/**
 * The stand-in core: the public core 0.7.0 in supplied mode, as far as the Routing module uses it.
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
 * - A Context for a database that holds no prepared Family is refused with 409
 *   `family-not-prepared`, by every page and operation but `prepare-family`.
 *
 * ## Triggered operations (`POST /operations/<name>`)
 *
 * - `prepare-family`: prepares the database the Context names with its Family id. Safe to call
 *   again. Answers `{ "familyId" }`; a body `{ "familyId" }` naming another Family is refused 400.
 *   It answers no version: the core's `GET /api/health` answers `{ "status": "ok", "version" }`.
 * - `enter-admin` with `{ "email" }`: enters an Admin without a password. Answers
 *   `{ "email", "outcome": "first" | "added" | "exists" }`.
 * - `reset-admin-password` with `{ "email" }`: draws and sets a new password, ending the Admin's
 *   sessions. Answers `{ "email", "newPassword" }`, or 404 `{ "error": "unknown-admin" }`.
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
 *   too. Only `GET /api/health` is answered without a Context.
 * - The core runs with `TRUST_PROXY=true` and takes the client from the Router's headers: the
 *   scheme from the first entry of `X-Forwarded-Proto`, the host from `X-Forwarded-Host`, and the
 *   client's address from the last entry of `X-Forwarded-For`.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, type HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import type { ContextClaims } from "../../src/context";
import type { SourcesPolled } from "../../src/core";
import { openContext } from "./core-context";

export const CONTEXT_HEADER = "x-family-context";

/** The version the stand-in runs, and answers "prepare the Family" with, until told otherwise. */
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

type Operation = "prepare-family" | "enter-admin" | "reset-admin-password" | "due-work" | "purge" | "secret-sweep";

/** An answer the stand-in gives as it is, to show that it reaches the browser unchanged. */
export type CannedAnswer = { status: number; headers: [string, string][]; body: Uint8Array };

export type StandInCore = {
  /** Where it serves the pages: its CALLER_PORT. */
  url: string;
  /** Where it serves the triggered operations: its TRIGGER_PORT. */
  triggerUrl: string;
  /** Every request that arrived, in order. */
  requests: RecordedRequest[];
  /** The Admins entered per Family id. */
  admins(familyId: string): string[];
  /** The password the stand-in last gave out for an Admin of a Family, if any. */
  password(familyId: string, email: string): string | undefined;
  /** Whether a Family was prepared. */
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
  /** From now on the stand-in runs this version, as a core of a new release does. */
  runVersion(version: string): void;
  close(): Promise<void>;
};


/** The pool of stand-in cores as the Routing module is told it: their pages and their triggered operations, in the same order. */
export const poolOf = (...cores: Pick<StandInCore, "url" | "triggerUrl">[]): { CORE_URLS: string; CORE_TRIGGER_URLS: string } => ({
  CORE_URLS: cores.map(({ url }) => url).join(","),
  CORE_TRIGGER_URLS: cores.map(({ triggerUrl }) => triggerUrl).join(","),
});

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

/** A refusal a triggered operation answers with, as the core does: the status and `{ "error" }`. */
type Refusal = { refused: 400 | 404; error: string };

