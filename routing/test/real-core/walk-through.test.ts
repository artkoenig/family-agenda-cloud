import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "../support/routing";
import { standInStripe, STRIPE_ENV } from "../support/stand-in-stripe";

/**
 * The walk-through against the core in supplied mode, not the stand-in: what the stand-in mirrors,
 * the real core must answer alike. No step prepares a Family: the core does when it first opens
 * it. Its Admins are Logto's, which the walk-through does not run: the core is configured with an
 * Identity Provider that never answers, and nothing here signs in. It runs where REAL_CORE_URL
 * names such a core, which CI's `real-core` job starts with TRUST_PROXY=true, as on the Cube; the
 * core must reach the test's Postgres server at REAL_CORE_DATABASE_HOST, and holds the Families' blobs below REAL_CORE_BLOB_ROOT.
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
 * Not walked through here until Logto runs beside the core (#136): an Admin signing in, a demo
 * Source and its Items on one Family's Agenda only. The core documents its sign-in page, Sources and Agendas as pages for
 * people, not as an interface for callers, and the Routing module takes from the core only what it
 * documents (ADR-0001).
 */
describe.skipIf(!real.url)("Two Families on the core", () => {
  it("are created, served apart and scheduled", async () => {
    const familyIdOf = async (organizationId: string): Promise<string> => {
      const created = await routing.run(["create", "--organization-id", organizationId], withRealCore());
      expect(created, created.stderr).toMatchObject({ exitCode: 0 });
      return ADDRESS.exec(created.stdout.trim())![1]!;
    };
    const first = await familyIdOf("org_walkfirst");
    const second = await familyIdOf("org_walksecond");
    expect(await routing.directory("SELECT family_id, status FROM family ORDER BY family_id")).toEqual(
      [first, second].sort().map((familyId) => ({ family_id: familyId, status: "active" })),
    );

    // The first has a founder, and with Stripe configured its Context names the Contract section (#267).
    await routing.directory("UPDATE family SET registered_by = 'u-founder' WHERE family_id = $1", [first]);
    const router = await routing.startRouter({ ...withRealCore(), ...STRIPE_ENV }, undefined, standInStripe());
    const health = await fetch(`${router.url}/api/health`);
    expect(await health.json()).toEqual({ status: "ok", version: expect.any(String) as unknown });
    for (const familyId of [first, second]) {
      // The core opens each Family with its own Context, its Organization and sections included: no setup page.
      const setup = await fetch(`${router.url}/${familyId}/setup`, { redirect: "manual" });
      expect(setup.status, await setup.text()).toBe(404);
    }

    const clock = new TestClock(new Date(Date.now() - (Date.now() % 60_000) + 10_000).toISOString());
    await routing.startScheduler(clock, withRealCore());
    await clock.tick(60_000);
    for (const familyId of [first, second]) {
      await expect
        .poll(async () => (await routing.run(["families"], withRealCore())).stdout, { timeout: 15_000 })
        .toMatch(new RegExp(`^${familyId}\\tactive\\t.*\\tsucceeded`, "m"));
    }
  });
});
