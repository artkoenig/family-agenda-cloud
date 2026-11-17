import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Logto's Management API as far as the Routing module uses it: a client-credentials token, and
 * deleting an Organization. Every Organization is there until deleted; deleting one again answers
 * 404, as Logto does.
 */
export type StandInLogto = {
  /** IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET for it. */
  env: { IDP_MANAGEMENT_ENDPOINT: string; IDP_MANAGEMENT_CLIENT_ID: string; IDP_MANAGEMENT_CLIENT_SECRET: string };
  /** The Organizations deleted so far, in order. */
  deleted: string[];
  /** Answers every Management API call with this status, until set to null. */
  failWith(status: number | null): void;
  close(): Promise<void>;
};

const CLIENT_ID = "routing-m2m";
const CLIENT_SECRET = "routing-m2m-secret";
const TOKEN = "stand-in-management-token";
const ORGANIZATION = /^\/api\/organizations\/([^/]+)$/;

export async function startStandInLogto(): Promise<StandInLogto> {
  const deleted: string[] = [];
  let failing: number | null = null;
  const server = createServer((incoming, outgoing) => {
    const url = incoming.url ?? "/";
    if (incoming.method === "POST" && url === "/oidc/token") {
      const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
      if (incoming.headers.authorization !== basic) return void outgoing.writeHead(401).end();
      return void outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }));
    }
    const organization = ORGANIZATION.exec(url);
    if (incoming.method !== "DELETE" || !organization) return void outgoing.writeHead(404).end();
    if (incoming.headers.authorization !== `Bearer ${TOKEN}`) return void outgoing.writeHead(401).end();
    if (failing !== null) return void outgoing.writeHead(failing).end();
    const organizationId = decodeURIComponent(organization[1]!);
    if (deleted.includes(organizationId)) return void outgoing.writeHead(404).end();
    deleted.push(organizationId);
    outgoing.writeHead(204).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    env: { IDP_MANAGEMENT_ENDPOINT: `http://127.0.0.1:${port}`, IDP_MANAGEMENT_CLIENT_ID: CLIENT_ID, IDP_MANAGEMENT_CLIENT_SECRET: CLIENT_SECRET },
    deleted,
    failWith(status) {
      failing = status;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
    },
  };
}
