import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import { poolOf, startStandInCore } from "./support/stand-in-core";

const ADMIN = "locked.out@example.org";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(email = ADMIN): Promise<string> {
  const result = await routing.run(["create", "--admin-email", email]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
}

const resetPassword = (familyId: string, email = ADMIN) =>
  routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", email]);

describe("Resetting an Admin's password", () => {
  it("is not tried on another core when the first core of the pool does not answer, so that no second password is drawn", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const since = routing.core.requests.length;

    const result = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", ADMIN], poolOf(down, routing.core));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(routing.core.requests.slice(since)).toEqual([]);
  });

  it("is tried on the next core when a core refuses to open the Family, and draws one password only", async () => {
    const familyId = await createFamily();
    const older = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    try {
      older.refuseFamily(familyId, "migrated-by-newer-release");
      const since = routing.core.requests.length;

      const result = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", ADMIN], poolOf(older, routing.core));

      expect(result, result.stderr).toMatchObject({ exitCode: 0 });
      expect(older.requests.map(({ path }) => path)).toEqual(["/operations/reset-admin-password"]);
      expect(routing.core.requests.slice(since).map(({ path }) => path)).toEqual(["/operations/reset-admin-password"]);
      expect(older.password(familyId, ADMIN)).toBeUndefined();
      expect(result.stdout).toContain(`New password for ${ADMIN}: ${routing.core.password(familyId, ADMIN)}\n`);
    } finally {
      await older.close();
    }
  });

  it("fails with what each core answered when every core refuses to open the Family, and prints no password", async () => {
    const familyId = await createFamily();
    const older = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    try {
      older.refuseFamily(familyId, "migrated-by-newer-release");
      routing.core.refuseFamily(familyId, "migrating");

      const result = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", ADMIN], poolOf(older, routing.core));

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const [olderHost, preparingHost] = [older, routing.core].map(({ triggerUrl }) => new URL(triggerUrl).host);
      expect(result.stderr).toContain(`No core ran reset-admin-password: ${olderHost} 409 migrated-by-newer-release, ${preparingHost} 503 migrating`);
      expect(older.requests).toHaveLength(1);
      expect(routing.core.password(familyId, ADMIN)).toBeUndefined();
    } finally {
      await older.close();
    }
  });

  it("is not tried on another core after a 503 that does not say the core refused the Family, so that no second password is drawn", async () => {
    const familyId = await createFamily();
    const other = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    try {
      routing.core.failNext("reset-admin-password", 503);

      const result = await routing.run(["reset-admin-password", "--family-id", familyId, "--admin-email", ADMIN], poolOf(routing.core, other));

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("The core answered reset-admin-password with 503");
      expect(other.requests).toEqual([]);
    } finally {
      await other.close();
    }
  });

  it("has the core reset the named Admin's password with that Family's Context, and prints the new password once", async () => {
    const familyId = await createFamily();
    const contextOfCreate = routing.core.requests[0]!.context!;

    const result = await resetPassword(familyId);

    expect(result.exitCode, result.stderr).toBe(0);
    const reset = routing.core.requests.at(-1)!;
    expect(`${reset.method} ${reset.path}`).toBe("POST /operations/reset-admin-password");
    expect(reset.body).toEqual({ email: ADMIN });
    expect(reset.context).toMatchObject({
      familyId,
      database: contextOfCreate.database,
      familyKey: contextOfCreate.familyKey,
      blobDirectory: contextOfCreate.blobDirectory,
      timeZone: contextOfCreate.timeZone,
      publicUrl: contextOfCreate.publicUrl,
    });
    const password = routing.core.password(familyId, ADMIN)!;
    expect(password).toBeDefined();
    expect(result.stdout).toBe(`New password for ${ADMIN}: ${password}\nThe Admin's sessions have ended. Sign in with this password.\n`);
    expect(result.stdout.split(password)).toHaveLength(2);
    expect(result.stderr).toContain(`"message":"The core reset an Admin's password and ended their sessions","familyId":"${familyId}"`);
  });

  it("for an Admin the Family does not have fails with a clear message and prints no password", async () => {
    const familyId = await createFamily();

    const result = await resetPassword(familyId, "stranger@example.org");

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`The Family ${familyId} has no Admin with the email stranger@example.org\n`);
    expect(routing.core.requests.at(-1)?.path).toBe("/operations/reset-admin-password");
    const logLines = result.stderr.split("\n").filter((line) => line.startsWith("{"));
    expect(logLines.at(-1)).toContain(`"familyId":"${familyId}"`);
    for (const line of logLines) expect(line).not.toContain("stranger@example.org");
  });

  it("when the core does not offer the operation (a bare 404) says so and prints no password", async () => {
    const familyId = await createFamily();
    routing.core.failNext("reset-admin-password", 404);

    const result = await resetPassword(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`"message":"Resetting the Admin's password failed","familyId":"${familyId}","error":"The core answered reset-admin-password with 404"`);
  });

  it("names the Admin of the Family it was given, not of another", async () => {
    const first = await createFamily();
    const second = await createFamily("other.admin@example.org");

    const result = await resetPassword(second, "other.admin@example.org");

    expect(result.exitCode, result.stderr).toBe(0);
    expect(routing.core.requests.at(-1)?.context?.familyId).toBe(second);
    expect(routing.core.password(second, "other.admin@example.org")).toBeDefined();
    expect(routing.core.password(first, ADMIN)).toBeUndefined();
  });

  it("when the core fails says so and prints no password", async () => {
    const familyId = await createFamily();
    routing.core.failNext("reset-admin-password");

    const result = await resetPassword(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("answered reset-admin-password with 500");
    expect(result.stderr).toContain(`"message":"Resetting the Admin's password failed","familyId":"${familyId}"`);
  });

  it("when the core answers without a password says so and prints none", async () => {
    const familyId = await createFamily();
    routing.core.failNext("reset-admin-password", 200);

    const result = await resetPassword(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("answered reset-admin-password without a new password");
  });

  it("leaves the new password in no log line and nowhere in the Directory", async () => {
    const familyId = await createFamily();
    await resetPassword(familyId, "stranger@example.org");
    const result = await resetPassword(familyId);
    expect(result.exitCode, result.stderr).toBe(0);

    const password = routing.core.password(familyId, ADMIN)!;
    const tables = await routing.directory("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'");
    const dump = (await Promise.all(tables.map(({ name }) => routing.directory(`SELECT row_to_json(t)::text AS row FROM "${String(name)}" t`))))
      .flat()
      .map(({ row }) => String(row))
      .join("\n");
    expect(dump).toContain(familyId);
    expect(routing.log()).toContain(`"familyId":"${familyId}"`);
    expect(dump).not.toContain(password);
    expect(routing.log()).not.toContain(password);
    const { sealedContext, context } = routing.core.requests.at(-1)!;
    for (const secret of [sealedContext!, context!.familyKey, context!.database.password]) expect(routing.log()).not.toContain(secret);
  });

  it.each([
    [["reset-admin-password"], "--family-id"],
    [["reset-admin-password", "--admin-email", ADMIN], "--family-id"],
    [["reset-admin-password", "--family-id", "family-1", "--admin-email", ADMIN], "--family-id needs a Family id"],
    [["reset-admin-password", "--family-id", "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41"], "--admin-email"],
    [["reset-admin-password", "--family-id", "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41", "--admin-email", "nobody"], "--admin-email needs the email address of the Admin"],
    [["reset-admin-password", "--family-id", "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41", "--admin-email", ADMIN, "--password", "x"], "--password"],
  ])("refuses %j and says how to use it", async (args, message) => {
    const result = await routing.run(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("routing reset-admin-password --family-id <id> --admin-email <address>");
    expect(routing.core.requests).toEqual([]);
  });

  it("takes the Family id in capitals as well", async () => {
    const familyId = await createFamily();

    const result = await resetPassword(familyId.toUpperCase());

    expect(result.exitCode, result.stderr).toBe(0);
    expect(routing.core.requests.at(-1)?.context?.familyId).toBe(familyId);
  });

  it("for a Family that is unknown fails with a clear message, and nothing arrives at a core", async () => {
    const familyId = "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41";

    const result = await resetPassword(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`There is no Family ${familyId}`);
    expect(routing.core.requests).toEqual([]);
  });

  it.each([
    ["being_prepared", "being prepared"],
    ["suspended", "suspended"],
    ["deleted", "deleted"],
  ])("for a Family that is %s fails with a clear message, and nothing arrives at a core", async (status, said) => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = $2 WHERE family_id = $1", [familyId, status]);
    const calls = routing.core.requests.length;

    const result = await resetPassword(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`The Family ${familyId} is ${said}, not active`);
    expect(routing.core.requests).toHaveLength(calls);
  });
});
