import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import pg from "pg";
import { inject } from "vitest";
import { run } from "../../src/cli";
import { readConfig } from "../../src/config";
import { createLog } from "../../src/log";
import { startRouter, type Router } from "../../src/router";
import { startStandInCore, type StandInCore } from "./stand-in-core";

export type RunResult = { exitCode: number; stdout: string; stderr: string };

export type TestRouting = {
  /** The environment the Routing module runs with: its Directory, keys and the stand-in core. */
  env: Record<string, string>;
  core: StandInCore;
  /** Runs the Routing module's command line with these arguments, as the Operator would. */
  run(args: string[], env?: Record<string, string | undefined>): Promise<RunResult>;
  /**
   * Starts the Router as `routing serve` would, on a free port of localhost, with these changes to
   * the environment. It logs into the same log as the command line and is stopped by close().
   */
  startRouter(env?: Record<string, string | undefined>): Promise<Router>;
  /** Everything the Routing module logged so far, over all runs and Routers. */
  log(): string;
  /** Runs SQL as a superuser on the Directory's database. */
  directory(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs SQL as a superuser on the server's maintenance database. */
  server(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  /** The role the Routing module opens the Directory with. */
  routingRole: string;
  close(): Promise<void>;
};

const key = () => randomBytes(32).toString("base64");

/**
 * Sets up a Routing module as the Cube would run it, on the test's Postgres server: a Directory
 * database of its own, owned by a role that may create roles and databases but is no superuser,
 * and a stand-in core.
 */
export async function setUpRouting(): Promise<TestRouting> {
  const superuserUrl = new URL(inject("postgresUrl"));
  const suffix = randomBytes(6).toString("hex");
  const routingRole = `routing_${suffix}`;
  const directoryName = `directory_${suffix}`;
  const directoryPassword = randomBytes(18).toString("base64url");

  const query = async (database: string, sql: string, values?: unknown[]) => {
    const url = new URL(superuserUrl);
    url.pathname = `/${database}`;
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      return (await client.query<Record<string, unknown>>(sql, values)).rows;
    } finally {
      await client.end();
    }
  };
  const maintenance = superuserUrl.pathname.slice(1) || "postgres";
  await query(maintenance, `CREATE ROLE ${routingRole} LOGIN CREATEDB CREATEROLE PASSWORD '${directoryPassword}'`);
  await query(maintenance, `CREATE DATABASE ${directoryName} OWNER ${routingRole}`);

  const contextKey = key();
  const core = await startStandInCore(contextKey);
  const directoryUrl = new URL(superuserUrl);
  directoryUrl.username = routingRole;
  directoryUrl.password = "";
  directoryUrl.pathname = `/${directoryName}`;
  const env: Record<string, string> = {
    DIRECTORY_DATABASE_URL: directoryUrl.toString(),
    DIRECTORY_DATABASE_PASSWORD: directoryPassword,
    OPERATOR_KEY: key(),
    CONTEXT_KEY: contextKey,
    CORE_URLS: core.url,
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
  const routing: TestRouting = {
    env,
    core,
    routingRole,
    async run(args, overrides = {}) {
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
        stdout: sink((text) => (stdout += text)),
        stderr: sink((text) => {
          stderr += text;
          logged += text;
        }),
      });
      return { exitCode, stdout, stderr };
    },
    async startRouter(overrides = {}) {
      const router = await startRouter(readConfig({ ...withOverrides(overrides), PORT: "0", LISTEN_HOST: "127.0.0.1" }), createLog(logSink()));
      routers.push(router);
      return router;
    },
    log: () => logged,
    directory: (sql, values) => query(directoryName, sql, values),
    server: (sql, values) => query(maintenance, sql, values),
    async close() {
      for (const router of routers) await router.close();
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
      for (const name of [directoryName, ...databases.map(({ datname }) => String(datname))]) {
        await query(maintenance, `DROP DATABASE IF EXISTS "${name}"`);
      }
      for (const { rolname } of roles) await query(maintenance, `DROP ROLE IF EXISTS "${String(rolname)}"`);
      await query(maintenance, `DROP ROLE IF EXISTS ${routingRole}`);
    },
  };
  return routing;
}
