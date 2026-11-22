/**
 * The stand-in core: the public core in supplied mode, as it prepares a Family on opening it
 * (artkoenig/family-agenda#405), as far as the Routing module uses it.
 * It follows the core's documentation (docs/configuration.md of the core, "Supplied mode" and
 * "Triggered operations"), and the walk-through against the real core image
 * (test/real-core/walk-through.test.ts) shows any difference, which is then fixed here.
 *
 * ## Two ports
 *
 * - Its pages on `CALLER_PORT` ({@link StandInCore.url}), the only port a core in supplied mode
 *   serves them on, for the Router alone.
 * - Its triggered operations on `TRIGGER_PORT` ({@link StandInCore.triggerUrl}), each requiring
 *   `Authorization: Bearer <TRIGGER_TOKEN>` (401 `{ "error": "unauthorized" }` otherwise, checked
 *   first) and the Context of the Family it acts on.
 *
 * ## The Context
 *
 * - Sent in the request header `X-Family-Context`, sealed as `v1.<iv>.<ciphertext>.<tag>` with
 *   AES-256-GCM under a key derived from `CONTEXT_KEY` (see test/support/core-context.ts).
 * - One that does not open, or has expired, is refused with 401 and opens nothing.
 * - The first page or operation with a Context whose database this release has not prepared
 *   prepares it, with the Context's Family id, and is then served: the caller has no step of its
 *   own for it.
 * - The first opening records the Context's `organizationId`, the Family's Logto Organization; a
 *   later Context naming another is refused with 403, a page with the text
 *   `organization-id-differs: …`, an operation with `{ "error": "organization-id-differs" }`.
 *   Another core answers it alike. A Context without one leaves what is recorded as it is.
 * - A Context carrying `identityProvider`, which the core takes from its own `OIDC_*` variables,
 *   is refused with 400.
 * - A core that does not open the Family refuses the page or operation, and changes nothing:
 *   - a database a newer release migrated, as a core of an older release finds during a rolling
 *     update: 409, a page with the text `migrated-by-newer-release: …`, an operation with
 *     `{ "error": "migrated-by-newer-release" }`. Another core, of that release, may serve it.
 *   - a database being prepared for longer than the core waits: 503, `migrating: …` or
 *     `{ "error": "migrating" }`. A retry is served once preparing is done.
 *   - a database that cannot be reached: 503, `The Family cannot be opened now.` or
 *     `{ "error": "unavailable" }`.
 *
 * ## Triggered operations (`POST /operations/<name>`)
 *
 * - `due-work`: polls the Family's due Sources, then extracts its messages. Answers
 *   `{ "polled": <step>, "extracted": <step> }`, each step `{ "ok": true, "report" }` or
 *   `{ "ok": false, "error" }`; the report of polling names the Sources that `ran` and those that
 *   `failed`.
 * - `purge`: answers `{ "purged", "deleted" }`. `secret-sweep`: answers `{ "removed" }`.
 * - Any other name: 404. A failure: 500 `{ "error": "failed" }`.
 *
 * A triggered operation answers once it has ended, however long that takes.
 *
 * ## Requests from browsers
 *
 * - The Router passes a Family's request on below the root, its Family id removed from the path
 *   (`/<family id>/agendas/1` arrives as `/agendas/1`), with that Family's Context; static files
 *   too. Only `GET /api/health`, the sign-in callback at `/sso/callback` (the path of its
 *   `OIDC_CALLBACK_URL`) and `POST /idp/events` are answered without a Context.
 * - The core runs with `TRUST_PROXY=true` and takes the client from the Router's headers: the
 *   scheme from the first entry of `X-Forwarded-Proto`, the host from `X-Forwarded-Host`, and the
 *   client's address from the last entry of `X-Forwarded-For`.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, type HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import type { ContextClaims } from "../../src/context";
import type { SourcesPolled } from "../../src/core";
import type { Resolve } from "../../src/pool";
import { systemResolve } from "../../src/resolve";
import { openContext } from "./core-context";

export const CONTEXT_HEADER = "x-family-context";

/** The version the stand-in runs, as its health check answers it. */
export const STAND_IN_CORE_VERSION = "0.0.0";

