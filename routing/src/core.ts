import { CONTEXT_HEADER } from "./context";
import type { Config } from "./config";
import { answerOf, dueWorkOf, isUnknownAdmin, newPassword, runningVersion, type Answer, type SourcesPolled } from "./core-answers";
import { neverConnected, notServing, takingTurns } from "./failover";
import { describe, reasonOf, type Log } from "./log";

/** The timers a call to the core is given up by; the system's unless a test moves time by hand. */
export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

const systemTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

/** How long a call to the core may take before it is given up. */
const CALL_TIMEOUT_MS = 30_000;

/**
 * How long an operation the Scheduler triggers may take before it is given up: far above any
 * realistic run, which polls the Family's due Sources one after another. It must stay below the
 * expiry of the Scheduler's jobs (see scheduler.ts): only then has the call ended, and its job
 * with it, before pg-boss could count the job as abandoned and let the next occurrence start a
 * second run beside one the core is still working on.
 */
export const TRIGGERED_TIMEOUT_MS = 10 * 60_000;

/** The operations a core offers to be triggered from outside, each for the Family its Context names. */
export type Core = {
  /** Brings the Family's database up to date; answers the version of the core that did. */
  prepareFamily(sealedContext: string): Promise<{ coreVersion: string }>;
  /** Enters an Admin by email address, without a password; an Admin who exists already is fine. */
  enterAdmin(sealedContext: string, email: string): Promise<void>;
  /**
   * Has the core draw and set a new password for the Admin with this email address, ending their
   * sessions; answers the new password, or undefined when the Family has no such Admin.
   */
  resetAdminPassword(sealedContext: string, email: string): Promise<string | undefined>;
  /** Polls the Family's Sources the core finds due; answers how many it polled and how many failed. */
  runDueWork(sealedContext: string): Promise<SourcesPolled>;
  /** Deletes the Family's messages past their retention. */
  purgeMessages(sealedContext: string): Promise<void>;
  /** Removes the Family's secrets no Source refers to any more. */
  sweepSecrets(sealedContext: string): Promise<void>;
};

export type { SourcesPolled } from "./core-answers";

export class CoreError extends Error {}

/** The pool as the client reaches it: each core's pages and triggered operations, and the token they require. */
export type Pool = Pick<Config, "coreUrls" | "coreTriggerUrls" | "triggerToken">;

/**
 * How a call goes. `failover` lets it go on to the next core of the pool when a core provably did
 * not run it; only the Scheduler's operations do, which the next occurrence would make anyway.
 */
type CallOptions = { body?: unknown; accept?: number[]; timeoutMs?: number; failover?: boolean };

/** A call that provably did not run on the core it was made to, so another core may take it. */
class NotRun extends CoreError {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
  }
}

/**
 * A client of the pool of cores. Any core serves any Family. Provisioning's operations go to the
 * first core and to no other: a call made a second time elsewhere could, for a password reset,
 * hand out a second password. The Scheduler's operations take the cores in turn, and a call goes on
 * to the next core when the core it was made to provably did not run it: it could not be connected
 * to, as one being restarted cannot, or it answered that it is not serving (502, 503, 504). A core
 * that was reached but did not answer in time may still be at work on the call, so the call is
 * given up then instead of being made a second time beside it, which could double a run.
 */
