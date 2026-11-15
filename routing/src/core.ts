/** The header a core reads the sealed Context from. */
export const CONTEXT_HEADER = "X-Family-Agenda-Context";

/** The operations a core offers to be triggered from outside, each for the Family its Context names. */
export type Core = {
  /** Brings the Family's database up to date; answers the core's version. */
  prepareFamily(sealedContext: string): Promise<{ coreVersion: string }>;
  /** Enters an Admin by email address, without a password; an Admin who exists already is fine. */
  enterAdmin(sealedContext: string, email: string): Promise<void>;
};

export class CoreError extends Error {}

export function coreClient(coreUrls: string[]): Core {
  // Any core of the pool serves any Family; Provisioning takes the first.
  const [url] = coreUrls;
  if (!url) throw new CoreError("No core configured in CORE_URLS");
  const call = async (operation: string, sealedContext: string, body?: unknown) => {
    const response = await fetch(`${url}/operations/${operation}`, {
      method: "POST",
      headers: { [CONTEXT_HEADER]: sealedContext, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    }).catch((error: unknown) => {
      throw new CoreError(`The core did not answer ${operation}: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!response.ok) throw new CoreError(`The core answered ${operation} with ${response.status}`);
    return response;
  };
  return {
    async prepareFamily(sealedContext) {
      const { coreVersion } = (await (await call("prepare-family", sealedContext)).json()) as { coreVersion?: unknown };
      if (typeof coreVersion !== "string") throw new CoreError("The core answered prepare-family without its version");
      return { coreVersion };
    },
    async enterAdmin(sealedContext, email) {
      await call("enter-admin", sealedContext, { email });
    },
  };
}
