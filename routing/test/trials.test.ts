import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECEIVER_PATH, type Receiver } from "../src/receiver";
import { setUpRouting, type TestRouting } from "./support/routing";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const DAY = 86_400_000;

let routing: TestRouting;
let receiver: Receiver;
beforeEach(async () => {
  routing = await setUpRouting();
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  receiver = await routing.startReceiver();
});
afterEach(async () => {
  await routing.close();
});

/** A Family that registers: a core's family.created, signed, as it posts it. */
async function register(): Promise<string> {
  const familyId = randomUUID();
  const body = JSON.stringify({ event: "family.created", familyId, organizationId: `org_${randomUUID().slice(0, 8)}`, email: "first.admin@example.org" });
  const response = await fetch(`${receiver.url}${RECEIVER_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "family-agenda-signature-sha-256": createHmac("sha256", routing.env.FAMILY_WEBHOOK_SECRET!).update(body).digest("hex"),
      "idempotency-key": familyId,
    },
    body,
  });
  expect(response.status).toBe(200);
  return familyId;
}

/** A Family the Operator creates. */
async function createFamily(): Promise<string> {
  const result = await routing.run(["create", "--organization-id", `org_${randomUUID().slice(0, 8)}`]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

const trialOf = async (familyId: string) =>
  (await routing.directory("SELECT trial_starts_at FROM family WHERE family_id = $1", [familyId]))[0]?.trial_starts_at as Date | null | undefined;

const openTrials = (...args: string[]) => routing.run(["open-trials", ...args]);
const startTrial = (familyId: string) => routing.run(["start-trial", "--family-id", familyId]);

async function subscribe(familyId: string, status: string, endedAt: Date | null = null, orderedAt = new Date("2026-11-01T00:00:00Z")) {
  const subscriptionId = `sub_${randomUUID().slice(0, 8)}`;
  await routing.directory(
    "INSERT INTO subscription (subscription_id, family_id, holder, billing, status, ordered_at, ended_at) VALUES ($1, $2, 'user_founder', 'monthly', $3, $4, $5)",
    [subscriptionId, familyId, status, orderedAt, endedAt],
  );
  return subscriptionId;
}

const deleteEntry = (familyId: string) =>
  routing.directory("UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL, deleted_at = now() WHERE family_id = $1", [familyId]);

/** Whether `at` lies in the moment just passed, as the Directory's clock sees it. */
const justNow = (at: Date | null | undefined) => {
  expect(at).toBeInstanceOf(Date);
  expect(Math.abs(Date.now() - at!.getTime())).toBeLessThan(60_000);
};

describe("Before Trials are open", () => {
  it("a Family that registers and one the Operator creates have no Trial", async () => {
    const registered = await register();
    const created = await createFamily();

    expect(await trialOf(registered)).toBeNull();
    expect(await trialOf(created)).toBeNull();
    expect(await routing.directory("SELECT trials_opened_at FROM setting")).toEqual([]);
  });
});

describe("Opening Trials", () => {
  it("starts a Trial for every Family that has none, is not deleted and never had a Subscription, and says so", async () => {
    const registered = await register();
    const created = await createFamily();
    const suspended = await createFamily();
    await routing.run(["suspend", "--family-id", suspended]);
    const deleted = await createFamily();
    await deleteEntry(deleted);
    const subscribed = await createFamily();
    await subscribe(subscribed, "canceled", new Date("2026-11-10T00:00:00Z"));

    const result = await openTrials();

    expect(result.exitCode, result.stderr).toBe(0);
    const started = [registered, created, suspended].sort();
    expect(result.stdout).toBe(`${started.map((familyId) => `The Family ${familyId} starts its Trial\n`).join("")}Trials are open; 3 started now\n`);
    for (const familyId of started) justNow(await trialOf(familyId));
    expect(await trialOf(deleted)).toBeNull();
    expect(await trialOf(subscribed)).toBeNull();
    const [setting] = await routing.directory("SELECT trials_opened_at FROM setting");
    justNow(setting?.trials_opened_at as Date);
  });

  it("leaves out the Families named with --except, in any case", async () => {
    const left = await createFamily();
    const alsoLeft = await createFamily();
    const started = await createFamily();

    const result = await openTrials("--except", left.toUpperCase(), "--except", alsoLeft);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${started} starts its Trial\nTrials are open; 1 started now\n` });
    expect(await trialOf(left)).toBeNull();
    expect(await trialOf(alsoLeft)).toBeNull();
  });

  it("again starts only the Trials of Families added since, and keeps when Trials were first opened", async () => {
    const first = await createFamily();
    expect(await openTrials()).toMatchObject({ exitCode: 0 });
    const firstTrial = await trialOf(first);
    const [opened] = await routing.directory("SELECT trials_opened_at FROM setting");
    const later = await createFamily();

    const again = await openTrials();

    expect(again).toMatchObject({ exitCode: 0, stdout: `The Family ${later} starts its Trial\nTrials are open; 1 started now\n` });
    expect(await trialOf(first)).toEqual(firstTrial);
    expect(await routing.directory("SELECT trials_opened_at FROM setting")).toEqual([opened]);
    expect(await openTrials()).toMatchObject({ exitCode: 0, stdout: "Trials are open; 0 started now\n" });
  });

  it("from then on starts the Trial of a Family that registers when it is created, and not of one the Operator creates", async () => {
    expect(await openTrials()).toMatchObject({ exitCode: 0 });

    const registered = await register();
    const created = await createFamily();

    justNow(await trialOf(registered));
    expect(await trialOf(created)).toBeNull();
  });

  it("takes only Family ids after --except", async () => {
    for (const args of [["--except"], ["--except", "not-a-uuid"], ["extra"]]) {
      const result = await openTrials(...args);
      expect(result, args.join(" ")).toMatchObject({ exitCode: 2, stdout: "" });
      expect(result.stderr).toContain("routing open-trials [--except <Family id>]...");
    }
  });
});

