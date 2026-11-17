import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECEIVER_PATH, type Receiver } from "../src/receiver";
import { setUpRouting, type TestRouting } from "./support/routing";

let routing: TestRouting;
let receiver: Receiver;
beforeEach(async () => {
  routing = await setUpRouting();
  // As `routing receive` does before it listens.
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  receiver = await routing.startReceiver();
});
afterEach(async () => {
  await routing.close();
});

const ALL_SCHEDULES = ["due-work", "purge-messages", "sweep-secrets"];

/** A core's family.created for a new Family, as it posts it. */
const announcement = (familyId = randomUUID(), organizationId = `org_${randomUUID().slice(0, 8)}`) => ({
  event: "family.created",
  familyId,
  organizationId,
  email: "first.admin@example.org",
});

/** Posts the body, signed with the cores' secret unless `signature` is given, as a core does. */
async function deliver(value: unknown, { signature, path = RECEIVER_PATH }: { signature?: string; path?: string } = {}) {
  const body = JSON.stringify(value);
  const response = await fetch(`${receiver.url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "family-agenda-signature-sha-256": signature ?? createHmac("sha256", routing.env.FAMILY_WEBHOOK_SECRET!).update(body).digest("hex"),
      "idempotency-key": String((value as { familyId?: unknown }).familyId),
    },
    body,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function entryOf(familyId: string) {
  const [entry] = await routing.directory("SELECT status, organization_id, time_zone FROM family WHERE family_id = $1", [familyId]);
  return entry;
}

const openings = (familyId: string) =>
  routing.core.requests.filter(({ path, context }) => path === "/operations/secret-sweep" && context?.familyId === familyId);

describe("a family.created a core signed", () => {
  it("creates the Family for its Organization, active with its schedules, and is answered 200 with its address", async () => {
    const delivery = announcement();

    const answer = await deliver(delivery);

    expect(answer).toEqual({ status: 200, body: { familyId: delivery.familyId, address: `https://app.family-agenda.cloud/${delivery.familyId}/` } });
    expect(await entryOf(delivery.familyId)).toEqual({ status: "active", organization_id: delivery.organizationId, time_zone: "Europe/Berlin" });
    expect(await routing.schedules(delivery.familyId)).toEqual(ALL_SCHEDULES);
    expect(routing.core.organizationOf(delivery.familyId)).toBe(delivery.organizationId);
    expect(openings(delivery.familyId)[0]?.context).toMatchObject({ familyId: delivery.familyId, organizationId: delivery.organizationId });
  });

  it("delivered again changes nothing and is answered 200 again", async () => {
    const delivery = announcement();
    await deliver(delivery);
    const calls = routing.core.requests.length;

    expect((await deliver(delivery)).status).toBe(200);

    expect(routing.core.requests).toHaveLength(calls);
    expect(await entryOf(delivery.familyId)).toMatchObject({ status: "active" });
    expect(await routing.schedules(delivery.familyId)).toEqual(ALL_SCHEDULES);
  });

  it("delivered twice side by side creates the Family once", async () => {
    const delivery = announcement();

    const answers = await Promise.all([deliver(delivery), deliver(delivery)]);

    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    expect(openings(delivery.familyId)).toHaveLength(1);
    expect(await routing.directory("SELECT count(*)::int AS n FROM family WHERE family_id = $1", [delivery.familyId])).toEqual([{ n: 1 }]);
  });

  it("that failed part-way is answered 500, and the core's next delivery finishes the Family", async () => {
    const delivery = announcement();
    routing.core.failNext("secret-sweep", 500);

    expect((await deliver(delivery)).status).toBe(500);
    expect(await entryOf(delivery.familyId)).toMatchObject({ status: "being_prepared" });

    expect((await deliver(delivery)).status).toBe(200);
    expect(await entryOf(delivery.familyId)).toMatchObject({ status: "active", organization_id: delivery.organizationId });
    expect(await routing.schedules(delivery.familyId)).toEqual(ALL_SCHEDULES);
  });

  it("naming another Organization than the Family was begun with is answered 409 and changes nothing", async () => {
    const delivery = announcement();
    await deliver(delivery);
    const calls = routing.core.requests.length;

    expect(await deliver({ ...delivery, organizationId: "org_other" })).toEqual({ status: 409, body: { error: "refused" } });

    expect(routing.core.requests).toHaveLength(calls);
    expect(await entryOf(delivery.familyId)).toMatchObject({ organization_id: delivery.organizationId });
    expect(routing.log()).toContain("Creating the registered Family was refused");
  });

  it("for a Family that does not say what family.created says is answered 400, and nothing is created", async () => {
    const delivery = announcement();

    expect(await deliver({ ...delivery, event: "family.deleted" })).toEqual({ status: 400, body: { error: "malformed" } });
    expect(await deliver({ ...delivery, familyId: "not-a-uuid" })).toEqual({ status: 400, body: { error: "malformed" } });

    expect(await routing.directory("SELECT family_id FROM family")).toEqual([]);
    expect(routing.core.requests).toEqual([]);
  });

  it("leaves the email address the Admin registered with out of the log", async () => {
    await deliver(announcement());

    expect(routing.log()).not.toContain("first.admin@example.org");
  });
});

describe("a delivery the cores did not sign", () => {
  it("is answered 401 and creates nothing", async () => {
    const delivery = announcement();

    expect(await deliver(delivery, { signature: createHmac("sha256", "another secret of 32 characters or more").update(JSON.stringify(delivery)).digest("hex") })).toEqual({
      status: 401,
      body: { error: "unsigned" },
    });
    expect(await deliver(delivery, { signature: "" })).toMatchObject({ status: 401 });

    expect(await entryOf(delivery.familyId)).toBeUndefined();
    expect(routing.core.requests).toEqual([]);
  });
});

describe("the receiver", () => {
  it("answers 404 to anything but a POST of family.created", async () => {
    expect((await deliver(announcement(), { path: "/other" })).status).toBe(404);
    expect((await fetch(`${receiver.url}${RECEIVER_PATH}`)).status).toBe(404);
  });

  it("answers 413 to a body longer than any family.created", async () => {
    const response = await fetch(`${receiver.url}${RECEIVER_PATH}`, { method: "POST", body: "x".repeat(65 * 1024) });
    expect(response.status).toBe(413);
  });
});

describe("routing receive", () => {
  it("does not start without FAMILY_WEBHOOK_SECRET", async () => {
    const result = await routing.run(["receive"], { FAMILY_WEBHOOK_SECRET: undefined });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("FAMILY_WEBHOOK_SECRET is not set");
  });

  it("brings the Directory up to date, receives until it is stopped, and then stops listening", async () => {
    let stop = () => {};
    const until = new Promise<void>((resolve) => {
      stop = resolve;
    });
    const running = routing.run(["receive"], { RECEIVER_PORT: "0", LISTEN_HOST: "127.0.0.1" }, { until });
    await expect.poll(() => routing.log()).toContain("The receiver listens");
    stop();

    expect(await running).toMatchObject({ exitCode: 0 });
    expect(routing.log()).toContain("The receiver stopped");
  });
});
