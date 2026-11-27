import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { signed, standInStripe, STRIPE_ENV, stripeSubscription, type StandInStripe } from "./support/stand-in-stripe";

const PUBLIC_URL = "https://app.family-agenda.test";
const seconds = (iso: string) => new Date(iso).getTime() / 1000;

let routing: TestRouting;
let router: Router;
let stripe: StandInStripe;
let familyId: string;
let now: Date;
let events: number;

beforeEach(async () => {
  now = new Date("2026-11-20T10:00:00Z");
  events = 0;
  routing = await setUpRouting();
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  const client = await routing.run(["sign-in-client"], { PUBLIC_URL });
  const signInEnv = { PUBLIC_URL, OIDC_ISSUER_URL: routing.logto.issuer, ...Object.fromEntries(client.stdout.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string])) };
  stripe = standInStripe();
  router = await routing.startRouter({ ...signInEnv, ...STRIPE_ENV }, () => now, stripe);
  const result = await routing.run(["create", "--organization-id", "org_1"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  familyId = /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
  routing.logto.addMember("org_1", "u-1");
  routing.logto.setName("u-1", "Anna Muster");
  routing.logto.setFounder("org_1", "u-1");
});
afterEach(async () => {
  await routing.close();
});

type Answer = { status: number; location: string | null; body: string };

/** A browser that keeps cookies; `visit` follows redirects. */
function browser() {
  const jar = new Map<string, string>();
  async function request(path: string, init: RequestInit = {}): Promise<Answer> {
    const url = new URL(path, PUBLIC_URL);
    const own = url.origin === PUBLIC_URL;
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const answer = await fetch(own ? new URL(url.pathname + url.search, router.url) : url, { ...init, redirect: "manual", headers: own && cookie ? { cookie } : {} });
    for (const set of own ? answer.headers.getSetCookie() : []) {
      const [name = "", value = ""] = set.split(";")[0]!.split(/=(.*)/s);
      if (set.includes("Max-Age=0")) jar.delete(name);
      else jar.set(name, value);
    }
    const location = answer.headers.get("location");
    return { status: answer.status, location: location && new URL(location, url).href, body: await answer.text() };
  }
  async function visit(path: string): Promise<Answer & { path: string }> {
    let at = new URL(path, PUBLIC_URL).href;
    for (let hop = 0; hop < 20; hop++) {
      const answer = await request(at);
      if (!answer.location) return { ...answer, path: at.replace(PUBLIC_URL, "") };
      at = answer.location;
      if (/^\/[0-9a-f-]{36}\/$/.test(at.replace(PUBLIC_URL, ""))) return { ...answer, path: at.replace(PUBLIC_URL, "") };
    }
    throw new Error("Too many redirects");
  }
  const post = (form: Record<string, string>, path = "/withdraw") => request(path, { method: "POST", body: new URLSearchParams(form) });
  /** Posts the form with the token of the page as it is now. */
  const submit = async (path = "/withdraw") => post({ csrf: csrfOf((await request(path)).body) }, path);
  return { request, visit, post, submit };
}

const csrfOf = (page: string): string => /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";

async function signedIn(userId = "u-1") {
  routing.logto.signInAs(userId);
  const own = browser();
  await own.visit("/sign-in");
  return own;
}

/** Lets the Directory follow the Subscription as Stripe has it. */
async function told(type = "customer.subscription.updated"): Promise<void> {
  const { body, signature } = signed({ id: `evt_${++events}`, object: "event", type, data: { object: { id: "sub_1" } } });
  const posted = await fetch(`${router.url}/stripe/events`, { method: "POST", body, headers: { "stripe-signature": signature } });
  expect(posted.status, routing.log()).toBe(200);
}

/** Sets the Subscription at Stripe and lets the Directory follow it. */
async function subscribed(changes: Parameters<typeof stripeSubscription>[2] = {}, type?: string): Promise<void> {
  stripe.subscriptions.set("sub_1", stripeSubscription(familyId, "sub_1", changes));
  await told(type);
}

