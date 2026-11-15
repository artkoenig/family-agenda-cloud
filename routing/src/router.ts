import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream";
import pg from "pg";
import { directoryConnection, type Config } from "./config";
import { CONTEXT_HEADER } from "./core";
import { directory as openDirectory, type Directory } from "./directory";
import { sealedContext, unwrappedFamily, type Family } from "./family-context";
import { reasonOf, type Log } from "./log";

/** The Router, listening for the browsers' requests. */
export type Router = { url: string; close(): Promise<void> };

/** A Family id as the first segment of a path, and the rest; a Family id is written in lower case. */
const FAMILY_PATH = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?]|$)(.*)$/s;

/** The headers of one connection, which a proxy does not pass on (RFC 9110, section 7.6.1). */
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

/**
 * Headers of the browser's a core never gets: a Context comes from the Router only, and the client
 * is described by the Router's own `X-Forwarded-*` headers, not by a `Forwarded` the browser sent.
 */
const NOT_FROM_THE_BROWSER = [CONTEXT_HEADER.toLowerCase(), "forwarded", "host"];

/** What the Router works with on every request. */
type RouterSetup = { config: Config; directory: Directory; log: Log; cores: Cores };

/** The cores of the pool, each request starting at the next; any core may answer any request. */
type Cores = { inTurn(): URL[] };

/** A request as the Router passes it on to a core. */
type CoreRequest = {
  /** The Family the request is for; none for static files and the health check. */
  familyId?: string;
  /** Where the request goes on the core. */
  path: string;
  /** Headers the Router adds to the browser's, such as the sealed Context. */
  routerHeaders: Record<string, string>;
};

/**
 * Starts the Router: it finds each request's Family by the Family id in its path and passes the
 * request on to any core with that Family's Context. It opens the Directory on the first request
 * that names a Family.
 */