/** Starts the stand-in core on two free ports of localhost: its pages', and its triggered operations'. */
export async function startStandInCore(contextKey: string, triggerToken: string): Promise<StandInCore> {
  const requests: RecordedRequest[] = [];
  const admins = new Map<string, string[]>();
  const faults = new Map<Operation, number>();
  const drops = new Set<Operation>();
  let canned: CannedAnswer | undefined;
  let dropping = false;
  const cannedAnswer = () => {
    const answer = canned;
    canned = undefined;
    return answer && new Response(answer.body, { status: answer.status, headers: answer.headers });
  };
  const passwords = new Map<string, string>();
  const passwordKey = (familyId: string, email: string) => `${familyId}/${email}`;
  /** What each Family's runs of due work answer: a result, or a failing status. */
  const dueWork = new Map<string, SourcesPolled | number>();
  /** The Families whose next run of due work is held, and what releases it. */
  const held = new Map<string, { until: Promise<void>; release: () => void }>();

  let version = STAND_IN_CORE_VERSION;

  /** Records the request, and opens its Context; the Context of a Family not prepared is refused, but by prepare-family. */
  const recording = (on: RecordedRequest["on"], app: Hono<Variables>) =>
    app.use(async (c, next) => {
      const sealedContext = c.req.header(CONTEXT_HEADER) ?? null;
      const context = sealedContext ? openedOrNull(sealedContext, contextKey) : null;
      const body: unknown = c.req.header("content-type")?.startsWith("application/json") ? await c.req.json() : null;
      const search = new URL(c.req.url).search;
      requests.push({ on, method: c.req.method, path: c.req.path, search, headers: c.req.header(), sealedContext, context, body });
      if (on === "trigger" && c.req.header("authorization") !== `Bearer ${triggerToken}`) return c.json({ error: "unauthorized" }, 401);
      if (on === "caller" && c.req.method === "GET" && c.req.path === "/api/health") return cannedAnswer() ?? c.json({ status: "ok", version });
      if (!context) return c.text("A valid Context is required.", 401);
      if (!prepared.has(context.familyId) && c.req.path !== "/operations/prepare-family") {
        return c.text("family-not-prepared: the database the Context names holds no prepared Family.", 409);
      }
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
  const triggered = (operation: Operation, answer: (context: Context, body: Record<string, unknown>) => Promise<object | number> | object | number) => {
    operations.post(`/operations/${operation}`, async (c) => {
      const status = fault(operation);
      if (status) return c.json({ error: "failed" }, status as 500);
      if (drops.delete(operation)) {
        (c.env as HttpBindings).outgoing.socket?.destroy();
        return RESPONSE_ALREADY_SENT;
      }
      const body = (requests.at(-1)?.body ?? {}) as Record<string, unknown>;
      const answered = await answer(c.get("context"), body);
      if (typeof answered === "number") return c.json({ error: "failed" }, answered as 500);
      if ("refused" in answered) return c.json({ error: (answered as Refusal).error }, (answered as Refusal).refused);
      return c.json(answered);
    });
  };
  operations.post("/operations/prepare-family", (c, next) => {
    const body = requests.at(-1)?.body as { familyId?: unknown } | null;
    if (body?.familyId !== undefined && body.familyId !== c.get("context").familyId) return c.json({ error: "family-id-not-the-contexts" }, 400);
    return next();
  });
  triggered("prepare-family", ({ familyId }) => {
    prepared.add(familyId);
    return { familyId };
  });
  triggered("enter-admin", ({ familyId }, { email }) => {
    const address = String(email);
    const entered = admins.get(familyId) ?? [];
    if (entered.includes(address)) return { email: address, outcome: "exists" };
    admins.set(familyId, [...entered, address]);
    return { email: address, outcome: entered.length === 0 ? "first" : "added" };
  });
  triggered("reset-admin-password", ({ familyId }, { email }) => {
    const address = String(email);
    if (!(admins.get(familyId) ?? []).includes(address)) return { refused: 404, error: "unknown-admin" } satisfies Refusal;
    const newPassword = randomBytes(12).toString("base64url");
    passwords.set(passwordKey(familyId, address), newPassword);
    return { email: address, newPassword };
  });
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
    admins: (familyId) => admins.get(familyId) ?? [],
    password: (familyId, email) => passwords.get(passwordKey(familyId, email)),
    isPrepared: (familyId) => prepared.has(familyId),
    failNext: (operation, status = 500) => faults.set(operation, status),
    dropNextCall: (operation) => drops.add(operation),
    answerNext: (answer) => {
      canned = answer;
    },
    dropNext: () => {
      dropping = true;
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
    runVersion(next) {
      version = next;
    },
    close: async () => {
      await Promise.all(servers.map((server) => closing(server, false)));
    },
  };
}
