import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Router } from "../src/router";
import { familyDatabaseNames } from "../src/family-databases";
import { setUpRouting, type TestRouting } from "./support/routing";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;

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
  const result = await routing.run(["create", "--admin-email", "first.admin@example.org"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

const suspend = (familyId: string) => routing.run(["suspend", "--family-id", familyId]);
const resume = (familyId: string) => routing.run(["resume", "--family-id", familyId]);

/** Status, type and body of the Router's answer to a browser. */
async function answerTo(path: string) {
  const response = await fetch(`${router.url}${path}`, { redirect: "manual" });
  return { status: response.status, type: response.headers.get("content-type"), body: await response.text() };
}

const MINUTE = 60_000;
const ALL_SCHEDULES = ["due-work", "purge-messages", "sweep-secrets"];

/** Moves the clock on minute by minute, as the Scheduler sees time pass. */
async function minutes(clock: TestClock, count: number): Promise<void> {
  for (let minute = 0; minute < count; minute++) await clock.tick(MINUTE);
}

/** The paths of the scheduled operations that arrived at the stand-in core for the Family. */
const scheduledCallsOf = (familyId: string): string[] =>
  routing.core.requests
    .filter(({ path, context }) => context?.familyId === familyId && path.startsWith("/operations/"))
    .map(({ path }) => path)
    .filter((path) => !["/operations/prepare-family", "/operations/enter-admin"].includes(path));

/** What the Family keeps while it is suspended: its entry with its secrets, database, role and blobs. */
async function dataOf(familyId: string) {
  const { databaseName } = familyDatabaseNames(familyId);
  const [entry] = await routing.directory(
    "SELECT database_name, database_role, blob_location, time_zone, wrapped_family_key, wrapped_database_password FROM family WHERE family_id = $1",
    [familyId],
  );
  return {
    entry,
    databases: (await routing.server("SELECT datname FROM pg_database WHERE datname = $1", [databaseName])).length,
    roles: (await routing.server("SELECT rolname FROM pg_roles WHERE rolname = $1", [databaseName])).length,
  };
}

const statusOf = async (familyId: string) =>
  (await routing.directory("SELECT status FROM family WHERE family_id = $1", [familyId]))[0]?.status;

describe("Suspending a Family", () => {
  it("makes its address answer the same 404 as an unknown Family, and nothing arrives at a core", async () => {
    const familyId = await createFamily();

    const result = await suspend(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is suspended\n` });
    const since = routing.core.requests.length;
    const unknown = await answerTo(`/${crypto.randomUUID()}/admin`);
    expect(unknown).toMatchObject({ status: 404 });
    expect(await answerTo(`/${familyId}/admin`)).toEqual(unknown);
    expect(routing.core.requests.slice(since)).toEqual([]);
  });

  it("removes its schedules, so that no due work, purge or sweep is triggered for it, and leaves other Families' alone", async () => {
    const familyId = await createFamily();
    const other = await createFamily();

    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });

    expect(await routing.schedules(familyId)).toEqual([]);
    expect(await routing.schedules(other)).toEqual(ALL_SCHEDULES);
    // 03:28 in Berlin, past the night and the hour: due work, the purge and the sweep all come due.
    const clock = new TestClock("2026-11-16T02:28:10Z");
    await routing.startScheduler(clock);
    await minutes(clock, 3);
    await expect.poll(() => scheduledCallsOf(other)).toContain("/operations/sweep-secrets");
    await clock.setTime("2026-11-16T02:58:10Z");
    await minutes(clock, 3);
    await expect.poll(() => scheduledCallsOf(other)).toContain("/operations/purge-messages");
    expect(scheduledCallsOf(familyId)).toEqual([]);
  });

  it("keeps its database, role, blob location and wrapped secrets", async () => {
    const familyId = await createFamily();
    const before = await dataOf(familyId);

    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });

    expect(await dataOf(familyId)).toEqual(before);
    expect(before).toMatchObject({ databases: 1, roles: 1 });
    expect(typeof before.entry?.wrapped_family_key).toBe("string");
    expect(typeof before.entry?.wrapped_database_password).toBe("string");
    expect(await statusOf(familyId)).toBe("suspended");
  });
});

describe("Resuming a Family", () => {
  it("routes its requests again and triggers its due work once per minute", async () => {
    const familyId = await createFamily();
    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });

    const result = await resume(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is active again\n` });
    expect(await statusOf(familyId)).toBe("active");
    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
    const since = routing.core.requests.length;
    expect(await answerTo(`/${familyId}/admin`)).toMatchObject({ status: 200 });
    expect(routing.core.requests.slice(since)).toMatchObject([{ path: "/admin", context: { familyId } }]);
    const clock = new TestClock("2026-11-16T08:01:10Z");
    await routing.startScheduler(clock);
    await minutes(clock, 1);
    await expect.poll(() => scheduledCallsOf(familyId)).toEqual(["/operations/run-due-work"]);
    await minutes(clock, 2);
    await expect.poll(() => scheduledCallsOf(familyId)).toEqual(Array(3).fill("/operations/run-due-work"));
  });

  it("brings back its schedules as creating it made them, in its own time zone", async () => {
    const created = await routing.run(["create", "--admin-email", "first.admin@example.org", "--time-zone", "America/New_York"]);
    const familyId = ADDRESS.exec(created.stdout.trim())![1]!;
    const before = await schedulesOf(familyId);
    await suspend(familyId);

    expect(await resume(familyId)).toMatchObject({ exitCode: 0 });

    expect(await schedulesOf(familyId)).toEqual(before);
    expect(before).toHaveLength(3);
    expect(before[0]).toMatchObject({ timezone: "America/New_York" });
  });

  it("keeps its data as it was before the suspension", async () => {
    const familyId = await createFamily();
    const before = await dataOf(familyId);
    await suspend(familyId);

    expect(await resume(familyId)).toMatchObject({ exitCode: 0 });

    expect(await dataOf(familyId)).toEqual(before);
  });
});

/** The Family's schedules as pg-boss keeps them. */
const schedulesOf = (familyId: string) =>
  routing.directory("SELECT name, key, cron, timezone, data, options FROM scheduler.schedule WHERE key = $1 ORDER BY name", [familyId]);

/** Everything suspending or resuming could change: the Family's data and status, and every schedule. */
async function everythingOf(familyId: string) {
  return {
    data: await dataOf(familyId),
    status: await statusOf(familyId),
    schedules: await routing.directory("SELECT name, key, cron, timezone, data, options FROM scheduler.schedule ORDER BY name, key"),
  };
}

describe("Running a command again", () => {
  it("suspending a suspended Family changes nothing and does not fail", async () => {
    const familyId = await createFamily();
    await createFamily();
    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });
    const before = await everythingOf(familyId);

    const result = await suspend(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is suspended\n` });
    expect(await everythingOf(familyId)).toEqual(before);
    expect(before).toMatchObject({ status: "suspended", schedules: { length: 3 } });
  });

  it("resuming an active Family changes nothing and does not fail", async () => {
    const familyId = await createFamily();
    await createFamily();
    const before = await everythingOf(familyId);

    const result = await resume(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is active again\n` });
    expect(await everythingOf(familyId)).toEqual(before);
    expect(before).toMatchObject({ status: "active", schedules: { length: 6 } });
  });

  it("finishes a suspension that stopped before the schedules were removed", async () => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);

    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });

    expect(await routing.schedules(familyId)).toEqual([]);
    expect(await statusOf(familyId)).toBe("suspended");
  });

  it("finishes a resumption that stopped before the schedules were created", async () => {
    const familyId = await createFamily();
    await suspend(familyId);
    await routing.directory("UPDATE family SET status = 'active' WHERE family_id = $1", [familyId]);

    expect(await resume(familyId)).toMatchObject({ exitCode: 0 });

    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
  });

  it("after a failure part-way says so, and finishes when run again", async () => {
    const familyId = await createFamily();
    // The schedules cannot be removed: the Family is suspended, its schedules stay.
    await routing.directory(`REVOKE DELETE ON scheduler.schedule FROM ${routing.routingRole}`);

    const failed = await suspend(familyId);

    await routing.directory(`GRANT DELETE ON scheduler.schedule TO ${routing.routingRole}`);
    expect(failed).toMatchObject({ exitCode: 1, stdout: "" });
    expect(failed.stderr).toContain(`"message":"Suspending the Family did not finish; run suspend again to finish it","familyId":"${familyId}"`);
    expect(await statusOf(familyId)).toBe("suspended");
    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
    expect(await suspend(familyId)).toMatchObject({ exitCode: 0 });
    expect(await routing.schedules(familyId)).toEqual([]);
  });

  it("after a failure part-way of a resumption says so, and finishes when run again", async () => {
    const familyId = await createFamily();
    await suspend(familyId);
    await routing.directory(`REVOKE INSERT ON scheduler.schedule FROM ${routing.routingRole}`);

    const failed = await resume(familyId);

    await routing.directory(`GRANT INSERT ON scheduler.schedule TO ${routing.routingRole}`);
    expect(failed).toMatchObject({ exitCode: 1, stdout: "" });
    expect(failed.stderr).toContain(`"message":"Resuming the Family did not finish; run resume again to finish it","familyId":"${familyId}"`);
    expect(await resume(familyId)).toMatchObject({ exitCode: 0 });
    expect(await statusOf(familyId)).toBe("active");
    expect(await routing.schedules(familyId)).toEqual(ALL_SCHEDULES);
  });
});

