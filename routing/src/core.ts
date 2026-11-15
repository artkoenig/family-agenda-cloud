import { CONTEXT_HEADER } from "./context";
import { answerOf, isUnknownAdmin, newPassword, preparedVersion, sourcesPolled, type Answer } from "./core-answers";
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
  /** Brings the Family's database up to date; answers the core's version. */
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

/** What a run of due work answers: how many due Sources the core polled, and of those how many failed. */
export type SourcesPolled = { ran: number; failed: number };

export class CoreError extends Error {}

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
export function coreClient(coreUrls: string[], log: Log, timers: Timers = systemTimers): Core {
  const [first] = coreUrls;
  if (!first) throw new CoreError("No core configured in CORE_URLS");
  const inTurn = takingTurns(coreUrls);
  /**
   * Calls the operation and answers its status with its JSON body ({} for none). A status other
   * than 2xx fails the call unless `accept` names it; so does no answer within `timeoutMs`, and,
   * with `failover`, no core of the pool that runs it.
   */
  const call = async (operation: string, sealedContext: string, options: CallOptions = {}): Promise<{ status: number; answer: Answer }> => {
    if (!options.failover) return callCore(first, operation, sealedContext, options, timers);
    const notRun: string[] = [];
    for (const url of inTurn()) {
      try {
        return await callCore(url, operation, sealedContext, options, timers);
      } catch (error) {
        if (!(error instanceof NotRun)) throw error;
        const core = new URL(url).host;
        notRun.push(`${core} ${error.reason}`);
        log.info("A core did not run the operation; the next one of the pool is tried", { operation, core, reason: error.reason });
      }
    }
    throw new CoreError(`No core answered ${operation}: ${notRun.join(", ")}`);
  };
  const triggered = { timeoutMs: TRIGGERED_TIMEOUT_MS, failover: true };
  return {
    async prepareFamily(sealedContext) {
      const coreVersion = preparedVersion((await call("prepare-family", sealedContext)).answer);
      if (coreVersion === undefined) throw new CoreError("The core answered prepare-family without its version");
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
      if (password === undefined) throw new CoreError("The core answered reset-admin-password without a password");
      return password;
    },
    async runDueWork(sealedContext) {
      const polled = sourcesPolled((await call("run-due-work", sealedContext, triggered)).answer);
      if (!polled) throw new CoreError("The core answered run-due-work without what ran");
      return polled;
    },
    async purgeMessages(sealedContext) {
      await call("purge-messages", sealedContext, triggered);
    },
    async sweepSecrets(sealedContext) {
      await call("sweep-secrets", sealedContext, triggered);
    },
  };
}

/** Calls the operation on one core; throws NotRun if the core provably did not run it. */
async function callCore(
  url: string,
  operation: string,
  sealedContext: string,
  { body, accept = [], timeoutMs = CALL_TIMEOUT_MS }: CallOptions,
  timers: Timers,
): Promise<{ status: number; answer: Answer }> {
  const timeout = new AbortController();
  const timer = timers.setTimeout(() => {
    timeout.abort(new Error(`no answer within ${timeoutMs / 1000} seconds`));
  }, timeoutMs);
  const noAnswer = (error: unknown) => new CoreError(`The core did not answer ${operation}: ${describe(timeout.signal.reason ?? error)}`);
  try {
    const response = await fetch(`${url}/operations/${operation}`, {
      method: "POST",
      headers: { [CONTEXT_HEADER]: sealedContext, ...(body === undefined ? {} : { "content-type": "application/json" }) },
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
    timers.clearTimeout(timer);
  }
}
