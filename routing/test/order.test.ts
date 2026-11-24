import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { dateOf } from "../src/contract-wording";
import { SIGN_OUT_PATH } from "../src/sign-in-pages";
import { trialEndsAt } from "../src/trial";
import type { Router } from "../src/router";
import type { StripePort } from "../src/stripe";
import type { TariffPrice } from "../src/order-session";
import { setUpRouting, type TestRouting } from "./support/routing";

const PUBLIC_URL = "https://app.family-agenda.test";
const CHECKOUT = "https://checkout.stripe.test/session";
const DAY = 24 * 60 * 60_000;
const PRICES: Record<string, TariffPrice> = {
  price_m: { active: true, currency: "eur", tax_behavior: "inclusive", type: "recurring", unit_amount: 499, recurring: { interval: "month", interval_count: 1 } },
  price_y: { active: true, currency: "eur", tax_behavior: "inclusive", type: "recurring", unit_amount: 4990, recurring: { interval: "year", interval_count: 1 } },
};

let routing: TestRouting;
let router: Router;
let signInEnv: Record<string, string>;
let stripe: StripePort & { created: Stripe.Checkout.SessionCreateParams[]; open: Set<string> };
let now: Date;

function fakeStripe(prices = PRICES): typeof stripe {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const open = new Set<string>();
  return {
    created,
    open,
    price: (id) => Promise.resolve(prices[id]!),
    createSession(params) {
      created.push(params);
      open.add(`${params.client_reference_id!}#${created.length}`);
      return Promise.resolve(CHECKOUT);
    },
    openSessions: (familyId) => Promise.resolve([...open].filter((id) => id.startsWith(`${familyId}#`))),
    expireSession(id) {
      open.delete(id);
      return Promise.resolve();
    },
  };
}

const STRIPE_ENV = { STRIPE_SECRET_KEY: "key", STRIPE_PRICE_MONTHLY: "price_m", STRIPE_PRICE_YEARLY: "price_y" };

beforeEach(async () => {
  now = new Date();
  routing = await setUpRouting();
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  const client = await routing.run(["sign-in-client"], { PUBLIC_URL });
  signInEnv = { PUBLIC_URL, OIDC_ISSUER_URL: routing.logto.issuer, ...Object.fromEntries(client.stdout.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string])) };
  stripe = fakeStripe();
  router = await routing.startRouter({ ...signInEnv, ...STRIPE_ENV }, () => now, stripe);
});
afterEach(async () => {
  await routing.close();
});

type Answer = { status: number; location: string | null; body: string; setCookies: string[] };

/** A browser that keeps cookies; `visit` follows redirects, and stops at the Family and at Stripe. */
function browser() {
  const jar = new Map<string, string>();
  async function request(path: string, init: RequestInit = {}): Promise<Answer> {
    const url = new URL(path, PUBLIC_URL);
    const own = url.origin === PUBLIC_URL;
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const answer = await fetch(own ? new URL(url.pathname + url.search, router.url) : url, { ...init, redirect: "manual", headers: own && cookie ? { cookie } : {} });
    const setCookies = own ? answer.headers.getSetCookie() : [];
    for (const set of setCookies) {
      const [name = "", value = ""] = set.split(";")[0]!.split(/=(.*)/s);
      if (set.includes("Max-Age=0")) jar.delete(name);
      else jar.set(name, value);
    }
    const location = answer.headers.get("location");
    return { status: answer.status, location: location && new URL(location, url).href, body: await answer.text(), setCookies };
  }
  return {
    jar,
    request,
    post: (form: Record<string, string>, path = "/order") => request(path, { method: "POST", body: new URLSearchParams(form) }),
    async visit(path: string): Promise<Answer & { path: string }> {
      let at = new URL(path, PUBLIC_URL).href;
      for (let hop = 0; hop < 20; hop++) {
        const answer = await request(at);
        if (!answer.location) return { ...answer, path: at.replace(PUBLIC_URL, "") };
        at = answer.location;
        if (/^\/[0-9a-f-]{36}\/$/.test(at.replace(PUBLIC_URL, ""))) return { ...answer, path: at.replace(PUBLIC_URL, "") };
      }
      throw new Error("Too many redirects");
    },
  };
}

