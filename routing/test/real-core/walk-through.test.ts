import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "../support/routing";

/**
 * The walk-through against the core in supplied mode, not the stand-in: what the stand-in mirrors,
 * the real core must answer alike. No step prepares a Family: the core does when it first opens
 * it, here for its first Admin. It runs where REAL_CORE_URL names such a core, which CI's
 * `real-core` job starts with TRUST_PROXY=true, as on the Cube, and with the demo Source plugin of
 * the core's repository at PLUGIN_URLS. The core must reach the test's Postgres server at
 * REAL_CORE_DATABASE_HOST, and holds the Families' blobs below REAL_CORE_BLOB_ROOT.
 */
const real = {
  url: process.env.REAL_CORE_URL,
  triggerUrl: process.env.REAL_CORE_TRIGGER_URL,
  contextKey: process.env.REAL_CORE_CONTEXT_KEY,
  triggerToken: process.env.REAL_CORE_TRIGGER_TOKEN,
  databaseHost: process.env.REAL_CORE_DATABASE_HOST,
  databasePort: process.env.REAL_CORE_DATABASE_PORT ?? "5432",
  blobRoot: process.env.REAL_CORE_BLOB_ROOT ?? "/var/lib/family-agenda/blobs",
};

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const EMAIL = "first.admin@example.org";
const OTHER_EMAIL = "other.admin@example.org";
/** A Task the core's demo Source states on every run. */
const DEMO_TASK = "Sign the class trip form";

/** The Routing module's environment with the real core as its one-core pool. */
const withRealCore = (): Record<string, string> => ({
  CORE_URL: real.url!,
  CORE_TRIGGER_URL: real.triggerUrl!,
  CONTEXT_KEY: real.contextKey!,
  TRIGGER_TOKEN: real.triggerToken!,
  FAMILY_DATABASE_HOST: real.databaseHost!,
  FAMILY_DATABASE_PORT: real.databasePort,
  BLOB_ROOT: real.blobRoot,
});

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  // The core closes a Family's idle connections after 10 seconds; dropping its database before
  // would end them, and the core does not survive a connection Postgres ends.
  await expect
    .poll(async () => routing.server("SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname LIKE 'family\\_%'"), { timeout: 30_000, interval: 500 })
    .toEqual([{ open: 0 }]);
  await routing.close();
}, 45_000);

/**
 * A browser on the Router at `base`: it keeps the session cookie it is given and sends POSTs
 * from the Router's origin.
 */
function browserAt(base: string) {
  let cookie: string | undefined;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      redirect: "manual",
      headers: { ...(cookie ? { cookie } : {}), ...(init.method === "POST" ? { origin: base } : {}) },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };
  return {
    get: (path: string) => request(path),
    post: (path: string, form: Record<string, string>) => request(path, { method: "POST", body: new URLSearchParams(form) }),
    session: () => cookie,
    withSession: (session: string | undefined) => {
      cookie = session;
    },
  };
}

/** The ids of the Family's Agendas, as its Admin area lists them. */
async function agendasOf(browser: ReturnType<typeof browserAt>, familyId: string): Promise<string[]> {
  const page = await browser.get(`/${familyId}/admin/agendas`);
  expect(page.status).toBe(200);
  return [...(await page.text()).matchAll(new RegExp(`/${familyId}/admin/agendas/([0-9a-f-]{36})"`, "g"))].map((match) => match[1]!);
}

/**
 * The core's pages and its schema are not an interface the Routing module relies on (ADR-0001): only
 * this test reads them, as a browser and the Operator would, to show that the pinned core serves two
 * Families apart behind the Router. A core that changes them fails this test when it is pinned, and
 * nothing in production.
 */
