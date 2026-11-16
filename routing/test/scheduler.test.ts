import { PgBoss, TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import { poolOf, startStandInCore, type OpeningProblem, type RecordedRequest, type StandInCore } from "./support/stand-in-core";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const MINUTE = 60_000;

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
  // The Directory is shared by the file's tests: each starts without the queues and schedules of
  // the one before.
  expect(await routing.directory("SELECT to_regnamespace('scheduler') IS NULL AS clean")).toEqual([{ clean: true }]);
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
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(1);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(3);

    const [call] = callsOf("due-work", familyId);
    expect(call?.context).toMatchObject({ familyId, publicUrl: `https://app.family-agenda.cloud/${familyId}` });
  });

  it("of two Families arrives for each with its own Context", async () => {
    const first = await createFamily();
    const second = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(() => [callsOf("due-work", first).length, callsOf("due-work", second).length]).toEqual([1, 1]);
    expect(callsOf("due-work", first)[0]?.context?.database.name).not.toBe(callsOf("due-work", second)[0]?.context?.database.name);
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
    expect(callsOf("purge", familyId)).toHaveLength(0);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("purge", familyId).length).toBe(1);
    await minutes(clock, 3);
    await clock.setTime("2026-11-16T09:57:10Z");
    await minutes(clock, 2);
    expect(callsOf("purge", familyId)).toHaveLength(1);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("purge", familyId).length).toBe(2);
    expect(callsOf("purge", familyId)[0]?.context).toMatchObject({ familyId });
  });

  it("sweep the Family's unreferenced secrets once per day, at night in its time zone", async () => {
    const familyId = await createFamily(["--time-zone", "America/New_York"]);
    // 03:28 in New York.
    const clock = new TestClock("2026-11-16T08:28:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    expect(callsOf("secret-sweep", familyId)).toHaveLength(0);
    await minutes(clock, 2);
    await expect.poll(() => callsOf("secret-sweep", familyId).length).toBe(1);
    await minutes(clock, 3);
    await clock.setTime("2026-11-17T08:28:10Z");
    await minutes(clock, 3);
    await expect.poll(() => callsOf("secret-sweep", familyId).length).toBe(2);
    expect(callsOf("secret-sweep", familyId)[0]?.context).toMatchObject({ familyId });
  });
});

describe("A run of due work still under way", () => {
  it("makes the next minutes' occurrences no-ops, and the Family runs again once it has ended", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    const release = routing.core.holdDueWork(familyId);

    await minutes(clock, 1);
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(1);
    await minutes(clock, 3);
    expect(callsOf("due-work", familyId)).toHaveLength(1);

    release();
    await expect.poll(async () => (await overview())[0]?.outcome).toBe("succeeded");
    await minutes(clock, 1);
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(2);
  });

  it("is not doubled while it lasts longer than an ordinary call may, and is given up only after ten minutes", async () => {
    const familyId = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    const release = routing.core.holdDueWork(familyId);

    await minutes(clock, 1);
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(1);
    await minutes(clock, 8);
    expect(callsOf("due-work", familyId)).toHaveLength(1);
    expect((await overview())[0]?.outcome).toBeUndefined();

    await minutes(clock, 3);
    await expect.poll(async () => (await routing.run(["families"])).stdout).toContain(
      "failed: The core did not answer due-work: no answer within 600 seconds",
    );
    release();
    await minutes(clock, 2);
    await expect.poll(async () => (await overview())[0]?.outcome).toBe("succeeded");
    expect(callsOf("due-work", familyId).length).toBeGreaterThanOrEqual(2);
  });

  it("of one Family does not hold up another Family's due work", async () => {
    const slow = await createFamily();
    const other = await createFamily();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    routing.core.holdDueWork(slow);

    await minutes(clock, 3);
    await expect.poll(() => callsOf("due-work", other).length).toBeGreaterThanOrEqual(2);
    expect(callsOf("due-work", slow)).toHaveLength(1);
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
    await expect.poll(() => callsOf("purge", other).length).toBe(1);
    await expect.poll(() => callsOf("due-work", other).length).toBeGreaterThan(1);
    await expect
      .poll(() => routing.log())
      .toContain(`"message":"The Family is not active; nothing is triggered","familyId":"${familyId}","occasion":"purge-messages"`);
    expect(routing.core.requests.filter(({ context }) => context?.familyId === familyId).map(({ path }) => path)).toEqual(["/operations/enter-admin"]);
    expect(await routing.schedules(familyId)).toHaveLength(3);
  });

  it("loses its schedules once deleted", async () => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = 'deleted' WHERE family_id = $1", [familyId]);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    await minutes(clock, 1);
    await expect.poll(() => routing.schedules(familyId)).toEqual([]);
    expect(callsOf("due-work", familyId)).toEqual([]);
  });
});

