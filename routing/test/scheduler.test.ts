import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import type { RecordedRequest } from "./support/stand-in-core";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const MINUTE = 60_000;

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(args: string[] = []): Promise<string> {
  const result = await routing.run(["create", "--admin-email", "first.admin@example.org", ...args]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

/** The calls of a triggered operation that arrived at the stand-in core for a Family. */
const callsOf = (operation: string, familyId: string): RecordedRequest[] =>
  routing.core.requests.filter(({ path, context }) => path === `/operations/${operation}` && context?.familyId === familyId);

/** Moves the clock on minute by minute, as the Scheduler sees time pass. */
async function minutes(clock: TestClock, count: number): Promise<void> {
  for (let minute = 0; minute < count; minute++) await clock.tick(MINUTE);
}

describe("Due work", () => {
  it("arrives at a core once per minute with the Family's Context", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(() => callsOf("run-due-work", familyId).length).toBe(1);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("run-due-work", familyId).length).toBe(3);

    const [call] = callsOf("run-due-work", familyId);
    expect(call?.context).toMatchObject({ familyId, pathPrefix: `/${familyId}` });
  });

  it("of two Families arrives for each with its own Context", async () => {
    const first = await createFamily();
    const second = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(() => [callsOf("run-due-work", first).length, callsOf("run-due-work", second).length]).toEqual([1, 1]);
    expect(callsOf("run-due-work", first)[0]?.context?.database.name).not.toBe(callsOf("run-due-work", second)[0]?.context?.database.name);
  });
});

describe("The purge and the sweep", () => {
  it("purge the Family's messages past their retention once per hour", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 3);
    // Jumps skip the occurrences on the way; the minutes before and after the hour are ticked through.
    await clock.setTime("2026-11-16T08:57:10Z");
    await minutes(clock, 2);
    expect(callsOf("purge-messages", familyId)).toHaveLength(0);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("purge-messages", familyId).length).toBe(1);
    await minutes(clock, 3);
    await clock.setTime("2026-11-16T09:57:10Z");
    await minutes(clock, 2);
    expect(callsOf("purge-messages", familyId)).toHaveLength(1);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("purge-messages", familyId).length).toBe(2);
    expect(callsOf("purge-messages", familyId)[0]?.context).toMatchObject({ familyId });
  });

  it("sweep the Family's unreferenced secrets once per day, at night in its time zone", async () => {
    const familyId = await createFamily(["--time-zone", "America/New_York"]);
    // 03:28 in New York.
    const clock = new TestClock("2026-11-16T08:28:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    expect(callsOf("sweep-secrets", familyId)).toHaveLength(0);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("sweep-secrets", familyId).length).toBe(1);
    await minutes(clock, 3);
    await clock.setTime("2026-11-17T08:28:10Z");
    await minutes(clock, 3);
    await expect.poll(() => callsOf("sweep-secrets", familyId).length).toBe(2);
    expect(callsOf("sweep-secrets", familyId)[0]?.context).toMatchObject({ familyId });
  });
});

describe("A run of due work still under way", () => {
  it("makes the next minutes' occurrences no-ops, and the Family runs again once it has ended", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    const release = routing.core.holdNextDueWork();

    await minutes(clock, 1);
    await expect.poll(() => callsOf("run-due-work", familyId).length).toBe(1);
    await minutes(clock, 3);
    expect(callsOf("run-due-work", familyId)).toHaveLength(1);

    release();
    await expect.poll(async () => (await overview())[0]?.outcome).toBe("succeeded");
    await minutes(clock, 1);
    await expect.poll(() => callsOf("run-due-work", familyId).length).toBe(2);
  });
});

describe("A Family that is not active", () => {
  it.each(["suspended", "being_prepared"])("triggers nothing when %s", async (status) => {
    const familyId = await createFamily();
    const other = await createFamily();
    await routing.directory("UPDATE family SET status = $2 WHERE family_id = $1", [familyId, status]);
    const clock = new TestClock("2026-11-16T08:58:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 3);
    await expect.poll(() => callsOf("purge-messages", other).length).toBe(1);
    await expect.poll(() => callsOf("run-due-work", other).length).toBeGreaterThan(1);
    await expect
      .poll(() => routing.log())
      .toContain(`"message":"The Family is not active; nothing is triggered","familyId":"${familyId}","occasion":"purge-messages"`);
    expect(routing.core.requests.filter(({ context }) => context?.familyId === familyId).map(({ path }) => path)).toEqual([
      "/operations/prepare-family",
      "/operations/enter-admin",
    ]);
    expect(await schedulesOf(familyId)).toHaveLength(3);
  });

  it("loses its schedules once deleted", async () => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = 'deleted' WHERE family_id = $1", [familyId]);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(() => schedulesOf(familyId)).toEqual([]);
    expect(callsOf("run-due-work", familyId)).toEqual([]);
  });
});

