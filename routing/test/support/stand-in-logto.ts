import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Logto's Management API as far as the Routing module uses it: a client-credentials token,
 * listing an Organization's users a page at a time, deleting a user and an Organization, putting
 * email templates, listing, creating and updating connectors, and patching the sign-in experience
 * and the Account Center. Every user and Organization is there until deleted; deleting one again
 * answers 404, and a page larger than Logto lists answers 400, as Logto does.
 *
 * Also its OpenID Connect provider at `<endpoint>/oidc`, as far as central sign-in uses it: listing,
 * creating and patching applications, and the authorization code flow with PKCE (S256) for a
 * Traditional application, whose ID token claims the Organizations the person is a member of
 * when the scope `urn:logto:scope:organizations` was asked for. Who is signed in is set with
 * `signInAs`; `/oidc/auth` with nobody signed in answers `error=login_required` to `prompt=none`
 * and shows a sign-in page otherwise. The claim is taken when `/oidc/auth` answers, as Logto
 * issues the code then; `/oidc/session/end` signs the person out. With the scope `email` the token claims the user's verified email
 * (`emailOf`). The ID token's signature is no real one: central sign-in does not check it.
 */
export type StandInLogto = {
  /** IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET for it. */
  env: { IDP_MANAGEMENT_ENDPOINT: string; IDP_MANAGEMENT_CLIENT_ID: string; IDP_MANAGEMENT_CLIENT_SECRET: string };
  /** The Organizations deleted so far, in order. */
  deleted: string[];
  /** The users deleted so far, in order. */
  deletedUsers: string[];
  /** The ids of the users and Organizations deleted so far, in order. */
  deletions: string[];
  /** The Organizations deleted while they had members left. */
  deletedWithMembers: string[];
  /** Makes `userId` a user of Logto and a member of the Organization. */
  addMember(organizationId: string, userId: string): void;
  /** Whether `userId` is a user of Logto. */
  hasUser(userId: string): boolean;
  /** Answers deleting this user or Organization with 503, until set to null. */
  failDeleting(id: string | null): void;
  /** The bodies of every PUT /api/email-templates, in order. */
  emailTemplatePuts: unknown[];
  /** Every connector, as Logto lists them; POST adds one, PATCH replaces its config. */
  connectors: { id: string; connectorId: string; config: unknown }[];
  /** Every call to the connectors, the sign-in experience and the Account Center, in order. */
  settingCalls: { method: string; path: string; body: unknown }[];
  /** Answers every Management API call with this status, until set to null. */
  failWith(status: number | null): void;
  /** The issuer of its OpenID Connect provider, as OIDC_ISSUER_URL names it. */
  issuer: string;
  /** Every application, as Logto lists them; POST adds one, PATCH merges its oidcClientMetadata. */
  applications: Application[];
  /** Signs `userId` in at Logto, as the person would on its sign-in page; null signs nobody in. */
  signInAs(userId: string | null): void;
  /** Answers the token endpoint's authorization code grant with this status, or drops the connection, until set to null. */
  failTokens(status: number | "drop" | null): void;
  close(): Promise<void>;
};

export type Application = { id: string; name: string; type: string; secret: string; oidcClientMetadata: { redirectUris: string[]; postLogoutRedirectUris: string[] } };

/** What `/oidc/auth` issued a code for. */
type Grant = { clientId: string; redirectUri: string; codeChallenge: string; nonce: string | undefined; userId: string; email: boolean; organizations: string[] | undefined };

/** The verified email of each user, as the ID token claims it when the scope `email` was asked for. */
export const emailOf = (userId: string): string => `${userId}@family.test`;

const CLIENT_ID = "routing-m2m";
const CLIENT_SECRET = "routing-m2m-secret";
const TOKEN = "stand-in-management-token";
const ORGANIZATION = /^\/api\/organizations\/([^/]+)$/;
const ORGANIZATION_USERS = /^\/api\/organizations\/([^/]+)\/users(\?.*)?$/;
const USER = /^\/api\/users\/([^/]+)$/;
/** The largest page Logto lists. */
const MAX_PAGE_SIZE = 100;
const SETTING = /^\/api\/(sign-in-exp|account-center|connectors(\/[^/]+)?)$/;
const APPLICATIONS = /^\/api\/applications(\/[^/]+)?(\/secrets)?$/;
const ORGANIZATIONS_SCOPE = "urn:logto:scope:organizations";

