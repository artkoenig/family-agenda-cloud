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

/** The header a core reads the sealed Context from. */
export const CONTEXT_HEADER = "X-Family-Agenda-Context";

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

export function coreClient(coreUrls: string[], timers: Timers = systemTimers): Core {
  // Any core of the pool serves any Family; Provisioning takes the first.
  const [url] = coreUrls;
  if (!url) throw new CoreError("No core configured in CORE_URLS");
  /**
   * Calls the operation and answers its status with its JSON body ({} for none). A status other
   * than 2xx fails the call unless `accept` names it; so does no answer within `timeoutMs`.
   */
  const call = async (
    operation: string,
    sealedContext: string,
    { body, accept = [], timeoutMs = CALL_TIMEOUT_MS }: { body?: unknown; accept?: number[]; timeoutMs?: number } = {},
  ): Promise<{ status: number; answer: Record<string, unknown> }> => {
    const timeout = new AbortController();
    const timer = timers.setTimeout(() => {
      timeout.abort(new Error(`no answer within ${timeoutMs / 1000} seconds`));
    }, timeoutMs);
    try {
      const response = await fetch(`${url}/operations/${operation}`, {
        method: "POST",
        headers: { [CONTEXT_HEADER]: sealedContext, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: timeout.signal,
      }).catch((error: unknown) => {
        throw new CoreError(`The core did not answer ${operation}: ${describe(timeout.signal.reason ?? error)}`);
      });
      if (!response.ok && !accept.includes(response.status)) throw new CoreError(`The core answered ${operation} with ${response.status}`);
      const text = await response.text().catch((error: unknown) => {
        throw new CoreError(`The core did not answer ${operation}: ${describe(timeout.signal.reason ?? error)}`);
      });
      return { status: response.status, answer: parsed(text) };
    } finally {
      timers.clearTimeout(timer);
    }
  };
  const triggered = { timeoutMs: TRIGGERED_TIMEOUT_MS };
  return {
    async prepareFamily(sealedContext) {
      const { coreVersion } = (await call("prepare-family", sealedContext)).answer;
      if (typeof coreVersion !== "string") throw new CoreError("The core answered prepare-family without its version");
      return { coreVersion };
    },
    async enterAdmin(sealedContext, email) {
      await call("enter-admin", sealedContext, { body: { email } });
    },
    async resetAdminPassword(sealedContext, email) {
      const { status, answer } = await call("reset-admin-password", sealedContext, { body: { email }, accept: [404] });
      if (status === 404) {
        // A 404 without that error code is a core that does not offer the operation.
        if (answer.error === "unknown-admin") return undefined;
        throw new CoreError("The core answered reset-admin-password with 404");
      }
      const { password } = answer;
      if (typeof password !== "string" || !password) throw new CoreError("The core answered reset-admin-password without a password");
      return password;
    },
    async runDueWork(sealedContext) {
      const { ran, failed } = (await call("run-due-work", sealedContext, triggered)).answer;
      if (!Number.isInteger(ran) || !Number.isInteger(failed)) throw new CoreError("The core answered run-due-work without what ran");
      return { ran: ran as number, failed: failed as number };
    },
    async purgeMessages(sealedContext) {
      await call("purge-messages", sealedContext, triggered);
    },
    async sweepSecrets(sealedContext) {
      await call("sweep-secrets", sealedContext, triggered);
    },
  };
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A JSON object answered, or {} for an empty body, one that is not JSON or not an object. */
function parsed(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