/** The names of the Family's schedules, as pg-boss keeps them in the Directory's database. */
async function schedulesOf(familyId: string): Promise<string[]> {
  const rows = await routing.directory("SELECT name FROM scheduler.schedule WHERE key = $1 ORDER BY name", [familyId]);
  return rows.map(({ name }) => String(name));
}

describe("Creating a Family", () => {
  it("creates its schedules: due work, the purge and the sweep", async () => {
    const familyId = await createFamily();

    expect(await schedulesOf(familyId)).toEqual(["due-work", "purge-messages", "sweep-secrets"]);
  });
});

/** What `routing families` prints, a line per Family. */
async function overview(): Promise<
  { familyId: string; status: string; ranAt: string | undefined; outcome: string | undefined; detail: string | undefined }[]
> {
  const result = await routing.run(["families"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [familyId, status, ran, ended] = line.split("\t");
      const [outcome, detail] = ended?.split(": ") ?? [];
      return { familyId: familyId!, status: status!, ranAt: /^due work ran (\S+)$/.exec(ran ?? "")?.[1], outcome, detail };
    });
}

describe("The Operator", () => {
  it("reads from the command line when each Family's due work last ran and how it ended", async () => {
    const succeeding = await createFamily();
    const failing = await createFamily();
    const never = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [never]);
    routing.core.answerDueWork(succeeding, { ran: 3, failed: 1 });
    routing.core.answerDueWork(failing, { ran: 1, failed: 0 });
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(async () => (await overview()).filter(({ outcome }) => outcome).length).toBe(2);
    const ranAtFirst = (await overview()).find(({ familyId }) => familyId === failing)!.ranAt!;
    routing.core.failDueWork(failing);
    await minutes(clock, 1);
    await expect.poll(async () => (await overview()).find(({ familyId }) => familyId === failing)?.outcome).toBe("failed");

    const { stdout } = await routing.run(["families"]);
    expect(stdout.split("\n")[2]).toBe(`${never}\tsuspended\tdue work never ran`);
    const byFamily = Object.fromEntries((await overview()).map((line) => [line.familyId, line]));
    expect(byFamily[succeeding]).toMatchObject({ status: "active", outcome: "succeeded", detail: "3 Sources polled, 1 failed" });
    expect(byFamily[failing]).toMatchObject({ status: "active", outcome: "failed", detail: "The core answered run-due-work with 500" });
    // When it last ran, by the Scheduler's clock.
    const ranAt = Date.parse(byFamily[failing]!.ranAt!);
    expect(ranAt).toBeGreaterThan(Date.parse(ranAtFirst));
    expect(ranAt).toBeGreaterThanOrEqual(Date.parse("2026-11-16T08:01:10Z"));
    expect(ranAt).toBeLessThanOrEqual(clock.now());
  });
});

describe("The log", () => {
  it("names the Family by its Family id and contains no Context or secret", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:58:10Z");
    await routing.startScheduler(clock);
    await minutes(clock, 1);
    await expect.poll(() => routing.log()).toContain(`"message":"Due work ran","familyId":"${familyId}"`);
    routing.core.failDueWork(familyId);
    await minutes(clock, 2);
    await expect.poll(() => routing.log()).toContain(`"message":"Due work failed","familyId":"${familyId}"`);
    await expect.poll(() => routing.log()).toContain(`"familyId":"${familyId}","occasion":"purge-messages"`);

    const scheduled = routing.core.requests.filter(({ path }) => !["/operations/prepare-family", "/operations/enter-admin"].includes(path));
    expect(scheduled.length).toBeGreaterThanOrEqual(3);
    for (const { sealedContext, context } of scheduled) {
      for (const secret of [sealedContext!, context!.familyKey, context!.database.password, routing.env.OPERATOR_KEY!, routing.env.CONTEXT_KEY!]) {
        expect(routing.log()).not.toContain(secret);
      }
    }
  });
});
