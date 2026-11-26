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
  routing.logto.addMember("org_1", "u-2");
  routing.logto.setName("u-2", "<b>Berta</b>");
  await routing.directory("UPDATE family SET registered_by = 'u-1', trial_starts_at = NULL WHERE family_id = $1", [familyId]);
});
afterEach(async () => {
  await routing.close();
});

type Answer = { status: number; location: string | null; cacheControl: string | null; type: string | null; body: string };

/** A browser that keeps cookies. */
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
    return { status: answer.status, location: location && new URL(location, url).href, cacheControl: answer.headers.get("cache-control"), type: answer.headers.get("content-type"), body: await answer.text() };
  }
  /** Where the redirects lead, up to the Family. */
  async function followed(path: string): Promise<string> {
    let at = new URL(path, PUBLIC_URL).href;
    for (let hop = 0; hop < 20; hop++) {
      const { location } = await request(at);
      if (!location) return at;
      at = location;
      if (/^\/[0-9a-f-]{36}\//.test(at.replace(PUBLIC_URL, ""))) return at.replace(PUBLIC_URL, "");
    }
    throw new Error("Too many redirects");
  }
  return { request, followed };
}

async function signedIn(userId = "u-1") {
  routing.logto.signInAs(userId);
  const own = browser();
  await own.followed("/sign-in");
  return own;
}

/** Sets the Subscription at Stripe and lets the Directory follow it. */
async function subscribed(changes: Parameters<typeof stripeSubscription>[2] = {}): Promise<void> {
  stripe.subscriptions.set("sub_1", stripeSubscription(familyId, "sub_1", changes));
  const { body, signature } = signed({ id: `evt_${++events}`, object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
  const posted = await fetch(`${router.url}/stripe/events`, { method: "POST", body, headers: { "stripe-signature": signature } });
  expect(posted.status, routing.log()).toBe(200);
}

const inTrial = () => routing.directory("UPDATE family SET trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-16T10:00:00Z")]);

const MONTHLY = { created: seconds("2026-11-09T10:00:00Z"), items: { data: [{ current_period_end: seconds("2026-12-09T10:00:00Z"), price: { recurring: { interval: "month" as const } } }] } };

describe("/contract", () => {
  it("answers GET and HEAD alone", async () => {
    for (const path of ["/contract", "/en/contract"]) {
      const answer = await fetch(`${router.url}${path}`, { method: "POST" });
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET, HEAD");
    }
    const head = await (await signedIn()).request("/contract", { method: "HEAD" });
    expect(head).toMatchObject({ status: 200, body: "" });
  });

  it("links the sign-in without a session, which comes back to the section", async () => {
    const page = await browser().request("/en/contract");
    expect(page).toMatchObject({ status: 200, location: null, cacheControl: "no-store", type: "text/html; charset=utf-8" });
    expect(page.body).not.toContain("<html");
    const link = /href="([^"]+)"/.exec(page.body)![1]!;
    routing.logto.signInAs("u-1");
    expect(await browser().followed(link)).toBe(`/${familyId}/admin/sections/contract`);
  });

  it("shows the founder the Trial and the way to order", async () => {
    await inTrial();
    const page = await (await signedIn()).request("/contract");
    expect(page).toMatchObject({ status: 200, cacheControl: "no-store", type: "text/html; charset=utf-8" });
    expect(page.body).toContain("<dt>Status</dt><dd>Testzeitraum</dd><dt>Endet am</dt><dd>30.11.2026 (noch 10 Tage)</dd>");
    expect(page.body).toContain('href="/order"');
    expect(page.body).not.toContain("<html");
  });

  it("refuses another Admin, for whom the core lists no section", async () => {
    await inTrial();
    expect(await (await signedIn("u-2")).request("/contract")).toMatchObject({ status: 403, body: "", cacheControl: "no-store" });
  });

  it("shows the founder the running Subscription, without asking Stripe", async () => {
    await subscribed(MONTHLY);
    stripe.subscriptions.clear();
    const { body } = await (await signedIn()).request("/contract");
    expect(body).toContain("<dt>Tarif</dt><dd>Monatsabo</dd><dt>Status</dt><dd>aktiv</dd><dt>Verlängert sich am</dt><dd>09.12.2026</dd>");
    expect(body).toContain('href="/cancel"');
    expect(body).toContain('href="/withdraw"');
    now = new Date("2026-11-24T10:00:00Z");
    expect((await (await signedIn()).request("/contract")).body).not.toContain('href="/withdraw"');
  });

  it("names another holder to the founder, escaped", async () => {
    await subscribed(MONTHLY);
    await routing.directory("UPDATE subscription SET holder = 'u-2'");
    expect((await (await signedIn()).request("/contract")).body).toContain("<dt>Bestellt von</dt><dd>&lt;b&gt;Berta&lt;/b&gt;</dd>");
  });

  it("shows a Locked Family since when, why, when it is deleted, and the way to order", async () => {
    const own = await signedIn();
    await routing.directory("UPDATE family SET locked_at = $2, lock_reason = 'trial_ended' WHERE family_id = $1", [familyId, new Date("2026-11-18T10:00:00Z")]);
    const { body } = await own.request("/contract");
    expect(body).toContain("<dd>gesperrt seit 18.11.2026 (der Testzeitraum ist abgelaufen)</dd><dt>Löschung am</dt><dd>18.12.2026</dd>");
    expect(body).toContain('href="/order"');
  });

  it("dates in the Family's time zone", async () => {
    await routing.directory("UPDATE family SET time_zone = 'Asia/Tokyo', trial_starts_at = $2 WHERE family_id = $1", [familyId, new Date("2026-11-16T20:00:00Z")]);
    expect((await (await signedIn()).request("/contract")).body).toContain("01.12.2026");
  });

  it("refuses the founder who is no Admin any more, and a Family that does not run", async () => {
    await inTrial();
    const own = await signedIn();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);
    const refused = async () => {
      expect(await own.request("/contract")).toMatchObject({ status: 403, body: "" });
    };
    await refused();
    await routing.directory("UPDATE family SET status = 'active' WHERE family_id = $1", [familyId]);
    routing.logto.addMember("org_1", "u-1", "member");
    await refused();
  });

  it("stands a holder who is gone from Logto, and refuses a Family without a founder", async () => {
    await subscribed(MONTHLY);
    await routing.directory("UPDATE subscription SET holder = 'u-gone'");
    expect((await (await signedIn()).request("/contract")).body).not.toContain("Bestellt von");
    await routing.directory("DELETE FROM subscription");
    await routing.directory("UPDATE family SET registered_by = NULL");
    expect(await (await signedIn()).request("/contract")).toMatchObject({ status: 403 });
  });
});
