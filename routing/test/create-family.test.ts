import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";
import { openContext, type Context } from "./support/stand-in-core";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;
const EMAIL = "first.admin@example.org";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(email = EMAIL, args: string[] = [], env: Record<string, string> = {}) {
  const result = await routing.run(["create", "--admin-email", email, ...args], env);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  const familyId = ADDRESS.exec(result.stdout.trim())?.[1];
  expect(familyId, result.stdout).toBeDefined();
  return { ...result, familyId: familyId! };
}

/** The Contexts that arrived at the stand-in core for a Family, opened. */
const contextsOf = (familyId: string): Context[] =>
  routing.core.requests.flatMap(({ context }) => (context?.familyId === familyId ? [context] : []));

/** Connects to a database with the credentials a Context names. */
async function connect(database: Context["database"], name = database.name) {
  const client = new pg.Client({ host: database.host, port: database.port, user: database.user, password: database.password, database: name });
  await client.connect();
  return client;
}

/** What an Operator, a core and Postgres can see of a Family; the same after any run that ended well. */
async function stateOf(familyId: string) {
  const [entry] = await routing.directory(
    `SELECT status, core_version, blob_location, time_zone,
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
    admins: routing.core.admins(familyId),
  };
}

const expectedState = (familyId: string) => ({
  entry: {
    status: "active",
    core_version: "0.0.0-stand-in",
    blob_location: `/var/lib/family-agenda/blobs/${familyId}`,
    time_zone: "Europe/Berlin",
    has_family_key: true,
    has_database_password: true,
  },
  databases: [{ database: `family_${familyId.replaceAll("-", "")}`, owner: `family_${familyId.replaceAll("-", "")}` }],
  opensWithItsContext: true,
  families: 1,
  familyRoles: 1,
  prepared: true,
  admins: [EMAIL],
});

describe("Creating a Family", () => {
  it("prints the Family's address and leaves it active, prepared by the core, with its first Admin", async () => {
    const { stdout, familyId } = await createFamily(EMAIL);

    expect(stdout).toBe(`https://app.family-agenda.cloud/${familyId}/\n`);
    const [entry] = await routing.directory("SELECT status, core_version FROM family WHERE family_id = $1", [familyId]);
    expect(entry).toEqual({ status: "active", core_version: "0.0.0-stand-in" });
    const operations = routing.core.requests.map(({ method, path }) => `${method} ${path}`);
    expect(operations).toEqual(["POST /operations/prepare-family", "POST /operations/enter-admin"]);
    expect(routing.core.requests[1]?.body).toEqual({ email: EMAIL });
    expect(routing.core.admins(familyId)).toEqual([EMAIL]);
  });

  it("leaves the Family's own database, owned by its own role", async () => {
    const { familyId } = await createFamily();

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("hands the core a Context naming the Family's database, key, blob location, time zone and path prefix", async () => {
    const { familyId } = await createFamily(EMAIL, ["--time-zone", "America/New_York"], {
      FAMILY_DATABASE_HOST: "postgres",
      FAMILY_DATABASE_PORT: "6543",
    });

    const [prepare, enterAdmin] = contextsOf(familyId);
    const name = `family_${familyId.replaceAll("-", "")}`;
    expect(prepare).toMatchObject({
      familyId,
      database: { host: "postgres", port: 6543, name, user: name },
      blobLocation: `/var/lib/family-agenda/blobs/${familyId}`,
      timeZone: "America/New_York",
      publicUrl: `https://app.family-agenda.cloud/${familyId}`,
      pathPrefix: `/${familyId}`,
      identityProvider: null,
      identityProviderSignIn: "known-admins-only",
    });
    expect(Buffer.from(prepare!.familyKey, "base64")).toHaveLength(32);
    expect(enterAdmin).toMatchObject({ familyKey: prepare!.familyKey, database: prepare!.database });
    const [entry] = await routing.directory("SELECT time_zone FROM family WHERE family_id = $1", [familyId]);
    expect(entry).toEqual({ time_zone: "America/New_York" });
  });

  it("passes the Identity Provider's settings on in the Context, with sign-in for known Admins only", async () => {
    const { familyId } = await createFamily(EMAIL, [], {
      OIDC_ISSUER_URL: "https://auth.family-agenda.cloud",
      OIDC_CLIENT_ID: "family-agenda",
      OIDC_CLIENT_SECRET: "client-secret",
      OIDC_REQUIRED_GROUP: "family-agenda-admins",
    });

    expect(contextsOf(familyId)[0]).toMatchObject({
      identityProvider: {
        issuerUrl: "https://auth.family-agenda.cloud",
        clientId: "family-agenda",
        clientSecret: "client-secret",
        requiredGroup: "family-agenda-admins",
      },
      identityProviderSignIn: "known-admins-only",
    });
  });

  it("gives each Family a different key, and keys that are unique", async () => {
    const first = await createFamily();
    const second = await createFamily("second.admin@example.org");

    expect(first.familyId).not.toBe(second.familyId);
    expect(contextsOf(first.familyId)[0]!.familyKey).not.toBe(contextsOf(second.familyId)[0]!.familyKey);
    expect(routing.core.admins(second.familyId)).toEqual(["second.admin@example.org"]);
  });
});