/** A Context as the stand-in opened it, with its database read from `databaseUrl` as the core reads it. */
export type Context = ContextClaims & { database: { host: string; port: number; name: string; user: string; password: string } };

export { openContext };

/** The client of a request as a core with `TRUST_PROXY=true` takes it from the headers. */
export function clientOf({ headers }: RecordedRequest): { address: string | undefined; scheme: "https" | "http"; host: string | undefined } {
  return {
    address: headers["x-forwarded-for"]?.split(",").at(-1)?.trim(),
    scheme: headers["x-forwarded-proto"]?.split(",")[0]?.trim() === "https" ? "https" : "http",
    host: headers["x-forwarded-host"] ?? headers.host,
  };
}

export type RecordedRequest = {
  /** The port it arrived at: the pages' or the triggered operations'. */
  on: "caller" | "trigger";
  method: string;
  path: string;
  /** The query string with its `?`, or "" when there was none. */
  search: string;
  /** The request's headers, names in lower case. */
  headers: Record<string, string>;
  /** The Context as sent, sealed; null when the request carried none. */
  sealedContext: string | null;
  /** The opened Context; null when there was none or it did not open. */
  context: Context | null;
  body: unknown;
};

type Operation = "due-work" | "purge" | "secret-sweep";

/** The path of the core's `OIDC_CALLBACK_URL`, the Routing module's default. */
export const CALLBACK_PATH = "/sso/callback";

/** An answer the stand-in gives as it is, to show that it reaches the browser unchanged. */
export type CannedAnswer = { status: number; headers: [string, string][]; body: Uint8Array };

/** Why a core does not open a Family: see "The Context" above. */
export type OpeningProblem = "migrated-by-newer-release" | "migrating" | "unavailable";

/** What a core answers instead of opening the Family: the status, and the text of a page's refusal. */
const OPENING_REFUSALS: Record<OpeningProblem, { status: 409 | 503; text: string }> = {
  "migrated-by-newer-release": {
    status: 409,
    text: "migrated-by-newer-release: a newer release migrated the database the Context names; another core may serve it.",
  },
  migrating: { status: 503, text: "migrating: the Family's database is being prepared; try again shortly." },
  unavailable: { status: 503, text: "The Family cannot be opened now." },
};

export type StandInCore = {
  /** Where it serves the pages: its CALLER_PORT. */
  url: string;
  /** Where it serves the triggered operations: its TRIGGER_PORT. */
  triggerUrl: string;
  /** Every request that arrived, in order. */
  requests: RecordedRequest[];
  /** The Organization id the first opening of the Family recorded, if any. */
  organizationOf(familyId: string): string | undefined;
  /** Whether a core prepared the Family, as the first one to open it does. */
  isPrepared(familyId: string): boolean;
  /** The next call of the operation answers with this status, and does nothing. */
  failNext(operation: Operation, status?: number): void;
  /**
   * The next call of the triggered operation is received and then its connection is dropped
   * without an answer, as by a core that dies while at work on it.
   */
  dropNextCall(operation: Operation): void;
  /** The next page or health check is answered with this, whatever was asked. */
  answerNext(answer: CannedAnswer): void;
  /** The next page of a Family begins its answer and then drops the connection. */
  dropNext(): void;
  /**
   * The next page of a Family is received and then its connection is dropped without an answer,
   * as by a core that dies while at work on it.
   */
  dropNextUnanswered(): void;
  /** The Family's runs of due work answer this from now on; `{ ran: 0, failed: 0 }` until set. */
  answerDueWork(familyId: string, result: SourcesPolled): void;
  /** The Family's runs of due work fail with this status from now on. */
  failDueWork(familyId: string, status?: number): void;
  /**
   * The Family's runs of due work stay under way until the answered function is called, as a
   * run that polls slow Sources does.
   */
  holdDueWork(familyId: string): () => void;
  /** Ends every run held under way. */
  releaseAll(): void;
  /** Stops listening on both ports, as a core that is restarted does: a call to it finds nobody there. */
  goDown(): Promise<void>;
  /** Listens again on the same address, with everything it knew before. */
  comeBack(): Promise<void>;
  /**
   * From now on this core does not open the Family and refuses its pages and operations with
   * `problem`, as a core of an older release does for a database a newer one migrated; undefined
   * has it open the Family again.
   */
  refuseFamily(familyId: string, problem: OpeningProblem | undefined): void;
  /** From now on this core opens no Family at all and refuses each with `problem`; undefined has it open them again. */
  refuseEveryFamily(problem: OpeningProblem | undefined): void;
  close(): Promise<void>;
};