describe("Creating a Family", () => {
  it("creates its schedules: due work, the purge and the sweep", async () => {
    const familyId = await createFamily();

    expect(await routing.schedules(familyId)).toEqual(["due-work", "purge-messages", "sweep-secrets"]);
  });

  it("while the Scheduler starts on a new Directory works, and due work arrives", async () => {
    const clock = new TestClock("2026-11-16T08:01:10Z");
    const [familyId] = await Promise.all([createFamily(), routing.startScheduler(clock)]);

    await minutes(clock, 1);
    await expect.poll(() => callsOf("due-work", familyId).length).toBe(1);
  });
});

describe("The Scheduler's queues", () => {
  it("made by an earlier version get the options of this one", async () => {
    const url = new URL(routing.env.DIRECTORY_DATABASE_URL!);
    url.password = routing.env.DIRECTORY_DATABASE_PASSWORD!;
    const earlier = new PgBoss({ connectionString: url.toString(), schema: "scheduler", supervise: false, schedule: false });
    await earlier.start();
    await earlier.createQueue("due-work", { policy: "exclusive", retryLimit: 2, expireInSeconds: 60 });
    await earlier.stop({ graceful: false });

    await createFamily();

    expect(await routing.directory("SELECT name, retry_limit, expire_seconds FROM scheduler.queue ORDER BY name")).toEqual([
      { name: "due-work", retry_limit: 0, expire_seconds: 900 },
      { name: "purge-messages", retry_limit: 0, expire_seconds: 900 },
      { name: "sweep-secrets", retry_limit: 0, expire_seconds: 900 },
    ]);
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
    expect(byFamily[failing]).toMatchObject({ status: "active", outcome: "failed", detail: "The core answered due-work with 500" });
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

    const scheduled = routing.core.requests.filter(({ on, path }) => on === "trigger" && path !== "/operations/enter-admin");
    expect(scheduled.length).toBeGreaterThanOrEqual(3);
    for (const { sealedContext, context } of scheduled) {
      for (const secret of [sealedContext!, context!.familyKey, context!.database.password, routing.env.OPERATOR_KEY!, routing.env.CONTEXT_KEY!]) {
        expect(routing.log()).not.toContain(secret);
      }
    }
  });
});

/** How many of the Family's occurrences of due work the Scheduler has handled: run, failed or waited. */
const handled = (familyId: string): number => routing.log().split(`"familyId":"${familyId}","occasion":"due-work"`).length - 1;

/**
 * Moves the clock on minute by minute, each time until the Family's occurrence of that minute is
 * handled; answers the minutes, counted from 1, in which its due work arrived at the core.
 */
async function minutesWithDueWork(clock: TestClock, familyId: string, count: number): Promise<number[]> {
  const arrived: number[] = [];
  for (let minute = 1; minute <= count; minute++) {
    const before = callsOf("due-work", familyId).length;
    const handledBefore = handled(familyId);
    await clock.tick(MINUTE);
    await expect.poll(() => handled(familyId)).toBe(handledBefore + 1);
    if (callsOf("due-work", familyId).length > before) arrived.push(minute);
  }
  return arrived;
}

const gaps = (minutes: number[]) => minutes.slice(1).map((minute, index) => minute - minutes[index]!);

