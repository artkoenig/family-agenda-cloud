import type { IncomingHttpHeaders } from "node:http";
import { CONTEXT_HEADER } from "./context";

/**
 * The headers the Router passes on, as a proxy between a browser and a core: which of the
 * browser's a core gets, how the Router describes the client to it, and which of the core's the
 * browser gets. No I/O.
 */

/** The headers of one connection, which a proxy does not pass on (RFC 9110, section 7.6.1). */
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

/**
 * Headers of the browser's a core never gets: a Context comes from the Router only, and the client
 * is described by the Router's own `X-Forwarded-*` headers, not by a `Forwarded` the browser sent.
 */
const NOT_FROM_THE_BROWSER = [CONTEXT_HEADER.toLowerCase(), "forwarded", "host"];

/** A browser's request as the Router reads it: its headers, names in lower case, and the address it came from. */
export type BrowserRequest = { headers: IncomingHttpHeaders; remoteAddress: string | undefined };

/**
 * The headers a core gets for the browser's request: the browser's own, without those of its
 * connection and those a core must not get from a browser, and the client as the core reads it
 * from a trusted proxy. That is its address as the one entry of `X-Forwarded-For`, and the scheme
 * and host it asked for. Behind Caddy (`trustProxy`, TRUST_PROXY) that is what Caddy forwarded,
 * the address being the last entry, which Caddy appended; otherwise what the Router itself sees,
 * whatever the request claims.
 */
export function headersToCore({ headers, remoteAddress }: BrowserRequest, trustProxy: boolean): IncomingHttpHeaders {
  const dropped = new Set([...connectionHeaders(headers.connection), ...NOT_FROM_THE_BROWSER]);
  const trusted = trustProxy ? headers : {};
  return {
    ...Object.fromEntries(Object.entries(headers).filter(([name]) => !dropped.has(name))),
    "x-forwarded-for": entries(trusted["x-forwarded-for"]).at(-1) ?? String(remoteAddress),
    "x-forwarded-proto": entries(trusted["x-forwarded-proto"])[0] ?? "http",
    "x-forwarded-host": entries(trusted["x-forwarded-host"])[0] ?? String(headers.host),
  };
}

/** The core's headers, as Node reads them (name, value, name, value...), without those of its connection. */
export function headersFromCore(rawHeaders: string[]): string[] {
  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) pairs.push([rawHeaders[index] ?? "", rawHeaders[index + 1] ?? ""]);
  const connection = pairs.filter(([name]) => name.toLowerCase() === "connection").map(([, value]) => value);
  const dropped = connectionHeaders(connection);
  return pairs.filter(([name]) => !dropped.has(name.toLowerCase())).flat();
}

/** The entries of a header that lists values separated by commas. */
const entries = (header: string | string[] | undefined): string[] =>
  header === undefined ? [] : String(header).split(",").map((entry) => entry.trim());

/** The headers of a connection: the hop-by-hop ones and those its `Connection` header names. */
const connectionHeaders = (connection: string | string[] | undefined): Set<string> =>
  new Set([...HOP_BY_HOP, ...entries(connection).map((name) => name.toLowerCase())]);
