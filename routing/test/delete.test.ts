import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteFamilyAndTell } from "../src/delete-family";
import { familyDatabaseNames } from "../src/family-databases";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { signed, standInStripe, STRIPE_ENV, stripeSubscription, type StandInStripe } from "./support/stand-in-stripe";

const PUBLIC_URL = "https://app.family-agenda.test";
const seconds = (iso: string) => new Date(iso).getTime() / 1000;

let routing: TestRouting;
let router: Router;
let stripe: StandInStripe;
let familyId: string;
let blobRoot: string;
let now: Date;
let events: number;

beforeEach(async () => {
  now = new Date("2026-11-20T10:00:00Z");
  events = 0;
  routing = await setUpRouting();
  blobRoot = await mkdtemp(join(tmpdir(), "routing-blobs-"));
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  const client = await routing.run(["sign-in-client"], { PUBLIC_URL });
  const signInEnv = { PUBLIC_URL, OIDC_ISSUER_URL: routing.logto.issuer, ...Object.fromEntries(client.stdout.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string])) };
  stripe = standInStripe();
  router = await routing.startRouter({ ...signInEnv, ...STRIPE_ENV, BLOB_ROOT: blobRoot }, () => now, stripe);
  const result = await routing.run(["create", "--organization-id", "org_1"], { BLOB_ROOT: blobRoot });
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  familyId = /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
  await mkdir(join(blobRoot, familyId, "attachments"), { recursive: true });
  await writeFile(join(blobRoot, familyId, "attachments", "flyer.pdf"), "a flyer");
  routing.logto.addMember("org_1", "u-1");
  routing.logto.setName("u-1", "Anna Muster");
  routing.logto.setFounder("org_1", "u-1");
  // Signed in a minute ago, by the Router's clock.
  routing.logto.signedInAt(new Date("2026-11-20T09:59:00Z"));
});
afterEach(async () => {
  await routing.close();
  await rm(blobRoot, { recursive: true, force: true });
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
  /** Follows redirects until a page answers, or until the browser is back at `PUBLIC_URL`'s root or a Family. */
  async function visit(path: string): Promise<Answer & { path: string }> {
    let at = new URL(path, PUBLIC_URL).href;
    for (let hop = 0; hop < 20; hop++) {
      const answer = await request(at);
      if (!answer.location) return { ...answer, path: at.replace(PUBLIC_URL, "") };
      at = answer.location;
      if (/^\/([0-9a-f-]{36}\/)?$/.test(at.replace(PUBLIC_URL, ""))) return { ...answer, path: at.replace(PUBLIC_URL, "") };
    }
    throw new Error("Too many redirects");
  }
  const post = (form: Record<string, string>, path = "/delete") => request(path, { method: "POST", body: new URLSearchParams(form) });
  /** Posts the form, ticked, with the token of the page as it is now. */
  const submit = async (path = "/delete") => post({ csrf: csrfOf((await request(path)).body), understood: "on" }, path);
  return { request, visit, post, submit, signedIn: () => jar.has("__Host-session") };
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

/** Monthly, ordered ten days before now and paid at once: within the withdrawal period, which ends on 24 November. */
const FRESH = { created: seconds("2026-11-10T09:00:00Z"), billing_cycle_anchor: seconds("2026-11-10T09:00:00Z") };
/** Monthly, ordered long ago: the earliest end is 9 December. */
const OLD = { created: seconds("2026-05-28T20:26:40Z"), billing_cycle_anchor: seconds("2026-06-09T10:00:00Z") };
/** Yearly, in its second year: the earliest end is 15 December, which pays 4,15 € back. */
const YEARLY = {
  created: seconds("2025-01-15T09:30:00Z"),
  billing_cycle_anchor: seconds("2025-01-15T09:30:00Z"),
  items: { data: [{ current_period_end: seconds("2027-01-15T09:30:00Z"), price: { recurring: { interval: "year" as const } } }] },
};

type Mail = { type: string; mail_to: string; subject: string; body: string };
const mails = async () => (await routing.directory("SELECT type, mail_to, subject, body FROM mail_outbox WHERE type LIKE 'family-deleted%' ORDER BY type, mail_to")) as Mail[];

const databaseName = () => familyDatabaseNames(familyId).databaseName;

/** What is left of the Family. */
async function left() {
  const [entry] = await routing.directory("SELECT status, deleted_at IS NOT NULL AS finished, wrapped_family_key FROM family WHERE family_id = $1", [familyId]);
  return {
    entry,
    databases: (await routing.server("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName()])).length,
    roles: (await routing.server("SELECT 1 FROM pg_roles WHERE rolname = $1", [databaseName()])).length,
    blobs: (await readdir(blobRoot)).includes(familyId),
    schedules: await routing.schedules(familyId),
  };
}

const GONE = { entry: { status: "deleted", finished: true, wrapped_family_key: null }, databases: 0, roles: 0, blobs: false, schedules: [] };

describe("/delete", () => {
  it("answers GET and POST alone", async () => {
    for (const path of ["/delete", "/en/delete"]) {
      const answer = await fetch(`${router.url}${path}`, { method: "PUT" });
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET, HEAD, POST");
    }
  });

  it("sends a browser without a session to the sign-in and back, in both languages", async () => {
    expect(await browser().request("/delete")).toMatchObject({ status: 302, location: `${PUBLIC_URL}/sign-in?back=%2Fdelete` });
    expect(await browser().post({}, "/en/delete")).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in?back=%2Fen%2Fdelete` });
    routing.logto.signInAs("u-1");
    const english = await browser().visit("/en/delete");
    expect(english).toMatchObject({ status: 200, path: "/en/delete" });
    expect(english.body).toContain('<form method="post">');
    expect(english.body).toContain('lang="en"');
    const german = await (await signedIn()).request("/delete");
    expect(german.body).toContain('lang="de"');
    expect(german.body).toContain("Familie endgültig löschen");
    expect(german.body).toContain(`href="${PUBLIC_URL}/${familyId}/admin/export/download"`);
  });

  it("is for Admins of the Family alone", async () => {
    routing.logto.addMember("org_1", "u-member", "member");
    const own = await signedIn("u-member");
    const page = await own.request("/delete");
    expect(page.status).toBe(403);
    expect(page.body).not.toContain("<form");
  });

  it("tells another Admin who can delete, and takes nothing from them", async () => {
    routing.logto.addMember("org_1", "u-2");
    const own = await signedIn("u-2");
    const page = await own.request("/delete");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Löschen kann nur: Anna Muster");
    expect(page.body).not.toContain("<form");
    expect((await own.request("/en/delete")).body).toContain("Only Anna Muster can delete the family");
    const founder = await signedIn("u-1");
    const { body } = await founder.request("/delete");
    routing.logto.signInAs("u-2");
    expect(await own.post({ csrf: csrfOf(body), understood: "on" })).toMatchObject({ status: 403 });
    expect(await own.submit()).toMatchObject({ status: 403 });
    expect(await left()).toMatchObject({ entry: { status: "active" }, databases: 1 });
    expect(await mails()).toEqual([]);
  });

  it("gives the support's address and no form to a Family without a recorded founder", async () => {
    const own = await signedIn();
    const { body } = await own.request("/delete");
    routing.logto.setFounder("org_1", null);
    await routing.directory("UPDATE family SET registered_by = NULL WHERE family_id = $1", [familyId]);
    const page = await own.request("/delete");
    expect(page.status).toBe(200);
    expect(page.body).toContain("support@family-agenda.cloud");
    expect(page.body).not.toContain("<form");
    expect(await own.post({ csrf: csrfOf(body), understood: "on" })).toMatchObject({ status: 403 });
    expect(await left()).toMatchObject({ entry: { status: "active" }, databases: 1 });
  });

  it("sends a sign-in older than 10 minutes back to Logto, which is asked for one no older, before the page and before deleting", async () => {
    const own = await signedIn();
    const { body } = await own.request("/delete");
    expect(body).toContain("<form");
    now = new Date("2026-11-20T10:09:01Z");
    expect(await own.request("/delete")).toMatchObject({ status: 302, location: `${PUBLIC_URL}/sign-in?back=%2Fdelete` });
    expect(await own.post({ csrf: csrfOf(body), understood: "on" })).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in?back=%2Fdelete` });
    expect(await left()).toMatchObject({ entry: { status: "active" }, databases: 1 });

    routing.logto.maxAges.length = 0;
    routing.logto.signedInAt(new Date("2026-11-20T10:09:00Z"));
    const again = await own.visit("/delete");
    expect(routing.logto.maxAges).toEqual(["600"]);
    expect(again).toMatchObject({ status: 200, path: "/delete" });
    expect(again.body).toContain("<form");
  });

  it("asks Logto for no fresh sign-in on the way to another page", async () => {
    routing.logto.signInAs("u-1");
    await browser().visit("/cancel");
    expect(routing.logto.maxAges).not.toContain("600");
  });

  it("refuses a form without the session's token, and deletes nothing without the tick", async () => {
    const own = await signedIn();
    expect(await own.post({ understood: "on" })).toMatchObject({ status: 403 });
    expect(await own.post({ csrf: "another", understood: "on" })).toMatchObject({ status: 403 });
    const { body } = await own.request("/delete");
    const unticked = await own.post({ csrf: csrfOf(body) });
    expect(unticked.status).toBe(400);
    expect(unticked.body).toContain("<form");
    expect(await left()).toMatchObject({ entry: { status: "active" }, databases: 1, blobs: true });
    expect(routing.logto.deletedUsers).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("deletes the Family, tells its Admins in their languages, and signs the founder out", async () => {
    routing.logto.addMember("org_1", "u-2");
    routing.logto.setLocale("u-2", "en-GB");
    const own = await signedIn();
    const answer = await own.submit();
    expect(answer, routing.log()).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in/out` });
    expect(await left()).toEqual(GONE);
    expect(routing.logto.deletedUsers.toSorted()).toEqual(["u-1", "u-2"]);
    expect(routing.logto.deleted).toEqual(["org_1"]);
    const [tombstone] = await routing.directory("SELECT row_to_json(family)::text AS entry FROM family WHERE family_id = $1", [familyId]);
    expect(tombstone!.entry).toContain(familyId);
    expect(tombstone!.entry).not.toMatch(/Anna|Muster|@/);

    const [deleter, notice, ...more] = await mails();
    expect(more).toEqual([]);
    expect(deleter).toMatchObject({ type: "family-deleted", mail_to: "u-1@example.com", subject: "Deine Familie wurde gelöscht – Family Agenda Cloud" });
    expect(deleter!.body).toContain("Du hast deine Familie am 20.11.2026 um 11:00 Uhr gelöscht.");
    expect(deleter!.body).toContain("spätestens am 04.12.2026 entfernt");
    expect(deleter!.body).not.toContain("Abonnement");
    expect(notice).toMatchObject({ type: "family-deleted-notice", mail_to: "u-2@example.com", subject: "Your family has been deleted – Family Agenda Cloud" });
    expect(notice!.body).toContain("Anna Muster deleted your family on 20 November 2026.");
    expect(stripe.ends).toEqual([]);

    expect(await own.visit(answer.location!)).toMatchObject({ path: "/" });
    expect(own.signedIn()).toBe(false);
    expect((await fetch(`${router.url}/${familyId}/`)).status).toBe(404);
  });

  it("deletes from the English page as well", async () => {
    const own = await signedIn();
    expect(await own.submit("/en/delete")).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in/out` });
    expect(await left()).toEqual(GONE);
  });

  it("cancels a running monthly Subscription to its earliest end, keeps its record, and names the end in the mail", async () => {
    await subscribed(OLD);
    const own = await signedIn();
    const page = await own.request("/delete");
    expect(page.body).toContain("Abonnement");
    expect(page.body).not.toContain("Vertrag widerrufen");
    expect(await own.submit(), routing.log()).toMatchObject({ status: 303 });
    expect(stripe.ends).toHaveLength(1);
    expect(stripe.ends[0]).toMatchObject({ id: "sub_1", end: new Date("2026-12-09T10:00:00Z"), metadata: { cancellationRefundCents: "" } });
    expect(await left()).toEqual(GONE);
    expect(await routing.directory("SELECT subscription_id, cancel_at FROM subscription WHERE family_id = $1", [familyId])).toEqual([{ subscription_id: "sub_1", cancel_at: new Date("2026-12-09T10:00:00Z") }]);
    const [deleter] = await mails();
    expect(deleter!.body).toContain("Dein Abonnement ist zum 09.12.2026 gekündigt.");
    expect(deleter!.body).not.toContain("erstatten");
  });

  it("notes the pro-rata refund of a yearly Subscription after year one, and names it in the mail", async () => {
    await subscribed(YEARLY);
    const own = await signedIn();
    expect(await own.submit(), routing.log()).toMatchObject({ status: 303 });
    expect(stripe.ends[0]).toMatchObject({ end: new Date("2026-12-15T09:30:00Z"), metadata: { cancellationRefundCents: "415" } });
    const [deleter] = await mails();
    expect(deleter!.body).toContain("Dein Abonnement ist zum 15.12.2026 gekündigt. Den nicht genutzten Teil, 4,15 €, erstatten wir auf dein Zahlungsmittel.");

    // The Subscription runs on to its end, which is no error, and pays the unused part back then.
    await told();
    expect(routing.log()).not.toContain("A Subscription runs of a Family that is deleted");
    await subscribed({ ...stripe.subscriptions.get("sub_1")!, status: "canceled" as const, ended_at: seconds("2026-12-15T09:30:00Z") }, "customer.subscription.deleted");
    expect(stripe.unused).toEqual([{ id: "sub_1", cents: 415 }]);
    expect(await left()).toEqual(GONE);
  });

  it("leaves a Subscription that is ending already as it is", async () => {
    await subscribed({ ...OLD, cancel_at: seconds("2027-01-09T10:00:00Z") });
    const own = await signedIn();
    expect(await own.submit(), routing.log()).toMatchObject({ status: 303 });
    expect(stripe.ends).toEqual([]);
    expect((await mails())[0]!.body).toContain("Dein Abonnement ist zum 09.01.2027 gekündigt.");
    expect(await left()).toEqual(GONE);
  });

  it("links to the withdrawal while the founder can still withdraw", async () => {
    await subscribed(FRESH);
    const page = await (await signedIn()).request("/delete");
    expect(page.body).toContain("Vertrag widerrufen");
    expect(page.body).toContain("24.11.2026");
  });

  it("deletes nothing if Stripe does not take the Cancellation", async () => {
    await subscribed(OLD);
    stripe.failEnds = true;
    const own = await signedIn();
    const answer = await own.submit();
    expect(answer.status).toBe(502);
    expect(answer.body).not.toContain("<form");
    expect(await left()).toMatchObject({ entry: { status: "active" }, databases: 1, blobs: true });
    expect(await mails()).toEqual([]);
    expect(routing.logto.deletedUsers).toEqual([]);
  });

  it("queues the mails before the Admins' users are deleted; an Operator finishes a run that failed part-way, and no mail is queued twice", async () => {
    routing.logto.addMember("org_1", "u-2");
    routing.logto.failDeleting("u-1");
    const own = await signedIn();
    expect(await own.submit()).toMatchObject({ status: 303, location: `${PUBLIC_URL}/sign-in/out` });
    expect(await left()).toMatchObject({ entry: { status: "deleted", finished: false } });
    expect(routing.logto.deleted).toEqual([]);
    expect(routing.log()).toContain("`routing delete` finishes it");
    expect((await mails()).map(({ type, mail_to }) => [type, mail_to])).toEqual([
      ["family-deleted", "u-1@example.com"],
      ["family-deleted-notice", "u-2@example.com"],
    ]);

    routing.logto.failDeleting(null);
    const finished = await routing.run(["delete", "--family-id", familyId, "--confirm", familyId], { BLOB_ROOT: blobRoot });
    expect(finished, finished.stderr).toMatchObject({ exitCode: 0 });
    expect(await left()).toEqual(GONE);
    expect(routing.logto.deleted).toEqual(["org_1"]);
    expect(await mails()).toHaveLength(2);
  });
});

describe("the automatic deletion (#228)", () => {
  const automatic = (at: Date) =>
    routing.provisioned((provisioning) => deleteFamilyAndTell(provisioning, familyId, { by: "automatic", at, subscription: null }), { BLOB_ROOT: blobRoot });

  it("deletes the Family by the same flow and tells every Admin, each in their language", async () => {
    routing.logto.addMember("org_1", "u-2");
    routing.logto.setLocale("u-2", "en");
    await automatic(now);
    expect(await left()).toEqual(GONE);
    expect(routing.logto.deleted).toEqual(["org_1"]);
    const [founder, other, ...more] = await mails();
    expect(more).toEqual([]);
    expect(founder).toMatchObject({ type: "family-deleted", mail_to: "u-1@example.com" });
    expect(founder!.body).toContain("Wie angekündigt haben wir deine Familie am 20.11.2026, 30 Tage nach der Sperre, gelöscht.");
    expect(founder!.body).toContain("spätestens am 04.12.2026 entfernt");
    expect(other).toMatchObject({ type: "family-deleted-notice", mail_to: "u-2@example.com" });
    expect(other!.body).toContain("As announced, we deleted your family on 20 November 2026, 30 days after it was locked.");
  });

  it("tells nobody a second time when it runs again", async () => {
    routing.logto.failDeleting("org_1");
    await expect(automatic(now)).rejects.toThrow();
    routing.logto.failDeleting(null);
    await automatic(new Date("2026-11-21T10:00:00Z"));
    expect(await left()).toEqual(GONE);
    expect(await mails()).toHaveLength(1);
  });
});
