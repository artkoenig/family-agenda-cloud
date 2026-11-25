import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Router } from "../src/router";
import { trialEndsAt } from "../src/trial";
import { setUpRouting, type TestRouting } from "./support/routing";
import { signed, standInStripe, STRIPE_ENV, stripeSubscription, type StandInStripe } from "./support/stand-in-stripe";

const PUBLIC_URL = "https://app.family-agenda.test";
const DAY = 24 * 60 * 60_000;
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
  const post = (form: Record<string, string>, path = "/cancel") => request(path, { method: "POST", body: new URLSearchParams(form) });
  /** Posts the form with the token of the page as it is now. */
  const submit = async (form: Record<string, string>, path = "/cancel") => post({ csrf: csrfOf((await request(path)).body), ...form }, path);
  return { request, visit, post, submit };
}

const csrfOf = (page: string): string => /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";
const endsOf = (page: string): string[] => [...page.matchAll(/<option value="([^"]+)"/g)].map(([, end]) => end!);

async function signedIn(userId = "u-1") {
  routing.logto.signInAs(userId);
  const own = browser();
  await own.visit("/sign-in");
  return own;
}

/** Sets the Subscription at Stripe and lets the Directory follow it. */
async function subscribed(changes: Parameters<typeof stripeSubscription>[2] = {}, type = "customer.subscription.updated"): Promise<void> {
  stripe.subscriptions.set("sub_1", stripeSubscription(familyId, "sub_1", changes));
  const { body, signature } = signed({ id: `evt_${++events}`, object: "event", type, data: { object: { id: "sub_1" } } });
  const posted = await fetch(`${router.url}/stripe/events`, { method: "POST", body, headers: { "stripe-signature": signature } });
  expect(posted.status, routing.log()).toBe(200);
}

const YEARLY = {
  created: seconds("2025-01-15T09:30:00Z"),
  billing_cycle_anchor: seconds("2025-01-15T09:30:00Z"),
  items: { data: [{ current_period_end: seconds("2027-01-15T09:30:00Z"), price: { recurring: { interval: "year" as const } } }] },
};

const mails = () => routing.directory("SELECT type, mail_to, subject, body FROM mail_outbox WHERE type = 'cancellation' ORDER BY created_at, id");
async function recordedEnd(): Promise<Date | null> {
  const [row] = await routing.directory("SELECT cancel_at FROM subscription WHERE subscription_id = 'sub_1'");
  return (row as { cancel_at: Date | null }).cancel_at;
}

