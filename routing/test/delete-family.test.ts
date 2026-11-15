import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { familyDatabaseNames } from "../src/family-databases";
import { setUpRouting, type TestRouting } from "./support/routing";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;

let routing: TestRouting;
/** The directory, shared with the cores, that holds one blob location per Family. */
let blobRoot: string;
beforeEach(async () => {
  routing = await setUpRouting();
  blobRoot = await mkdtemp(join(tmpdir(), "routing-blobs-"));
});
afterEach(async () => {
  await routing.close();
  await rm(blobRoot, { recursive: true, force: true });
});

const run = (args: string[], env: Record<string, string | undefined> = {}) => routing.run(args, { BLOB_ROOT: blobRoot, ...env });

/** Creates a Family and puts blobs into its blob location, as its core would. */
async function createFamily() {
  const created = await run(["create", "--admin-email", "first.admin@example.org"]);
  expect(created, created.stderr).toMatchObject({ exitCode: 0 });
  const familyId = ADDRESS.exec(created.stdout.trim())![1]!;
  await mkdir(join(blobRoot, familyId, "attachments"), { recursive: true });
  await writeFile(join(blobRoot, familyId, "attachments", "flyer.pdf"), "a flyer");
  return familyId;
}

const deleteFamily = (familyId: string, confirmation = familyId, env: Record<string, string | undefined> = {}) =>
  run(["delete", "--family-id", familyId, "--confirm", confirmation], env);

const name = (familyId: string) => familyDatabaseNames(familyId).databaseName;

async function blobsOf(familyId: string): Promise<string[]> {
  try {
    return await readdir(join(blobRoot, familyId), { recursive: true });
  } catch {
    return [];
  }
}

/** What an Operator and Postgres can see of a Family. */
async function stateOf(familyId: string) {
  const [entry] = await routing.directory(
    `SELECT status, database_name, database_role, blob_location, wrapped_family_key, wrapped_database_password,
            deleted_at IS NOT NULL AS deletion_finished
     FROM family WHERE family_id = $1`,
    [familyId],
  );
  return {
    entry,
    databases: (await routing.server("SELECT datname FROM pg_database WHERE datname = $1", [name(familyId)])).length,
    roles: (await routing.server("SELECT rolname FROM pg_roles WHERE rolname = $1", [name(familyId)])).length,
    blobs: await blobsOf(familyId),
    blobLocationExists: (await readdir(blobRoot).catch((): string[] => [])).includes(familyId),
  };
}

const deletedState = (familyId: string) => ({
  entry: {
    status: "deleted",
    database_name: name(familyId),
    database_role: name(familyId),
    blob_location: join(blobRoot, familyId),
    wrapped_family_key: null,
    wrapped_database_password: null,
    deletion_finished: true,
  },
  databases: 0,
  roles: 0,
  blobs: [],
  blobLocationExists: false,
});

