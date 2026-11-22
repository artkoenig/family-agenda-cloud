import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Logto's Management API as far as the Routing module uses it: a client-credentials token,
 * listing an Organization's users a page at a time, deleting a user and an Organization, putting
 * email templates, listing, creating and updating connectors, and patching the sign-in experience
 * and the Account Center. Every user and Organization is there until deleted; deleting one again
 * answers 404, and a page larger than Logto lists answers 400, as Logto does.
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
  close(): Promise<void>;
};

const CLIENT_ID = "routing-m2m";
const CLIENT_SECRET = "routing-m2m-secret";
const TOKEN = "stand-in-management-token";
const ORGANIZATION = /^\/api\/organizations\/([^/]+)$/;
const ORGANIZATION_USERS = /^\/api\/organizations\/([^/]+)\/users(\?.*)?$/;
const USER = /^\/api\/users\/([^/]+)$/;
/** The largest page Logto lists. */
const MAX_PAGE_SIZE = 100;
const SETTING = /^\/api\/(sign-in-exp|account-center|connectors(\/[^/]+)?)$/;

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
  const membersLeft = (organizationId: string) => (members.get(organizationId) ?? []).filter((userId) => users.has(userId));
  const server = createServer((incoming, outgoing) => {
    const url = incoming.url ?? "/";
    if (incoming.method === "POST" && url === "/oidc/token") {
      const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
      if (incoming.headers.authorization !== basic) return void outgoing.writeHead(401).end();
      return void outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }));
    }
    const organization = ORGANIZATION.exec(url);
    const organizationUsers = incoming.method === "GET" ? ORGANIZATION_USERS.exec(url) : null;
    const user = incoming.method === "DELETE" ? USER.exec(url) : null;
    const templates = incoming.method === "PUT" && url === "/api/email-templates";
    const setting = SETTING.test(url);
    const known = templates || setting || organizationUsers || user || (incoming.method === "DELETE" && organization);
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
  function putTemplates(incoming: IncomingMessage, outgoing: ServerResponse) {
    let body = "";
    incoming.on("data", (chunk: Buffer) => (body += chunk.toString()));
    incoming.on("end", () => {
      emailTemplatePuts.push(JSON.parse(body));
      outgoing.writeHead(200, { "content-type": "application/json" }).end("[]");
    });
  }
  const readJson = (incoming: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      let body = "";
      incoming.on("data", (chunk: Buffer) => (body += chunk.toString()));
      incoming.on("end", () => { resolve(body ? JSON.parse(body) : undefined); });
    });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
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
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
    },
  };
}
