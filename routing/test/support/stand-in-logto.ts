import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Logto's Management API as far as the Routing module uses it: a client-credentials token,
 * deleting an Organization, putting email templates, listing, creating and updating connectors,
 * and patching the sign-in experience and the Account Center. Every Organization is there until
 * deleted; deleting one again answers 404, as Logto does.
 */
export type StandInLogto = {
  /** IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET for it. */
  env: { IDP_MANAGEMENT_ENDPOINT: string; IDP_MANAGEMENT_CLIENT_ID: string; IDP_MANAGEMENT_CLIENT_SECRET: string };
  /** The Organizations deleted so far, in order. */
  deleted: string[];
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
const SETTING = /^\/api\/(sign-in-exp|account-center|connectors(\/[^/]+)?)$/;

export async function startStandInLogto(): Promise<StandInLogto> {
  const deleted: string[] = [];
  const emailTemplatePuts: unknown[] = [];
  const connectors: StandInLogto["connectors"] = [];
  const settingCalls: StandInLogto["settingCalls"] = [];
  let failing: number | null = null;
  const server = createServer((incoming, outgoing) => {
    const url = incoming.url ?? "/";
    if (incoming.method === "POST" && url === "/oidc/token") {
      const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
      if (incoming.headers.authorization !== basic) return void outgoing.writeHead(401).end();
      return void outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }));
    }
    const organization = ORGANIZATION.exec(url);
    const templates = incoming.method === "PUT" && url === "/api/email-templates";
    const setting = SETTING.test(url);
    if (!templates && !setting && (incoming.method !== "DELETE" || !organization)) return void outgoing.writeHead(404).end();
    if (incoming.headers.authorization !== `Bearer ${TOKEN}`) return void outgoing.writeHead(401).end();
    if (failing !== null) return void outgoing.writeHead(failing).end("refused");
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
    if (deleted.includes(organizationId)) return void outgoing.writeHead(404).end();
    deleted.push(organizationId);
    outgoing.writeHead(204).end();
  });
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
