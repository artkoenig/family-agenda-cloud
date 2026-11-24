import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { founderOf } from "../src/founder";
import { RECEIVER_PATH } from "../src/receiver";
import { setUpRouting, type TestRouting } from "./support/routing";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

const organization = () => `org_${randomUUID().slice(0, 8)}`;

async function createFamily(organizationId = organization()): Promise<string> {
  const result = await routing.run(["create", "--organization-id", organizationId]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return ADDRESS.exec(result.stdout.trim())![1]!;
}

const registeredBy = async (familyId: string) =>
  (await routing.directory("SELECT registered_by FROM family WHERE family_id = $1", [familyId]))[0]?.registered_by;

const setFounder = (...args: string[]) => routing.run(["set-founder", ...args]);

describe("The founder of a new Family", () => {
  it("that registers is read from its Organization when it is created", async () => {
    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
    const receiver = await routing.startReceiver();
    const familyId = randomUUID();
    const organizationId = organization();
    routing.logto.setFounder(organizationId, "user_founder");
    const body = JSON.stringify({ event: "family.created", familyId, organizationId, email: "first.admin@example.org" });

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
    expect(await registeredBy(familyId)).toBe("user_founder");
  });

  it("the Operator creates is read from its Organization too", async () => {
    const organizationId = organization();
    routing.logto.setFounder(organizationId, "user_founder");

    const familyId = await createFamily(organizationId);

    expect(await registeredBy(familyId)).toBe("user_founder");
  });

  it("is none when its Organization names none, and the Family is created all the same when Logto fails", async () => {
    const familyId = await createFamily();
    routing.logto.failWith(503);
    const organizationId = organization();

    const result = await routing.run(["create", "--organization-id", organizationId]);

    routing.logto.failWith(null);
    expect(await registeredBy(familyId)).toBeNull();
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(result.stderr).toContain("Reading the Family's founder from Logto failed; it is read again when it is first needed");
  });
});

describe("The founder of a Family created before", () => {
  it("is read from its Organization the first time it is needed, and recorded", async () => {
    const organizationId = organization();
    const familyId = await createFamily(organizationId);
    routing.logto.setFounder(organizationId, "user_founder");

    const founder = await routing.provisioned((provisioning) => founderOf(provisioning, familyId));

    expect(founder).toBe("user_founder");
    expect(await registeredBy(familyId)).toBe("user_founder");
    const reads = routing.logto.organizationReads.length;
    routing.logto.setFounder(organizationId, "user_other");
    expect(await routing.provisioned((provisioning) => founderOf(provisioning, familyId))).toBe("user_founder");
    expect(routing.logto.organizationReads).toHaveLength(reads);
  });

  it("is none while its Organization names none, or is gone, and for an unknown Family there is none to read", async () => {
    const organizationId = organization();
    const familyId = await createFamily(organizationId);

    expect(await routing.provisioned((provisioning) => founderOf(provisioning, familyId))).toBeNull();
    routing.logto.deleted.push(organizationId);
    expect(await routing.provisioned((provisioning) => founderOf(provisioning, familyId))).toBeNull();
    expect(await routing.provisioned((provisioning) => founderOf(provisioning, randomUUID()))).toBeUndefined();
    expect(await registeredBy(familyId)).toBeNull();
  });
});

describe("Setting the founder by hand", () => {
  it("records the Admin named by email or user id, and prints the user id", async () => {
    const organizationId = organization();
    const familyId = await createFamily(organizationId);
    routing.logto.addMember(organizationId, "user_ada");

    const byEmail = await setFounder(familyId, "USER_ADA@example.com");

    expect(byEmail, byEmail.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} has the founder user_ada\n` });
    expect(await registeredBy(familyId)).toBe("user_ada");
    const otherOrganization = organization();
    const other = await createFamily(otherOrganization);
    routing.logto.addMember(otherOrganization, "user_bo");
    expect(await setFounder(other, "user_bo")).toMatchObject({ exitCode: 0, stdout: `The Family ${other} has the founder user_bo\n` });
    expect(await registeredBy(other)).toBe("user_bo");
  });

  it("refuses anyone who is not an Admin of the Family now", async () => {
    const organizationId = organization();
    const familyId = await createFamily(organizationId);
    routing.logto.addMember(organizationId, "user_member", null);
    routing.logto.addMember(organization(), "user_elsewhere");

    for (const admin of ["user_member", "user_elsewhere", "nobody@example.com"]) {
      const result = await setFounder(familyId, admin);
      expect(result, admin).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain(`${admin} is no Admin of the Family ${familyId}`);
      expect(result.stderr).toContain(`"message":"Recording the founder was refused","familyId":"${familyId}"`);
    }
    expect(await registeredBy(familyId)).toBeNull();
  });

  it("overwrites a founder recorded before only with --force", async () => {
    const organizationId = organization();
    routing.logto.setFounder(organizationId, "user_ada");
    const familyId = await createFamily(organizationId);
    routing.logto.addMember(organizationId, "user_ada");
    routing.logto.addMember(organizationId, "user_bo");

    const refused = await setFounder(familyId, "user_bo");

    expect(refused).toMatchObject({ exitCode: 1, stdout: "" });
    expect(refused.stderr).toContain(`The Family ${familyId} has the founder user_ada recorded already; run set-founder with --force to overwrite it`);
    expect(await registeredBy(familyId)).toBe("user_ada");
    expect(await setFounder(familyId, "user_ada")).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} has the founder user_ada\n` });
    expect(await setFounder(familyId, "user_bo", "--force")).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} has the founder user_bo\n` });
    expect(await registeredBy(familyId)).toBe("user_bo");
  });

  it("is refused for an unknown Family, and says so when Logto fails", async () => {
    const unknown = randomUUID();
    const familyId = await createFamily();

    const refused = await setFounder(unknown, "user_ada");
    routing.logto.failWith(503);
    const failed = await setFounder(familyId, "user_ada");
    routing.logto.failWith(null);

    expect(refused).toMatchObject({ exitCode: 1, stdout: "" });
    expect(refused.stderr).toContain(`There is no Family ${unknown}`);
    expect(failed).toMatchObject({ exitCode: 1, stdout: "" });
    expect(failed.stderr).toContain(`"message":"Recording the founder failed; run set-founder again","familyId":"${familyId}"`);
  });

  it("needs IDP_MANAGEMENT_*, and the Family id and the Admin", async () => {
    const familyId = await createFamily();

    const unconfigured = await routing.run(["set-founder", familyId, "user_ada"], {
      IDP_MANAGEMENT_ENDPOINT: undefined,
      IDP_MANAGEMENT_CLIENT_ID: undefined,
      IDP_MANAGEMENT_CLIENT_SECRET: undefined,
    });

    expect(unconfigured).toMatchObject({ exitCode: 2, stdout: "" });
    expect(unconfigured.stderr).toContain("set-founder needs IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET");
    for (const args of [[], [familyId], ["not-a-uuid", "user_ada"], [familyId, "user_ada", "more"]]) {
      const result = await setFounder(...args);
      expect(result, args.join(" ")).toMatchObject({ exitCode: 2, stdout: "" });
      expect(result.stderr).toContain("routing set-founder <Family id> <Admin's email or user id> [--force]");
    }
  });
});
