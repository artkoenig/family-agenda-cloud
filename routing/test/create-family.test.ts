import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import { openContext, poolOf, startStandInCore, type Context, type StandInCore } from "./support/stand-in-core";

/** The core's triggered operations the Routing module called: its health checks aside. */
const triggered = () => routing.core.requests.filter(({ on }) => on === "trigger");

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const ORG = "org_first";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(organizationId = ORG, args: string[] = [], env: Record<string, string> = {}) {
  const result = await routing.run(["create", "--organization-id", organizationId, ...args], env);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  const familyId = ADDRESS.exec(result.stdout.trim())?.[1];
  expect(familyId, result.stdout).toBeDefined();
  return { ...result, familyId: familyId! };
}

/** The Contexts that arrived at the stand-in core for a Family, opened. */
const contextsOf = (familyId: string): Context[] =>
  triggered().flatMap(({ context }) => (context?.familyId === familyId ? [context] : []));

/** Connects to a database with the credentials a Context names. */
async function connect(database: Context["database"], name = database.name) {
  const client = new pg.Client({ host: database.host, port: database.port, user: database.user, password: database.password, database: name });
  await client.connect();
  return client;
}

/** What an Operator, a core and Postgres can see of a Family; the same after any run that ended well. */
async function stateOf(familyId: string) {
  const [entry] = await routing.directory(
    `SELECT status, blob_location, time_zone, organization_id,
            wrapped_family_key IS NOT NULL AS has_family_key, wrapped_database_password IS NOT NULL AS has_database_password
     FROM family WHERE family_id = $1`,
    [familyId],
  );
  const [context] = contextsOf(familyId).slice(-1);
  const databases = await routing.server(
    "SELECT d.datname AS database, r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = $1",
    [context?.database.name],
  );
  const client = context && (await connect(context.database));
  await client?.end();
  return {
    entry,
    databases,
    opensWithItsContext: Boolean(client),
    families: (await routing.directory("SELECT count(*)::int AS count FROM family"))[0]?.count,
    familyRoles: (
      await routing.server(
        `SELECT count(DISTINCT m.roleid)::int AS count FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = $1`,
        [routing.routingRole],
      )
    )[0]?.count,
    prepared: routing.core.isPrepared(familyId),
    organization: routing.core.organizationOf(familyId),
    schedules: await routing.schedules(familyId),
  };
}

const expectedState = (familyId: string) => ({
  entry: {
    status: "active",
    blob_location: `/var/lib/family-agenda/blobs/${familyId}`,
    time_zone: "Europe/Berlin",
    organization_id: ORG,
    has_family_key: true,
    has_database_password: true,
  },
  databases: [{ database: `family_${familyId.replaceAll("-", "")}`, owner: `family_${familyId.replaceAll("-", "")}` }],
  opensWithItsContext: true,
  families: 1,
  familyRoles: 1,
  prepared: true,
  organization: ORG,
  schedules: ["due-work", "purge-messages", "sweep-secrets"],
});