/** A core as a pool names it: where it serves its pages, and where its triggered operations. */
type PoolMember = Pick<StandInCore, "url" | "triggerUrl">;

/** The pool as the Routing module is told it: one name for the cores' pages, the same one for their triggered operations. */
export type PoolAddresses = { CORE_URL: string; CORE_TRIGGER_URL: string };

/** The cores each pool's name stands for now, as the Cube's name service knows the replicas of the cores' service. */
const pools = new Map<string, PoolMember[]>();

/**
 * A pool of these cores, in this order, as the Routing module is told it: by one name, which
 * {@link resolveStandIns} resolves to the cores it stands for at that moment.
 */
export const poolOf = (...cores: PoolMember[]): PoolAddresses => {
  const name = `pool-${pools.size + 1}.test`;
  pools.set(name, cores);
  return { CORE_URL: `http://${name}:3002`, CORE_TRIGGER_URL: `http://${name}:3001` };
};

/** Scales the pool: from now on its name stands for these cores, as after `docker compose up --scale`. */
export const scalePool = ({ CORE_URL }: PoolAddresses, ...cores: PoolMember[]): void => {
  pools.set(new URL(CORE_URL).hostname, cores);
};

/**
 * Resolves a pool's name to its stand-in cores, which listen on ports of their own on localhost
 * where the replicas of a service share one port; any other address as the system does.
 */
export const resolveStandIns: Resolve = async (address) => {
  const cores = pools.get(address.hostname);
  if (!cores) return systemResolve(address);
  return cores.map(({ url, triggerUrl }) => new URL(address.port === "3001" ? triggerUrl : url));
};

/** The due-work answer of the core for a run that polled `ran` due Sources, `failed` of which failed. */
function dueWorkAnswer({ ran, failed }: SourcesPolled): object {
  const sourceIds = Array.from({ length: ran }, (_, index) => `source-${index + 1}`);
  const report = {
    ran: sourceIds.slice(failed),
    failed: sourceIds.slice(0, failed).map((sourceId) => ({ sourceId, kind: "temporary", message: "the Source did not answer" })),
    invalid: [],
    refused: [],
    lost: [],
  };
  return { polled: { ok: true, report }, extracted: { ok: true, report: { extracted: 0 } } };
}