describe("Starting one Family's Trial", () => {
  it("starts it now, ending 14 days later, as the Directory entry says", async () => {
    const familyId = await createFamily();

    const result = await startTrial(familyId);

    expect(result.exitCode, result.stderr).toBe(0);
    const startsAt = await trialOf(familyId);
    justNow(startsAt);
    const endsAt = new Date(startsAt!.getTime() + 14 * DAY);
    expect(result.stdout).toBe(`The Family ${familyId} starts its Trial ${startsAt!.toISOString()}; it ends ${endsAt.toISOString()}\n`);
    const entry = await routing.provisioned(({ directory }) => directory.find(familyId));
    expect(entry).toMatchObject({ trialStartsAt: startsAt, trialEndsAt: endsAt });
  });

  it("is refused for a Family that had its Trial, and changes nothing", async () => {
    const familyId = await createFamily();
    await startTrial(familyId);
    const startsAt = await trialOf(familyId);

    const result = await startTrial(familyId);

    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`The Family ${familyId} had its Trial already; it started ${startsAt!.toISOString()}`);
    expect(result.stderr).toContain(`"message":"Starting the Trial was refused","familyId":"${familyId}"`);
    expect(await trialOf(familyId)).toEqual(startsAt);
  });

  it("is refused for a Family that had a Subscription, even an ended one", async () => {
    const familyId = await createFamily();
    await subscribe(familyId, "canceled", new Date("2026-11-10T00:00:00Z"));

    const result = await startTrial(familyId);

    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`The Family ${familyId} had a Subscription and gets no Trial`);
    expect(await trialOf(familyId)).toBeNull();
  });

  it("is refused for a deleted Family and an unknown one", async () => {
    const deleted = await createFamily();
    await deleteEntry(deleted);
    const unknown = randomUUID();

    const refusedDeleted = await startTrial(deleted);
    const refusedUnknown = await startTrial(unknown);

    expect(refusedDeleted).toMatchObject({ exitCode: 1, stdout: "" });
    expect(refusedDeleted.stderr).toContain(`The Family ${deleted} is deleted and gets no Trial`);
    expect(refusedUnknown).toMatchObject({ exitCode: 1, stdout: "" });
    expect(refusedUnknown.stderr).toContain(`There is no Family ${unknown}`);
    expect(await trialOf(deleted)).toBeNull();
  });

  it("says so when the Directory fails", async () => {
    const familyId = await createFamily();
    await routing.directory(`REVOKE UPDATE ON family FROM ${routing.routingRole}`);

    const result = await startTrial(familyId);

    await routing.directory(`GRANT UPDATE ON family TO ${routing.routingRole}`);
    expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    expect(result.stderr).toContain(`"message":"Starting the Trial failed; run start-trial again","familyId":"${familyId}"`);
  });
});

describe("A Family's Subscription", () => {
  const subscriptionOf = (familyId: string) => routing.provisioned(({ directory }) => directory.subscriptionOf(familyId));

  it("is none without one", async () => {
    expect(await subscriptionOf(await createFamily())).toBeNull();
  });

  it("is the running one, not one that ended before", async () => {
    const familyId = await createFamily();
    await subscribe(familyId, "canceled", new Date("2026-11-05T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    await subscribe(familyId, "incomplete_expired", null, new Date("2026-11-20T00:00:00Z"));
    const running = await subscribe(familyId, "past_due", null, new Date("2026-11-06T00:00:00Z"));

    expect(await subscriptionOf(familyId)).toEqual({
      subscriptionId: running,
      familyId,
      customerId: null,
      holder: "user_founder",
      billing: "monthly",
      status: "past_due",
      orderedAt: new Date("2026-11-06T00:00:00Z"),
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAt: null,
      endedAt: null,
      confirmationSentAt: null,
    });
  });

  it.each(["trialing", "active", "past_due", "unpaid"])("runs while its status is %s", async (status) => {
    const familyId = await createFamily();
    await subscribe(familyId, status);

    expect(await subscriptionOf(familyId)).toMatchObject({ status });
  });

  it.each(["canceled", "incomplete", "incomplete_expired", "paused"])("is none while its only one is %s", async (status) => {
    const familyId = await createFamily();
    await subscribe(familyId, status);

    expect(await subscriptionOf(familyId)).toBeNull();
  });

  it("is the latest ordered of two running ones, and not another Family's", async () => {
    const familyId = await createFamily();
    const other = await createFamily();
    await subscribe(familyId, "active", null, new Date("2026-11-01T00:00:00Z"));
    const latest = await subscribe(familyId, "trialing", null, new Date("2026-11-02T00:00:00Z"));
    await subscribe(other, "active", null, new Date("2026-11-03T00:00:00Z"));

    expect(await subscriptionOf(familyId)).toMatchObject({ subscriptionId: latest });
  });
});
