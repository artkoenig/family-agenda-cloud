import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import net, { type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject, vi } from "vitest";

/**
 * The Cube's logto-log-retention service (cube/compose.yaml), which deletes Logto's sign-in log older
 * than 30 days (#235): its script run once, as it runs each day, as the role that owns Logto's tables,
 * on a database with Logto 1.46.0's `logs` table and the row level security Logto guards it with.
 */
const script = fileURLToPath(new URL("../../cube/logto-log-retention.sh", import.meta.url));
const sql = fileURLToPath(new URL("../../cube/logto-log-retention.sql", import.meta.url));

const superuserUrl = new URL(inject("postgresUrl"));
const name = `logto_${inject("runId")}_${randomBytes(4).toString("hex")}`;
const password = randomBytes(16).toString("hex");

async function query(database: string, statement: string, user = superuserUrl.username, secret = decodeURIComponent(superuserUrl.password)) {
  const url = new URL(superuserUrl);
  url.pathname = `/${database}`;
  url.username = user;
  url.password = secret;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return (await client.query<Record<string, unknown>>(statement)).rows;
  } finally {
    await client.end();
  }
}

/** As Logto's role, which owns its tables, as `db seed` makes them. */
const asLogto = (statement: string) => query(name, statement, name, password);

// From Logto 1.46.0: packages/schemas/tables/logs.sql, and the policies of _after_each.sql.
const LOGTO_SCHEMA = `
  CREATE TABLE tenants (id varchar(21) NOT NULL PRIMARY KEY, db_user varchar(128));
  CREATE TABLE logs (
    tenant_id varchar(21) NOT NULL REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE CASCADE,
    id varchar(21) NOT NULL,
    key varchar(128) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT (now()),
    payload_user_id varchar(128),
    payload_application_id text,
    payload_hook_id varchar(21),
    PRIMARY KEY (id)
  );
  CREATE INDEX logs__created_at_id ON logs (tenant_id, created_at, id);
  ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY logs_tenant_id ON logs AS RESTRICTIVE USING (tenant_id = (SELECT id FROM tenants WHERE db_user = current_user));
  CREATE POLICY logs_modification ON logs USING (true);
  INSERT INTO tenants (id, db_user) VALUES ('default', 'logto_tenant_logto'), ('admin', 'logto_tenant_logto_admin');
`;

type Run = { exitCode: number; stdout: string; lines: Record<string, unknown>[] };

/** The connection, as libpq's PG* variables name it. */
const environment = (database = name, user = name) => ({
  PATH: process.env.PATH ?? "",
  PGHOST: superuserUrl.hostname,
  PGPORT: superuserUrl.port || "5432",
  PGUSER: user,
  PGPASSWORD: password,
  PGDATABASE: database,
  LOGTO_LOG_RETENTION_SQL: sql,
});

/** Runs the service's script once. */
async function runOnce(database = name, user = name): Promise<Run> {
  const env = environment(database, user);
  const { exitCode, stdout } = await promisify(execFile)("bash", [script, "--once"], { env }).then(
    ({ stdout }) => ({ exitCode: 0, stdout }),
    (error: unknown) => {
      const { code, stdout } = error as { code: number; stdout: string };
      return { exitCode: code, stdout };
    },
  );
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { exitCode, stdout, lines };
}

async function listen(server: net.Server, port = 0): Promise<number> {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  const port = await listen(server);
  server.close();
  await once(server, "close");
  return port;
}

/** Runs the service's script as the service does, with Postgres on a port of this host. */
function startService(port: number, wait: number) {
  // In a process group of its own, as the script's `sleep` outlives it outside of a container.
  const child = spawn("bash", [script], {
    env: { ...environment(), PGHOST: "127.0.0.1", PGPORT: String(port), LOGTO_LOG_RETENTION_WAIT: String(wait) },
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  const exited = once(child, "exit") as Promise<[number | null]>;
  return {
    stdout: () => stdout,
    firstLine: () =>
      vi.waitFor(() => JSON.parse(stdout.slice(0, stdout.indexOf("\n") + 1)) as Record<string, unknown>, { timeout: 10_000, interval: 50 }),
    terminate: async () => {
      child.kill("SIGTERM");
      return (await exited)[0];
    },
    cleanUp: () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Every process of the group has ended.
      }
    },
  };
}

const remaining = async () => (await query(name, "SELECT id FROM logs ORDER BY id")).map(({ id }) => id);