export async function startStandInLogto(): Promise<StandInLogto> {
  const deleted: string[] = [];
  const emailTemplatePuts: unknown[] = [];
  const connectors: StandInLogto["connectors"] = [];
  const settingCalls: StandInLogto["settingCalls"] = [];
  const deletedUsers: string[] = [];
  const deletions: string[] = [];
  const deletedWithMembers: string[] = [];
  const users = new Set<string>();
  const members = new Map<string, string[]>();
  let failing: number | null = null;
  let failingDeletion: string | null = null;
  let failingTokens: number | "drop" | null = null;
  const applications: Application[] = [];
  let signedIn: string | null = null;
  const grants = new Map<string, Grant>();
  let issuer = "";
  const membersLeft = (organizationId: string) => (members.get(organizationId) ?? []).filter((userId) => users.has(userId));
  const server = createServer((incoming, outgoing) => {
    const url = incoming.url ?? "/";
    if (incoming.method === "POST" && url === "/oidc/token") {
      void readText(incoming).then((text) => {
        const form = new URLSearchParams(text);
        if (form.get("grant_type") === "authorization_code") {
          exchangeCode(form, incoming, outgoing);
          return;
        }
        const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
        if (incoming.headers.authorization !== basic) return void outgoing.writeHead(401).end();
        outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }));
      });
      return;
    }
    if (incoming.method === "GET" && url.startsWith("/oidc/auth?")) {
      authorize(new URL(url, "http://logto").searchParams, outgoing);
      return;
    }
    if (incoming.method === "GET" && url.startsWith("/oidc/session/end?")) {
      endSession(new URL(url, "http://logto").searchParams, outgoing);
      return;
    }
    const application = APPLICATIONS.exec(url);
    const organization = ORGANIZATION.exec(url);
    const organizationUsers = incoming.method === "GET" ? ORGANIZATION_USERS.exec(url) : null;
    const user = incoming.method === "DELETE" ? USER.exec(url) : null;
    const templates = incoming.method === "PUT" && url === "/api/email-templates";
    const setting = SETTING.test(url);
    const known = templates || setting || application || organizationUsers || user || (incoming.method === "DELETE" && organization);
    if (!known) return void outgoing.writeHead(404).end();
    if (incoming.headers.authorization !== `Bearer ${TOKEN}`) return void outgoing.writeHead(401).end();
    if (failing !== null) return void outgoing.writeHead(failing).end("refused");
    if (organizationUsers) {
      listUsers(decodeURIComponent(organizationUsers[1]!), new URL(url, "http://logto").searchParams, outgoing);
      return;
    }
    if (user) {
      deleteUser(decodeURIComponent(user[1]!), outgoing);
      return;
    }
    if (templates) {
      putTemplates(incoming, outgoing);
      return;
    }
    if (application) {
      void readJson(incoming).then((body) => {
        answerApplications(incoming.method ?? "", application[1]?.slice(1), application[2] !== undefined, body, outgoing);
      });
      return;
    }
    if (setting) {
      void readJson(incoming).then((body) => {
        settingCalls.push({ method: incoming.method ?? "", path: url, body });
        answerSetting(incoming.method ?? "", url, body, outgoing);
      });
      return;
    }
    const organizationId = decodeURIComponent(organization![1]!);
    if (organizationId === failingDeletion) return void outgoing.writeHead(503).end("refused");
    if (deleted.includes(organizationId)) return void outgoing.writeHead(404).end();
    deleted.push(organizationId);
    deletions.push(organizationId);
    if (membersLeft(organizationId).length > 0) deletedWithMembers.push(organizationId);
    members.delete(organizationId);
    outgoing.writeHead(204).end();
  });
  function listUsers(organizationId: string, query: URLSearchParams, outgoing: ServerResponse) {
    if (deleted.includes(organizationId)) return void outgoing.writeHead(404).end();
    const page = Number(query.get("page") ?? "1");
    const pageSize = Number(query.get("page_size") ?? "20");
    if (pageSize > MAX_PAGE_SIZE) return void outgoing.writeHead(400).end("guard.invalid_pagination");
    const all = membersLeft(organizationId);
    const listed = all.slice((page - 1) * pageSize, page * pageSize).map((id) => ({ id, primaryEmail: `${id}@example.com`, organizationRoles: [] }));
    outgoing.writeHead(200, { "content-type": "application/json", "total-number": String(all.length) }).end(JSON.stringify(listed));
  }
  function deleteUser(userId: string, outgoing: ServerResponse) {
    if (userId === failingDeletion) return void outgoing.writeHead(503).end("refused");
    if (!users.has(userId)) return void outgoing.writeHead(404).end();
    users.delete(userId);
    deletedUsers.push(userId);
    deletions.push(userId);
    outgoing.writeHead(204).end();
  }
  function answerSetting(method: string, url: string, body: unknown, outgoing: ServerResponse) {
    const json = (value: unknown) => outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
    if (url === "/api/connectors" && method === "GET") return void json(connectors);
    if (url === "/api/connectors" && method === "POST") {
      const { connectorId, config } = body as { connectorId: string; config: unknown };
      const connector = { id: `connector-${connectors.length + 1}`, connectorId, config };
      connectors.push(connector);
      return void json(connector);
    }
    const connector = url.startsWith("/api/connectors/") ? connectors.find(({ id }) => `/api/connectors/${id}` === url) : undefined;
    if (url.startsWith("/api/connectors/") && (method !== "PATCH" || !connector)) return void outgoing.writeHead(404).end();
    if (connector) connector.config = (body as { config: unknown }).config;
    if (method !== "PATCH") return void outgoing.writeHead(404).end();
    json(connector ?? body);
  }
  /** As Logto 1.x does: an application's JSON has no secret, which only its `/secrets` lists. */
  function answerApplications(method: string, id: string | undefined, secrets: boolean, body: unknown, outgoing: ServerResponse) {
    const json = (value: unknown) => outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
    const withoutSecret = ({ id, name, type, oidcClientMetadata }: Application) => ({ id, name, type, oidcClientMetadata });
    if (id === undefined && method === "GET") return void json(applications.map(withoutSecret));
    if (id === undefined && method === "POST") {
      const { name, type, oidcClientMetadata } = body as Pick<Application, "name" | "type" | "oidcClientMetadata">;
      const created = { id: `app-${applications.length + 1}`, name, type, secret: randomBytes(16).toString("hex"), oidcClientMetadata };
      applications.push(created);
      return void json(withoutSecret(created));
    }
    const found = applications.find((candidate) => candidate.id === id);
    if (found && secrets && method === "GET") return void json([{ applicationId: found.id, name: "Default secret", value: found.secret, expiresAt: null }]);
    if (!found || secrets || method !== "PATCH") return void outgoing.writeHead(404).end();
    const { oidcClientMetadata } = body as Partial<Pick<Application, "oidcClientMetadata">>;
    found.oidcClientMetadata = { ...found.oidcClientMetadata, ...oidcClientMetadata };
    json(withoutSecret(found));
  }
  /** `/oidc/auth`: a code for the person signed in, back at the redirect URI with the state. */
  function authorize(query: URLSearchParams, outgoing: ServerResponse) {
    const client = applications.find(({ id }) => id === query.get("client_id"));
    const redirectUri = query.get("redirect_uri") ?? "";
    const challenge = query.get("code_challenge");
    if (client?.type !== "Traditional" || !client.oidcClientMetadata.redirectUris.includes(redirectUri)) return void outgoing.writeHead(400).end("invalid client or redirect_uri");
    if (query.get("response_type") !== "code" || query.get("code_challenge_method") !== "S256" || !challenge) return void outgoing.writeHead(400).end("invalid request");
    const back = new URL(redirectUri);
    const state = query.get("state");
    if (state !== null) back.searchParams.set("state", state);
    if (signedIn === null) {
      if (query.get("prompt") !== "none") return void outgoing.writeHead(200, { "content-type": "text/html" }).end("<h1>Logto sign-in</h1>");
      back.searchParams.set("error", "login_required");
      return void outgoing.writeHead(302, { location: back.toString() }).end();
    }
    const scopes = (query.get("scope") ?? "").split(" ");
    const code = randomBytes(16).toString("hex");
    const organizations = scopes.includes(ORGANIZATIONS_SCOPE) ? organizationsOf(signedIn) : undefined;
    grants.set(code, { clientId: client.id, redirectUri, codeChallenge: challenge, nonce: query.get("nonce") ?? undefined, userId: signedIn, email: scopes.includes("email"), organizations });
    back.searchParams.set("code", code);
    outgoing.writeHead(302, { location: back.toString() }).end();
  }
  /** `/oidc/session/end`: ends Logto's session and sends the browser to a post-logout redirect URI of the client. */
  function endSession(query: URLSearchParams, outgoing: ServerResponse) {
    const client = applications.find(({ id }) => id === query.get("client_id"));
    const redirectUri = query.get("post_logout_redirect_uri") ?? "";
    if (!client?.oidcClientMetadata.postLogoutRedirectUris.includes(redirectUri)) return void outgoing.writeHead(400).end("invalid client or post_logout_redirect_uri");
    signedIn = null;
    outgoing.writeHead(302, { location: redirectUri }).end();
  }
  const organizationsOf = (userId: string) => [...members].filter(([organizationId]) => !deleted.includes(organizationId) && membersLeft(organizationId).includes(userId)).map(([organizationId]) => organizationId);
  /** The token endpoint's authorization code grant: the code once, for its client, redirect URI and PKCE verifier. */
  function exchangeCode(form: URLSearchParams, incoming: IncomingMessage, outgoing: ServerResponse) {
    if (failingTokens === "drop") return void incoming.socket.destroy();
    if (failingTokens !== null) return void outgoing.writeHead(failingTokens).end("refused");
    const [clientId = "", secret = ""] = Buffer.from((incoming.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString().split(":");
    const client = applications.find(({ id }) => id === clientId);
    if (client?.secret !== secret) return void outgoing.writeHead(401).end(JSON.stringify({ error: "invalid_client" }));
    const code = form.get("code") ?? "";
    const grant = grants.get(code);
    grants.delete(code);
    const verified = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === grant?.codeChallenge;
    if (grant?.clientId !== clientId || grant.redirectUri !== form.get("redirect_uri") || !verified) {
      return void outgoing.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
    }
    const now = Math.floor(Date.now() / 1000);
    const email = grant.email ? { email: emailOf(grant.userId), email_verified: true } : {};
    const claims = { iss: issuer, aud: clientId, sub: grant.userId, ...email, nonce: grant.nonce, iat: now, exp: now + 3600, organizations: grant.organizations };
    const idToken = [{ alg: "ES384", typ: "JWT" }, claims].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".c3RhbmQtaW4";
    outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: "opaque", token_type: "Bearer", expires_in: 3600, id_token: idToken, scope: "openid" }));
  }
  function putTemplates(incoming: IncomingMessage, outgoing: ServerResponse) {
    let body = "";
    incoming.on("data", (chunk: Buffer) => (body += chunk.toString()));
    incoming.on("end", () => {
      emailTemplatePuts.push(JSON.parse(body));
      outgoing.writeHead(200, { "content-type": "application/json" }).end("[]");
    });
  }
  const readText = (incoming: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      incoming.on("data", (chunk: Buffer) => (body += chunk.toString()));
      incoming.on("end", () => { resolve(body); });
    });
  const readJson = async (incoming: IncomingMessage): Promise<unknown> => {
    const body = await readText(incoming);
    return body ? JSON.parse(body) : undefined;
  };
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  issuer = `http://127.0.0.1:${port}/oidc`;
  return {
    env: { IDP_MANAGEMENT_ENDPOINT: `http://127.0.0.1:${port}`, IDP_MANAGEMENT_CLIENT_ID: CLIENT_ID, IDP_MANAGEMENT_CLIENT_SECRET: CLIENT_SECRET },
    deleted,
    deletedUsers,
    deletions,
    deletedWithMembers,
    addMember(organizationId, userId) {
      users.add(userId);
      members.set(organizationId, [...(members.get(organizationId) ?? []), userId]);
    },
    hasUser: (userId) => users.has(userId),
    failDeleting(id) {
      failingDeletion = id;
    },
    emailTemplatePuts,
    connectors,
    settingCalls,
    failWith(status) {
      failing = status;
    },
    issuer,
    applications,
    signInAs(userId) {
      signedIn = userId;
    },
    failTokens(status) {
      failingTokens = status;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
    },
  };
}