describe("A Family that cannot be suspended or resumed", () => {
  it.each([
    ["suspend", "suspended"],
    ["resume", "resumed"],
  ])("is a deleted one: %s is refused and changes nothing", async (command, change) => {
    const familyId = await createFamily();
    // As deleting leaves it: no secrets, no schedules.
    await routing.directory(
      "UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL, deleted_at = now() WHERE family_id = $1",
      [familyId],
    );
    await routing.directory("DELETE FROM scheduler.schedule WHERE key = $1", [familyId]);
    const before = await everythingOf(familyId);

    const result = await routing.run([command, "--family-id", familyId]);

    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`The Family ${familyId} is deleted and cannot be ${change}`);
    expect(result.stderr).toContain(`was refused","familyId":"${familyId}"`);
    expect(await everythingOf(familyId)).toEqual(before);
    expect(before.status).toBe("deleted");
  });

  it.each([
    ["suspend", "suspended"],
    ["resume", "resumed"],
  ])("is one still being prepared: %s is refused and changes nothing", async (command, change) => {
    routing.core.failNext("enter-admin");
    expect((await routing.run(["create", "--admin-email", "first.admin@example.org"])).exitCode).toBe(1);
    const [row] = await routing.directory("SELECT family_id FROM family WHERE status = 'being_prepared'");
    const familyId = String(row?.family_id);
    const before = await everythingOf(familyId);

    const result = await routing.run([command, "--family-id", familyId]);

    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`The Family ${familyId} is being prepared and cannot be ${change}; finish preparing it first`);
    expect(await everythingOf(familyId)).toEqual(before);
    expect(before.status).toBe("being_prepared");
  });

  it.each([["suspend"], ["resume"]])("is an unknown one: %s is refused", async (command) => {
    const familyId = crypto.randomUUID();

    const result = await routing.run([command, "--family-id", familyId]);

    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`There is no Family ${familyId}`);
    expect(await routing.directory("SELECT family_id FROM family")).toEqual([]);
  });

  it.each([["suspend"], ["resume"]])("is named by no Family id: %s is a usage error", async (command) => {
    for (const args of [[], ["--family-id", "not-a-uuid"], ["--family-id", crypto.randomUUID(), "--confirm", "x"]]) {
      const result = await routing.run([command, ...args]);
      expect(result, args.join(" ")).toMatchObject({ exitCode: 2, stdout: "" });
      expect(result.stderr).toContain(`routing ${command} --family-id <id>`);
    }
  });
});