describe("A Family whose due work fails", () => {
  it("is retried with growing delay, which stops growing at a quarter of an hour", { timeout: 120_000 }, async () => {
    const familyId = await createFamily();
    routing.core.failDueWork(familyId);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    const arrived = await minutesWithDueWork(clock, familyId, 45);

    expect(gaps(arrived)).toEqual([2, 4, 8, 15, 15]);
  });

  it("is shown to the Operator with how it failed, how often in a row and when it is tried again", { timeout: 60_000 }, async () => {
    const familyId = await createFamily();
    routing.core.failDueWork(familyId, 500);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    expect(await minutesWithDueWork(clock, familyId, 8)).toEqual([1, 3, 7]);

    const { stdout } = await routing.run(["families"]);
    const [line] = stdout.split("\n");
    expect(line).toMatch(new RegExp(`^${familyId}\tactive\tdue work ran 2026-11-16T08:07:`));
    expect(line?.split("\t").slice(3)).toEqual(["failed: The core answered due-work with 500", "3 failures in a row, next try 2026-11-16T08:15:00.000Z"]);
    expect(routing.log()).toContain(
      `"message":"Due work failed","familyId":"${familyId}","occasion":"due-work","reason":"The core answered due-work with 500","failures":3`,
    );
  });

  it("is triggered once per minute again after a run succeeds", { timeout: 60_000 }, async () => {
    const familyId = await createFamily();
    routing.core.failDueWork(familyId);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    // Fails in minutes 1, 3 and 7; the retry in minute 15 succeeds.
    expect(await minutesWithDueWork(clock, familyId, 8)).toEqual([1, 3, 7]);
    routing.core.answerDueWork(familyId, { ran: 2, failed: 0 });
    expect(await minutesWithDueWork(clock, familyId, 11)).toEqual([7, 8, 9, 10, 11]);
    // A failure after that starts the delays from the beginning.
    routing.core.failDueWork(familyId);
    expect(await minutesWithDueWork(clock, familyId, 4)).toEqual([1, 3]);
  });

  it("does not delay any other Family's due work", { timeout: 60_000 }, async () => {
    const failing = await createFamily();
    const other = await createFamily();
    routing.core.failDueWork(failing);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);

    expect(await minutesWithDueWork(clock, failing, 8)).toEqual([1, 3, 7]);
    await expect.poll(() => callsOf("due-work", other).length).toBe(8);
    await expect.poll(async () => (await overview()).find(({ familyId }) => familyId === other)?.outcome).toBe("succeeded");
  });
});

describe("A core that does not answer", () => {
  let others: StandInCore[] = [];
  afterEach(async () => {
    for (const core of others) await core.close();
    others = [];
  });

  /** A core of the pool that is down: nothing listens at its address. */
  async function downCore(): Promise<StandInCore> {
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    return down;
  }

  it("makes the Scheduler use another core of the pool, and the run counts as a success", async () => {
    const familyId = await createFamily();
    const down = await downCore();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(down, routing.core));

    expect(await minutesWithDueWork(clock, familyId, 3)).toEqual([1, 2, 3]);

    expect((await overview())[0]).toMatchObject({ outcome: "succeeded" });
    expect(routing.log()).toContain(`"message":"A core did not run the operation; the next one of the pool is tried","operation":"due-work","core":"${new URL(down.triggerUrl).host}","reason":"ECONNREFUSED"`);
    expect(routing.log()).not.toContain('"message":"Due work failed"');
  });

  it.each([502, 503, 504])("that answers %i makes the Scheduler use another core of the pool", async (status) => {
    const familyId = await createFamily();
    const starting = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others.push(starting);
    starting.failNext("due-work", status);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(starting, routing.core));

    expect(await minutesWithDueWork(clock, familyId, 1)).toEqual([1]);

    expect(starting.requests.map(({ path }) => path)).toEqual(["/operations/due-work"]);
    expect((await overview())[0]).toMatchObject({ outcome: "succeeded" });
  });

  it("that answers 500 fails the run, which is not made again on another core", async () => {
    const familyId = await createFamily();
    const failing = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others.push(failing);
    failing.failNext("due-work", 500);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(failing, routing.core));

    await minutesWithDueWork(clock, familyId, 1);

    expect(callsOf("due-work", familyId)).toEqual([]);
    expect((await overview())[0]).toMatchObject({ outcome: "failed", detail: "The core answered due-work with 500" });
  });

  it("that drops the call after it arrived fails the run, which is not made again on another core", async () => {
    const familyId = await createFamily();
    const dying = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others.push(dying);
    dying.dropNextCall("due-work");
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(dying, routing.core));

    await minutesWithDueWork(clock, familyId, 1);

    expect(dying.requests.map(({ path }) => path)).toEqual(["/operations/due-work"]);
    expect(callsOf("due-work", familyId)).toEqual([]);
    expect((await overview())[0]).toMatchObject({ outcome: "failed", detail: expect.stringMatching(/^The core did not answer due-work/) as unknown });
  });

  it("when no core answers is recorded as failed and retried, and is neither lost nor doubled once a core is back", { timeout: 60_000 }, async () => {
    const familyId = await createFamily();
    const down = await downCore();
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(down, routing.core));
    await routing.core.goDown();

    // Fails in minutes 1 and 3; waits for its retry in minutes 2 and 4.
    expect(await minutesWithDueWork(clock, familyId, 4)).toEqual([]);
    expect(handled(familyId)).toBe(4);
    expect((await overview())[0]).toMatchObject({ outcome: "failed", detail: expect.stringMatching(/^No core ran due-work/) as unknown });

    await routing.core.comeBack();
    // The retry in minute 7 is the first run again; from then on one per minute.
    expect(await minutesWithDueWork(clock, familyId, 7)).toEqual([3, 4, 5, 6, 7]);
    expect(callsOf("due-work", familyId)).toHaveLength(5);
    expect((await overview())[0]).toMatchObject({ outcome: "succeeded" });
  });
});