export function coreClient({ coreUrls, coreTriggerUrls, triggerToken }: Pool, log: Log, timers: Timers = systemTimers): Core {
  // Config pairs CORE_TRIGGER_URLS with CORE_URLS one to one, in the same order.
  const [first] = coreTriggerUrls;
  const [firstPages] = coreUrls;
  if (!first || !firstPages) throw new CoreError("No core configured in CORE_URLS");
  const inTurn = takingTurns(coreTriggerUrls);
  /**
   * Calls the operation and answers its status with its JSON body ({} for none). A status other
   * than 2xx fails the call unless `accept` names it; so does no answer within `timeoutMs`, and,
   * with `failover`, no core of the pool that runs it.
   */
  const call = async (operation: string, sealedContext: string, options: CallOptions = {}): Promise<{ status: number; answer: Answer }> => {
    if (!options.failover) return callCore(first, triggerToken, operation, sealedContext, options, timers);
    const notRun: string[] = [];
    for (const target of inTurn()) {
      try {
        return await callCore(target, triggerToken, operation, sealedContext, options, timers);
      } catch (error) {
        if (!(error instanceof NotRun)) throw error;
        const core = new URL(target).host;
        notRun.push(`${core} ${error.reason}`);
        log.info("A core did not run the operation; the next one of the pool is tried", { operation, core, reason: error.reason });
      }
    }
    throw new CoreError(`No core answered ${operation}: ${notRun.join(", ")}`);
  };
  const triggered = { timeoutMs: TRIGGERED_TIMEOUT_MS, failover: true };
  return {
    async prepareFamily(sealedContext) {
      // Without failover, prepare-family runs on the first core alone. It answers no version, so
      // the version is read from that same core's /api/health, on its pages' address.
      await call("prepare-family", sealedContext);
      const coreVersion = runningVersion(await healthOf(firstPages, timers));
      if (coreVersion === undefined) throw new CoreError("The core answered /api/health without its version");
      return { coreVersion };
    },
    async enterAdmin(sealedContext, email) {
      await call("enter-admin", sealedContext, { body: { email } });
    },
    async resetAdminPassword(sealedContext, email) {
      const { status, answer } = await call("reset-admin-password", sealedContext, { body: { email }, accept: [404] });
      if (status === 404) {
        if (isUnknownAdmin(answer)) return undefined;
        throw new CoreError("The core answered reset-admin-password with 404");
      }
      const password = newPassword(answer);
      if (password === undefined) throw new CoreError("The core answered reset-admin-password without a new password");
      return password;
    },
    async runDueWork(sealedContext) {
      const polled = dueWorkOf((await call("due-work", sealedContext, triggered)).answer);
      if (!polled) throw new CoreError("The core answered due-work without what ran");
      if ("error" in polled) throw new CoreError(`The core's due work failed, ${polled.error}`);
      return polled;
    },
    async purgeMessages(sealedContext) {
      await call("purge", sealedContext, triggered);
    },
    async sweepSecrets(sealedContext) {
      await call("secret-sweep", sealedContext, triggered);
    },
  };
}

/** Calls the operation on the core at `triggerUrl`; throws NotRun if the core provably did not run it. */
async function callCore(
  triggerUrl: string,
  triggerToken: string,
  operation: string,
  sealedContext: string,
  { body, accept = [], timeoutMs = CALL_TIMEOUT_MS }: CallOptions,
  timers: Timers,
): Promise<{ status: number; answer: Answer }> {
  const timeout = deadline(timeoutMs, timers);
  const noAnswer = (error: unknown) => new CoreError(`The core did not answer ${operation}: ${describe(timeout.signal.reason ?? error)}`);
  try {
    const response = await fetch(`${triggerUrl}/operations/${operation}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${triggerToken}`,
        [CONTEXT_HEADER]: sealedContext,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: timeout.signal,
    }).catch((error: unknown) => {
      const code = reasonOf((error as { cause?: unknown }).cause ?? error);
      throw neverConnected(code) ? new NotRun(noAnswer(error).message, code) : noAnswer(error);
    });
    if (!response.ok && !accept.includes(response.status)) {
      const message = `The core answered ${operation} with ${response.status}`;
      throw notServing(response.status) ? new NotRun(message, String(response.status)) : new CoreError(message);
    }
    const text = await response.text().catch((error: unknown) => {
      throw noAnswer(error);
    });
    return { status: response.status, answer: answerOf(text) };
  } finally {
    timeout.clear();
  }
}

/** What the core answers at /api/health, the one page it serves without a Context. */
async function healthOf(url: string, timers: Timers): Promise<Answer> {
  const timeout = deadline(CALL_TIMEOUT_MS, timers);
  try {
    const response = await fetch(`${url}/api/health`, { signal: timeout.signal });
    if (!response.ok) throw new CoreError(`The core answered /api/health with ${response.status}`);
    return answerOf(await response.text());
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError(`The core did not answer /api/health: ${describe(timeout.signal.reason ?? error)}`);
  } finally {
    timeout.clear();
  }
}

/** An abort signal that fires once `ms` have passed without `clear()`, its reason saying so. */
function deadline(ms: number, timers: Timers): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const timer = timers.setTimeout(() => {
    controller.abort(new Error(`no answer within ${ms / 1000} seconds`));
  }, ms);
  return {
    signal: controller.signal,
    clear: () => {
      timers.clearTimeout(timer);
    },
  };
}
