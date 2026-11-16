import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "../support/routing";

/**
 * The walk-through against the released core in supplied mode, not the stand-in: what the stand-in
 * mirrors, the real core must answer alike. It runs where REAL_CORE_URL names such a core (CI's
 * `real-core` job starts one); the core must reach the test's Postgres server at
 * REAL_CORE_DATABASE_HOST, and holds the Families' blobs below REAL_CORE_BLOB_ROOT.
 */
const real = {
  url: process.env.REAL_CORE_URL,
  triggerUrl: process.env.REAL_CORE_TRIGGER_URL,
  contextKey: process.env.REAL_CORE_CONTEXT_KEY,
  triggerToken: process.env.REAL_CORE_TRIGGER_TOKEN,
  version: process.env.REAL_CORE_VERSION,
  databaseHost: process.env.REAL_CORE_DATABASE_HOST,
  databasePort: process.env.REAL_CORE_DATABASE_PORT ?? "5432",
  blobRoot: process.env.REAL_CORE_BLOB_ROOT ?? "/var/lib/family-agenda/blobs",
};

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const EMAIL = "first.admin@example.org";

/** The Routing module's environment with the real core as its one-core pool. */
const withRealCore = (): Record<string, string> => ({
  CORE_URLS: real.url!,
  CORE_TRIGGER_URLS: real.triggerUrl!,
  CONTEXT_KEY: real.contextKey!,
  TRIGGER_TOKEN: real.triggerToken!,
  CORE_VERSION: real.version!,
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
  // would end them, and the core 0.7.0 does not survive a connection Postgres ends.
  await expect
    .poll(async () => routing.server("SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname LIKE 'family\\_%'"), { timeout: 30_000, interval: 500 })
    .toEqual([{ open: 0 }]);
  await routing.close();
}, 45_000);

describe.skipIf(!real.url)("A Family on the released core", () => {
  it("is created, served, scheduled and given a new Admin password", async () => {
    const created = await routing.run(["create", "--admin-email", EMAIL], withRealCore());
    expect(created, created.stderr).toMatchObject({ exitCode: 0 });
    const familyId = ADDRESS.exec(created.stdout.trim())![1]!;
    expect(await routing.directory("SELECT status, core_version FROM family WHERE family_id = $1", [familyId])).toEqual([
      { status: "active", core_version: real.version },
    ]);

    const router = await routing.startRouter(withRealCore());
    const health = await fetch(`${router.url}/api/health`);
    expect(await health.json()).toEqual({ status: "ok", version: real.version });
    // The Family has its first Admin: no setup page, the sign-in below the Family's address.
    const page = await fetch(`${router.url}/${familyId}/admin`, { redirect: "manual" });
    expect(page.status, await page.text()).toBeLessThan(500);
    expect(page.status).not.toBe(409);
    const location = page.headers.get("location");
    if (location) expect(location).toContain(`/${familyId}/`);

    const reset = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", EMAIL], withRealCore());
    expect(reset, reset.stderr).toMatchObject({ exitCode: 0 });
    expect(reset.stdout).toMatch(new RegExp(`^New password for ${EMAIL}: \\S{8,}$`, "m"));
    const unknown = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", "stranger@example.org"], withRealCore());
    expect(unknown.stderr).toContain(`The Family ${familyId} has no Admin with the email stranger@example.org`);

    const clock = new TestClock(new Date(Date.now() - (Date.now() % 60_000) + 10_000).toISOString());
    await routing.startScheduler(clock, withRealCore());
    await clock.tick(60_000);
    await expect
      .poll(async () => (await routing.run(["families"], withRealCore())).stdout, { timeout: 15_000 })
      .toMatch(new RegExp(`^${familyId}\\tactive\\t.*\\tsucceeded`, "m"));
  });
});
