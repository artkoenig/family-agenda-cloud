import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { directoryConnection, type Config } from "./config";
import { CONTEXT_HEADER } from "./core";
import { directory as openDirectory, type Directory } from "./directory";
import { sealedContext, unwrappedFamily, type Family } from "./family-context";
import type { Log } from "./log";

/** The Router, listening for the browsers' requests. */
export type Router = { url: string; close(): Promise<void> };

/** A Family id as the first segment of a path, and the rest; a Family id is written in lower case. */
const FAMILY_PATH = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?]|$)(.*)$/s;

/** The headers of one connection, which a proxy does not pass on (RFC 9110, section 7.6.1). */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

/** What the Router needs for every request. */
type Routing = { config: Config; directory: Directory; log: Log; cores: Cores };

/** The cores of the pool, each request starting at the next; any core may answer any request. */
type Cores = { inTurn(): URL[] };

/**
 * Starts the Router: it finds each request's Family by the Family id in its path and passes the
 * request on to any core with that Family's Context. It opens the Directory on the first request
 * that names a Family.
 */
export async function startRouter(config: Config, log: Log): Promise<Router> {
  const pool = new pg.Pool({ ...directoryConnection(config), max: 10 });
  // An idle connection the server closed is replaced on the next request; it is no reason to stop.
  pool.on("error", (error) => {
    log.error("A connection to the Directory failed", { error });
  });
  const routing: Routing = { config, directory: openDirectory(pool), log, cores: cores(config.coreUrls) };
  const server = createServer((incoming, outgoing) => {
    route(routing, incoming, outgoing).catch((error: unknown) => {
      log.error("Routing a request failed", { error });
      answerBadGateway(outgoing);
    });
  });
  await new Promise<void>((resolve) => server.listen(config.listenPort, config.listenHost, resolve));
  const { address, port } = server.address() as AddressInfo;
  return {
    url: `http://${address}:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
      await pool.end();
    },
  };
}

function cores(urls: string[]): Cores {
  const pool = urls.map((url) => new URL(url));
  let next = 0;
  return {
    inTurn() {
      const start = next;
      next = (next + 1) % pool.length;
      return [...pool.slice(start), ...pool.slice(0, start)];
    },
  };
}

async function route(routing: Routing, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const target = incoming.url ?? "/";
  if (isFamilyIndependent(incoming.method, target)) {
    pass(routing, incoming, outgoing, { path: target, added: {} });
    return;
  }
  const [, familyId = "", rest = ""] = FAMILY_PATH.exec(target) ?? [];
  const family = familyId ? await activeFamily(routing, familyId) : undefined;
  if (!family) {
    // The same answer whether the Family is unknown, suspended or deleted: it tells nobody which Families exist.
    outgoing.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found\n");
    return;
  }
  // Not the path: an Agenda's id in it is what keeps the Agenda's address private.
  outgoing.on("close", () => {
    routing.log.info("Served a request", { familyId, method: incoming.method, status: outgoing.statusCode });
  });
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  pass(routing, incoming, outgoing, { familyId, path, added: { [CONTEXT_HEADER]: await sealedContext(routing.config, family) } });
}

/** The Family, its secrets unwrapped, if it is active; only an active Family is routed to. */
async function activeFamily({ config, directory }: Routing, familyId: string): Promise<Family | undefined> {
  const entry = await directory.find(familyId);
  const { wrappedFamilyKey, wrappedDatabasePassword } = entry ?? {};
  if (entry?.status !== "active" || !wrappedFamilyKey || !wrappedDatabasePassword) return undefined;
  return unwrappedFamily(config, { ...entry, wrappedFamilyKey, wrappedDatabasePassword });
}

/** Static files and the health check: the same for every Family, so served without one. */
function isFamilyIndependent(method: string | undefined, target: string): boolean {
  const [pathname = ""] = target.split("?", 1);
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname.startsWith("/static/") || pathname === "/api/health";
}

type Passing = {
  /** The Family the request is for; none for static files and the health check. */
  familyId?: string;
  /** Where the request goes on the core. */
  path: string;
  /** Headers the Router adds, such as the sealed Context. */
  added: Record<string, string>;
};

/**
 * Passes the request on to a core and the core's answer back unchanged. A request without a body
 * that a core refuses to take goes on to the next core; a request with a body cannot be sent twice.
 */
function pass(routing: Routing, incoming: IncomingMessage, outgoing: ServerResponse, passing: Passing): void {
  const { config, log, cores: pool } = routing;
  const retryable = incoming.method === "GET" || incoming.method === "HEAD";
  const about = passing.familyId === undefined ? {} : { familyId: passing.familyId };
  const headers = { ...passedOn(incoming.headers), ...forwarded(config, incoming), ...passing.added };
  const attempt = ([core, ...others]: URL[]): void => {
    if (!core) {
      log.error("No core answered", about);
      answerBadGateway(outgoing);
      return;
    }
    const toCore = request(
      { host: core.hostname, port: core.port, method: incoming.method, path: passing.path, headers: { ...headers, host: core.host } },
      (fromCore) => {
        outgoing.writeHead(fromCore.statusCode ?? 502, withoutHopByHop(fromCore.rawHeaders));
        fromCore.pipe(outgoing);
      },
    );
    toCore.on("error", (error) => {
      log.error("A core did not answer", { ...about, core: core.host, error });
      if (retryable) attempt(others);
      else attempt([]);
    });
    if (retryable) toCore.end();
    else incoming.pipe(toCore);
  };
  attempt(retryable ? pool.inTurn() : pool.inTurn().slice(0, 1));
}

function answerBadGateway(outgoing: ServerResponse): void {
  if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
  outgoing.end(outgoing.headersSent ? undefined : "Bad gateway\n");
}

/**
 * The client, as the core reads it from a trusted proxy: its address as the one entry of
 * `X-Forwarded-For`, and the scheme and host it asked for. Behind Caddy (TRUST_PROXY) that is
 * what Caddy forwarded, the address being the last entry, which Caddy appended; otherwise what
 * the Router itself sees, whatever the request claims.
 */
function forwarded(config: Config, incoming: IncomingMessage): Record<string, string> {
  const trusted = config.trustProxy ? incoming.headers : {};
  return {
    "x-forwarded-for": entries(trusted["x-forwarded-for"]).at(-1) ?? String(incoming.socket.remoteAddress),
    "x-forwarded-proto": entries(trusted["x-forwarded-proto"])[0] ?? "http",
    "x-forwarded-host": entries(trusted["x-forwarded-host"])[0] ?? String(incoming.headers.host),
  };
}

/** The entries of a header that lists values separated by commas. */
const entries = (header: string | string[] | undefined): string[] => (header === undefined ? [] : String(header).split(",").map((entry) => entry.trim()));

/** The browser's headers a core gets: a Context comes from the Router only, never from the browser. */
function passedOn(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const dropped = new Set([...HOP_BY_HOP, CONTEXT_HEADER.toLowerCase(), "host"]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !dropped.has(name)));
}

/** The core's headers, as Node reads them (name, value, name, value...), without those of its connection. */
function withoutHopByHop(rawHeaders: string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    const [name = "", value = ""] = rawHeaders.slice(index, index + 2);
    if (!HOP_BY_HOP.has(name.toLowerCase())) kept.push(name, value);
  }
  return kept;
}
