import { CONTEXT_HEADER } from "./context";
import type { Config } from "./config";
import { answerOf, dueWorkOf, isUnknownAdmin, newPassword, openingRefusal, type Answer, type SourcesPolled } from "./core-answers";
import { neverConnected, notServing } from "./failover";
import { describe, reasonOf, type Log } from "./log";
import { poolAt, type Resolve } from "./pool";
import { systemResolve } from "./resolve";

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

/**
 * The operations a core offers to be triggered from outside, each for the Family its Context
 * names. A core prepares a Family's database when it first opens it, so none of them is for that.
 */
export type Core = {
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

/** The pool as the client reaches it: where it serves the triggered operations, and the token they require. */
export type TriggerPool = Pick<Config, "coreTriggerUrl" | "triggerToken">;

/**
 * How a call goes. `alsoWhenNotServing` lets it go on to the next core of the pool also when the
 * core it was made to answered that it is not serving; only the Scheduler's operations do, which
 * the next occurrence would make anyway.
 */
type CallOptions = { body?: unknown; accept?: number[]; timeoutMs?: number; alsoWhenNotServing?: boolean };

/**
 * A call that did not run on the core it was made to, so another core may take it: because the
 * core `refused` to open the Family, because it was `unreached`, the connection never made, or
 * because it answered that it is `not-serving`.
 */
class NotRun extends CoreError {
  constructor(
    message: string,
    readonly reason: string,
    readonly why: "refused" | "unreached" | "not-serving",
  ) {
    super(message);
  }
}

/** What a test stands in for: the timers a call is given up by, and what finds the cores the pool's name stands for. */
export type CoreClientOptions = { timers?: Timers | undefined; resolve?: Resolve | undefined };

/**
 * A client of the pool of cores. Any core serves any Family. A call is made to the cores the
 * pool's name stands for when it starts (`resolve` finds them), calls taking the cores in turn,
 * and every core is tried at most once, so a call ends after as many tries as the pool has cores.
 *
 * - A core that refuses to open the Family has changed nothing, and says so: its release is older
 *   than the one that migrated the Family's database, as during a rolling update, or it is still
 *   preparing the database (see `openingRefusal`). Every call then goes on to the next core.
 * - A core that could not be connected to, as one stopped a moment ago, has not received the
 *   call. Every call then goes on to the next core too.
 * - Provisioning's operations go on for no other reason: a call that may have run and is made a
 *   second time elsewhere could, for a password reset, hand out a second password.
 * - The Scheduler's operations also go on when a core answered that it is not serving (502, 503, 504).
 * - A core that was reached but did not answer in time may still be at work on the call, so the
 *   call is given up then instead of being made a second time beside it, which could double a run.
 */
export function coreClient({ coreTriggerUrl, triggerToken }: TriggerPool, log: Log, { timers = systemTimers, resolve = systemResolve }: CoreClientOptions = {}): Core {
  const pool = poolAt(coreTriggerUrl, resolve, log);
  /**
   * Calls the operation and answers its status with its JSON body ({} for none). A status other
   * than 2xx fails the call unless `accept` names it; so does no answer within `timeoutMs`, and
   * no core of the pool that runs it.
   */
  const call = async (operation: string, sealedContext: string, options: CallOptions = {}): Promise<{ status: number; answer: Answer }> => {
    const notRun: string[] = [];
    for (const target of await pool.cores()) {
      try {
        return await callCore(target, triggerToken, operation, sealedContext, options, timers);
      } catch (error) {
        if (!(error instanceof NotRun) || (error.why === "not-serving" && !options.alsoWhenNotServing)) throw error;
        notRun.push(`${target.host} ${error.reason}`);
        log.info("A core did not run the operation; the next one of the pool is tried", { operation, core: target.host, reason: error.reason });
      }
    }
    throw new CoreError(`No core ran ${operation}: ${notRun.join(", ") || `${pool.host} stands for no core`}`);
  };
  const triggered = { timeoutMs: TRIGGERED_TIMEOUT_MS, alsoWhenNotServing: true };
  return {
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

/** Calls the operation on the core at `triggerUrl`; throws NotRun if the core did not run it. */
async function callCore(
  triggerUrl: URL,
  triggerToken: string,
  operation: string,
  sealedContext: string,
  { body, accept = [], timeoutMs = CALL_TIMEOUT_MS }: CallOptions,
  timers: Timers,
): Promise<{ status: number; answer: Answer }> {
  const timeout = deadline(timeoutMs, timers);
  const noAnswer = (error: unknown) => new CoreError(`The core did not answer ${operation}: ${describe(timeout.signal.reason ?? error)}`);
  try {
    const response = await fetch(new URL(`/operations/${operation}`, triggerUrl), {
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
      throw neverConnected(code) ? new NotRun(noAnswer(error).message, code, "unreached") : noAnswer(error);
    });
    const text = await response.text().catch((error: unknown) => {
      throw noAnswer(error);
    });
    const answer = answerOf(text);
    if (!response.ok && !accept.includes(response.status)) {
      const message = `The core answered ${operation} with ${response.status}`;
      const refusal = openingRefusal(response.status, answer.error);
      if (refusal !== undefined) throw new NotRun(message, refusal, "refused");
      throw notServing(response.status) ? new NotRun(message, String(response.status), "not-serving") : new CoreError(message);
    }
    return { status: response.status, answer };
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
