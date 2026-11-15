import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream";
import pg from "pg";
import { directoryConnection, type Config } from "./config";
import { CONTEXT_HEADER } from "./context";
import { directory as openDirectory, type Directory } from "./directory";
import { coresFor, isBodiless, takingTurns } from "./failover";
import { sealedContext, unwrappedFamily } from "./family-context";
import { reasonOf, type Log } from "./log";
import { headersFromCore, headersToCore } from "./proxy-headers";
import { routeRequest } from "./request-routing";

/** The Router, listening for the browsers' requests. */
export type Router = { url: string; close(): Promise<void> };

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
  const setup: RouterSetup = { config, directory: openDirectory(directoryPool), log, cores: { inTurn: takingTurns(config.coreUrls.map((url) => new URL(url))) } };
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

async function route(setup: RouterSetup, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const { config, directory } = setup;
  const routed = await routeRequest({ method: incoming.method, target: incoming.url ?? "/" }, config.coreVersion, (familyId) => directory.find(familyId));
  if (routed.to === "refused") {
    outgoing.writeHead(routed.status, routed.headers).end(routed.body);
    return;
  }
  if (routed.to === "core") {
    passOn(setup, incoming, outgoing, { path: routed.path, routerHeaders: {} });
    return;
  }
  const { familyId, path, entry } = routed;
  const family = unwrappedFamily(config, entry);
  // Not the path: an Agenda's id in it is what keeps the Agenda's address private.
  outgoing.on("close", () => {
    setup.log.info("Served a request", { familyId, method: incoming.method, status: outgoing.statusCode });
  });
  passOn(setup, incoming, outgoing, { familyId, path, routerHeaders: { [CONTEXT_HEADER]: await sealedContext(config, family) } });
}

/**
 * Passes the request on to a core and the core's answer back unchanged. A request without a body
 * that a core does not take goes on to the next core, as long as no answer has begun; a request
 * with a body cannot be sent twice. An answer that breaks off breaks off for the browser too.
 */
function passOn(setup: RouterSetup, incoming: IncomingMessage, outgoing: ServerResponse, coreRequest: CoreRequest): void {
  const { config, log, cores } = setup;
  const bodiless = isBodiless(incoming.method);
  const familyField = coreRequest.familyId === undefined ? {} : { familyId: coreRequest.familyId };
  const browser = { headers: incoming.headers, remoteAddress: incoming.socket.remoteAddress };
  const headers = { ...headersToCore(browser, config.trustProxy), ...coreRequest.routerHeaders };
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
        outgoing.writeHead(fromCore.statusCode ?? 502, headersFromCore(fromCore.rawHeaders));
        pipeline(fromCore, outgoing, (error) => {
          if (error) log.error("A core's answer broke off", { ...familyField, core: core.host, reason: reasonOf(error) });
        });
      },
    );
    toCore.on("error", (error) => {
      if (answered) return;
      log.error("A core did not answer", { ...familyField, core: core.host, reason: reasonOf(error) });
      attempt(others);
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
  attempt(coresFor(incoming.method, cores.inTurn()));
}

function answerBadGateway(outgoing: ServerResponse): void {
  if (outgoing.headersSent) {
    outgoing.destroy();
    return;
  }
  outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end("Bad gateway\n");
}