beforeAll(async () => {
  await query(superuserUrl.pathname.slice(1) || "postgres", `CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
  await query(superuserUrl.pathname.slice(1) || "postgres", `CREATE DATABASE ${name} OWNER ${name}`);
  await asLogto(LOGTO_SCHEMA);
});
afterAll(async () => {
  const maintenance = superuserUrl.pathname.slice(1) || "postgres";
  await query(maintenance, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await query(maintenance, `DROP ROLE IF EXISTS ${name}`);
});
beforeEach(async () => {
  await asLogto("DELETE FROM logs");
  await asLogto(`
    INSERT INTO logs (tenant_id, id, key, payload, created_at) VALUES
      ('default', 'sign-in-31-days', 'Interaction.SignIn.Submit', '{"ip": "203.0.113.7", "userAgent": "Firefox"}', now() - interval '31 days'),
      ('default', 'hook-31-days', 'TriggerHook.PostRegister', '{"hookId": "hook"}', now() - interval '31 days'),
      ('admin', 'console-31-days', 'ExchangeTokenBy.AuthorizationCode', '{"ip": "203.0.113.8"}', now() - interval '31 days'),
      ('default', 'sign-in-29-days', 'Interaction.SignIn.Submit', '{"ip": "203.0.113.9"}', now() - interval '29 days'),
      ('default', 'hook-29-days', 'TriggerHook.PostRegister', '{"hookId": "hook"}', now() - interval '29 days'),
      ('default', 'sign-in-today', 'Interaction.SignIn.Submit', '{"ip": "203.0.113.10"}', now())
  `);
});

describe("Deleting Logto's sign-in log after 30 days", () => {
  it("deletes the rows of 31 days ago, of every tenant and the webhook deliveries too, and keeps those of 29 days ago", async () => {
    const run = await runOnce();

    expect(run.exitCode).toBe(0);
    expect(run.lines).toEqual([{ time: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/) as unknown, level: "info", message: "Deleted Logto's sign-in log older than 30 days", deleted: 3 }]);
    expect(await remaining()).toEqual(["hook-29-days", "sign-in-29-days", "sign-in-today"]);
  });

  it("changes nothing more when it runs a second time", async () => {
    await runOnce();

    const second = await runOnce();

    expect(second.exitCode).toBe(0);
    expect(second.lines).toMatchObject([{ level: "info", deleted: 0 }]);
    expect(await remaining()).toEqual(["hook-29-days", "sign-in-29-days", "sign-in-today"]);
  });

  it("logs a failed run as one line of level error, and exits with an error", async () => {
    // A database without Logto's tables, as after a Logto upgrade that renamed `logs`.
    await query(name, "ALTER TABLE logs RENAME TO audit_logs");
    try {
      const run = await runOnce();

      expect(run.exitCode).not.toBe(0);
      expect(run.lines).toEqual([
        {
          time: expect.any(String) as unknown,
          level: "error",
          message: "Could not delete Logto's sign-in log older than 30 days",
          error: expect.stringContaining('relation "logs" does not exist') as unknown,
        },
      ]);
    } finally {
      await query(name, "ALTER TABLE audit_logs RENAME TO logs");
    }
    expect(await remaining()).toHaveLength(6);
  });

  it("logs a connection that fails as a line of level error too", async () => {
    const run = await runOnce(name, `${name}_unknown`);

    expect(run.exitCode).not.toBe(0);
    expect(run.lines).toMatchObject([{ level: "error", error: expect.stringContaining(`${name}_unknown`) as unknown }]);
  });
});

describe("The service's start, as after a reboot of the host, which starts Postgres at the same time", () => {
  it("waits for Postgres and logs no error until it is there", async () => {
    const port = await unusedPort();
    const service = startService(port, 60);
    const proxy = net.createServer((socket) => {
      const upstream = net.connect(Number(superuserUrl.port || "5432"), superuserUrl.hostname);
      socket.on("error", () => upstream.destroy()).pipe(upstream);
      upstream.on("error", () => socket.destroy()).pipe(socket);
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(service.stdout()).toBe("");
      await listen(proxy, port);

      expect(await service.firstLine()).toMatchObject({ level: "info", deleted: 3 });
    } finally {
      service.cleanUp();
      proxy.close();
    }
  }, 20_000);

  it("logs an error when Postgres stays away", async () => {
    const service = startService(await unusedPort(), 1);
    try {
      expect(await service.firstLine()).toMatchObject({ level: "error", error: expect.stringContaining("failed") as unknown });
    } finally {
      service.cleanUp();
    }
  }, 20_000);

  it("ends on TERM while it waits", async () => {
    const service = startService(await unusedPort(), 60);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(await service.terminate()).toBe(0);
      expect(service.stdout()).toBe("");
    } finally {
      service.cleanUp();
    }
  }, 20_000);
});
