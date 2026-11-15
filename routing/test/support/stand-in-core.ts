/**
 * The stand-in core, and with it the contract between the Routing module and the public core.
 *
 * The core's side (artkoenig/family-agenda#362) is not released, so its documentation of the
 * Context and of the triggered operations does not exist yet. Until it does, this module is where
 * that contract is written down: the Routing module's tests expect exactly what this stand-in
 * accepts. When the core documents its side, this module follows the documentation, and the
 * walk-through against the real core image (#101) shows any difference.
 *
 * ## The Context
 *
 * - Sent in the request header `X-Family-Agenda-Context`.
 * - A JWT encrypted as a compact JWE (RFC 7516) with `alg: "dir"` and `enc: "A256GCM"`: the
 *   Context key itself is the content key, so the Context is both encrypted and authenticated
 *   ("signed") with it. The Context key is 32 bytes, given to both sides as standard base64.
 * - Claims: `iat` and `exp` (seconds; a short lifetime), and the ones in {@link Context}.
 * - A Context that does not decrypt with the Context key, or whose `exp` has passed, is rejected
 *   with 401 and opens nothing.
 *
 * ## Triggered operations
 *
 * - `POST /operations/prepare-family`: brings the database the Context names up to date and
 *   writes the Family id into it. Safe to call again. Answers 200 `{ "coreVersion": "<version>" }`.
 * - `POST /operations/enter-admin` with JSON `{ "email": "<address>" }`: enters an Admin with that
 *   email address and no password, which closes the setup page. Needs a prepared Family (409
 *   otherwise). Answers 201 when the Admin is new and 200 when one with that address exists.
 * - `POST /operations/reset-admin-password` with JSON `{ "email": "<address>" }`: draws a new
 *   password for the Admin with that email address, sets it and ends their sessions, as the core's
 *   `family-agenda reset-admin-password <email>` does inside an Instance. Answers 200
 *   `{ "password": "<new password>" }`, the only place the password is ever given out; 404
 *   `{ "error": "unknown-admin" }` when the Family has no Admin with that address (a 404 without
 *   that error code is no answer of this operation); 409 for a Family that is not prepared.
 * - `POST /operations/run-due-work`: polls each of the Family's Sources that is due, as the core
 *   decides; the caller only gives it the occasion. Needs a prepared Family (409 otherwise).
 *   Answers 200 `{ "ran": <Sources polled>, "failed": <of those, Sources that failed> }` once the
 *   run has ended.
 * - `POST /operations/purge-messages`: deletes the Family's messages past their retention.
 *   Needs a prepared Family (409 otherwise). Answers 200 `{ "purged": <n>, "deleted": <n> }`.
 * - `POST /operations/sweep-secrets`: removes the Family's secrets no Source refers to any more.
 *   Needs a prepared Family (409 otherwise). Answers 200 `{ "removed": <n> }`. It is triggered
 *   per Family like the others, not once for all: the secrets are in each Family's own database,
 *   which the core opens only with that Family's Context.
 *
 * A triggered operation answers once it has ended, however long that takes; the Routing module
 * gives a call up after a long timeout of its own.
 *
 * ## Requests from browsers
 *
 * - The Router passes a Family's request on below the root, its Family id removed from the path
 *   (`/<family id>/agendas/1` arrives as `/agendas/1`), with that Family's Context. The core emits
 *   its addresses below the Context's `pathPrefix`.
 * - Static files (`/static/...`) and the health check (`GET /api/health`) are the same for every
 *   Family: they are served without a Context.
 * - The core runs with `TRUST_PROXY=true` and takes the client from the Router's headers, as its
 *   documentation (docs/configuration.md, `TRUST_PROXY`) says: the scheme from the first entry of
 *   `X-Forwarded-Proto`, the host from `X-Forwarded-Host`, and the client's address from the last
 *   entry of `X-Forwarded-For`.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, type HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import { jwtDecrypt } from "jose";
import type { SourcesPolled } from "../../src/core";

export const CONTEXT_HEADER = "x-family-agenda-context";

/** The version the stand-in answers "prepare the Family" with. */
export const STAND_IN_CORE_VERSION = "0.0.0-stand-in";

/** What a Context tells the core about the Family a request or operation is for. */
export type Context = {
  familyId: string;
  /** The Family's own database, and the role to open it with. */
  database: { host: string; port: number; name: string; user: string; password: string };
  /** The key the core encrypts the Family's Source credentials with: 32 bytes, base64. */
  familyKey: string;
  /** The directory the core keeps the Family's blobs in. */
  blobLocation: string;
  /** IANA time zone, where the Family's days start. */
  timeZone: string;
  /**
   * The Family's public address, with the path prefix and without a trailing slash:
   * `https://app.family-agenda.cloud/<family id>`. The core emits its addresses below it; the
   * address the Operator hands out is this with a trailing slash.
   */
  publicUrl: string;
  /** The path prefix the core emits its addresses below: `/<family id>`. */
  pathPrefix: string;
  /** The Identity Provider, as the core's `OIDC_*` settings name it; null when there is none. */
  identityProvider: { issuerUrl: string; clientId: string; clientSecret: string; requiredGroup: string } | null;
  /**
   * Who may sign in through the Identity Provider: `known-admins-only` signs in a person only if
   * an Admin with their verified email address exists, and never makes anyone an Admin.
   */
  identityProviderSignIn: "known-admins-only";
  iat: number;
  exp: number;
};