export async function startRouter(config: Config, log: Log): Promise<Router> {
  const directoryPool = new pg.Pool({ ...directoryConnection(config), max: 10 });
  // An idle connection the server closed is replaced on the next request; it is no reason to stop.
  directoryPool.on("error", (error) => {
    log.error("A connection to the Directory failed", { reason: reasonOf(error) });
  });
  const setup: RouterSetup = { config, directory: openDirectory(directoryPool), log, cores: inTurn(config.coreUrls) };
  const server = createServer((incoming, outgoing) => {
    route(setup, incoming, outgoing).catch((error: unknown) => {
      log.error("Routing a request failed", { reason: reasonOf(error) });
      answerBadGateway(outgoing);
    });
  });
  await new Promise<void>((resolve) => server.listen(config.listenPort, config.listenHost, resolve));
  const { address, port } = server.address() as AddressInfo;
  return {
    url: `http://${address.includes(":") ? `[${address}]` : address}:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
      await directoryPool.end();
    },
  };
}

function inTurn(coreUrls: string[]): Cores {
  const urls = coreUrls.map((url) => new URL(url));
  let next = 0;
  return {
    inTurn() {
      const start = next;
      next = (next + 1) % urls.length;
      return [...urls.slice(start), ...urls.slice(0, start)];
    },
  };
}

async function route(setup: RouterSetup, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const target = incoming.url ?? "/";
  if (isFamilyIndependent(incoming.method, target)) {
    passOn(setup, incoming, outgoing, { path: target, routerHeaders: {} });
    return;
  }
  const [, familyId = "", rest = ""] = FAMILY_PATH.exec(target) ?? [];
  const family = familyId ? await activeFamily(setup, familyId) : undefined;
  if (!family) {
    // The same answer whether the Family is unknown, suspended or deleted: it tells nobody which Families exist.
    outgoing.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found\n");
    return;
  }
  // Not the path: an Agenda's id in it is what keeps the Agenda's address private.
  outgoing.on("close", () => {
    setup.log.info("Served a request", { familyId, method: incoming.method, status: outgoing.statusCode });
  });
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  passOn(setup, incoming, outgoing, { familyId, path, routerHeaders: { [CONTEXT_HEADER]: await sealedContext(setup.config, family) } });
}

/** The Family, its secrets unwrapped, if it is active; only an active Family is routed to. */
async function activeFamily({ config, directory }: RouterSetup, familyId: string): Promise<Family | undefined> {
  const entry = await directory.find(familyId);
  return entry?.status === "active" ? unwrappedFamily(config, entry) : undefined;
}

/** Static files and the health check: the same for every Family, so served without one. */
function isFamilyIndependent(method: string | undefined, target: string): boolean {
  const [pathname = ""] = target.split("?", 1);
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname.startsWith("/static/") || pathname === "/api/health";
}

/**
 * Passes the request on to a core and the core's answer back unchanged. A request without a body
 * that a core does not take goes on to the next core, as long as no answer has begun; a request
 * with a body cannot be sent twice. An answer that breaks off breaks off for the browser too.
 */
function passOn(setup: RouterSetup, incoming: IncomingMessage, outgoing: ServerResponse, coreRequest: CoreRequest): void {
  const { config, log, cores } = setup;
  const bodiless = incoming.method === "GET" || incoming.method === "HEAD";
  const familyField = coreRequest.familyId === undefined ? {} : { familyId: coreRequest.familyId };
  const headers = { ...passedOn(incoming.headers), ...forwarded(config, incoming), ...coreRequest.routerHeaders };
  const attempt = ([core, ...others]: URL[]): void => {
    if (!core) {
      log.error("No core answered", familyField);
      answerBadGateway(outgoing);
      return;
    }
    let answered = false;
    const toCore = request(
      { host: core.hostname, port: core.port, method: incoming.method, path: coreRequest.path, headers: { ...headers, host: core.host } },
      (fromCore) => {
        answered = true;
        outgoing.writeHead(fromCore.statusCode ?? 502, withoutHopByHop(fromCore.rawHeaders));
        pipeline(fromCore, outgoing, (error) => {
          if (error) log.error("A core's answer broke off", { ...familyField, core: core.host, reason: reasonOf(error) });
        });
      },
    );
    toCore.on("error", (error) => {
      if (answered) return;
      log.error("A core did not answer", { ...familyField, core: core.host, reason: reasonOf(error) });
      attempt(bodiless ? others : []);
    });
    // A browser that goes away takes its request to the core with it.
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) toCore.destroy();
    });
    if (bodiless) toCore.end();
    else {
      incoming.on("error", () => toCore.destroy());
      incoming.pipe(toCore);
    }
  };
  attempt(bodiless ? cores.inTurn() : cores.inTurn().slice(0, 1));
}

function answerBadGateway(outgoing: ServerResponse): void {
  if (outgoing.headersSent) {
    outgoing.destroy();
    return;
  }
  outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end("Bad gateway\n");
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
const entries = (header: string | string[] | undefined): string[] =>
  header === undefined ? [] : String(header).split(",").map((entry) => entry.trim());

/** The headers of a connection: the hop-by-hop ones and those its `Connection` header names. */
const connectionHeaders = (connection: string | string[] | undefined): Set<string> =>
  new Set([...HOP_BY_HOP, ...entries(connection).map((name) => name.toLowerCase())]);

/** The browser's headers a core gets. */
function passedOn(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const dropped = new Set([...connectionHeaders(headers.connection), ...NOT_FROM_THE_BROWSER]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !dropped.has(name)));
}

/** The core's headers, as Node reads them (name, value, name, value...), without those of its connection. */
function withoutHopByHop(rawHeaders: string[]): string[] {
  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) pairs.push([rawHeaders[index] ?? "", rawHeaders[index + 1] ?? ""]);
  const connection = pairs.filter(([name]) => name.toLowerCase() === "connection").map(([, value]) => value);
  const dropped = connectionHeaders(connection);
  return pairs.filter(([name]) => !dropped.has(name.toLowerCase())).flat();
}