describe("The Context", () => {
  it("cannot be read without the Context key and shows none of its secrets", async () => {
    const { familyId } = await createFamily();

    const [{ sealedContext }] = routing.core.requests as unknown as [{ sealedContext: string }];
    const [context] = contextsOf(familyId);
    await expect(openContext(sealedContext, randomBytes(32).toString("base64"))).rejects.toThrow();
    expect(sealedContext).not.toContain(context!.familyKey);
    expect(sealedContext).not.toContain(context!.database.password);
    expect(Buffer.from(sealedContext.split(".")[0]!, "base64url").toString()).toBe('{"alg":"dir","enc":"A256GCM"}');
  });

  it("is rejected after its short lifetime", async () => {
    const issuedBefore = Date.now();
    await createFamily();

    const [{ sealedContext }] = routing.core.requests as unknown as [{ sealedContext: string }];
    await expect(openContext(sealedContext, routing.env.CONTEXT_KEY!, new Date(issuedBefore + 30_000))).resolves.toBeDefined();
    await expect(openContext(sealedContext, routing.env.CONTEXT_KEY!, new Date(Date.now() + 61_000))).rejects.toThrow(/exp/);
  });
});

describe("Each Family's database", () => {
  it("opens with that Family's credentials only", async () => {
    const first = await createFamily();
    const second = await createFamily("second.admin@example.org");
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
    const failed = await routing.run(["create", "--admin-email", EMAIL]);
    expect(failed.exitCode, failed.stderr).toBe(1);
    expect(failed.stderr).toMatch(failure);
    expect(failed.stdout).toBe("");
    const familyId = familyIdIn(failed.stderr)!;
    expect(failed.stderr).toContain("--family-id");
    await mendIt();
    const again = await createFamily(EMAIL, ["--family-id", familyId]);
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
    const failed = await routing.run(["create", "--admin-email", EMAIL]);
    expect(failed.stderr).toMatch(/permission denied to create role/);
    await alterRole("CREATEROLE")();

    const resumed = await routing.run(["create", "--admin-email", EMAIL, "--family-id", familyIdIn(failed.stderr)!]);
    expect(resumed.exitCode).toBe(1);
    expect(resumed.stderr).toContain("run create without --family-id");
    const { familyId } = await createFamily();

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("with another time zone than the Family was begun with is refused", async () => {
    routing.core.failNext("enter-admin");
    const failed = await routing.run(["create", "--admin-email", EMAIL, "--time-zone", "Europe/Vienna"]);
    const familyId = familyIdIn(failed.stderr)!;

    const other = await routing.run(["create", "--admin-email", EMAIL, "--family-id", familyId, "--time-zone", "Europe/Berlin"]);
    expect(other.exitCode).toBe(1);
    expect(other.stderr).toContain("begun with the time zone Europe/Vienna, not Europe/Berlin");
    expect(routing.core.requests).toHaveLength(2);

    await createFamily(EMAIL, ["--family-id", familyId, "--time-zone", "Europe/Vienna"]);
    expect(await stateOf(familyId)).toMatchObject({ entry: { status: "active", time_zone: "Europe/Vienna" } });
  });

  it("without --family-id is refused while a Family is being prepared, and names it", async () => {
    routing.core.failNext("prepare-family");
    const familyId = familyIdIn((await routing.run(["create", "--admin-email", EMAIL])).stderr)!;
    const calls = routing.core.requests.length;

    const careless = await routing.run(["create", "--admin-email", EMAIL]);

    expect(careless.exitCode).toBe(1);
    expect(careless.stderr).toContain(`The Family ${familyId} is still being prepared; finish it first with create --family-id ${familyId}`);
    expect(routing.core.requests).toHaveLength(calls);
    expect((await routing.directory("SELECT family_id FROM family")).map(({ family_id }) => family_id)).toEqual([familyId]);
    await createFamily(EMAIL, ["--family-id", familyId]);
    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("with a Family id that create never began is refused, and creates nothing", async () => {
    const familyId = "0b6c3b0e-6a3a-4f7e-9d55-2f1f8d2c9a41";

    const result = await routing.run(["create", "--admin-email", EMAIL, "--family-id", familyId]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Nothing of the Family ${familyId} was created`);
    expect(routing.core.requests).toEqual([]);
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

  it("after the core failed to prepare the Family ends as an undisturbed run, with the same keys", async () => {
    const familyId = await failAndRunAgain(/answered prepare-family with 500/, () => {
      routing.core.failNext("prepare-family");
    });

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
    const keys = new Set(routing.core.requests.map(({ context }) => context?.familyKey));
    expect(keys.size).toBe(1);
  });

  it("after the core did not answer ends as an undisturbed run", async () => {
    const familyId = familyIdIn((await routing.run(["create", "--admin-email", EMAIL], { CORE_URLS: "http://127.0.0.1:9" })).stderr)!;
    await createFamily(EMAIL, ["--family-id", familyId]);

    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });

  it("after the core failed to enter the first Admin ends as an undisturbed run, with the same keys", async () => {
    const familyId = await failAndRunAgain(/answered enter-admin with 500/, () => {
      routing.core.failNext("enter-admin");
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

  it("for an active Family changes nothing and prints its address", async () => {
    const { familyId } = await createFamily();
    const calls = routing.core.requests.length;

    const again = await createFamily(EMAIL, ["--family-id", familyId]);

    expect(again.stdout).toBe(`https://app.family-agenda.cloud/${familyId}/\n`);
    expect(routing.core.requests).toHaveLength(calls);
    expect(await stateOf(familyId)).toEqual(expectedState(familyId));
  });
});

describe("Secrets", () => {
  it("are neither in the Directory's tables nor in the log, which names the Family by its Family id", async () => {
    routing.core.failNext("enter-admin");
    const failed = await routing.run(["create", "--admin-email", EMAIL]);
    const familyId = /"familyId":"([0-9a-f-]{36})"/.exec(failed.stderr)![1]!;
    await createFamily(EMAIL, ["--family-id", familyId]);

    const secrets = routing.core.requests.flatMap(({ sealedContext, context }) => [
      sealedContext!,
      context!.familyKey,
      Buffer.from(context!.familyKey, "base64").toString("hex"),
      context!.database.password,
    ]);
    const tables = await routing.directory(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const dump = (
      await Promise.all(tables.map(({ name }) => routing.directory(`SELECT row_to_json(t)::text AS row FROM "${String(name)}" t`)))
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
    const result = await routing.run(["create", "--admin-email", EMAIL], { [name]: undefined });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`${name} is not set`);
    expect(routing.core.requests).toEqual([]);
    expect(await routing.directory("SELECT to_regclass('family') IS NULL AS empty")).toEqual([{ empty: true }]);
  });

  it("are not taken from the command line or from the Directory's address", async () => {
    const asOption = await routing.run(["create", "--admin-email", EMAIL, "--operator-key", routing.env.OPERATOR_KEY!]);
    const url = new URL(routing.env.DIRECTORY_DATABASE_URL!);
    url.password = routing.env.DIRECTORY_DATABASE_PASSWORD!;
    const inUrl = await routing.run(["create", "--admin-email", EMAIL], { DIRECTORY_DATABASE_URL: url.toString() });

    expect(asOption.exitCode).toBe(2);
    expect(inUrl.exitCode).toBe(2);
    expect(inUrl.stderr).toContain("must not contain a password");
    expect(inUrl.stderr).not.toContain(routing.env.DIRECTORY_DATABASE_PASSWORD);
    expect(routing.core.requests).toEqual([]);
  });

  it("refuses a key that is not 32 bytes", async () => {
    const result = await routing.run(["create", "--admin-email", EMAIL], { CONTEXT_KEY: "c2hvcnQ=" });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("CONTEXT_KEY must be 32 bytes");
  });
});

describe("The command line", () => {
  it.each([
    [[], "No command given"],
    [["delete"], "Unknown command delete"],
    [["create"], "--admin-email"],
    [["create", "--admin-email", "nobody"], "--admin-email"],
    [["create", "--admin-email", EMAIL, "--time-zone", "Mars/Olympus"], "Unknown time zone"],
    [["create", "--admin-email", EMAIL, "--family-id", "family-1"], "--family-id needs a Family id"],
  ])("refuses %j and says how to use it", async (args, message) => {
    const result = await routing.run(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("Usage:");
    expect(routing.core.requests).toEqual([]);
  });

  it("refuses to create a Family again that is not being prepared", async () => {
    const { familyId } = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);

    const result = await routing.run(["create", "--admin-email", EMAIL, "--family-id", familyId]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("The Family is suspended");
  });
});
