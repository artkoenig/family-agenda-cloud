import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { stripePort } from "../src/stripe";

type Call = { method: string | undefined; path: string; body: string; version: string | string[] | undefined; authorization: string | undefined };
let server: Server | undefined;
afterEach(() => server?.close());

/** Stripe's API as the SDK calls it, answering each call from `answers` by its method and path. */
async function stripeAnswering(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  server = createServer((incoming, outgoing) => {
    let body = "";
    incoming.on("data", (chunk: Buffer) => (body += chunk.toString()));
    incoming.on("end", () => {
      const path = incoming.url ?? "";
      calls.push({ method: incoming.method, path, body, version: incoming.headers["stripe-version"], authorization: incoming.headers.authorization });
      outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answers[`${incoming.method ?? ""} ${path}`]));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { calls, port: stripePort("restricted", { host: "127.0.0.1", port: (server.address() as AddressInfo).port, protocol: "http" }) };
}

it("reads a Price with the key and the fixed API version", async () => {
  const { calls, port } = await stripeAnswering({ "GET /v1/prices/price_m": { id: "price_m", unit_amount: 499 } });
  expect(await port.price("price_m")).toMatchObject({ unit_amount: 499 });
  expect(calls).toMatchObject([{ version: "2026-11-18.endive", authorization: "Bearer restricted" }]);
});

it("creates a Session and answers its address, and fails without one", async () => {
  const answers: Record<string, unknown> = { "POST /v1/checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.test/1" } };
  const { calls, port } = await stripeAnswering(answers);
  expect(await port.createSession({ mode: "subscription", client_reference_id: "f-1" })).toBe("https://checkout.stripe.test/1");
  expect(calls[0]!.body).toContain("client_reference_id=f-1");
  answers["POST /v1/checkout/sessions"] = { id: "cs_2", url: null };
  await expect(port.createSession({ mode: "subscription" })).rejects.toThrow("Stripe's Checkout Session cs_2 has no address");
});

it("finds the Family's open Sessions on every page, and expires one", async () => {
  const session = (id: string, familyId: string | null) => ({ id, object: "checkout.session", client_reference_id: familyId });
  const { calls, port } = await stripeAnswering({
    "GET /v1/checkout/sessions?status=open&limit=100": { object: "list", has_more: true, data: [session("cs_1", "f-1"), session("cs_2", "f-2")] },
    "GET /v1/checkout/sessions?status=open&limit=100&starting_after=cs_2": { object: "list", has_more: false, data: [session("cs_3", null), session("cs_4", "f-1")] },
    "POST /v1/checkout/sessions/cs_4/expire": session("cs_4", "f-1"),
  });
  expect(await port.openSessions("f-1")).toEqual(["cs_1", "cs_4"]);
  await port.expireSession("cs_4");
  expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/v1/checkout/sessions/cs_4/expire" });
});
