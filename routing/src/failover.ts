/**
 * Failover across the pool of cores: the order the cores are tried in, and when a call or a
 * request may go on to the next core. Any core may serve any Family. What a core's refusal to open
 * a Family says is read in core-answers.ts. No I/O.
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
 * Whether a call failed with the error `code` of a connection that was never made, so that it
 * provably did not run and another core may take it.
 */
export const neverConnected = (code: string): boolean => NOT_CONNECTED.has(code);

/**
 * Whether a core answered with the `status` of a core that is not serving, so that the call
 * provably did not run and another core may take it.
 */
export const notServing = (status: number): boolean => NOT_RUN.has(status);

/** Whether a request with this method has no body, and so may be sent to a second core. */
export const isBodiless = (method: string | undefined): boolean => method === "GET" || method === "HEAD";

/**
 * Whether an answer with this `status` may be a core's refusal to open the Family, which its
 * body then tells (see `openingRefusal`): any other status is the Family's own answer.
 */
export const mayRefuseOpening = (status: number): boolean => status === 409 || status === 503;
