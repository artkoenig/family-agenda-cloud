import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { signedEvent, stripePort } from "../src/stripe";
import { signed } from "./support/stand-in-stripe";

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
      const answered = answers[`${incoming.method ?? ""} ${path}`];
      const status = answered !== null && typeof answered === "object" && "error" in answered ? 400 : 200;
      outgoing.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(answered));
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

it("reads, marks and ends a Subscription, and sets a Customer's languages", async () => {
  const { calls, port } = await stripeAnswering({
    "GET /v1/subscriptions/sub_1": { id: "sub_1", status: "active" },
    "POST /v1/subscriptions/sub_1": {},
    "DELETE /v1/subscriptions/sub_1?invoice_now=false&prorate=false": { id: "sub_1", status: "canceled" },
    "POST /v1/customers/cus_1": {},
  });
  expect(await port.subscription("sub_1")).toMatchObject({ status: "active" });
  await port.addMetadata("sub_1", { duplicate: "true" });
  expect(calls.at(-1)!.body).toBe("metadata[duplicate]=true");
  expect(await port.cancelSubscription("sub_1")).toMatchObject({ status: "canceled" });
  await port.setCustomerLocales("cus_1", ["de"]);
  expect(calls.at(-1)!.body).toBe("preferred_locales[0]=de");
});

const list = (...data: unknown[]) => ({ object: "list", has_more: false, data });

it("refunds every payment of a Subscription", async () => {
  const answers = {
    "GET /v1/invoices?subscription=sub_1&limit=100": list({ id: "in_1" }, { id: "in_2" }),
    "GET /v1/invoice_payments?invoice=in_1&status=paid&limit=100": list({ id: "p_1", payment: { type: "payment_intent", payment_intent: "pi_1" } }),
    "GET /v1/invoice_payments?invoice=in_2&status=paid&limit=100": list({ id: "p_2", payment: { type: "charge", charge: { id: "ch_1" } } }),
    "POST /v1/refunds": { id: "re_1" } as unknown,
  };
  const { calls, port } = await stripeAnswering(answers);
  await port.refundSubscription("sub_1");
  expect(calls.filter(({ path }) => path === "/v1/refunds").map(({ body }) => body)).toEqual(["payment_intent=pi_1&reason=duplicate", "charge=ch_1&reason=duplicate"]);
  answers["POST /v1/refunds"] = { error: { type: "invalid_request_error", code: "charge_already_refunded", message: "Refunded" } };
  await port.refundSubscription("sub_1");
  answers["POST /v1/refunds"] = { error: { type: "invalid_request_error", code: "resource_missing", message: "No such payment" } };
  await expect(port.refundSubscription("sub_1")).rejects.toThrow("No such payment");
});

it("refuses to refund a payment it cannot", async () => {
  const { port } = await stripeAnswering({
    "GET /v1/invoices?subscription=sub_1&limit=100": list({ id: "in_1" }),
    "GET /v1/invoice_payments?invoice=in_1&status=paid&limit=100": list({ id: "p_1", payment: { type: "payment_record", payment_record: "pr_1" } }),
  });
  await expect(port.refundSubscription("sub_1")).rejects.toThrow("A payment by payment_record cannot be refunded");
});

it("creates the Portal's configuration once and then brings it up to date", async () => {
  const listing = "GET /v1/billing_portal/configurations?active=true&limit=100";
  const answers: Record<string, unknown> = {
    [listing]: list({ id: "bpc_other", metadata: {} }, { id: "bpc_none", metadata: null }),
    "POST /v1/billing_portal/configurations": { id: "bpc_1" },
    "POST /v1/billing_portal/configurations/bpc_1": { id: "bpc_1" },
    "POST /v1/billing_portal/sessions": { url: "https://billing.stripe.test/1" },
  };
  const { calls, port } = await stripeAnswering(answers);
  expect(await port.portalConfiguration()).toBe("bpc_1");
  const features = calls.at(-1)!.body;
  for (const on of ["payment_method_update", "invoice_history", "customer_update"]) expect(features).toContain(`features[${on}][enabled]=true`);
  for (const off of ["subscription_cancel", "subscription_pause", "subscription_update"]) expect(features).toContain(`features[${off}][enabled]=false`);
  expect(features).toContain("features[customer_update][allowed_updates][0]=address");
  expect(features).toContain("metadata[integration]=family-agenda-portal");
  answers[listing] = list({ id: "bpc_1", metadata: { integration: "family-agenda-portal" } });
  expect(await port.portalConfiguration()).toBe("bpc_1");
  expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/v1/billing_portal/configurations/bpc_1" });
  expect(await port.portalSession({ customer: "cus_1" })).toBe("https://billing.stripe.test/1");
});

it("takes an event Stripe signed, and no other", () => {
  const { body, signature } = signed({ id: "evt_1", object: "event" }, "secret");
  expect(signedEvent(Buffer.from(body), signature, "secret")).toMatchObject({ id: "evt_1" });
  expect(signedEvent(Buffer.from(body), signature, "other")).toBeUndefined();
  expect(signedEvent(Buffer.from(`${body} `), signature, "secret")).toBeUndefined();
  expect(signedEvent(Buffer.from(body), "", "secret")).toBeUndefined();
});
