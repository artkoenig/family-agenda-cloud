import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import { STAND_IN_CORE_VERSION, type RecordedRequest } from "./support/stand-in-core";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const NEXT_VERSION = "0.0.1-stand-in";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(): Promise<string> {
  const result = await routing.run(["create", "--admin-email", "first.admin@example.org"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

/** The cores of the pool and the Routing module move to a new release together, as the Cube's `.env` names it. */
function upgradeCores(version = NEXT_VERSION): void {
  routing.core.runVersion(version);
  routing.env.CORE_VERSION = version;
}

/** The calls of "prepare the Family" that arrived at the stand-in core for a Family since `since`. */
const preparesOf = (familyId: string, since: number): RecordedRequest[] =>
  routing.core.requests.slice(since).filter(({ path, context }) => path === "/operations/prepare-family" && context?.familyId === familyId);

/** The calls of a triggered operation that arrived at the stand-in core for a Family. */
const callsOf = (operation: string, familyId: string): RecordedRequest[] =>
  routing.core.requests.filter(({ path, context }) => path === `/operations/${operation}` && context?.familyId === familyId);

/** Moves the clock on minute by minute, as the Scheduler sees time pass. */
async function minutes(clock: TestClock, count: number): Promise<void> {
  for (let minute = 0; minute < count; minute++) await clock.tick(60_000);
}

const coreVersionOf = async (familyId: string) =>
  (await routing.directory("SELECT core_version FROM family WHERE family_id = $1", [familyId]))[0]?.core_version;

describe("A rollout", () => {
  it("prepares every Family once with its own Context and notes the new version for each", async () => {
    const first = await createFamily();
    const second = await createFamily();
    const since = routing.core.requests.length;
    upgradeCores();

    const result = await routing.run(["roll-out"]);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `Prepared 2 Families for core version ${NEXT_VERSION}\n` });
    expect(routing.log()).toContain(`"message":"Rolling out the core version","coreVersion":"${NEXT_VERSION}","families":2`);
    expect(routing.log()).toContain(`"message":"The Family is prepared for the core version","familyId":"${first}","coreVersion":"${NEXT_VERSION}"`);
    expect(preparesOf(first, since)).toHaveLength(1);
    expect(preparesOf(second, since)).toHaveLength(1);
    expect(preparesOf(first, since)[0]?.context?.database.name).not.toBe(preparesOf(second, since)[0]?.context?.database.name);
    expect([await coreVersionOf(first), await coreVersionOf(second)]).toEqual([NEXT_VERSION, NEXT_VERSION]);
    expect(STAND_IN_CORE_VERSION).not.toBe(NEXT_VERSION);
  });

  it("that fails for one Family still prepares the others, records the failure and names the Family", async () => {
    const [first, second, third] = [await createFamily(), await createFamily(), await createFamily()];
    upgradeCores();
    // The rollout prepares the oldest Family first.
    routing.core.failNext("prepare-family");

    const result = await routing.run(["roll-out"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(
      `Prepared 2 Families for core version ${NEXT_VERSION}\n` +
        "Failed for 1 Family; run roll-out again to retry:\n" +
        `${first}\tThe core answered prepare-family with 500\n`,
    );
    expect(routing.log()).toContain(
      `"message":"Preparing the Family for the core version failed","familyId":"${first}","coreVersion":"${NEXT_VERSION}",` +
        '"reason":"The core answered prepare-family with 500"',
    );
    expect(result.stdout).not.toContain(second);
    expect(result.stdout).not.toContain(third);
    expect([await coreVersionOf(first), await coreVersionOf(second), await coreVersionOf(third)]).toEqual([
      STAND_IN_CORE_VERSION,
      NEXT_VERSION,
      NEXT_VERSION,
    ]);
    const families = (await routing.run(["families"])).stdout.split("\n");
    expect(families.find((line) => line.startsWith(first))).toContain(`preparing for ${NEXT_VERSION} failed: The core answered prepare-family with 500`);
    expect(families.find((line) => line.startsWith(second))).not.toContain("preparing");
  });

  it("run again prepares only the Families still behind and forgets their failure", async () => {
    const [first, second] = [await createFamily(), await createFamily()];
    upgradeCores();
    routing.core.failNext("prepare-family");
    expect((await routing.run(["roll-out"])).exitCode).toBe(1);
    const since = routing.core.requests.length;

    const again = await routing.run(["roll-out"]);

    expect(again, again.stderr).toMatchObject({ exitCode: 0, stdout: `Prepared 1 Family for core version ${NEXT_VERSION}\n` });
    expect(preparesOf(first, since)).toHaveLength(1);
    expect(preparesOf(second, since)).toHaveLength(0);
    expect(await coreVersionOf(first)).toBe(NEXT_VERSION);
    expect((await routing.run(["families"])).stdout).not.toContain("preparing");
  });

  it("fails for a Family the core prepares for another version than CORE_VERSION, and notes no version", async () => {
    const familyId = await createFamily();
    // The Routing module was told of a release the cores do not run.
    routing.env.CORE_VERSION = NEXT_VERSION;

    const result = await routing.run(["roll-out"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      `${familyId}\tThe core answered version ${STAND_IN_CORE_VERSION}, not the CORE_VERSION ${NEXT_VERSION}`,
    );
    expect(await coreVersionOf(familyId)).toBe(STAND_IN_CORE_VERSION);
  });

  it("needs CORE_VERSION, the version the pool runs, and without it prepares nothing", async () => {
    await createFamily();
    const since = routing.core.requests.length;

    const result = await routing.run(["roll-out"], { CORE_VERSION: undefined });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("CORE_VERSION is not set");
    expect(routing.core.requests.slice(since)).toEqual([]);
  });

  it("with every Family prepared already prepares none", async () => {
    await createFamily();
    const since = routing.core.requests.length;

    const result = await routing.run(["roll-out"]);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `Prepared 0 Families for core version ${STAND_IN_CORE_VERSION}\n` });
    expect(routing.core.requests.slice(since)).toEqual([]);
  });
});

describe("A Family not prepared for the running core version", () => {
  it("gets 503 with a plain page to try again in a moment, and nothing arrives at the core", async () => {
    const familyId = await createFamily();
    upgradeCores();
    const router = await routing.startRouter();
    const since = routing.core.requests.length;

    const response = await fetch(`${router.url}/${familyId}/agendas/1`);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.text()).toBe("This Family is being updated. Try again in a moment.\n");
    expect(routing.core.requests.slice(since)).toEqual([]);
  });

  it("is routed again once a rollout has prepared it, without further action", async () => {
    const familyId = await createFamily();
    upgradeCores();
    const router = await routing.startRouter();
    expect((await fetch(`${router.url}/${familyId}/admin`)).status).toBe(503);

    expect((await routing.run(["roll-out"])).exitCode).toBe(0);

    const response = await fetch(`${router.url}/${familyId}/admin`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/admin" });
  });

  it("that is suspended is still not found: the rollout prepares it and leaves it suspended", async () => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);
    upgradeCores();
    const router = await routing.startRouter();
    expect((await fetch(`${router.url}/${familyId}/admin`)).status).toBe(404);
    const since = routing.core.requests.length;

    expect((await routing.run(["roll-out"])).exitCode).toBe(0);

    expect(preparesOf(familyId, since)).toHaveLength(1);
    expect(await routing.directory("SELECT status, core_version FROM family WHERE family_id = $1", [familyId])).toEqual([
      { status: "suspended", core_version: NEXT_VERSION },
    ]);
    expect((await fetch(`${router.url}/${familyId}/admin`)).status).toBe(404);
  });

  it("has no due work, purge or sweep triggered, and is scheduled again once a rollout has prepared it", async () => {
    const behind = await createFamily();
    const other = await createFamily();
    upgradeCores();
    // The rollout prepares the oldest Family first: only the other is prepared.
    routing.core.failNext("prepare-family");
    expect((await routing.run(["roll-out"])).exitCode).toBe(1);
    // 02:30 UTC is 03:30 in Europe/Berlin, the sweep's time; 03:00 the purge's.
    const clock = new TestClock("2026-11-16T02:28:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 3);
    await expect.poll(() => callsOf("sweep-secrets", other).length).toBe(1);
    await clock.setTime("2026-11-16T02:57:10Z");
    await minutes(clock, 4);
    await expect.poll(() => callsOf("purge-messages", other).length).toBe(1);
    await expect.poll(() => callsOf("run-due-work", other).length).toBeGreaterThan(1);
    await expect
      .poll(() => routing.log())
      .toContain(`"message":"The Family is not prepared for the running core version; nothing is triggered","familyId":"${behind}"`);
    expect(callsOf("run-due-work", behind)).toEqual([]);
    expect(callsOf("purge-messages", behind)).toEqual([]);
    expect(callsOf("sweep-secrets", behind)).toEqual([]);

    expect((await routing.run(["roll-out"])).exitCode).toBe(0);
    await minutes(clock, 1);
    await expect.poll(() => callsOf("run-due-work", behind).length).toBe(1);
  });

  it("that is deleted or still being prepared is left alone by the rollout", async () => {
    const deleted = await createFamily();
    // As deleting it leaves its entry: marked deleted, its keys destroyed.
    await routing.directory(
      "UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL WHERE family_id = $1",
      [deleted],
    );
    const beingPrepared = await createFamily();
    await routing.directory("UPDATE family SET status = 'being_prepared' WHERE family_id = $1", [beingPrepared]);
    upgradeCores();
    const since = routing.core.requests.length;

    const result = await routing.run(["roll-out"]);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `Prepared 0 Families for core version ${NEXT_VERSION}\n` });
    expect(routing.core.requests.slice(since)).toEqual([]);
  });
});