describe("Deleting a Family", () => {
  it("drops its database and role, empties its blob location and leaves its entry deleted, without secrets", async () => {
    const familyId = await createFamily();

    const result = await deleteFamily(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is deleted\n` });
    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("closes the connections a core still holds to the Family's database", async () => {
    const familyId = await createFamily();
    const [context] = routing.core.requests.map(({ context }) => context!).slice(-1);
    const { host, port, name: database, user, password } = context!.database;
    const held = new pg.Client({ host, port, database, user, password });
    held.on("error", () => undefined);
    await held.connect();

    const result = await deleteFamily(familyId);

    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
    await held.end().catch(() => undefined);
  });

  it.each(["suspended", "being_prepared"])("deletes a Family that is %s", async (status) => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET status = $2 WHERE family_id = $1", [familyId, status]);

    expect(await deleteFamily(familyId)).toMatchObject({ exitCode: 0 });
    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("leaves every other Family's database, role, blobs and Directory entry untouched", async () => {
    const other = await createFamily();
    const familyId = await createFamily();
    const before = await stateOf(other);

    expect(await deleteFamily(familyId)).toMatchObject({ exitCode: 0 });

    expect(await stateOf(other)).toEqual(before);
    expect(before).toMatchObject({ entry: { status: "active" }, databases: 1, roles: 1, blobs: ["attachments", join("attachments", "flyer.pdf")] });
  });

  it("logs the Family by its Family id and no secret", async () => {
    const familyId = await createFamily();
    const [entry] = await routing.directory("SELECT wrapped_family_key, wrapped_database_password FROM family WHERE family_id = $1", [familyId]);
    const secrets = routing.core.requests.flatMap(({ sealedContext, context }) => [sealedContext!, context!.familyKey, context!.database.password]);
    const logBefore = routing.log().length;

    const result = await deleteFamily(familyId);

    const lines = result.stderr.trim().split("\n").map((line) => JSON.parse(line) as { familyId?: string; message: string });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.familyId === familyId && line.message !== "")).toBe(true);
    expect(lines.at(-1)?.message).toBe("The Family is deleted");
    for (const secret of [...secrets, String(entry!.wrapped_family_key), String(entry!.wrapped_database_password), routing.env.OPERATOR_KEY!]) {
      expect(routing.log().slice(logBefore)).not.toContain(secret);
    }
  });
});

describe("Deleting a Family is refused, and changes nothing,", () => {
  async function expectUnchanged(familyId: string, act: () => Promise<{ exitCode: number; stderr: string }>, message: string, exitCode = 1) {
    const before = await stateOf(familyId);

    const result = await act();

    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toContain(message);
    expect(await stateOf(familyId)).toEqual(before);
    expect(before).toMatchObject({ entry: { status: "active" }, databases: 1, roles: 1 });
  }

  it("when the confirmation is another Family id", async () => {
    const familyId = await createFamily();
    const other = await createFamily();

    await expectUnchanged(familyId, () => deleteFamily(familyId, other), "does not match the Family id; nothing was deleted");
    expect(await stateOf(other)).toMatchObject({ entry: { status: "active" }, databases: 1 });
  });

  it("without a confirmation", async () => {
    const familyId = await createFamily();

    await expectUnchanged(familyId, () => run(["delete", "--family-id", familyId]), "--confirm needs the Family id", 2);
  });

  it("without a Family id", async () => {
    const familyId = await createFamily();

    await expectUnchanged(familyId, () => run(["delete", "--confirm", familyId]), "--family-id needs the Family id", 2);
  });

  it("for a Family whose blob location is not below the blob root", async () => {
    const familyId = await createFamily();
    const elsewhere = await mkdtemp(join(tmpdir(), "routing-elsewhere-"));

    await expectUnchanged(familyId, () => deleteFamily(familyId, familyId, { BLOB_ROOT: elsewhere }), "blob location is not");
    await rm(elsewhere, { recursive: true });
  });

  it("for a Family whose database or role in the Directory is not the one its Family id gives", async () => {
    const familyId = await createFamily();
    await routing.directory("UPDATE family SET database_name = 'postgres', database_role = 'postgres' WHERE family_id = $1", [familyId]);

    const result = await deleteFamily(familyId);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`database and role are not ${name(familyId)}; nothing was deleted`);
    expect(await stateOf(familyId)).toMatchObject({ entry: { status: "active", database_name: "postgres" }, databases: 1, roles: 1, blobs: ["attachments", join("attachments", "flyer.pdf")] });
    expect(await routing.server("SELECT 1 FROM pg_database WHERE datname = 'postgres'")).toHaveLength(1);
  });

  it("for text that is not a Family id, which it does not log", async () => {
    const result = await run(["delete", "--family-id", "family-1", "--confirm", "family-1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("is not a Family id; nothing was deleted");
    expect(result.stderr).not.toContain('"familyId"');
  });

  it("for a Family id that is not in the Directory", async () => {
    const familyId = await createFamily();
    const unknown = "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41";

    const result = await deleteFamily(unknown);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`There is no Family ${unknown}`);
    expect(await stateOf(familyId)).toMatchObject({ entry: { status: "active" }, databases: 1, roles: 1 });
  });
});

describe("Running delete again", () => {
  /** Fails a delete with `breakIt`, mends it with `mendIt`, and runs delete again. */
  async function failAndRunAgain(failure: RegExp, breakIt: (familyId: string) => Promise<void>, mendIt: (familyId: string) => Promise<void>) {
    const familyId = await createFamily();
    await breakIt(familyId);
    const failed = await deleteFamily(familyId);
    expect(failed.exitCode, failed.stderr).toBe(1);
    expect(failed.stderr).toMatch(failure);
    expect(failed.stderr).toContain("did not finish; run delete again to finish it");
    expect(failed.stderr).toContain(`"familyId":"${familyId}"`);
    expect(failed.stdout).toBe("");
    expect(await stateOf(familyId)).toMatchObject({ entry: { deletion_finished: false } });
    await mendIt(familyId);
    const again = await deleteFamily(familyId);
    expect(again, again.stderr).toMatchObject({ exitCode: 0 });
    return familyId;
  }

  const alterRole = (option: string) => async () => {
    await routing.server(`ALTER ROLE ${routing.routingRole} ${option}`);
  };

  it("after the Directory entry could not be marked deleted ends as an undisturbed run", async () => {
    const familyId = await failAndRunAgain(
      /permission denied for table family/,
      async () => routing.directory(`REVOKE UPDATE ON family FROM ${routing.routingRole}`).then(() => undefined),
      async () => routing.directory(`GRANT UPDATE ON family TO ${routing.routingRole}`).then(() => undefined),
    );

    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("after the database could not be dropped ends as an undisturbed run", async () => {
    const familyId = await failAndRunAgain(
      /must be owner of database/,
      async (id) => routing.server(`ALTER DATABASE ${name(id)} OWNER TO CURRENT_USER`).then(() => undefined),
      async (id) => routing.server(`ALTER DATABASE ${name(id)} OWNER TO ${name(id)}`).then(() => undefined),
    );

    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("after the role could not be dropped ends as an undisturbed run", async () => {
    const familyId = await failAndRunAgain(/permission denied to drop role/, alterRole("NOCREATEROLE"), alterRole("CREATEROLE"));

    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("after the blob root was not there ends as an undisturbed run, rather than reporting blobs gone it never saw", async () => {
    const away = `${blobRoot}.away`;
    const familyId = await failAndRunAgain(
      /The blob root .* is not there/,
      async () => rename(blobRoot, away),
      async () => rename(away, blobRoot),
    );

    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
  });

  it("after it ended well changes nothing and says the Family was deleted already", async () => {
    const familyId = await createFamily();
    expect(await deleteFamily(familyId)).toMatchObject({ exitCode: 0 });
    const [{ deleted_at: deletedAt }] = (await routing.directory("SELECT deleted_at FROM family WHERE family_id = $1", [familyId])) as [
      { deleted_at: Date },
    ];

    const again = await deleteFamily(familyId);

    expect(again, again.stderr).toMatchObject({ exitCode: 0, stdout: `The Family ${familyId} is deleted\n` });
    expect(again.stderr).toContain(`"message":"The Family was deleted already","familyId":"${familyId}","deletedAt":"${deletedAt.toISOString()}"`);
    expect(await stateOf(familyId)).toEqual(deletedState(familyId));
    expect(await routing.directory("SELECT deleted_at FROM family WHERE family_id = $1", [familyId])).toEqual([{ deleted_at: deletedAt }]);
  });

  it("after a failure part-way leaves the Family marked deleted but not finished, until it is run again", async () => {
    const familyId = await createFamily();
    await routing.server(`ALTER ROLE ${routing.routingRole} NOCREATEROLE`);
    expect(await deleteFamily(familyId)).toMatchObject({ exitCode: 1 });

    expect(await stateOf(familyId)).toMatchObject({
      entry: { status: "deleted", wrapped_family_key: null, wrapped_database_password: null, deletion_finished: false },
      databases: 0,
      roles: 1,
      blobLocationExists: true,
    });
  });
});
