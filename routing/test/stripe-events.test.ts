import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LockReason } from "../src/directory";
import { lockFamily } from "../src/family-status";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { signed, standInStripe, STRIPE_ENV, stripeSubscription, type StandInStripe } from "./support/stand-in-stripe";

const PUBLIC_URL = "https://app.family-agenda.test";

let routing: TestRouting;
let router: Router;
let stripe: StandInStripe;
let familyId: string;
let events: number;
const now = new Date("2026-11-20T10:00:00Z");

beforeEach(async () => {
  events = 0;
  routing = await setUpRouting();
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  const client = await routing.run(["sign-in-client"], { PUBLIC_URL });
  const signInEnv = { PUBLIC_URL, OIDC_ISSUER_URL: routing.logto.issuer, ...Object.fromEntries(client.stdout.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string])) };
  stripe = standInStripe();
  router = await routing.startRouter({ ...signInEnv, ...STRIPE_ENV }, () => now, stripe);
  familyId = await createFamily();
  routing.logto.setName("u-1", "Anna Muster");
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(organizationId = "org_1"): Promise<string> {
  const result = await routing.run(["create", "--organization-id", organizationId]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  routing.logto.addMember(organizationId, "u-1");
  return /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
}

type Event = { id?: string; type: string; data: { object: unknown } };

async function post(event: Event, secret?: string): Promise<number> {
  const { body, signature } = signed({ id: `evt_${++events}`, object: "event", ...event }, secret);
  return (await fetch(`${router.url}/stripe/events`, { method: "POST", body, headers: { "stripe-signature": signature } })).status;
}

const updated = (id: string, eventId?: string): Event => ({ ...(eventId && { id: eventId }), type: "customer.subscription.updated", data: { object: { id } } });
const deleted = (id: string): Event => ({ type: "customer.subscription.deleted", data: { object: { id } } });
const invoice = (type: "paid" | "payment_failed", id: string): Event => ({ type: `invoice.${type}`, data: { object: { parent: { subscription_details: { subscription: id } } } } });
const completed = (id: string, session: object = {}): Event => ({
  type: "checkout.session.completed",
  data: { object: { subscription: id, invoice: null, locale: "de", customer_details: { name: "Order Name", email: "order@example.com" }, ...session } },
});

/** Sets the Subscription at Stripe. */
const at = (id: string, changes: Parameters<typeof stripeSubscription>[2] = {}) => stripe.subscriptions.set(id, stripeSubscription(familyId, id, changes));
const lock = (reason: LockReason) => routing.provisioned((work) => lockFamily(work, familyId, reason, new Date("2026-11-10T10:00:00Z")));
const rowsOf = () => routing.directory("SELECT * FROM subscription ORDER BY subscription_id");
const mails = () => routing.directory("SELECT type, mail_to, subject, body, body_html, attachments FROM mail_outbox WHERE type IN ('confirmation', 'unpaid') ORDER BY created_at, id");
const handledEvents = async () => (await routing.directory("SELECT event_id FROM stripe_event")).length;
async function familyRow() {
  const [row] = await routing.directory("SELECT status, lock_reason, locked_at FROM family WHERE family_id = $1", [familyId]);
  return row;
}

describe("Stripe's webhook", () => {
  it("refuses what Stripe did not sign, and what is no event, changing nothing", async () => {
    at("sub_1");
    expect(await post(updated("sub_1"), "another-secret")).toBe(400);
    const unsigned = await fetch(`${router.url}/stripe/events`, { method: "POST", body: JSON.stringify(updated("sub_1")) });
    expect(unsigned.status).toBe(400);
    expect((await fetch(`${router.url}/stripe/events`)).status).toBe(405);
    expect((await fetch(`${router.url}/stripe/events`, { method: "POST", body: "x".repeat(1024 * 1024 + 1) }).catch(() => ({ status: 413 }))).status).toBe(413);
    expect(await rowsOf()).toEqual([]);
    expect(await handledEvents()).toBe(0);
  });

  it("does nothing on other events, Sessions and invoices without a Subscription, and Subscriptions of no Family", async () => {
    expect(await post({ type: "customer.created", data: { object: { id: "cus_1" } } })).toBe(200);
    expect(await post(completed("", { subscription: null }))).toBe(200);
    expect(await post({ type: "invoice.paid", data: { object: { parent: null } } })).toBe(200);
    at("sub_1", { metadata: {} });
    at("sub_2", { metadata: { familyId: "not-a-family", holder: "u-1" } });
    at("sub_3", { metadata: { familyId: crypto.randomUUID(), holder: "u-1" } });
    for (const id of ["sub_1", "sub_2", "sub_3"]) expect(await post(updated(id))).toBe(200);
    expect(await rowsOf()).toEqual([]);
    expect(routing.log()).toContain("A Stripe event is about a Subscription of no Family");
  });

  it("keeps an order of a Family in its Trial, and the Family served", async () => {
    at("sub_1", { cancel_at: 1_790_000_000, trial_end: 1_781_000_000 });
    expect(await post(completed("sub_1"))).toBe(200);
    expect(await rowsOf()).toMatchObject([
      {
        subscription_id: "sub_1",
        family_id: familyId,
        customer_id: "cus_sub_1",
        holder: "u-1",
        billing: "monthly",
        status: "active",
        ordered_at: new Date(1_780_000_000_000),
        trial_end: new Date(1_781_000_000_000),
        current_period_end: new Date(1_782_000_000_000),
        cancel_at: new Date(1_790_000_000_000),
        ended_at: null,
        confirmation_sent_at: now,
      },
    ]);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null });
  });

  it("unlocks a Locked Family with its schedules on the order", async () => {
    const schedules = await routing.schedules(familyId);
    await lock("trial_ended");
    expect(await routing.schedules(familyId)).toEqual([]);
    at("sub_1");
    expect(await post(completed("sub_1", { invoice: "in_1" }))).toBe(200);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null });
    expect(await routing.schedules(familyId)).toEqual(schedules);
  });

  it("acts once on an event delivered twice", async () => {
    at("sub_1", { status: "unpaid" });
    expect(await post(updated("sub_1", "evt_same"))).toBe(200);
    at("sub_1");
    expect(await post(updated("sub_1", "evt_same"))).toBe(200);
    expect(await rowsOf()).toMatchObject([{ status: "unpaid" }]);
    expect(await handledEvents()).toBe(1);
  });

  it("ends in the current state however events come in", async () => {
    at("sub_1", { status: "canceled", ended_at: 1_790_000_000 });
    expect(await post(deleted("sub_1"))).toBe(200);
    expect(await post(updated("sub_1"))).toBe(200);
    expect(await rowsOf()).toMatchObject([{ status: "canceled", ended_at: new Date(1_790_000_000_000) }]);
    expect(await familyRow()).toMatchObject({ lock_reason: "subscription_ended", locked_at: new Date(1_790_000_000_000) });
  });

  it("leaves a Family in its Trial whose Subscription ended, with its schedules, and locks one whose Trial is over", async () => {
    const schedules = await routing.schedules(familyId);
    await routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-16T10:00:00Z")]);
    at("sub_1", { status: "canceled", ended_at: 1_790_000_000 });
    expect(await post(deleted("sub_1"))).toBe(200);
    expect(await rowsOf()).toMatchObject([{ status: "canceled" }]);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null, locked_at: null });
    expect(await routing.schedules(familyId)).toEqual(schedules);

    await routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-06T10:00:00Z")]);
    expect(await post(updated("sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ lock_reason: "subscription_ended" });
  });

  it("leaves the Family as it is while payments are retried, and while an order is incomplete", async () => {
    at("sub_1", { status: "past_due" });
    expect(await post(invoice("payment_failed", "sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ lock_reason: null });
    await lock("trial_ended");
    at("sub_1", { status: "canceled" });
    at("sub_2", { status: "incomplete" });
    expect(await post(updated("sub_2"))).toBe(200);
    expect(await familyRow()).toMatchObject({ lock_reason: "trial_ended" });
  });

  it("locks an unpaid Family with one mail, and unlocks it when it is paid", async () => {
    at("sub_1", { status: "unpaid" });
    expect(await post(updated("sub_1"))).toBe(200);
    expect(await post(invoice("payment_failed", "sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ lock_reason: "unpaid", locked_at: now });
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "unpaid", mail_to: expect.stringContaining("u-1@example.com") as unknown, subject: "Deine Familie ist gesperrt: Zahlung ausgeblieben – Family Agenda Cloud" });
    expect(sent[0]!["body"]).toContain("Deine Familie ist deshalb seit dem 20.11.2026 gesperrt.");
    at("sub_1");
    expect(await post(invoice("paid", "sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null });
  });

  it("locks an unpaid Family whose holder is gone, without a mail", async () => {
    at("sub_1", { status: "unpaid", metadata: { familyId, holder: "u-gone" } });
    expect(await post(updated("sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ lock_reason: "unpaid" });
    expect(await mails()).toEqual([]);
    expect(routing.log()).toContain("The holder of an unpaid Subscription has no email address");
  });

  it("leaves a deleted Family alone", async () => {
    await routing.directory("UPDATE family SET status = 'being_prepared' WHERE family_id = $1", [familyId]);
    at("sub_1", { status: "unpaid" });
    expect(await post(updated("sub_1"))).toBe(200);
    at("sub_1", { status: "canceled" });
    expect(await post(deleted("sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ status: "being_prepared" });
    expect(await mails()).toEqual([]);
    expect(routing.log()).toContain("A Subscription runs of a Family that is deleted or not prepared");
  });

  it("sends the confirmation once, in Family Agenda's look with the legal texts attached, and has the invoices in German", async () => {
    at("sub_1");
    expect(await post(completed("sub_1", { locale: "en" }))).toBe(200);
    expect(await post(completed("sub_1", { locale: "en" }))).toBe(200);
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "confirmation", mail_to: expect.stringContaining("u-1@example.com") as unknown });
    const body = String(sent[0]!["body"]);
    expect(body).toContain("Anna Muster");
    expect(body).toContain("Postflex 1, 12345 Musterstadt");
    expect(String(sent[0]!["body_html"])).toContain("Anna Muster");
    expect((sent[0]!["attachments"] as { filename: string; contentType: string }[]).map(({ filename, contentType }) => [filename, contentType])).toEqual([
      ["Family-Agenda-Cloud-AGB.pdf", "application/pdf"],
      ["Family-Agenda-Cloud-Widerrufsbelehrung.pdf", "application/pdf"],
    ]);
    expect(stripe.customerLocales.get("cus_sub_1")).toEqual(["de"]);
  });

  it("keeps the name asked for on Checkout at Logto if it has none, and confirms to it", async () => {
    routing.logto.addMember("org_1", "u-2");
    at("sub_1", { metadata: { familyId, holder: "u-2" } });
    expect(await post(completed("sub_1", { customer_details: { name: "Billing Name", individual_name: "Berta Beispiel", email: "order@example.com" } }))).toBe(200);
    expect(routing.logto.nameOf("u-2")).toBe("Berta Beispiel");
    expect(String((await mails())[0]!["body"])).toContain("Berta Beispiel");
  });

  it("leaves a name Logto has alone", async () => {
    at("sub_1");
    expect(await post(completed("sub_1", { customer_details: { name: "Billing Name", individual_name: "Other Name", email: "order@example.com" } }))).toBe(200);
    expect(routing.logto.nameOf("u-1")).toBe("Anna Muster");
  });

  it("confirms to the address of the order if Logto no longer knows the holder", async () => {
    at("sub_1", { metadata: { familyId, holder: "u-gone" } });
    expect(await post(completed("sub_1"))).toBe(200);
    expect(await mails()).toMatchObject([{ mail_to: expect.stringContaining("order@example.com") as unknown }]);
  });

  it("says in the log if it cannot write a confirmation", async () => {
    at("sub_1", { metadata: { familyId, holder: "u-gone" } });
    expect(await post(completed("sub_1", { customer_details: null }))).toBe(200);
    expect(await mails()).toEqual([]);
    expect(routing.log()).toContain("A contract confirmation could not be written");
  });

  it("is delivered again after a failure, and then does what is left", async () => {
    at("sub_1");
    stripe.failCustomers = true;
    const event = { ...completed("sub_1"), id: "evt_again" };
    expect(await post(event)).toBe(500);
    expect(await handledEvents()).toBe(0);
    stripe.failCustomers = false;
    expect(await post(event)).toBe(200);
    expect(await mails()).toHaveLength(1);
    expect(stripe.customerLocales.get("cus_sub_1")).toEqual(["de"]);
  });

  it("cancels and refunds a second order, and confirms the first alone", async () => {
    at("sub_1");
    at("sub_2", { created: 1_780_000_100 });
    expect(await post(completed("sub_1"))).toBe(200);
    expect(await post(completed("sub_2"))).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_2"]);
    expect(stripe.refunded).toEqual(["sub_2"]);
    expect(await rowsOf()).toMatchObject([
      { subscription_id: "sub_1", status: "active" },
      { subscription_id: "sub_2", status: "canceled", confirmation_sent_at: null },
    ]);
    expect(await mails()).toHaveLength(1);
    expect(routing.log()).toContain("A Family has a second running Subscription");
    // Its own events then, and a payment that arrives late.
    expect(await post(deleted("sub_2"))).toBe(200);
    expect(await post(invoice("paid", "sub_2"))).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_2"]);
    expect(stripe.refunded).toEqual(["sub_2", "sub_2", "sub_2"]);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null });
  });

  it("cancels the newer one also if its event came in first", async () => {
    at("sub_1");
    at("sub_2", { created: 1_780_000_100 });
    expect(await post(updated("sub_2"))).toBe(200);
    expect(await post(completed("sub_1"))).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_2"]);
    expect(await rowsOf()).toMatchObject([{ status: "active" }, { status: "canceled" }]);
    expect(await mails()).toHaveLength(1);
  });

  it("takes a new order after one that ended, of which the event is still to come", async () => {
    at("sub_1");
    expect(await post(updated("sub_1"))).toBe(200);
    at("sub_1", { status: "canceled", ended_at: 1_790_000_000 });
    at("sub_2");
    expect(await post(updated("sub_2"))).toBe(200);
    expect(stripe.cancelled).toEqual([]);
    expect(await post(deleted("sub_1"))).toBe(200);
    expect(await familyRow()).toMatchObject({ status: "active", lock_reason: null });
    expect(await rowsOf()).toMatchObject([{ status: "canceled" }, { status: "active" }]);
  });
});