describe("The Family id", () => {
  it("is taken in lower case", async () => {
    const familyId = await createFamily();

    expect(await suspend(familyId.toUpperCase())).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is suspended\n` });
    expect(await statusOf(familyId)).toBe("suspended");
  });
});

describe("The log", () => {
  /** The messages logged since `since`, each with the Family id it names. */
  const loggedSince = (since: number) =>
    routing
      .log()
      .slice(since)
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { message: string; familyId?: string })
      .map(({ message, familyId }) => ({ message, familyId }));

  it("says what each command did, naming the Family by its Family id", async () => {
    const familyId = await createFamily();
    const steps = [
      { message: "The Family is suspended; nothing routes to it", familyId },
      { message: "The Family's schedules are removed", familyId },
      { message: "The Family's schedules are removed", familyId },
      { message: "The Family is active again", familyId },
      { message: "The Family's schedules are in place", familyId },
      { message: "The Family's schedules are in place", familyId },
    ];
    const since = routing.log().length;

    for (const command of ["suspend", "suspend", "resume", "resume"]) await routing.run([command, "--family-id", familyId]);

    expect(loggedSince(since)).toEqual(steps);
  });

  it("contains no secret", async () => {
    const familyId = await createFamily();
    const [entry] = await routing.directory("SELECT wrapped_family_key, wrapped_database_password FROM family WHERE family_id = $1", [familyId]);
    const since = routing.log().length;

    await suspend(familyId);
    await resume(familyId);

    const log = routing.log().slice(since);
    expect(log).toContain(familyId);
    for (const secret of [entry!.wrapped_family_key, entry!.wrapped_database_password, routing.env.OPERATOR_KEY, routing.env.CONTEXT_KEY]) {
      expect(log).not.toContain(String(secret));
    }
  });
});