describe("Creating a Family", () => {
  it("prints the Family's address and leaves it active, opened by a core that recorded its Organization", async () => {
    const { stdout, familyId } = await createFamily(ORG);

    expect(stdout).toBe(`https://app.family-agenda.cloud/${familyId}/\n`);
    expect(await routing.directory("SELECT status, organization_id FROM family WHERE family_id = $1", [familyId])).toEqual([
      { status: "active", organization_id: ORG },
    ]);
    // No step of its own prepares the Family: the core does when it first opens it.
    const operations = triggered().map(({ method, path }) => `${method} ${path}`);
    expect(operations).toEqual(["POST /operations/secret-sweep"]);
    expect(routing.core.isPrepared(familyId)).toBe(true);
    expect(routing.core.organizationOf(familyId)).toBe(ORG);
  });

  it("leaves the Family's own database, owned by its own role", async () => {
    const { familyId } = await createFamily();

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("hands the core a Context naming the Family's database, key, blob location, time zone and path prefix", async () => {
    const { familyId } = await createFamily(ORG, ["--time-zone", "America/New_York"], {
      FAMILY_DATABASE_HOST: "postgres",
      FAMILY_DATABASE_PORT: "6543",
    });

    const [opening, ...more] = contextsOf(familyId);
    expect(more).toEqual([]);
    const name = `family_${familyId.replaceAll("-", "")}`;
    expect(opening).toMatchObject({
      familyId,
      organizationId: ORG,
      database: { host: "postgres", port: 6543, name, user: name },
      blobDirectory: "/var/lib/family-agenda/blobs",
      timeZone: "America/New_York",
      publicUrl: `https://app.family-agenda.cloud/${familyId}`,
    });
    expect(opening).not.toHaveProperty("identityProvider");
    expect(Buffer.from(opening!.familyKey, "base64url")).toHaveLength(32);
    const [entry] = await routing.directory("SELECT time_zone FROM family WHERE family_id = $1", [familyId]);
    expect(entry).toEqual({ time_zone: "America/New_York" });
  });

  it("ignores the OIDC_* variables, which only the cores take", async () => {
    const { familyId } = await createFamily(ORG, [], { OIDC_ISSUER_URL: "https://auth.family-agenda.cloud", OIDC_CLIENT_SECRET: "client-secret" });

    expect(contextsOf(familyId)[0]).not.toHaveProperty("identityProvider");
    expect(routing.log()).not.toContain("client-secret");
  });

  it("gives each Family a different key, and keys that are unique", async () => {
    const first = await createFamily();
    const second = await createFamily("org_second");

    expect(first.familyId).not.toBe(second.familyId);
    expect(contextsOf(first.familyId)[0]!.familyKey).not.toBe(contextsOf(second.familyId)[0]!.familyKey);
    expect(routing.core.organizationOf(second.familyId)).toBe("org_second");
  });
});

describe("Creating a Family while a core refuses to open it", () => {
  let other: StandInCore | undefined;
  afterEach(async () => {
    await other?.close();
    other = undefined;
  });

  it("has the next core of the pool open it", async () => {
    other = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    // The first core cannot reach the new Family's database yet.
    routing.core.refuseEveryFamily("unavailable");

    const { familyId } = await createFamily(ORG, [], poolOf(routing.core, other));

    expect(triggered().map(({ path }) => path)).toEqual(["/operations/secret-sweep"]);
    expect(other.requests.map(({ path }) => path)).toEqual(["/operations/secret-sweep"]);
    expect(other.organizationOf(familyId)).toBe(ORG);
    expect(await routing.directory("SELECT status FROM family WHERE family_id = $1", [familyId])).toEqual([{ status: "active" }]);
  });

  it("fails when every core refuses, saying what each answered, and is finished by running it again", async () => {
    other = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    routing.core.refuseEveryFamily("unavailable");
    other.refuseEveryFamily("migrating");

    const failed = await routing.run(["create", "--organization-id", ORG], poolOf(routing.core, other));

    expect(failed.exitCode).toBe(1);
    const hosts = [routing.core, other].map(({ triggerUrl }) => new URL(triggerUrl).host);
    expect(failed.stderr).toContain(`No core ran secret-sweep: ${hosts[0]} 503 unavailable, ${hosts[1]} 503 migrating`);
    const familyId = /"familyId":"([0-9a-f-]{36})"/.exec(failed.stderr)![1]!;
    routing.core.refuseEveryFamily(undefined);
    await createFamily(ORG, ["--family-id", familyId], poolOf(routing.core, other));
    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });
});

describe("The Context", () => {
  it("cannot be read without the Context key and shows none of its secrets", async () => {
    const { familyId } = await createFamily();

    const [{ sealedContext }] = triggered() as unknown as [{ sealedContext: string }];
    const [context] = contextsOf(familyId);
    expect(() => openContext(sealedContext, randomBytes(32).toString("base64"))).toThrow();
    expect(sealedContext).not.toContain(context!.familyKey);
    expect(sealedContext).not.toContain(context!.database.password);
    expect(sealedContext).toMatch(/^v1\./);
  });

  it("is rejected after its short lifetime", async () => {
    const issuedBefore = Date.now();
    await createFamily();

    const [{ sealedContext }] = triggered() as unknown as [{ sealedContext: string }];
    expect(() => openContext(sealedContext, routing.env.CONTEXT_KEY!, new Date(issuedBefore + 30_000))).not.toThrow();
    expect(() => openContext(sealedContext, routing.env.CONTEXT_KEY!, new Date(Date.now() + 91_000))).toThrow("expired");
  });
});

describe("Each Family's database", () => {
  it("opens with that Family's credentials only", async () => {
    const first = await createFamily();
    const second = await createFamily("org_second");
    const own = contextsOf(first.familyId)[0]!.database;
    const others = contextsOf(second.familyId)[0]!.database;

    const client = await connect(own);
    expect((await client.query("SELECT current_user AS role")).rows).toEqual([{ role: own.user }]);
    await client.end();
    await expect(connect(own, others.name)).rejects.toThrow(/permission denied/);
    await expect(connect({ ...others, password: own.password })).rejects.toThrow(/password authentication failed/);
  });

  it("does not open for the Routing module's own role", async () => {
    const { familyId } = await createFamily();
    const { host, port, name } = contextsOf(familyId)[0]!.database;
    const directory = new URL(routing.env.DIRECTORY_DATABASE_URL!);

    await expect(
      connect({ host, port, name, user: decodeURIComponent(directory.username), password: routing.env.DIRECTORY_DATABASE_PASSWORD! }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Running create again", () => {
  const familyIdIn = (log: string) => /"familyId":"([0-9a-f-]{36})"/.exec(log)?.[1];

  /**
   * Fails a run with `breakIt` at the step that logs `failure`, mends it with `mendIt`, and runs
   * create again with the Family id the failed run logged.
   */
  async function failAndRunAgain(failure: RegExp, breakIt: () => Promise<void> | void, mendIt: () => Promise<void> | void = () => undefined) {
    await breakIt();
    const failed = await routing.run(["create", "--organization-id", ORG]);
    expect(failed.exitCode, failed.stderr).toBe(1);
    expect(failed.stderr).toMatch(failure);
    expect(failed.stdout).toBe("");
    const familyId = familyIdIn(failed.stderr)!;
    expect(failed.stderr).toContain("--family-id");
    await mendIt();
    const again = await createFamily(ORG, ["--family-id", familyId]);
    expect(again.familyId).toBe(familyId);
    return familyId;
  }

  /** Brings the Directory's tables into being, as the deploy does before any Family is created. */
  async function migrateDirectory() {
    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0, stdout: "" });
  }

  const revoke = (privilege: string) => async () => {
    await routing.directory(`REVOKE ${privilege} ON family FROM ${routing.routingRole}`);
  };
  const grant = (privilege: string) => async () => {
    await routing.directory(`GRANT ${privilege} ON family TO ${routing.routingRole}`);
  };
  const alterRole = (option: string) => async () => {
    await routing.server(`ALTER ROLE ${routing.routingRole} ${option}`);
  };

  it("after the role could not be created, with nothing left to finish, ends as an undisturbed run", async () => {
    await alterRole("NOCREATEROLE")();
    const failed = await routing.run(["create", "--organization-id", ORG]);
    expect(failed.stderr).toMatch(/permission denied to create role/);
    await alterRole("CREATEROLE")();

    const resumed = await routing.run(["create", "--organization-id", ORG, "--family-id", familyIdIn(failed.stderr)!]);
    expect(resumed.exitCode).toBe(1);
    expect(resumed.stderr).toContain("run create without --family-id");
    const { familyId } = await createFamily();

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("with another time zone than the Family was begun with is refused", async () => {
    routing.core.failNext("secret-sweep");
    const failed = await routing.run(["create", "--organization-id", ORG, "--time-zone", "Europe/Vienna"]);
    const familyId = familyIdIn(failed.stderr)!;

    const other = await routing.run(["create", "--organization-id", ORG, "--family-id", familyId, "--time-zone", "Europe/Berlin"]);
    expect(other.exitCode).toBe(1);
    expect(other.stderr).toContain("begun with the time zone Europe/Vienna, not Europe/Berlin");
    expect(triggered()).toHaveLength(1);

    await createFamily(ORG, ["--family-id", familyId, "--time-zone", "Europe/Vienna"]);
    expect(await stateOf(familyId)).toMatchObject({ entry: { status: "active", time_zone: "Europe/Vienna" } });
  });

  it("without --family-id is refused while a Family is being prepared, and names it", async () => {
    routing.core.failNext("secret-sweep");
    const familyId = familyIdIn((await routing.run(["create", "--organization-id", ORG])).stderr)!;
    const calls = triggered().length;

    const careless = await routing.run(["create", "--organization-id", ORG]);

    expect(careless.exitCode).toBe(1);
    expect(careless.stderr).toContain(`The Family ${familyId} is still being prepared; finish it first with create --family-id ${familyId}`);
    expect(triggered()).toHaveLength(calls);
    expect((await routing.directory("SELECT family_id FROM family")).map(({ family_id }) => family_id)).toEqual([familyId]);
    await createFamily(ORG, ["--family-id", familyId]);
    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("with a Family id that create never began is refused, and creates nothing", async () => {
    const familyId = "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41";

    const result = await routing.run(["create", "--organization-id", ORG, "--family-id", familyId]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Nothing of the Family ${familyId} was created`);
    expect(triggered()).toEqual([]);
    expect(await routing.directory("SELECT count(*)::int AS count FROM family")).toEqual([{ count: 0 }]);
    expect(await routing.server("SELECT count(*)::int AS count FROM pg_roles WHERE rolname = $1", [`family_${familyId.replaceAll("-", "")}`])).toEqual([
      { count: 0 },
    ]);
  });

  it("after the database could not be created ends as an undisturbed run", async () => {
    const familyId = await failAndRunAgain(/permission denied to create database/, alterRole("NOCREATEDB"), alterRole("CREATEDB"));

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("after the Directory entry could not be written ends as an undisturbed run", async () => {
    await migrateDirectory();
    const familyId = await failAndRunAgain(/permission denied for table family/, revoke("INSERT"), grant("INSERT"));

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("after the core did not answer ends as an undisturbed run", async () => {
    const familyId = familyIdIn((await routing.run(["create", "--organization-id", ORG], { CORE_URL: "http://127.0.0.1:9", CORE_TRIGGER_URL: "http://127.0.0.1:9" })).stderr)!;
    await createFamily(ORG, ["--family-id", familyId]);

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("after the core failed to open the Family ends as an undisturbed run, with the same keys", async () => {
    const familyId = await failAndRunAgain(/answered secret-sweep with 500/, () => {
      routing.core.failNext("secret-sweep");
    });

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
    const contexts = contextsOf(familyId);
    expect(new Set(contexts.map(({ familyKey }) => familyKey)).size).toBe(1);
    expect(new Set(contexts.map(({ database }) => database.password)).size).toBe(1);
  });

  it("after the Family could not be marked active ends as an undisturbed run", async () => {
    await migrateDirectory();
    const familyId = await failAndRunAgain(/permission denied for table family/, revoke("UPDATE"), grant("UPDATE"));

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("with another Organization than the Family was begun with is refused", async () => {
    routing.core.failNext("secret-sweep");
    const familyId = familyIdIn((await routing.run(["create", "--organization-id", ORG])).stderr)!;
    const calls = triggered().length;

    const other = await routing.run(["create", "--organization-id", "org_other", "--family-id", familyId]);

    expect(other.exitCode).toBe(1);
    expect(other.stderr).toContain(`The Family ${familyId} belongs to the Organization ${ORG}, not org_other`);
    expect(triggered()).toHaveLength(calls);
  });

  it("fails, without trying another core, when the core holds another Organization for the Family", async () => {
    // As if the Family's database had been opened for another Organization before.
    routing.core.failNext("secret-sweep");
    const familyId = familyIdIn((await routing.run(["create", "--organization-id", "org_other"])).stderr)!;
    await createFamily("org_other", ["--family-id", familyId]);
    await routing.directory("UPDATE family SET status = 'being_prepared', organization_id = $2 WHERE family_id = $1", [familyId, ORG]);
    const calls = triggered().length;

    const refused = await routing.run(["create", "--organization-id", ORG, "--family-id", familyId]);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("answered secret-sweep with 403 organization-id-differs");
    expect(triggered()).toHaveLength(calls + 1);
  });

  it("for an active Family changes nothing and prints its address", async () => {
    const { familyId } = await createFamily();
    const calls = triggered().length;

    const again = await createFamily(ORG, ["--family-id", familyId]);

    expect(again.stdout).toBe(`https://app.family-agenda.cloud/${familyId}/\n`);
    expect(triggered()).toHaveLength(calls);
    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });
});

describe("Secrets", () => {
  it("are neither in the Directory's tables nor in the log, which names the Family by its Family id", async () => {
    routing.core.failNext("secret-sweep");
    const failed = await routing.run(["create", "--organization-id", ORG]);
    const familyId = /"familyId":"([0-9a-f-]{36})"/.exec(failed.stderr)![1]!;
    await createFamily(ORG, ["--family-id", familyId]);

    const secrets = triggered().flatMap(({ sealedContext, context }) => [
      sealedContext!,
      context!.familyKey,
      Buffer.from(context!.familyKey, "base64").toString("hex"),
      context!.database.password,
    ]);
    const tables = await routing.directory(
      "SELECT table_schema AS schema, table_name AS name FROM information_schema.tables WHERE table_schema IN ('public', 'scheduler')",
    );
    const dump = (
      await Promise.all(
        tables.map(({ schema, name }) => routing.directory(`SELECT row_to_json(t)::text AS row FROM "${String(schema)}"."${String(name)}" t`)),
      )
    )
      .flat()
      .map(({ row }) => String(row))
      .join("\n");
    expect(dump).toContain(familyId);
    expect(routing.log()).toContain(`"familyId":"${familyId}"`);
    for (const secret of [...secrets, routing.env.OPERATOR_KEY!, routing.env.CONTEXT_KEY!, routing.env.DIRECTORY_DATABASE_PASSWORD!]) {
      expect(dump).not.toContain(secret);
      expect(routing.log()).not.toContain(secret);
    }
  });

  it.each(["OPERATOR_KEY", "CONTEXT_KEY", "DIRECTORY_DATABASE_PASSWORD"])("come from the environment only: without %s nothing is created", async (name) => {
    const result = await routing.run(["create", "--organization-id", ORG], { [name]: undefined });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`${name} is not set`);
    expect(triggered()).toEqual([]);
    expect(await routing.directory("SELECT to_regclass('family') IS NULL AS empty")).toEqual([{ empty: true }]);
  });

  it("are not taken from the command line or from the Directory's address", async () => {
    const asOption = await routing.run(["create", "--organization-id", ORG, "--operator-key", routing.env.OPERATOR_KEY!]);
    const url = new URL(routing.env.DIRECTORY_DATABASE_URL!);
    url.password = routing.env.DIRECTORY_DATABASE_PASSWORD!;
    const inUrl = await routing.run(["create", "--organization-id", ORG], { DIRECTORY_DATABASE_URL: url.toString() });

    expect(asOption.exitCode).toBe(2);
    expect(inUrl.exitCode).toBe(2);
    expect(inUrl.stderr).toContain("must not contain a password");
    expect(inUrl.stderr).not.toContain(routing.env.DIRECTORY_DATABASE_PASSWORD);
    expect(triggered()).toEqual([]);
  });

  it("refuses a key that is not 32 bytes", async () => {
    const result = await routing.run(["create", "--organization-id", ORG], { CONTEXT_KEY: "c2hvcnQ=" });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("CONTEXT_KEY must be 32 characters or more");
  });
});

describe("The command line", () => {
  it.each([
    [[], "No command given"],
    [["destroy"], "Unknown command destroy"],
    [["create"], "--organization-id"],
    [["create", "--organization-id", "org/1"], "--organization-id"],
    [["create", "--organization-id", ORG, "--time-zone", "Mars/Olympus"], "Unknown time zone"],
    [["create", "--organization-id", ORG, "--family-id", "family-1"], "--family-id needs a Family id"],
  ])("refuses %j and says how to use it", async (args, message) => {
    const result = await routing.run(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("Usage:");
    expect(triggered()).toEqual([]);
  });

  it("refuses to create a Family again that is not being prepared", async () => {
    const { familyId } = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);

    const result = await routing.run(["create", "--organization-id", ORG, "--family-id", familyId]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("The Family is suspended");
  });
});