/** An active Family in its Trial of 14 days, with its Admin `u-1`, its founder. */
async function createFamily(founder: string | null = "u-1"): Promise<string> {
  const organizationId = "org_1";
  const result = await routing.run(["create", "--organization-id", organizationId]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  const familyId = /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
  routing.logto.addMember(organizationId, "u-1");
  routing.logto.setFounder(organizationId, founder);
  await startTrial(familyId, 0);
  return familyId;
}

/** Lets the Family's Trial begin so many days ago. */
const startTrial = (familyId: string, daysAgo: number) => setFamily(familyId, "trial_starts_at", new Date(now.getTime() - daysAgo * DAY));

const setFamily = (familyId: string, column: string, value: unknown) => routing.directory(`UPDATE family SET ${column} = $2 WHERE family_id = $1`, [familyId, value]);

async function signedIn(userId = "u-1") {
  routing.logto.signInAs(userId);
  const own = browser();
  await own.visit("/sign-in");
  return own;
}

describe("The session of the Routing module's pages", () => {
  it("is set at the sign-in and cleared by Abmelden", async () => {
    await createFamily();
    const own = await signedIn();
    expect(own.jar.has("__Host-session")).toBe(true);
    const signOut = await own.request(SIGN_OUT_PATH);
    expect(signOut.setCookies.some((cookie) => cookie.startsWith("__Host-session=; "))).toBe(true);
    expect((await own.request("/order")).location).toBe(`${PUBLIC_URL}/sign-in?back=%2Forder`);
  });

  it("is asked for at the sign-in, which comes back to the page", async () => {
    await createFamily();
    routing.logto.signInAs("u-1");
    expect(await browser().visit("/en/order")).toMatchObject({ status: 200, path: "/en/order" });
  });

  it("never takes the browser to a path that is not a page's", async () => {
    const familyId = await createFamily();
    routing.logto.signInAs("u-1");
    for (const back of ["https://evil.test/order", "//evil.test", "/api/x"]) {
      expect(await browser().visit(`/sign-in?back=${encodeURIComponent(back)}`)).toMatchObject({ path: `/${familyId}/` });
    }
  });
});

describe("The order page", () => {
  it("is for Admins of the Family alone", async () => {
    await createFamily();
    routing.logto.addMember("org_1", "u-member", "member");
    const own = await signedIn("u-member");
    for (const path of ["/order", "/order/done"]) expect(await own.request(path)).toMatchObject({ status: 403 });
    expect(await own.post({ billing: "monthly" })).toMatchObject({ status: 403 });
    expect(stripe.created).toEqual([]);
  });

  it.each(["suspended", "deleted"])("is not for a Family that is %s", async (status) => {
    const familyId = await createFamily();
    const own = await signedIn();
    await setFamily(familyId, "status", status);
    expect(await own.request("/order")).toMatchObject({ status: 403 });
  });

  it("tells another Admin who alone may order", async () => {
    await createFamily();
    routing.logto.setName("u-1", "Anna Muster");
    routing.logto.addMember("org_1", "u-2");
    const own = await signedIn("u-2");
    const { body } = await own.request("/order");
    expect(body).toContain("Bestellen kann nur: Anna Muster");
    expect(body).not.toContain("<form");
    expect(await own.post({ billing: "monthly" })).toMatchObject({ status: 200 });
    expect(stripe.created).toEqual([]);
  });

  it("gives the support's address where no founder is known, or they are no Admin any more", async () => {
    const familyId = await createFamily(null);
    const own = await signedIn();
    const without = await own.request("/order");
    await setFamily(familyId, "registered_by", "u-gone");
    for (const { body } of [without, await own.request("/order")]) {
      expect(body).toContain("support@family-agenda.cloud");
      expect(body).not.toContain("<form");
    }
    await own.post({ billing: "monthly", name: "Anna" });
    expect(stripe.created).toEqual([]);
  });

  it("shows when the first payment falls due: at the Trial's end, or today if Locked", async () => {
    const familyId = await createFamily();
    const own = await signedIn();
    const due = async () => /Erste Zahlung am ([^<]+)/.exec((await own.request("/order")).body)?.[1];
    expect(await due()).toBe(dateOf(trialEndsAt(now), "de"));
    await startTrial(familyId, 13);
    expect(await due()).toBe(dateOf(new Date(now.getTime() + DAY), "de"));
    await routing.directory("UPDATE family SET locked_at = $2, lock_reason = 'trial_ended' WHERE family_id = $1", [familyId, now]);
    expect(await due()).toBe(dateOf(now, "de"));
  });

  it("offers nothing without a running Trial", async () => {
    const familyId = await createFamily();
    const own = await signedIn();
    for (const trial of [null, new Date(now.getTime() - 20 * DAY)]) {
      await setFamily(familyId, "trial_starts_at", trial);
      expect((await own.request("/order")).body).not.toContain("<form");
      await own.post({ billing: "monthly", name: "Anna" });
    }
    expect(stripe.created).toEqual([]);
  });

  it("says that the Tariff is already ordered, and by whom", async () => {
    const familyId = await createFamily();
    routing.logto.setName("u-1", "Anna Muster");
    await routing.directory("INSERT INTO subscription (subscription_id, family_id, holder, billing, status, ordered_at) VALUES ('sub_1', $1, 'u-1', 'monthly', 'active', now())", [familyId]);
    const own = await signedIn();
    const { body } = await own.request("/order");
    expect(body).toContain("Tarif bereits bestellt");
    expect(body).toContain("Anna Muster");
    await own.post({ billing: "monthly", name: "Anna" });
    expect(stripe.created).toEqual([]);
  });
});

describe("The order", () => {
  it("asks a founder without a name for it, and keeps it at Logto", async () => {
    const familyId = await createFamily();
    routing.logto.setLocale("u-1", "en-GB");
    const own = await signedIn();
    expect((await own.request("/order")).body).toContain('name="name"');
    for (const name of ["", "   ", "x".repeat(129)]) expect(await own.post({ billing: "yearly", name })).toMatchObject({ status: 400 });
    expect(stripe.created).toEqual([]);

    expect(await own.post({ billing: "yearly", name: " Anna Muster " })).toMatchObject({ status: 303, location: CHECKOUT });
    expect(routing.logto.nameOf("u-1")).toBe("Anna Muster");
    expect((await own.request("/order")).body).not.toContain('name="name"');
    expect(stripe.created).toMatchObject([
      { client_reference_id: familyId, line_items: [{ price: "price_y", quantity: 1 }], metadata: { familyId, holder: "u-1" }, customer_email: "u-1@example.com", locale: "en" },
    ]);
  });

  it("speaks the Admin's language at Logto and leaves a name there alone", async () => {
    await createFamily();
    routing.logto.setName("u-1", "Anna Muster");
    routing.logto.setLocale("u-1", "de-DE");
    const own = await signedIn();
    expect(await own.post({ billing: "monthly", name: "Other" }, "/en/order")).toMatchObject({ status: 303, location: CHECKOUT });
    expect(routing.logto.nameOf("u-1")).toBe("Anna Muster");
    expect(stripe.created).toMatchObject([{ locale: "de", success_url: `${PUBLIC_URL}/en/order/done` }]);
  });

  it("expires the Family's Session before", async () => {
    await createFamily();
    routing.logto.setName("u-1", "Anna Muster");
    const own = await signedIn();
    await own.post({ billing: "monthly" });
    await own.post({ billing: "yearly" });
    expect(stripe.created).toHaveLength(2);
    expect(stripe.open.size).toBe(1);
  });

  it("refuses an unknown billing, a long body and other methods, and needs a sign-in", async () => {
    await createFamily();
    routing.logto.setName("u-1", "Anna Muster");
    const own = await signedIn();
    expect(await own.post({ billing: "weekly" })).toMatchObject({ status: 400 });
    expect(await own.post({ billing: "monthly", name: "x".repeat(9000) })).toMatchObject({ status: 413 });
    expect(await own.request("/order", { method: "PUT" })).toMatchObject({ status: 405 });
    expect(await own.post({}, "/order/done")).toMatchObject({ status: 405 });
    expect(await browser().post({ billing: "monthly" })).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in?back=%2Forder` });
    expect(stripe.created).toEqual([]);
  });

  it("changes nothing at the success address", async () => {
    const familyId = await createFamily();
    const own = await signedIn();
    const entry = () => routing.directory("SELECT * FROM family WHERE family_id = $1", [familyId]);
    const before = await entry();
    const done = await own.request("/order/done");
    expect(done).toMatchObject({ status: 200 });
    expect(done.body).toContain("Danke für Ihre Bestellung.");
    expect(done.body).toContain(`href="/${familyId}/"`);
    expect(await entry()).toEqual(before);
    expect(await routing.directory("SELECT * FROM subscription")).toEqual([]);
  });
});

describe("The Router", () => {
  it("refuses to start with a Price that is not the Tariff's", async () => {
    const wrong = fakeStripe({ ...PRICES, price_y: { ...PRICES["price_y"]!, unit_amount: 4900 } });
    await expect(routing.startRouter({ ...signInEnv, ...STRIPE_ENV }, undefined, wrong)).rejects.toThrow("Stripe's yearly Price price_y is not 4990 cents");
  });

  it("starts without Stripe, with the order page off", async () => {
    await createFamily();
    const own = await signedIn();
    router = await routing.startRouter(signInEnv);
    const answer = await own.request("/order");
    expect(answer.body).not.toContain("Tarif bestellen");
    expect(answer.location ?? "").not.toContain("back=");
  });
});