/** The Context opened, or null if it does not open. */
function openedOrNull(sealedContext: string, contextKey: string): Context | null {
  try {
    const context = openContext(sealedContext, contextKey);
    const url = new URL(context.databaseUrl);
    const database = {
      host: url.hostname,
      port: Number(url.port || "5432"),
      name: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
    return { ...context, database };
  } catch {
    return null;
  }
}

type Variables = { Variables: { context: Context } };

/**
 * The Families prepared, shared by every stand-in core: a core keeps that in the Family's
 * database, which all cores of a pool open, so a Family one core prepared is prepared for all.
 */
const prepared = new Set<string>();

/** The Organization id recorded per Family, shared by every stand-in core as `prepared` is. */
const organizations = new Map<string, string>();

/** Starts the stand-in core on two free ports of localhost: its pages', and its triggered operations'. */
export async function startStandInCore(contextKey: string, triggerToken: string): Promise<StandInCore> {
  const requests: RecordedRequest[] = [];
  const faults = new Map<Operation, number>();
  const drops = new Set<Operation>();
  let canned: CannedAnswer | undefined;
  let dropping = false;
  let droppingUnanswered = false;
  const cannedAnswer = () => {
    const answer = canned;
    canned = undefined;
    return answer && new Response(answer.body, { status: answer.status, headers: answer.headers });
  };
  /** What each Family's runs of due work answer: a result, or a failing status. */
  const dueWork = new Map<string, SourcesPolled | number>();
  /** The Families whose next run of due work is held, and what releases it. */
  const held = new Map<string, { until: Promise<void>; release: () => void }>();

  /** The Families this core does not open, and why. */
  const refusedFamilies = new Map<string, OpeningProblem>();
  let refusedAll: OpeningProblem | undefined;

  /** Records the request, opens its Context and with it the Family, which the first opening prepares. */
  const recording = (on: RecordedRequest["on"], app: Hono<Variables>) =>
    app.use(async (c, next) => {
      const sealedContext = c.req.header(CONTEXT_HEADER) ?? null;
      const context = sealedContext ? openedOrNull(sealedContext, contextKey) : null;
      const body: unknown = c.req.header("content-type")?.startsWith("application/json") ? await c.req.json() : null;
      const search = new URL(c.req.url).search;
      requests.push({ on, method: c.req.method, path: c.req.path, search, headers: c.req.header(), sealedContext, context, body });
      if (on === "trigger" && c.req.header("authorization") !== `Bearer ${triggerToken}`) return c.json({ error: "unauthorized" }, 401);
      if (on === "caller" && c.req.method === "GET" && c.req.path === "/api/health") return cannedAnswer() ?? c.json({ status: "ok", version: STAND_IN_CORE_VERSION });
      if (on === "caller" && !sealedContext && ((c.req.method === "GET" && c.req.path === CALLBACK_PATH) || (c.req.method === "POST" && c.req.path === "/idp/events")))
        return cannedAnswer() ?? c.json({ familyIndependent: c.req.path });
      if (!context) return c.text("A valid Context is required.", 401);
      if ("identityProvider" in context) {
        const text = "The Context is refused: identityProvider comes from the OIDC_* variables.";
        return on === "trigger" ? c.json({ error: "invalid-context", problem: text }, 400) : c.text(text, 400);
      }
      const recorded = organizations.get(context.familyId);
      if (recorded !== undefined && context.organizationId !== undefined && context.organizationId !== recorded) {
        return on === "trigger"
          ? c.json({ error: "organization-id-differs" }, 403)
          : c.text("organization-id-differs: the Context names another organization than the one the Family's database holds.", 403);
      }
      const problem = refusedAll ?? refusedFamilies.get(context.familyId);
      if (problem) {
        const { status, text } = OPENING_REFUSALS[problem];
        return on === "trigger" ? c.json({ error: problem }, status) : c.text(text, status, { "cache-control": "no-store" });
      }
      prepared.add(context.familyId);
      if (recorded === undefined && context.organizationId !== undefined) organizations.set(context.familyId, context.organizationId);
      c.set("context", context);
      await next();
    });

  const pages = new Hono<Variables>();
  recording("caller", pages);
  const operations = new Hono<Variables>();
  recording("trigger", operations);

  const fault = (operation: Operation) => {
    const status = faults.get(operation);
    faults.delete(operation);
    return status;
  };

  /** A triggered operation, which answers what `answer` gives: a body, or a failing status. */
  const triggered = (operation: Operation, answer: (context: Context) => Promise<object | number> | object | number) => {
    operations.post(`/operations/${operation}`, async (c) => {
      const status = fault(operation);
      if (status) return c.json({ error: "failed" }, status as 500);
      if (drops.delete(operation)) {
        (c.env as HttpBindings).outgoing.socket?.destroy();
        return RESPONSE_ALREADY_SENT;
      }
      const answered = await answer(c.get("context"));
      if (typeof answered === "number") return c.json({ error: "failed" }, answered as 500);
      return c.json(answered);
    });
  };
  triggered("due-work", async ({ familyId }) => {
    // Held until released; the hold stays in place for releaseAll() while the run waits.
    await held.get(familyId)?.until;
    const answer = dueWork.get(familyId) ?? { ran: 0, failed: 0 };
    return typeof answer === "number" ? answer : dueWorkAnswer(answer);
  });
  triggered("purge", () => ({ purged: 0, deleted: 0 }));
  triggered("secret-sweep", () => ({ removed: 0 }));
  operations.notFound((c) => c.json({ error: "unknown-operation" }, 404));

  // Every other page of the Family, static files included: says which Family and page it served.
  pages.all("*", (c) => {
    if (droppingUnanswered) {
      droppingUnanswered = false;
      (c.env as HttpBindings).outgoing.socket?.destroy();
      return RESPONSE_ALREADY_SENT;
    }
    if (dropping) {
      // Begins the answer, then drops the connection, as a core that dies mid-answer does.
      dropping = false;
      const { outgoing } = c.env as HttpBindings;
      outgoing.writeHead(200, { "content-type": "text/plain", "content-length": "1000" });
      outgoing.write("the beginning of a page", () => outgoing.socket?.destroy());
      return RESPONSE_ALREADY_SENT;
    }
    return cannedAnswer() ?? c.json({ familyId: c.get("context").familyId, path: c.req.path });
  });

  const listen = (app: Hono<Variables>) =>
    new Promise<Server>((resolve) => {
      const started = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1", createServer }, () => {
        resolve(started as Server);
      });
    });
  const servers = [await listen(pages), await listen(operations)] as const;
  const [port, triggerPort] = servers.map((server) => (server.address() as AddressInfo).port) as [number, number];
  const closing = (server: Server, all: boolean) =>
    new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      if (all) server.closeAllConnections();
    });
  const reopening = (server: Server, at: number) =>
    new Promise<void>((resolve) => {
      server.listen(at, "127.0.0.1", resolve);
    });
  return {
    url: `http://127.0.0.1:${port}`,
    triggerUrl: `http://127.0.0.1:${triggerPort}`,
    requests,
    organizationOf: (familyId) => organizations.get(familyId),
    isPrepared: (familyId) => prepared.has(familyId),
    failNext: (operation, status = 500) => faults.set(operation, status),
    dropNextCall: (operation) => drops.add(operation),
    answerNext: (answer) => {
      canned = answer;
    },
    dropNext: () => {
      dropping = true;
    },
    dropNextUnanswered: () => {
      droppingUnanswered = true;
    },
    answerDueWork: (familyId, result) => dueWork.set(familyId, result),
    failDueWork: (familyId, status = 500) => dueWork.set(familyId, status),
    holdDueWork(familyId) {
      let resolve = () => {};
      const until = new Promise<void>((resolved) => {
        resolve = resolved;
      });
      const release = () => {
        if (held.get(familyId)?.until === until) held.delete(familyId);
        resolve();
      };
      held.set(familyId, { until, release });
      return release;
    },
    releaseAll() {
      for (const { release } of held.values()) release();
    },
    goDown: async () => {
      await Promise.all(servers.map((server) => closing(server, true)));
    },
    comeBack: async () => {
      await Promise.all([reopening(servers[0], port), reopening(servers[1], triggerPort)]);
    },
    refuseEveryFamily(problem) {
      refusedAll = problem;
    },
    refuseFamily(familyId, problem) {
      if (problem) refusedFamilies.set(familyId, problem);
      else refusedFamilies.delete(familyId);
    },
    close: async () => {
      await Promise.all(servers.map((server) => closing(server, false)));
    },
  };
}
