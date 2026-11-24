import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LockReason } from "../src/directory";
import { lockFamily, unlockFamily } from "../src/family-status";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const ALL_SCHEDULES = ["due-work", "purge-messages", "sweep-secrets"];
const MINUTE = 60_000;

let routing: TestRouting;
let router: Router;
beforeEach(async () => {
  routing = await setUpRouting();
  router = await routing.startRouter();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(): Promise<string> {
  const result = await routing.run(["create", "--organization-id", `org_${crypto.randomUUID().slice(0, 8)}`]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

const lock = (familyId: string, reason: LockReason = "trial_ended", at = new Date("2026-11-20T10:00:00Z")) =>
  routing.provisioned((provisioning) => lockFamily(provisioning, familyId, reason, at));
const unlock = (familyId: string) => routing.provisioned((provisioning) => unlockFamily(provisioning, familyId));
const suspend = (familyId: string) => routing.run(["suspend", "--family-id", familyId]);
const resume = (familyId: string) => routing.run(["resume", "--family-id", familyId]);

/** The Family's stored status and lock. */
async function lockOf(familyId: string) {
  const [row] = await routing.directory("SELECT status, locked_at, lock_reason FROM family WHERE family_id = $1", [familyId]);
  return row;
}

/** Status of the Router's answer to a browser for the Family's admin page. */
const answerTo = async (familyId: string) => (await fetch(`${router.url}/${familyId}/admin`, { redirect: "manual" })).status;

/** The paths of the scheduled operations that arrived at the stand-in core for the Family, after the sweep that opened it. */
const scheduledCallsOf = (familyId: string): string[] =>
  routing.core.requests
    .filter(({ path, context }) => context?.familyId === familyId && path.startsWith("/operations/"))
    .map(({ path }) => path)
    .slice(1);

const familyLine = async (familyId: string) => {
  const result = await routing.run(["families"]);
  return result.stdout.split("\n").find((line) => line.startsWith(familyId));
};

/** The Family's data: its database, its blobs, and what the Directory needs to open them. */
async function dataOf(familyId: string, blobRoot: string) {
  const [entry] = await routing.directory(
    "SELECT database_name, database_role, blob_location, time_zone, wrapped_family_key, wrapped_database_password FROM family WHERE family_id = $1",
    [familyId],
  );
  return {
    entry,
    appointments: await routing.family(familyId, "SELECT title FROM appointment"),
    blobs: (await readdir(join(blobRoot, familyId), { recursive: true })).sort(),
    flyer: await readFile(join(blobRoot, familyId, "attachments", "flyer.pdf"), "utf8"),
  };
}

describe("Locking a Family", () => {
  it("withholds it, removes its schedules, and `families` says it is locked", async () => {
    const familyId = await createFamily();
    const other = await createFamily();

    await lock(familyId, "subscription_ended");

    expect(await lockOf(familyId)).toEqual({ status: "active", locked_at: new Date("2026-11-20T10:00:00Z"), lock_reason: "subscription_ended" });
    expect(await routing.schedules(familyId)).toEqual([]);
    expect(await routing.schedules(other)).toEqual(ALL_SCHEDULES);
    expect(await answerTo(familyId)).toBe(404);
    expect(await answerTo(other)).toBe(200);
    expect((await familyLine(familyId))?.split("\t")[1]).toBe("locked");
    expect((await familyLine(other))?.split("\t")[1]).toBe("active");
    expect(routing.log()).toContain(`"message":"The Family is locked; nothing routes to it","familyId":"${familyId}","reason":"subscription_ended"`);
  });

  it("twice keeps when and why it was first locked", async () => {
    const familyId = await createFamily();
    await lock(familyId, "trial_ended", new Date("2026-11-20T10:00:00Z"));

    await lock(familyId, "unpaid", new Date("2026-11-21T10:00:00Z"));

    expect(await lockOf(familyId)).toMatchObject({ locked_at: new Date("2026-11-20T10:00:00Z"), lock_reason: "trial_ended" });
    expect(await routing.schedules(familyId)).toEqual([]);
  });

  it("gives the Scheduler no due work for it, even while its schedules are still there", async () => {
    const familyId = await createFamily();
    const other = await createFamily();
    // A lock that stopped before the schedules were removed.
    await routing.directory("UPDATE family SET locked_at = now(), lock_reason = 'unpaid' WHERE family_id = $1", [familyId]);

    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    for (let minute = 0; minute < 3; minute++) await clock.tick(MINUTE);

    await expect.poll(() => scheduledCallsOf(other)).toContain("/operations/due-work");
    expect(scheduledCallsOf(familyId)).toEqual([]);
    expect(routing.log()).toContain(`"message":"The Family is not active; nothing is triggered","familyId":"${familyId}","occasion":"due-work","status":"locked"`);
  });

  it("leaves its data untouched, through the lock, the Scheduler's ticks and the unlock", async () => {
    const blobRoot = await mkdtemp(join(tmpdir(), "routing-blobs-"));
    try {
      routing.env.BLOB_ROOT = blobRoot;
      const familyId = await createFamily();
      const other = await createFamily();
      await routing.family(familyId, "CREATE TABLE appointment (title text)");
      await routing.family(familyId, "INSERT INTO appointment VALUES ('Dentist')");
      await mkdir(join(blobRoot, familyId, "attachments"), { recursive: true });
      await writeFile(join(blobRoot, familyId, "attachments", "flyer.pdf"), "a flyer");
      const before = await dataOf(familyId, blobRoot);

      await lock(familyId);
      const clock = new TestClock("2026-11-16T08:01:10Z");
      await routing.startScheduler(clock);
      for (let minute = 0; minute < 3; minute++) await clock.tick(MINUTE);
      await expect.poll(() => scheduledCallsOf(other)).toContain("/operations/due-work");

      expect(await dataOf(familyId, blobRoot)).toEqual(before);
      expect(before).toMatchObject({ appointments: [{ title: "Dentist" }], blobs: ["attachments", join("attachments", "flyer.pdf")], flyer: "a flyer" });
      expect(scheduledCallsOf(familyId)).toEqual([]);

      await unlock(familyId);

      expect(await dataOf(familyId, blobRoot)).toEqual(before);
    } finally {
      await rm(blobRoot, { recursive: true, force: true });
    }
  });

  it("is refused for a deleted Family, and for one still being prepared", async () => {
    const deleted = await createFamily();
    await routing.directory("UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL, deleted_at = now() WHERE family_id = $1", [deleted]);
    routing.core.failNext("secret-sweep");
    expect((await routing.run(["create", "--organization-id", `org_${crypto.randomUUID().slice(0, 8)}`])).exitCode).toBe(1);
    const [preparing] = await routing.directory("SELECT family_id FROM family WHERE status = 'being_prepared'");
    const beingPrepared = String(preparing?.family_id);

    await expect(lock(deleted)).rejects.toThrow(`The Family ${deleted} is deleted and cannot be locked`);
    await expect(lock(beingPrepared)).rejects.toThrow(`The Family ${beingPrepared} is being prepared and cannot be locked`);
    await expect(unlock(deleted)).rejects.toThrow(`The Family ${deleted} is deleted and cannot be unlocked`);
    await expect(lock(crypto.randomUUID())).rejects.toThrow("There is no Family");
    expect(await lockOf(deleted)).toMatchObject({ locked_at: null });
    expect(await lockOf(beingPrepared)).toMatchObject({ locked_at: null });
  });
});

describe("Unlocking a Family", () => {
  it("routes to it again and brings back its schedules", async () => {
    const familyId = await createFamily();
    await lock(familyId);

    expect(await unlock(familyId)).toBe("active");

    expect(await lockOf(familyId)).toEqual({ status: "active", locked_at: null, lock_reason: null });
    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
    expect(await answerTo(familyId)).toBe(200);
  });

  it("that is not locked makes its schedules follow its status and changes nothing else", async () => {
    const familyId = await createFamily();
    await routing.directory("DELETE FROM scheduler.schedule WHERE key = $1", [familyId]);

    expect(await unlock(familyId)).toBe("active");

    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
    expect(routing.log()).not.toContain("The Family is unlocked");
  });
});

describe("A Locked Family that is suspended", () => {
  it("is suspended, and Locked again once it is resumed, without schedules", async () => {
    const familyId = await createFamily();
    await lock(familyId);

    expect(await suspend(familyId)).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is suspended\n` });
    expect((await familyLine(familyId))?.split("\t")[1]).toBe("suspended");

    const resumed = await resume(familyId);

    expect(resumed, resumed.stderr).toMatchObject({
      exitCode: 0,
      stdout: `The Family ${familyId} is resumed and stays Locked: it is not routed to or scheduled until it is unlocked\n`,
    });
    expect(await lockOf(familyId)).toMatchObject({ status: "active", locked_at: new Date("2026-11-20T10:00:00Z") });
    expect(await routing.schedules(familyId)).toEqual([]);
    expect(await answerTo(familyId)).toBe(404);
  });

  it("locked while suspended stays suspended, and unlocked while suspended stays without schedules", async () => {
    const familyId = await createFamily();
    await suspend(familyId);

    await lock(familyId, "unpaid");
    expect(await lockOf(familyId)).toMatchObject({ status: "suspended", lock_reason: "unpaid" });
    expect(await unlock(familyId)).toBe("suspended");

    expect(await lockOf(familyId)).toEqual({ status: "suspended", locked_at: null, lock_reason: null });
    expect(await routing.schedules(familyId)).toEqual([]);
    expect(await resume(familyId)).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is active again\n` });
    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
  });
});