describe.skipIf(!real.url)("Two Families on the core", () => {
  it("are created, signed in to apart, scheduled, and show the demo Source's Items on one Family's Agenda only", async () => {
    const familyIdOf = async (email: string): Promise<string> => {
      const created = await routing.run(["create", "--admin-email", email], withRealCore());
      expect(created, created.stderr).toMatchObject({ exitCode: 0 });
      return ADDRESS.exec(created.stdout.trim())![1]!;
    };
    const first = await familyIdOf(EMAIL);
    const second = await familyIdOf(OTHER_EMAIL);
    expect(await routing.directory("SELECT family_id, status FROM family ORDER BY family_id")).toEqual(
      [first, second].sort().map((familyId) => ({ family_id: familyId, status: "active" })),
    );

    const router = await routing.startRouter(withRealCore());
    const health = await fetch(`${router.url}/api/health`);
    expect(await health.json()).toEqual({ status: "ok", version: expect.any(String) as unknown });

    const passwordOf = async (familyId: string, email: string): Promise<string> => {
      const reset = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", email], withRealCore());
      expect(reset, reset.stderr).toMatchObject({ exitCode: 0 });
      return new RegExp(`^New password for ${email}: (\\S{8,})$`, "m").exec(reset.stdout)![1]!;
    };
    const firstPassword = await passwordOf(first, EMAIL);
    const secondPassword = await passwordOf(second, OTHER_EMAIL);
    // The other Family's Admin is not one of this Family's, nor the other way round.
    const elsewhere = await routing.run(["reset-admin-password", "--family-id", first, "--admin-email", OTHER_EMAIL], withRealCore());
    expect(elsewhere.stderr).toContain(`The Family ${first} has no Admin with the email ${OTHER_EMAIL}`);
    const back = await routing.run(["reset-admin-password", "--family-id", second, "--admin-email", EMAIL], withRealCore());
    expect(back.stderr).toContain(`The Family ${second} has no Admin with the email ${EMAIL}`);

    const signIn = async (familyId: string, email: string, password: string) => {
      const browser = browserAt(router.url);
      // Each Family has its first Admin: its setup page is never open, every page leads to signing in.
      expect((await browser.get(`/${familyId}/setup`)).status).toBe(404);
      const admin = await browser.get(`/${familyId}/admin`);
      expect([admin.status, admin.headers.get("location")]).toEqual([302, `/${familyId}/admin/sign-in`]);
      const signedIn = await browser.post(`/${familyId}/admin/sign-in`, { email, password });
      expect(signedIn.status, await signedIn.text()).toBe(303);
      // The session is the Family's own: its cookie goes only to paths below the Family's address.
      expect(signedIn.headers.get("set-cookie")).toContain(`Path=/${familyId}`);
      // Supplied mode has the first Admin confirm the recovery kit before anything else.
      const confirmed = await browser.post(`/${familyId}/admin/recovery-kit/confirm`, { saved: "yes" });
      expect(confirmed.status).toBe(303);
      expect((await browser.get(`/${familyId}/admin/agendas`)).status).toBe(200);
      return browser;
    };
    // The other Family's Admin does not sign in to this Family, with neither one's password.
    const refused = await browserAt(router.url).post(`/${first}/admin/sign-in`, { email: OTHER_EMAIL, password: secondPassword });
    expect(refused.status).toBeLessThan(500);
    expect(refused.status).not.toBe(303);
    expect(refused.headers.get("set-cookie") ?? "").not.toContain("fb_session=");
    const firstAdmin = await signIn(first, EMAIL, firstPassword);
    const secondAdmin = await signIn(second, OTHER_EMAIL, secondPassword);

    // A session from one Family does not sign the Admin in to the other.
    const stray = browserAt(router.url);
    stray.withSession(firstAdmin.session());
    const across = await stray.get(`/${second}/admin/agendas`);
    expect([across.status, across.headers.get("location")]).toEqual([302, `/${second}/admin/sign-in`]);

    // The first Family gets the demo Source; both get an Agenda that shows everyone.
    expect((await firstAdmin.post(`/${first}/admin/source-types/demo/enable`, {})).status).toBe(303);
    expect((await firstAdmin.post(`/${first}/admin/sources`, { sourceTypeId: "demo", pollIntervalMinutes: "1" })).status).toBe(303);
    for (const [browser, familyId] of [[firstAdmin, first], [secondAdmin, second]] as const) {
      expect((await browser.post(`/${familyId}/admin/agendas`, { layout: "task_list", horizonDays: "7" })).status).toBe(303);
    }
    const [firstAgenda] = await agendasOf(firstAdmin, first);
    const [secondAgenda] = await agendasOf(secondAdmin, second);
    const agenda = async (familyId: string, agendaId: string) => {
      const page = await fetch(`${router.url}/${familyId}/agendas/${agendaId}`);
      expect(page.status).toBe(200);
      return page.text();
    };
    expect(await agenda(first, firstAgenda!)).not.toContain(DEMO_TASK);

    const clock = new TestClock(new Date(Date.now() - (Date.now() % 60_000) + 10_000).toISOString());
    await routing.startScheduler(clock, withRealCore());
    const demoTasks = (familyId: string) => routing.family(familyId, "SELECT title FROM task WHERE title = $1", [DEMO_TASK]);
    await expect
      .poll(
        async () => {
          await clock.tick(60_000);
          return demoTasks(first);
        },
        { timeout: 40_000, interval: 1_000 },
      )
      .toEqual([{ title: DEMO_TASK }]);
    await expect.poll(async () => agenda(first, firstAgenda!), { timeout: 10_000 }).toContain(DEMO_TASK);
    for (const familyId of [first, second]) {
      await expect
        .poll(async () => (await routing.run(["families"], withRealCore())).stdout, { timeout: 15_000 })
        .toMatch(new RegExp(`^${familyId}\\tactive\\t.*\\tsucceeded`, "m"));
    }

    // The other Family shows none of them, and holds none of them.
    expect(await agenda(second, secondAgenda!)).not.toContain(DEMO_TASK);
    expect(await routing.family(second, "SELECT count(*)::int AS items FROM item")).toEqual([{ items: 0 }]);
  });
});