/** Opens a Context with the Context key, as the core does; throws if it cannot or it has expired. */
export async function openContext(token: string, contextKey: string, at: Date = new Date()): Promise<Context> {
  const { payload } = await jwtDecrypt(token, Buffer.from(contextKey, "base64"), {
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
    currentDate: at,
    requiredClaims: ["exp", "iat"],
  });
  return payload as unknown as Context;
}

/** The client of a request as a core with `TRUST_PROXY=true` takes it from the headers. */
export function clientOf({ headers }: RecordedRequest): { address: string | undefined; scheme: "https" | "http"; host: string | undefined } {
  return {
    address: headers["x-forwarded-for"]?.split(",").at(-1)?.trim(),
    scheme: headers["x-forwarded-proto"]?.split(",")[0]?.trim() === "https" ? "https" : "http",
    host: headers["x-forwarded-host"] ?? headers.host,
  };
}

export type RecordedRequest = {
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

type Operation = "prepare-family" | "enter-admin" | "reset-admin-password" | "run-due-work" | "purge-messages" | "sweep-secrets";

/** An answer the stand-in gives as it is, to show that it reaches the browser unchanged. */
export type CannedAnswer = { status: number; headers: [string, string][]; body: Uint8Array };

/** What a core serves the same for every Family, without a Context. */
const isFamilyIndependent = (method: string, path: string) =>
  path.startsWith("/static/") || (method === "GET" && path === "/api/health");

export type StandInCore = {
  url: string;
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
  /** The next page, static file or health check is answered with this, whatever was asked. */
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
  close(): Promise<void>;
};

/** Starts the stand-in core on a free port of localhost. */
export async function startStandInCore(contextKey: string): Promise<StandInCore> {
  const requests: RecordedRequest[] = [];
  const prepared = new Set<string>();
  const admins = new Map<string, string[]>();
  const faults = new Map<Operation, number>();
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

  const app = new Hono<{ Variables: { context: Context } }>();
  app.use(async (c, next) => {
    const sealedContext = c.req.header(CONTEXT_HEADER) ?? null;
    const context = sealedContext ? await openContext(sealedContext, contextKey).catch(() => null) : null;
    const body: unknown = c.req.header("content-type")?.startsWith("application/json") ? await c.req.json() : null;
    const search = new URL(c.req.url).search;
    requests.push({ method: c.req.method, path: c.req.path, search, headers: c.req.header(), sealedContext, context, body });
    if (isFamilyIndependent(c.req.method, c.req.path)) return cannedAnswer() ?? c.json({ familyIndependent: c.req.path });
    if (!context) return c.json({ error: "no valid Context" }, 401);
    c.set("context", context);
    await next();
  });
  const fault = (operation: Operation) => {
    const status = faults.get(operation);
    faults.delete(operation);
    return status;
  };

  app.post("/operations/prepare-family", (c) => {
    const status = fault("prepare-family");
    if (status) return c.json({ error: "fault" }, status as 500);
    prepared.add(c.get("context").familyId);
    return c.json({ coreVersion: STAND_IN_CORE_VERSION });
  });
  app.post("/operations/enter-admin", async (c) => {
    const status = fault("enter-admin");
    if (status) return c.json({ error: "fault" }, status as 500);
    const { familyId } = c.get("context");
    if (!prepared.has(familyId)) return c.json({ error: "Family not prepared" }, 409);
    const { email } = await c.req.json<{ email: string }>();
    const entered = admins.get(familyId) ?? [];
    if (entered.includes(email)) return c.json({ created: false }, 200);
    admins.set(familyId, [...entered, email]);
    return c.json({ created: true }, 201);
  });
  app.post("/operations/reset-admin-password", async (c) => {
    const status = fault("reset-admin-password");
    if (status) return c.json({ error: "fault" }, status as 500);
    const { familyId } = c.get("context");
    if (!prepared.has(familyId)) return c.json({ error: "Family not prepared" }, 409);
    const { email } = await c.req.json<{ email: string }>();
    if (!(admins.get(familyId) ?? []).includes(email)) return c.json({ error: "unknown-admin" }, 404);
    const password = randomBytes(12).toString("base64url");
    passwords.set(passwordKey(familyId, email), password);
    return c.json({ password });
  });

  /** A triggered operation on a prepared Family, which answers what `answer` gives: a body, or a failing status. */
  const triggered = (operation: Operation, answer: (familyId: string) => Promise<object | number>) => {
    app.post(`/operations/${operation}`, async (c) => {
      const status = fault(operation);
      if (status) return c.json({ error: "fault" }, status as 500);
      const { familyId } = c.get("context");
      if (!prepared.has(familyId)) return c.json({ error: "Family not prepared" }, 409);
      const answered = await answer(familyId);
      return typeof answered === "number" ? c.json({ error: "fault" }, answered as 500) : c.json(answered);
    });
  };
  triggered("run-due-work", async (familyId) => {
    // Held until released; the hold stays in place for releaseAll() while the run waits.
    await held.get(familyId)?.until;
    return dueWork.get(familyId) ?? { ran: 0, failed: 0 };
  });
  triggered("purge-messages", () => Promise.resolve({ purged: 0, deleted: 0 }));
  triggered("sweep-secrets", () => Promise.resolve({ removed: 0 }));

  // Every other page of the Family: says which Family and page it served.
  app.all("*", (c) => {
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

  const server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1", createServer }, () => {
      resolve(started as Server);
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    admins: (familyId) => admins.get(familyId) ?? [],
    password: (familyId, email) => passwords.get(passwordKey(familyId, email)),
    isPrepared: (familyId) => prepared.has(familyId),
    failNext: (operation, status = 500) => faults.set(operation, status),
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
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
