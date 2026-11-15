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
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { jwtDecrypt } from "jose";

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
  /** The Family's public address, with the path prefix: `https://app.family-agenda.cloud/<family id>`. */
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

export type RecordedRequest = {
  method: string;
  path: string;
  /** The Context as sent, sealed; null when the request carried none. */
  sealedContext: string | null;
  /** The opened Context; null when there was none or it did not open. */
  context: Context | null;
  body: unknown;
};

type Operation = "prepare-family" | "enter-admin";

export type StandInCore = {
  url: string;
  /** Every request that arrived, in order. */
  requests: RecordedRequest[];
  /** The Admins entered per Family id. */
  admins(familyId: string): string[];
  /** Whether a Family was prepared. */
  isPrepared(familyId: string): boolean;
  /** The next call of the operation answers with this status, and does nothing. */
  failNext(operation: Operation, status?: number): void;
  close(): Promise<void>;
};

/** Starts the stand-in core on a free port of localhost. */
export async function startStandInCore(contextKey: string): Promise<StandInCore> {
  const requests: RecordedRequest[] = [];
  const prepared = new Set<string>();
  const admins = new Map<string, string[]>();
  const faults = new Map<Operation, number>();

  const app = new Hono<{ Variables: { context: Context } }>();
  app.use(async (c, next) => {
    const sealedContext = c.req.header(CONTEXT_HEADER) ?? null;
    const context = sealedContext ? await openContext(sealedContext, contextKey).catch(() => null) : null;
    const body: unknown = c.req.header("content-type")?.startsWith("application/json") ? await c.req.json() : null;
    requests.push({ method: c.req.method, path: c.req.path, sealedContext, context, body });
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
    isPrepared: (familyId) => prepared.has(familyId),
    failNext: (operation, status = 500) => faults.set(operation, status),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
