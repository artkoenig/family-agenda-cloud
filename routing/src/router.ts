import { createServer, request, type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream";
import pg from "pg";
import { directoryConnection, type Config } from "./config";
import { CONTEXT_HEADER } from "./context";
import { openingRefusal, pageErrorCode } from "./core-answers";
import { directory as openDirectory, type Directory } from "./directory";
import { isBodiless, mayRefuseOpening, neverConnected } from "./failover";
import { sealedContext, unwrappedFamily } from "./family-context";
import { reasonOf, type Log } from "./log";
import { hostnameOf, poolAt, type Pool, type Resolve } from "./pool";
import { systemResolve } from "./resolve";
import { headersFromCore, headersToCore } from "./proxy-headers";
import { BAD_GATEWAY, routeRequest, UNAVAILABLE, type Refusal } from "./request-routing";

/** The Router, listening for the browsers' requests. */
export type Router = { url: string; close(): Promise<void> };

/** What the Router works with on every request. */
type RouterSetup = {
  config: Config;
  directory: Directory;
  log: Log;
  /** The pool of cores where it serves the pages; any core may answer any request. */
  pool: Pool;
};

/** A request as the Router passes it on to a core. */
type CoreRequest = {
  /** The Family the request is for; none for a request a core answers without a Context (see `routeRequest`). */
  familyId?: string;
  /** Where the request goes on the core. */
  path: string;
  /** Headers the Router adds to the browser's, such as the sealed Context. */
  routerHeaders: Record<string, string>;
};

/**
 * How much of a request's body the Router holds in memory, so that it can send the request to
 * another core when one refuses to open the Family. A longer body is passed on as it arrives, to
 * one core only.
 */
const HELD_BODY_BYTES = 1024 * 1024;

/** How much of a core's answer the Router reads to tell whether it is a refusal: more than any refusal has. */
const REFUSAL_BYTES = 1024;

/**
 * Starts the Router: it finds each request's Family by the Family id in its path and passes the
 * request on to any core with that Family's Context. It opens the Directory on the first request
 * that names a Family. `resolve` finds the cores the pool's name stands for, at each request.
 */
export async function startRouter(config: Config, log: Log, resolve: Resolve = systemResolve): Promise<Router> {
  const directoryPool = new pg.Pool({ ...directoryConnection(config), max: 10 });
  // An idle connection the server closed is replaced on the next request; it is no reason to stop.
  directoryPool.on("error", (error) => {
    log.error("A connection to the Directory failed", { reason: reasonOf(error) });
  });
  const setup: RouterSetup = { config, directory: openDirectory(directoryPool), log, pool: poolAt(config.coreUrl, resolve, log) };
  const server = createServer((incoming, outgoing) => {
    route(setup, incoming, outgoing).catch((error: unknown) => {
      log.error("Routing a request failed", { reason: reasonOf(error) });
      answer(outgoing, BAD_GATEWAY);
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
  const routed = await routeRequest({ method: incoming.method, target: incoming.url ?? "/" }, (familyId) => directory.find(familyId), config.callbackPath);
  if (routed.to === "refused") {
    outgoing.writeHead(routed.status, routed.headers).end(routed.body);
    return;
  }
  if (routed.to === "core") {
    await passOn(setup, incoming, outgoing, { path: routed.path, routerHeaders: {} });
    return;
  }
  const { familyId, path, entry } = routed;
  const family = unwrappedFamily(config, entry);
  // Not the path: an Agenda's id in it is what keeps the Agenda's address private.
  outgoing.on("close", () => {
    setup.log.info("Served a request", { familyId, method: incoming.method, status: outgoing.statusCode });
  });
  await passOn(setup, incoming, outgoing, { familyId, path, routerHeaders: { [CONTEXT_HEADER]: sealedContext(config, family) } });
}

/**
 * Passes the request on to a core and the core's answer back unchanged, trying each core the
 * pool's name stands for at this request at most once.
 *
 * - A core that refuses to open the Family has not run the request (see `openingRefusal`), so the
 *   request goes on to the next core, whatever its method, as long as the Router still holds all
 *   of it: a request without a body, or with one of up to HELD_BODY_BYTES.
 * - A core that could not be connected to, as one stopped a moment ago, has not received the
 *   request, so the request goes on to the next core under the same condition.
 * - A core that does not answer, or answers 503 without saying that it refuses, may have run the
 *   request, so only a request without a body goes on to the next core then, as long as no answer
 *   has begun. A HEAD request, whose answer has no body to say why, goes on after any 409 too.
 * - When no core is left, the answer is 503 if any core refused, and 502 if none answered or the
 *   pool's name stands for none.
 * - An answer that breaks off breaks off for the browser too.
 */
async function passOn(setup: RouterSetup, incoming: IncomingMessage, outgoing: ServerResponse, coreRequest: CoreRequest): Promise<void> {
  const { config, log, pool } = setup;
  const bodiless = isBodiless(incoming.method);
  const body: Beginning | undefined = bodiless ? { chunks: [], whole: true } : await beginningOf(incoming, HELD_BODY_BYTES);
  // A browser that went away before its request was read has nobody to answer.
  if (!body) return;
  const familyField = coreRequest.familyId === undefined ? {} : { familyId: coreRequest.familyId };
  const browser = { headers: incoming.headers, remoteAddress: incoming.socket.remoteAddress };
  const headers = { ...headersToCore(browser, config.trustProxy), ...coreRequest.routerHeaders };
  const refused: string[] = [];
  // A browser that goes away takes its request to the core with it.
  let asked: ClientRequest | undefined;
  outgoing.on("close", () => {
    if (!outgoing.writableFinished) asked?.destroy();
  });

  const send = (toCore: ClientRequest): void => {
    for (const chunk of body.chunks) toCore.write(chunk);
    if (body.whole) {
      toCore.end();
      return;
    }
    incoming.on("error", () => toCore.destroy());
    incoming.pipe(toCore);
  };

  const attempt = ([core, ...others]: URL[]): void => {
    if (!core) {
      if (refused.length > 0) log.error("Every core that answered refused to open the Family", { ...familyField, refused: refused.join(", ") });
      else log.error("No core answered", familyField);
      answer(outgoing, refused.length > 0 ? UNAVAILABLE : BAD_GATEWAY);
      return;
    }
    let answered = false;
    const toCore = request(
      { host: hostnameOf(core), port: core.port, method: incoming.method, path: coreRequest.path, headers: { ...headers, host: core.host } },
      (fromCore) => {
        answered = true;
        void passBack(fromCore, core, others);
      },
    );
    toCore.on("error", (error) => {
      if (answered) return;
      const reason = reasonOf(error);
      log.error("A core did not answer", { ...familyField, core: core.host, reason });
      if (bodiless || (body.whole && neverConnected(reason))) {
        attempt(others);
        return;
      }
      // It may have run the request, whatever a core before it refused.
      log.error("No core answered", familyField);
      answer(outgoing, BAD_GATEWAY);
    });
    asked = toCore;
    send(toCore);
  };

  /** Passes the core's answer back, unless it is a refusal to open the Family: then the next core is tried. */
  const passBack = async (fromCore: IncomingMessage, core: URL, others: URL[]): Promise<void> => {
    const status = fromCore.statusCode ?? 502;
    const begun = mayRefuseOpening(status) ? await beginningOf(fromCore, REFUSAL_BYTES) : NOT_READ;
    if (!begun) {
      log.error("A core's answer broke off", { ...familyField, core: core.host, reason: "before its body arrived" });
      answer(outgoing, BAD_GATEWAY);
      return;
    }
    const refusal = refusalIn(status, begun) ?? unexplainedRefusal(incoming.method, status);
    if (refusal === undefined) {
      relay(fromCore, begun, outgoing, (error) => {
        log.error("A core's answer broke off", { ...familyField, core: core.host, reason: reasonOf(error) });
      });
      return;
    }
    refused.push(`${core.host} ${refusal}`);
    log.info("A core refused to open the Family; the next one of the pool is tried", { ...familyField, core: core.host, reason: refusal });
    // A body longer than the Router holds is partly sent already, and cannot be sent again.
    attempt(body.whole ? others : []);
  };

  const cores = await pool.cores();
  // A browser that went away while the pool's name was resolved has nobody to answer.
  if (outgoing.destroyed) return;
  attempt(body.whole ? cores : cores.slice(0, 1));
}

/** The beginning of what a browser or a core sent: all of it if `whole`, or else the rest is still to be read. */
type Beginning = { chunks: Buffer[]; whole: boolean };

/** The beginning of an answer the Router passes back without reading any of it. */
const NOT_READ: Beginning = { chunks: [], whole: false };

/** Why the core refused to open the Family, if the answer that begins so is such a refusal: none is longer than the Router reads. */
const refusalIn = (status: number, { chunks, whole }: Beginning): string | undefined =>
  whole ? openingRefusal(status, pageErrorCode(Buffer.concat(chunks).toString())) : undefined;

/**
 * Why a request goes on to the next core although the answer does not say that the core refused
 * the Family, which only a request without a body does: after a 503, which such a request may
 * always be asked again after, and after a 409 to HEAD, whose answer has no body to say it.
 */
function unexplainedRefusal(method: string | undefined, status: number): string | undefined {
  if (!isBodiless(method)) return undefined;
  return status === 503 || (method === "HEAD" && status === 409) ? String(status) : undefined;
}

/** Passes a core's answer back to the browser unchanged: its status and headers, what the Router read of it, and the rest. */
function relay(fromCore: IncomingMessage, { chunks, whole }: Beginning, outgoing: ServerResponse, brokeOff: (error: Error) => void): void {
  outgoing.writeHead(fromCore.statusCode ?? 502, headersFromCore(fromCore.rawHeaders));
  for (const chunk of chunks) outgoing.write(chunk);
  if (whole) {
    outgoing.end();
    return;
  }
  pipeline(fromCore, outgoing, (error) => {
    if (error) brokeOff(error);
  });
}

/**
 * Reads the beginning of what a browser or a core sends: all of it (`whole`) if it is at most
 * `limit` bytes, or else what arrived until it was more, the rest still to be read from the
 * stream. Undefined if it broke off before either.
 */
function beginningOf(stream: IncomingMessage, limit: number): Promise<Beginning | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const settle = (whole: boolean | undefined): void => {
      stream.off("data", onData).off("end", onEnd).off("close", onBreak).off("error", onBreak);
      stream.pause();
      resolve(whole === undefined ? undefined : { chunks, whole });
    };
    const onData = (chunk: Buffer): void => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > limit) settle(false);
    };
    const onEnd = (): void => {
      settle(true);
    };
    const onBreak = (): void => {
      settle(undefined);
    };
    stream.on("data", onData).on("end", onEnd).on("close", onBreak).on("error", onBreak);
  });
}

/** Gives the Router's own answer, or breaks the answer off if a core's has begun. */
function answer(outgoing: ServerResponse, { status, headers, body }: Refusal): void {
  if (outgoing.headersSent) {
    outgoing.destroy();
    return;
  }
  outgoing.writeHead(status, headers).end(body);
}