describe("A core that refuses to open the Family", () => {
  let others: StandInCore[] = [];
  afterEach(async () => {
    for (const core of others) await core.close();
    others = [];
  });

  /** A core of the pool that does not open the Family, as one of an older release than the one that migrated its database. */
  async function refusingCore(familyId: string, problem: OpeningProblem): Promise<StandInCore> {
    const core = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others.push(core);
    core.refuseFamily(familyId, problem);
    return core;
  }

  it.each(["migrated-by-newer-release", "migrating"] as const)("with %s makes the Scheduler use another core of the pool, and the run counts as a success", async (problem) => {
    const familyId = await createFamily();
    const refusing = await refusingCore(familyId, problem);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(refusing, routing.core));

    expect(await minutesWithDueWork(clock, familyId, 2)).toEqual([1, 2]);

    expect(refusing.requests.length).toBeGreaterThan(0);
    expect((await overview())[0]).toMatchObject({ outcome: "succeeded" });
    const status = problem === "migrating" ? 503 : 409;
    expect(routing.log()).toContain(
      `"message":"A core did not run the operation; the next one of the pool is tried","operation":"due-work","core":"${new URL(refusing.triggerUrl).host}","reason":"${status} ${problem}"`,
    );
    expect(routing.log()).not.toContain('"message":"Due work failed"');
  });

  it("on every core of the pool fails the run after one try per core, saying what each core answered, and the run is retried", { timeout: 60_000 }, async () => {
    const familyId = await createFamily();
    const older = await refusingCore(familyId, "migrated-by-newer-release");
    routing.core.refuseFamily(familyId, "migrating");
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock, poolOf(older, routing.core));

    await minutes(clock, 1);
    await expect.poll(async () => (await overview())[0]?.outcome).toBe("failed");

    const [olderHost, preparingHost] = [older, routing.core].map(({ triggerUrl }) => new URL(triggerUrl).host);
    const said = [`${olderHost} 409 migrated-by-newer-release`, `${preparingHost} 503 migrating`];
    // The cores are taken in turn, so either may have been asked first.
    const { stdout } = await routing.run(["families"]);
    expect(stdout).toMatch(new RegExp(`\\tfailed: No core ran due-work: (${said.join(", ")}|${said.toReversed().join(", ")})\\t1 failure in a row`));
    expect(callsOf("due-work", familyId)).toHaveLength(1);
    expect(older.requests.filter(({ path }) => path === "/operations/due-work")).toHaveLength(1);

    // Preparing is done: the retry, two minutes after the failed run, is served.
    routing.core.refuseFamily(familyId, undefined);
    await minutes(clock, 2);
    await expect.poll(async () => (await overview())[0]?.outcome).toBe("succeeded");
  });
});

