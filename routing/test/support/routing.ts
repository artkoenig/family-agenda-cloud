import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import pg from "pg";
import { afterAll, inject } from "vitest";
import type { TestClock } from "pg-boss";
import { run } from "../../src/cli";
import { readConfig } from "../../src/config";
import { createLog } from "../../src/log";
import { startRouter, type Router } from "../../src/router";
import { SCHEDULER_RUNNING } from "../../src/scheduler";
import { poolOf, resolveStandIns, startStandInCore, type StandInCore } from "./stand-in-core";

export type RunResult = { exitCode: number; stdout: string; stderr: string };

/** How a command runs that runs until stopped: on a clock the test moves, until `until` settles. */
export type RunOptions = { clock?: TestClock; until?: Promise<unknown> };

export type TestRouting = {
  /** The environment the Routing module runs with: its Directory, keys and the stand-in core. */
  env: Record<string, string>;
  core: StandInCore;
  /** Runs the Routing module's command line with these arguments, as the Operator would. */
  run(args: string[], env?: Record<string, string | undefined>, options?: RunOptions): Promise<RunResult>;
  /**
   * Starts the Router as `routing serve` would, on a free port of localhost, with these changes to
   * the environment. It logs into the same log as the command line and is stopped by close().
   */
  startRouter(env?: Record<string, string | undefined>): Promise<Router>;
  /**
   * Starts the Scheduler, as `routing schedule` on the Cube, on a clock the test moves; answers
   * once it is under way, with these changes to the environment. close() stops it.
   */
  startScheduler(clock: TestClock, env?: Record<string, string | undefined>): Promise<void>;
  /** The names of the Family's schedules, as pg-boss keeps them in the Directory's database. */
  schedules(familyId: string): Promise<string[]>;
  /** Everything the Routing module logged so far, over all runs, Routers and Schedulers. */
  log(): string;
  /** Runs SQL as a superuser on the Directory's database. */
  directory(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs SQL as a superuser on the server's maintenance database. */
  server(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs SQL as a superuser on the Family's own database, as the Directory names it. */
  family(familyId: string, sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  /** The role the Routing module opens the Directory with. */
  routingRole: string;
  close(): Promise<void>;
};

const key = () => randomBytes(32).toString("base64");

type Server = {
  superuserUrl: URL;
  maintenance: string;
  query: (database: string, sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
};

function serverOf(superuserUrl: URL): Server {
  return {
    superuserUrl,
    maintenance: superuserUrl.pathname.slice(1) || "postgres",
    query: async (database, sql, values) => {
      const url = new URL(superuserUrl);
      url.pathname = `/${database}`;
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      try {
        return (await client.query<Record<string, unknown>>(sql, values)).rows;
      } finally {
        await client.end();
      }
    },
  };
}

type Directory = { routingRole: string; directoryName: string; directoryPassword: string };

/**
 * The routing role and the Directory's database, made once per test file and worker: creating and
 * dropping a database costs Postgres a checkpoint, and mutation testing runs each test thousands of
 * times. Between tests, close() empties the Directory instead, and after the file's last test it is
 * dropped. The globalSetup's teardown drops whatever a killed worker left behind; the names carry its
 * run id, so that runs side by side keep apart.
 */
let shared: Promise<Directory> | undefined;

function sharedDirectory(server: Server): Promise<Directory> {
  shared ??= (async () => {
    const suffix = `${inject("runId")}_${randomBytes(4).toString("hex")}`;
    const directory = {
      routingRole: `routing_${suffix}`,
      directoryName: `directory_${suffix}`,
      directoryPassword: randomBytes(18).toString("base64url"),
    };
    await server.query(server.maintenance, `CREATE ROLE ${directory.routingRole} LOGIN CREATEDB CREATEROLE PASSWORD '${directory.directoryPassword}'`);
    await server.query(server.maintenance, `CREATE DATABASE ${directory.directoryName} OWNER ${directory.routingRole}`);
    return directory;
  })();
  return shared;
}

afterAll(async () => {
  if (!shared) return;
  const { routingRole, directoryName } = await shared;
  shared = undefined;
  const server = serverOf(new URL(inject("postgresUrl")));
  await server.query(server.maintenance, `DROP DATABASE IF EXISTS ${directoryName} WITH (FORCE)`);
  await server.query(server.maintenance, `DROP ROLE IF EXISTS ${routingRole}`);
});

/**
 * Sets up a Routing module as the Cube would run it, on the test's Postgres server: a Directory
 * database of its own, owned by a role that may create roles and databases but is no superuser,
 * and a stand-in core. The Directory is empty at the start of every test.
 */
export async function setUpRouting(): Promise<TestRouting> {
  const server = serverOf(new URL(inject("postgresUrl")));
  const { superuserUrl, maintenance, query } = server;
  const { routingRole, directoryName, directoryPassword } = await sharedDirectory(server);

  const contextKey = key();
  const triggerToken = key();
  const core = await startStandInCore(contextKey, triggerToken);
  const directoryUrl = new URL(superuserUrl);
  directoryUrl.username = routingRole;
  directoryUrl.password = "";
  directoryUrl.pathname = `/${directoryName}`;
  const env: Record<string, string> = {
    DIRECTORY_DATABASE_URL: directoryUrl.toString(),
    DIRECTORY_DATABASE_PASSWORD: directoryPassword,
    OPERATOR_KEY: key(),
    CONTEXT_KEY: contextKey,
    TRIGGER_TOKEN: triggerToken,
    ...poolOf(core),
    BLOB_ROOT: "/var/lib/family-agenda/blobs",
  };

  let logged = "";
  const logSink = () =>
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        logged += chunk.toString();
        done();
      },
    });
  const routers: Router[] = [];
  const withOverrides = (overrides: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries({ ...env, ...overrides }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const schedulers: (() => Promise<void>)[] = [];
  let onLog = () => {};
  const routing: TestRouting = {
    env,
    core,
    routingRole,
    async run(args, overrides = {}, options = {}) {
      let stdout = "";
      let stderr = "";
      const sink = (append: (text: string) => void) =>
        new Writable({
          write(chunk: Buffer, _encoding, done) {
            append(chunk.toString());
            done();
          },
        });
      const exitCode = await run(args, {
        env: withOverrides(overrides),
        resolve: resolveStandIns,
        ...options,
        stdout: sink((text) => (stdout += text)),
        stderr: sink((text) => {
          stderr += text;
          logged += text;
          onLog();
        }),
      });
      return { exitCode, stdout, stderr };
    },
    async startRouter(overrides = {}) {
      const router = await startRouter(readConfig({ ...withOverrides(overrides), PORT: "0", LISTEN_HOST: "127.0.0.1" }), createLog(logSink()), resolveStandIns);
      routers.push(router);
      return router;
    },
    async startScheduler(clock, overrides = {}) {
      let stopped = () => {};
      const stopping = new Promise<void>((resolve) => {
        stopped = resolve;
      });
      const before = logged.length;
      let running: Promise<RunResult> | undefined;
      // Under way once it says so, or over if it ended before.
      await new Promise<void>((resolve) => {
        onLog = () => {
          if (logged.slice(before).includes(`"message":"${SCHEDULER_RUNNING}"`)) resolve();
        };
        running = routing.run(["schedule"], overrides, { clock, until: stopping });
        void running.then(() => {
          resolve();
        });
      });
      onLog = () => {};
      const result = running!;
      schedulers.push(async () => {
        stopped();
        await result;
      });
    },
    async schedules(familyId) {
      const rows = await query(directoryName, "SELECT name FROM scheduler.schedule WHERE key = $1 ORDER BY name", [familyId]);
      return rows.map(({ name }) => String(name));
    },
    log: () => logged,
    directory: (sql, values) => query(directoryName, sql, values),
    server: (sql, values) => query(maintenance, sql, values),
    async family(familyId, sql, values) {
      const [row] = await query(directoryName, "SELECT database_name FROM family WHERE family_id = $1", [familyId]);
      if (!row) throw new Error(`The Directory has no Family ${familyId}`);
      return query(String(row.database_name), sql, values);
    },
    async close() {
      for (const router of routers) await router.close();
      // A run held under way would keep its Scheduler from stopping.
      core.releaseAll();
      await Promise.all(schedulers.map((stop) => stop()));
      await core.close();
      // The Families' roles, which the Routing module created and so was made a member of, and
      // the databases they own.
      const roles = await query(
        maintenance,
        `SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member
         WHERE u.rolname = $1`,
        [routingRole],
      );
      const databases = await query(
        maintenance,
        "SELECT datname FROM pg_database WHERE datdba IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1))",
        [roles.map(({ rolname }) => rolname)],
      );
      for (const { datname } of databases) await query(maintenance, `DROP DATABASE IF EXISTS "${String(datname)}" WITH (FORCE)`);
      for (const { rolname } of roles) await query(maintenance, `DROP ROLE IF EXISTS "${String(rolname)}"`);
      // Empties the Directory for the next test: everything the Routing module made in it is its role's.
      await query(directoryName, `DROP OWNED BY ${routingRole}`);
      // A test may have changed the role, and may have failed before changing it back.
      await query(maintenance, `ALTER ROLE ${routingRole} LOGIN CREATEDB CREATEROLE PASSWORD '${directoryPassword}'`);
    },
  };
  return routing;
}