/** Ordered ten days before now and paid at once: within the withdrawal period, which ends on 24 November. */
const FRESH = { created: seconds("2026-11-10T09:00:00Z"), billing_cycle_anchor: seconds("2026-11-10T09:00:00Z") };
/** Ordered long ago: the period ended on 11 June, and the earliest end is 9 December. */
const OLD = { created: seconds("2026-05-28T20:26:40Z"), billing_cycle_anchor: seconds("2026-06-09T10:00:00Z") };

type Mail = { type: string; mail_to: string; subject: string; body: string };
const mails = async () => (await routing.directory("SELECT type, mail_to, subject, body FROM mail_outbox WHERE type = 'withdrawal' ORDER BY created_at, id")) as Mail[];
async function recorded(): Promise<{ status: string; cancel_at: Date | null; ended_at: Date | null }> {
  const [row] = await routing.directory("SELECT status, cancel_at, ended_at FROM subscription WHERE subscription_id = 'sub_1'");
  return row as { status: string; cancel_at: Date | null; ended_at: Date | null };
}
const family = async () => (await routing.directory("SELECT lock_reason FROM family WHERE family_id = $1", [familyId]))[0];

describe("/withdraw", () => {
  it("answers GET and POST alone", async () => {
    for (const path of ["/withdraw", "/en/withdraw"]) {
      const answer = await fetch(`${router.url}${path}`, { method: "PUT" });
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET, HEAD, POST");
    }
  });

  it("sends a browser without a session to the sign-in and back, in both languages", async () => {
    await subscribed(FRESH);
    expect(await browser().request("/withdraw")).toMatchObject({ status: 302, location: `${PUBLIC_URL}/sign-in?back=%2Fwithdraw` });
    expect(await browser().post({}, "/en/withdraw")).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in?back=%2Fen%2Fwithdraw` });
    routing.logto.signInAs("u-1");
    const english = await browser().visit("/en/withdraw");
    expect(english).toMatchObject({ status: 200, path: "/en/withdraw" });
    expect(english.body).toContain('<form method="post">');
    expect(english.body).toContain('lang="en"');
    const german = await (await signedIn()).request("/withdraw");
    expect(german.body).toContain('lang="de"');
    expect(german.body).toContain("Anna Muster");
    expect(stripe.cancelled).toEqual([]);
  });

  it("is for Admins of the Family alone", async () => {
    await subscribed(FRESH);
    routing.logto.addMember("org_1", "u-member", "member");
    const own = await signedIn("u-member");
    const page = await own.request("/withdraw");
    expect(page.status).toBe(403);
    expect(page.body).not.toContain("<form");
  });

  it("tells another Admin who the holder is, and takes nothing from them", async () => {
    await subscribed(FRESH);
    routing.logto.addMember("org_1", "u-2");
    const own = await signedIn("u-2");
    const page = await own.request("/withdraw");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Vertragsinhaber: Anna Muster");
    expect(page.body).not.toContain("<form");
    expect((await own.request("/en/withdraw")).body).toContain("Contract holder: Anna Muster");
    const holder = await signedIn("u-1");
    const { body } = await holder.request("/withdraw");
    routing.logto.signInAs("u-2");
    expect(await own.post({ csrf: csrfOf(body) })).toMatchObject({ status: 403 });
    const mine = await own.request("/withdraw");
    expect(await own.post({ csrf: csrfOf(mine.body) })).toMatchObject({ status: 403 });
    expect(stripe.cancelled).toEqual([]);
    expect(stripe.refunded).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("gives the support's address and no form to a Family without a recorded founder", async () => {
    await subscribed(FRESH);
    const own = await signedIn();
    const { body } = await own.request("/withdraw");
    routing.logto.setFounder("org_1", null);
    await routing.directory("UPDATE family SET registered_by = NULL WHERE family_id = $1", [familyId]);
    const page = await own.request("/withdraw");
    expect(page.status).toBe(200);
    expect(page.body).toContain("support@family-agenda.cloud");
    expect(page.body).not.toContain("<form");
    expect(await own.post({ csrf: csrfOf(body) })).toMatchObject({ status: 403 });
    expect(stripe.cancelled).toEqual([]);
  });

  it("says so if there is nothing to withdraw from", async () => {
    const own = await signedIn();
    const page = await own.request("/withdraw");
    expect(page.status).toBe(200);
    expect(page.body).toContain("kein Abonnement");
    expect(page.body).not.toContain("<form");
    await subscribed({ ...FRESH, status: "canceled", ended_at: seconds("2026-11-15T00:00:00Z") });
    const ended = await own.request("/withdraw");
    expect(ended.body).toContain("kein Abonnement");
    expect(ended.body).not.toContain("<form");
  });

  it("takes no Withdrawal from a Subscription that ended otherwise", async () => {
    await subscribed(FRESH);
    const own = await signedIn();
    const { body } = await own.request("/withdraw");
    stripe.subscriptions.set("sub_1", stripeSubscription(familyId, "sub_1", { ...FRESH, status: "canceled", ended_at: seconds("2026-11-19T00:00:00Z") }));
    const answer = await own.post({ csrf: csrfOf(body) });
    expect(answer.status).toBe(409);
    expect(answer.body).toContain("kein Abonnement");
    expect(stripe.refunded).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("refuses a form without the session's token, changing nothing", async () => {
    await subscribed(FRESH);
    const own = await signedIn();
    expect(await own.post({})).toMatchObject({ status: 403 });
    expect(await own.post({ csrf: "another" })).toMatchObject({ status: 403 });
    const other = await signedIn();
    expect(await own.post({ csrf: csrfOf((await other.request("/withdraw")).body) })).toMatchObject({ status: 403 });
    expect(stripe.cancelled).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("within the period ends the Subscription at once, refunds all that was paid and mails the holder; the Family is Locked once Stripe tells", async () => {
    await subscribed(FRESH);
    stripe.paid.set("sub_1", 499);
    routing.logto.setLocale("u-1", "de-DE");
    const own = await signedIn();
    const receipt = await own.submit();
    expect(receipt.status).toBe(200);
    expect(receipt.body).toContain("20.11.2026");
    expect(receipt.body).toContain("data-print");
    expect(receipt.body).not.toMatch(/bestätigt|wirksam|gültig/);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(stripe.refunded).toEqual(["sub_1"]);
    expect(stripe.ends).toEqual([]);
    expect(stripe.subscriptions.get("sub_1")!.metadata).toMatchObject({ withdrawalReceivedAt: now.toISOString() });
    expect(await recorded()).toMatchObject({ status: "canceled", ended_at: new Date(1_790_000_000_000) });
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ mail_to: "u-1@example.com", subject: "Eingangsbestätigung deines Widerrufs – Family Agenda Cloud" });
    expect(sent[0]!.body).toContain("insgesamt 4,99 €");
    expect(sent[0]!.body).not.toMatch(/bestätigt|wirksam|gültig/);

    expect(await family()).toMatchObject({ lock_reason: null });
    await told("customer.subscription.deleted");
    expect(await family()).toMatchObject({ lock_reason: "subscription_ended" });
    expect(stripe.unused).toEqual([]);
  });

  it("takes two submits as one Withdrawal: one refund and one mail", async () => {
    await subscribed(FRESH);
    stripe.paid.set("sub_1", 499);
    const own = await signedIn();
    const { body } = await own.request("/withdraw");
    const [first, second] = await Promise.all([own.post({ csrf: csrfOf(body) }), own.post({ csrf: csrfOf(body) })]);
    expect([first.status, second.status]).toEqual([200, 200]);
    now = new Date(now.getTime() + 5 * 60_000);
    const third = await own.post({ csrf: csrfOf(body) });
    expect(third.status).toBe(200);
    expect(third.body).toContain("11:00");
    expect(third.body).not.toContain("11:05");
    await told("customer.subscription.deleted");
    expect((await own.post({ csrf: csrfOf(body) })).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(stripe.refunded).toEqual(["sub_1"]);
    expect(await mails()).toHaveLength(1);
    const page = await own.request("/withdraw");
    expect(page.body).toContain("kein Abonnement");
  });

  it("within the period in the Trial refunds nothing, the mail says 0,00 € and that the Trial goes on, and the Family stays in its Trial", async () => {
    await routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-16T10:00:00Z")]);
    await subscribed({ ...FRESH, billing_cycle_anchor: seconds("2026-11-30T10:00:00Z") });
    routing.logto.setLocale("u-1", "de-DE");
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    const [mail] = await mails();
    expect(mail!.body).toContain("insgesamt 0,00 €");
    expect(mail!.body).toContain("Dein Testzeitraum läuft bis zum 30.11.2026 weiter");
    expect(mail!.body).not.toContain("gesperrt");
    await told("customer.subscription.deleted");
    expect(await family()).toMatchObject({ lock_reason: null });
    expect(routing.log()).toContain("the Family stays in its Trial");
  });

  it("within the period after the Trial ended locks the Family, and the mail says so", async () => {
    await routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-01T10:00:00Z")]);
    await subscribed(FRESH);
    routing.logto.setLocale("u-1", "de-DE");
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect((await mails())[0]!.body).toContain("deine Familie ist gesperrt");
    await told("customer.subscription.deleted");
    expect(await family()).toMatchObject({ lock_reason: "subscription_ended" });
  });

  it("within the period ends a Subscription with a Cancellation pending at once all the same, and pays the Cancellation's payback not too", async () => {
    await subscribed({ ...FRESH, cancel_at: seconds("2026-12-10T09:00:00Z"), metadata: { familyId, holder: "u-1", cancellationReceivedAt: "2026-11-12T08:00:00.000Z", cancellationRefundCents: "" } });
    stripe.paid.set("sub_1", 499);
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(stripe.refunded).toEqual(["sub_1"]);
    expect((await mails())[0]!.body).toContain("insgesamt 4,99 €");
    await told("customer.subscription.deleted");
    expect(stripe.unused).toEqual([]);
  });

  it("withdraws from an unpaid Subscription of a Locked Family", async () => {
    await subscribed({ ...FRESH, status: "unpaid" });
    expect(await family()).toMatchObject({ lock_reason: "unpaid" });
    const own = await signedIn();
    expect((await own.request("/withdraw")).body).toContain("<form");
    expect((await own.submit()).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(await mails()).toHaveLength(1);
  });

  it("counts the last day of the period in", async () => {
    await subscribed(FRESH);
    now = new Date("2026-11-24T22:59:59Z");
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
  });

  it("after the period cancels to the earliest date and mails the period's end and the contract's end", async () => {
    await subscribed(OLD);
    const own = await signedIn();
    const receipt = await own.submit();
    expect(receipt.status).toBe(200);
    expect(receipt.body).toContain("20.11.2026");
    expect(stripe.cancelled).toEqual([]);
    expect(stripe.refunded).toEqual([]);
    expect(stripe.ends).toEqual([
      {
        id: "sub_1",
        end: new Date("2026-12-09T10:00:00Z"),
        metadata: { cancellationReceivedAt: now.toISOString(), cancellationRefundCents: "", withdrawalReceivedAt: now.toISOString() },
        idempotencyKey: expect.stringContaining("withdraw:sub_1:") as unknown,
      },
    ]);
    expect(await recorded()).toMatchObject({ status: "active", cancel_at: new Date("2026-12-09T10:00:00Z") });
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain("Die Widerrufsfrist von 14 Tagen ist am 11.06.2026 abgelaufen");
    expect(sent[0]!.body).toContain("Der Vertrag endet am 09.12.2026");
    expect(sent[0]!.body).not.toMatch(/bestätigt|wirksam|gültig/);

    now = new Date(now.getTime() + 60_000);
    expect((await own.submit()).status).toBe(200);
    expect(stripe.ends).toHaveLength(1);
    expect(await mails()).toHaveLength(1);
    expect(await family()).toMatchObject({ lock_reason: null });
  });

  it("is over on the first day after the period", async () => {
    await subscribed(FRESH);
    now = new Date("2026-11-24T23:00:00Z");
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.cancelled).toEqual([]);
    expect(stripe.ends).toMatchObject([{ end: new Date("2026-12-10T09:00:00Z") }]);
    expect((await mails())[0]!.body).toContain("am 24.11.2026 abgelaufen");
  });

  it("after the period keeps the earlier end of a pending Cancellation, and mails that date", async () => {
    const metadata = { familyId, holder: "u-1", cancellationReceivedAt: "2026-11-01T08:00:00.000Z", cancellationRefundCents: "" };
    await subscribed({ ...OLD, cancel_at: seconds("2026-12-09T10:00:00Z"), metadata });
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.ends).toEqual([{ id: "sub_1", end: new Date("2026-12-09T10:00:00Z"), metadata: { withdrawalReceivedAt: now.toISOString() }, idempotencyKey: expect.any(String) as unknown }]);
    expect(stripe.subscriptions.get("sub_1")!.metadata).toMatchObject({ cancellationReceivedAt: "2026-11-01T08:00:00.000Z" });
    expect((await mails())[0]!.body).toContain("Der Vertrag endet am 09.12.2026");
  });

  it("after the period moves a Cancellation pending to a later date forward to the earliest", async () => {
    const metadata = { familyId, holder: "u-1", cancellationReceivedAt: "2026-11-01T08:00:00.000Z", cancellationRefundCents: "" };
    await subscribed({ ...OLD, cancel_at: seconds("2027-02-09T10:00:00Z"), metadata });
    const own = await signedIn();
    expect((await own.submit()).status).toBe(200);
    expect(stripe.ends).toMatchObject([{ end: new Date("2026-12-09T10:00:00Z"), metadata: { cancellationReceivedAt: now.toISOString(), withdrawalReceivedAt: now.toISOString() } }]);
    expect(await recorded()).toMatchObject({ cancel_at: new Date("2026-12-09T10:00:00Z") });
    expect((await mails())[0]!.body).toContain("Der Vertrag endet am 09.12.2026");
  });

  it("mails in the holder's language", async () => {
    await subscribed(FRESH);
    stripe.paid.set("sub_1", 499);
    routing.logto.setLocale("u-1", "en-GB");
    const own = await signedIn();
    const receipt = await own.submit("/en/withdraw");
    expect(receipt.status).toBe(200);
    expect(receipt.body).not.toMatch(/confirmed|valid/);
    const [mail] = await mails();
    expect(mail).toMatchObject({ subject: "Acknowledgement of your withdrawal – Family Agenda Cloud" });
    expect(mail!.body).toContain("€4.99 in total");
    expect(mail!.body).not.toMatch(/confirmed|valid/);
  });

  it("records nothing and mails nobody if Stripe does not end the Subscription, and takes it when Stripe does", async () => {
    await subscribed(FRESH);
    stripe.paid.set("sub_1", 499);
    const own = await signedIn();
    stripe.failCancels = true;
    const answer = await own.submit();
    expect(answer.status).toBe(502);
    expect(answer.body).toContain("Bitte versuch es in einigen Minuten erneut.");
    expect(await recorded()).toMatchObject({ status: "active", ended_at: null });
    expect(await mails()).toEqual([]);
    stripe.failCancels = false;
    now = new Date("2026-11-25T10:00:00Z");
    const receipt = await (await signedIn()).submit();
    expect(receipt.status).toBe(200);
    expect(receipt.body).toContain("20.11.2026");
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(await mails()).toHaveLength(1);
  });

  it("finishes a Withdrawal whose refund Stripe did not take, even after Stripe told of the end", async () => {
    await subscribed(FRESH);
    stripe.paid.set("sub_1", 499);
    const own = await signedIn();
    const { body } = await own.request("/withdraw");
    stripe.failRefunds = true;
    expect((await own.post({ csrf: csrfOf(body) })).status).toBe(502);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(await mails()).toEqual([]);
    await told("customer.subscription.deleted");
    stripe.failRefunds = false;
    expect((await own.post({ csrf: csrfOf(body) })).status).toBe(200);
    expect(stripe.cancelled).toEqual(["sub_1"]);
    expect(stripe.refunded).toEqual(["sub_1"]);
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain("insgesamt 4,99 €");
  });

  it("records nothing and mails nobody if Stripe does not take the Cancellation after the period", async () => {
    await subscribed(OLD);
    const own = await signedIn();
    stripe.failEnds = true;
    expect((await own.submit()).status).toBe(502);
    expect(await recorded()).toMatchObject({ cancel_at: null });
    expect(await mails()).toEqual([]);
    stripe.failEnds = false;
    expect((await own.submit()).status).toBe(200);
    expect(await mails()).toHaveLength(1);
  });
});