describe("/cancel", () => {
  it("answers GET and POST alone", async () => {
    for (const path of ["/cancel", "/en/cancel"]) {
      const answer = await fetch(`${router.url}${path}`, { method: "PUT" });
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET, HEAD, POST");
    }
  });

  it("sends a browser without a session to the sign-in and back", async () => {
    await subscribed();
    expect(await browser().request("/cancel")).toMatchObject({ status: 302, location: `${PUBLIC_URL}/sign-in?back=%2Fcancel` });
    expect(await browser().post({ end: "x" }, "/en/cancel")).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in?back=%2Fen%2Fcancel` });
    routing.logto.signInAs("u-1");
    const page = await browser().visit("/en/cancel");
    expect(page).toMatchObject({ status: 200, path: "/en/cancel" });
    expect(page.body).toContain('<form method="post">');
    expect(stripe.ends).toEqual([]);
  });

  it("is for Admins of the Family alone", async () => {
    await subscribed();
    routing.logto.addMember("org_1", "u-member", "member");
    const own = await signedIn("u-member");
    expect(await own.request("/cancel")).toMatchObject({ status: 403 });
    expect((await own.request("/cancel")).body).not.toContain("<form");
  });

  it("tells another Admin who the holder is, and takes nothing from them", async () => {
    await subscribed();
    routing.logto.addMember("org_1", "u-2");
    const own = await signedIn("u-2");
    const page = await own.request("/cancel");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Anna Muster");
    expect(page.body).not.toContain("<form");
    const holder = await signedIn("u-1");
    const { body } = await holder.request("/cancel");
    routing.logto.signInAs("u-2");
    expect(await own.post({ csrf: csrfOf(body), end: endsOf(body)[0]! })).toMatchObject({ status: 403 });
    expect(await own.post({ end: endsOf(body)[0]! })).toMatchObject({ status: 403 });
    expect(stripe.ends).toEqual([]);
  });

  it("says so if there is nothing to cancel", async () => {
    const own = await signedIn();
    const page = await own.request("/cancel");
    expect(page.status).toBe(200);
    expect(page.body).toContain("kein Abonnement");
    expect(page.body).not.toContain("<form");
    await subscribed({ status: "canceled", ended_at: seconds("2026-11-01T00:00:00Z") });
    expect((await own.request("/cancel")).body).toContain("kein Abonnement");
  });

  it("offers the ends of the billing periods from the current one on", async () => {
    await subscribed({ billing_cycle_anchor: seconds("2026-06-09T10:00:00Z") });
    const own = await signedIn();
    const ends = endsOf((await own.request("/cancel")).body);
    expect(ends).toHaveLength(12);
    expect(ends.slice(0, 2)).toEqual(["2026-12-09T10:00:00.000Z", "2027-01-09T10:00:00.000Z"]);
  });

  it("offers the Trial's end first for a Subscription ordered during the Trial", async () => {
    await routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date(now.getTime() - 4 * DAY)]);
    const anchor = trialEndsAt(new Date(now.getTime() - 4 * DAY));
    await subscribed({ billing_cycle_anchor: anchor.getTime() / 1000 });
    const own = await signedIn();
    const ends = endsOf((await own.request("/cancel")).body);
    expect(ends.slice(0, 2)).toEqual(["2026-11-30T10:00:00.000Z", "2026-12-30T10:00:00.000Z"]);
    expect((await own.submit({ end: ends[0]! })).status).toBe(200);
    expect((await mails())[0]).toMatchObject({ body: expect.stringContaining("Es wird nichts berechnet.") as unknown });
  });

  it("counts a Subscription paid at once, whose anchor Stripe moved a period on, from its first payment", async () => {
    await subscribed({ billing_cycle_anchor: seconds("2026-12-18T10:00:00Z") });
    const own = await signedIn();
    expect(endsOf((await own.request("/cancel")).body)[0]).toBe("2026-12-18T10:00:00.000Z");
    expect((await own.submit({ end: "2026-12-18T10:00:00.000Z" })).status).toBe(200);
    expect(((await mails())[0] as { body: string }).body).not.toContain("Es wird nichts berechnet.");
  });

  it("refuses a form without the session's token, changing nothing", async () => {
    await subscribed();
    const own = await signedIn();
    const { body } = await own.request("/cancel");
    const end = endsOf(body)[0]!;
    expect(await own.post({ end })).toMatchObject({ status: 403 });
    expect(await own.post({ end, csrf: "another" })).toMatchObject({ status: 403 });
    expect(await own.post({ undo: "1", csrf: "another" })).toMatchObject({ status: 403 });
    const other = await signedIn();
    expect(await own.post({ end, csrf: csrfOf((await other.request("/cancel")).body) })).toMatchObject({ status: 403 });
    expect(stripe.ends).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("refuses an end date it does not offer", async () => {
    await subscribed();
    const own = await signedIn();
    for (const end of ["2026-12-01T00:00:00.000Z", "", "tomorrow"]) {
      const answer = await own.submit({ end });
      expect(answer.status).toBe(400);
      expect(answer.body).toContain("<select");
    }
    expect((await own.post({ csrf: csrfOf((await own.request("/cancel")).body) })).status).toBe(400);
    expect(stripe.ends).toEqual([]);
  });

  it("cancels at Stripe to exactly the chosen date, keeps it, shows the receipt and mails the holder once", async () => {
    await subscribed({ billing_cycle_anchor: seconds("2026-06-09T10:00:00Z") });
    routing.logto.setLocale("u-1", "de-DE");
    const own = await signedIn();
    const end = endsOf((await own.request("/cancel")).body)[1]!;
    const receipt = await own.submit({ end });
    expect(receipt.status).toBe(200);
    expect(receipt.body).toContain("09.01.2027");
    expect(receipt.body).toContain("data-print");
    expect(stripe.ends).toEqual([
      { id: "sub_1", end: new Date("2027-01-09T10:00:00Z"), metadata: { cancellationReceivedAt: now.toISOString(), cancellationRefundCents: "" }, idempotencyKey: expect.stringContaining("cancel:sub_1:") as unknown },
    ]);
    expect(await recordedEnd()).toEqual(new Date("2027-01-09T10:00:00Z"));
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ body: expect.stringContaining("09.01.2027") as unknown });

    now = new Date(now.getTime() + 60_000);
    const again = await own.post({ csrf: csrfOf(receipt.body) || csrfOf((await own.request("/cancel")).body), end });
    expect(again.status).toBe(200);
    expect(again.body).toContain("09.01.2027");
    expect(again.body).toContain("20.11.2026");
    expect((await own.submit({ end: "2026-12-09T10:00:00.000Z" })).status).toBe(303);
    expect(stripe.ends).toHaveLength(1);
    expect(await mails()).toHaveLength(1);
  });

  it("mails in the holder's language", async () => {
    await subscribed();
    routing.logto.setLocale("u-1", "en-GB");
    const own = await signedIn();
    const end = endsOf((await own.request("/cancel")).body)[0]!;
    expect((await own.submit({ end })).status).toBe(200);
    expect((await mails())[0]).toMatchObject({ subject: expect.stringMatching(/cancel/i) as unknown });
  });

  it("records nothing and mails nobody if Stripe does not take the Cancellation", async () => {
    await subscribed();
    const own = await signedIn();
    const end = endsOf((await own.request("/cancel")).body)[0]!;
    stripe.failEnds = true;
    const answer = await own.submit({ end });
    expect(answer.status).toBe(502);
    expect(answer.body).toContain("Es wurde nichts geändert");
    expect(await recordedEnd()).toBeNull();
    expect(await mails()).toEqual([]);
    stripe.failEnds = false;
    expect((await own.submit({ end })).status).toBe(200);
    expect(await mails()).toHaveLength(1);
  });

  it("shows a pending Cancellation with the button that takes it back, without a mail", async () => {
    await subscribed();
    const own = await signedIn();
    const end = endsOf((await own.request("/cancel")).body)[0]!;
    await own.submit({ end });
    const pending = await own.request("/cancel");
    expect(pending.status).toBe(200);
    expect(pending.body).toContain('name="undo"');
    expect(pending.body).not.toContain("<select");

    stripe.failEnds = true;
    expect((await own.submit({ undo: "1" })).status).toBe(502);
    expect(await recordedEnd()).toEqual(new Date(end));
    stripe.failEnds = false;
    expect(await own.submit({ undo: "1" })).toMatchObject({ status: 303, location: `${PUBLIC_URL}/cancel` });
    expect(stripe.ends.at(-1)).toMatchObject({ id: "sub_1", end: null, metadata: { cancellationReceivedAt: "", cancellationRefundCents: "" } });
    expect(await recordedEnd()).toBeNull();
    expect(await mails()).toHaveLength(1);
    expect((await own.request("/cancel")).body).toContain("<select");
    expect(await own.submit({ undo: "1" })).toMatchObject({ status: 303 });
    expect(stripe.ends).toHaveLength(2);
  });

  it("notes what a yearly Subscription after year one pays back, and pays it when the Subscription ends by the Cancellation", async () => {
    await subscribed(YEARLY);
    const own = await signedIn();
    const ends = endsOf((await own.request("/cancel")).body);
    expect(ends.slice(0, 3)).toEqual(["2026-12-15T09:30:00.000Z", "2027-01-15T09:30:00.000Z", "2027-02-15T09:30:00.000Z"]);
    expect((await own.submit({ end: ends[0]! })).status).toBe(200);
    expect(stripe.ends[0]).toMatchObject({ metadata: { cancellationRefundCents: "415" } });
    expect(stripe.unused).toEqual([]);

    const ended = { ...stripe.subscriptions.get("sub_1")!, status: "canceled" as const, ended_at: seconds("2026-12-15T09:30:00Z") };
    await subscribed(ended, "customer.subscription.deleted");
    expect(stripe.unused).toEqual([{ id: "sub_1", cents: 415 }]);
  });

  it("pays nothing back for a Cancellation taken back, or a Subscription that ended before it", async () => {
    await subscribed(YEARLY);
    const own = await signedIn();
    const end = endsOf((await own.request("/cancel")).body)[0]!;
    await own.submit({ end });
    const cancelled = stripe.subscriptions.get("sub_1")!;
    await subscribed({ ...cancelled, status: "canceled", ended_at: seconds("2026-12-01T00:00:00Z") }, "customer.subscription.deleted");
    expect(stripe.unused).toEqual([]);
  });

  it("pays nothing back at the end of a paid year", async () => {
    await subscribed(YEARLY);
    const own = await signedIn();
    expect((await own.submit({ end: "2027-01-15T09:30:00.000Z" })).status).toBe(200);
    expect(stripe.ends[0]).toMatchObject({ metadata: { cancellationRefundCents: "" } });
  });
});
