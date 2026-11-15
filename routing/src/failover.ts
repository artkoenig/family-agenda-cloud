/**
 * Failover across the pool of cores: the order the cores are tried in, and when a call or a
 * request may go on to the next core. Any core may serve any Family. No I/O.
 */

/**
 * The errors of a connection that was never made: the call did not arrive at the core. A
 * connection that broke after the call was sent is not among them, as the core may have run it.
 */
const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * What a core answers when it did not run the operation, because it is starting or because a proxy
 * in front of it has no core to pass the call to.
 */
const NOT_RUN = new Set([502, 503, 504]);

/** Answers the items in turn: each round starts at the item after the one the last round started at. */
export function takingTurns<T>(items: readonly T[]): () => T[] {
  let next = 0;
  return () => {
    const start = next;
    next = (next + 1) % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
  };
}

/**
 * Why a call provably did not run on the core it was made to, so that another core may take it:
 * the error `code` of a connection that was never made, or the `status` of a core that is not
 * serving. Undefined when the core may have run it.
 */
export function notRunReason(failure: { code: string } | { status: number }): string | undefined {
  if ("code" in failure) return NOT_CONNECTED.has(failure.code) ? failure.code : undefined;
  return NOT_RUN.has(failure.status) ? String(failure.status) : undefined;
}

/** Whether a request with this method has no body, and so may be sent to a second core. */
export const isBodiless = (method: string | undefined): boolean => method === "GET" || method === "HEAD";

/**
 * The cores a browser's request is tried on, in order, given the pool's cores in turn: each of
 * them for a request without a body, the first only for one with a body, which cannot be sent twice.
 */
export const coresFor = <T>(method: string | undefined, inTurn: T[]): T[] => (isBodiless(method) ? inTurn : inTurn.slice(0, 1));
