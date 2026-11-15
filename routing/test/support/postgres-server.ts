import { randomBytes } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** A superuser's address of the Postgres server the tests create Directories, Families and roles on. */
    postgresUrl: string;
    /** Names this run's Directories and roles, so that its teardown drops those and no other run's. */
    runId: string;
  }
}

/**
 * The tests run against a real Postgres server (16 or later), named by TEST_DATABASE_URL with a
 * superuser's credentials, such as the `postgres` service of CI. Each test file makes a Directory and
 * a role for the Routing module of its own on it; each test removes the Families it made.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a Postgres 16+ server with a superuser, for example: " +
        "docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17 and " +
        "TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres",
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ superuser: boolean }>("SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user");
    if (!rows[0]?.superuser) throw new Error("TEST_DATABASE_URL must name a superuser");
  } finally {
    await client.end();
  }
  project.provide("postgresUrl", url);
  const runId = randomBytes(4).toString("hex");
  project.provide("runId", runId);

  // The tests share a Directory and its role per file (see setUpRouting); this drops them at the end.
  return async () => {
    const cleanup = new pg.Client({ connectionString: url });
    await cleanup.connect();
    try {
      const pattern = `%\\_${runId}\\_%`;
      const { rows: databases } = await cleanup.query<{ name: string }>("SELECT datname AS name FROM pg_database WHERE datname LIKE $1", [pattern]);
      for (const { name } of databases) await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      const { rows: roles } = await cleanup.query<{ name: string }>("SELECT rolname AS name FROM pg_roles WHERE rolname LIKE $1", [pattern]);
      for (const { name } of roles) await cleanup.query(`DROP ROLE IF EXISTS "${name}"`);
    } finally {
      await cleanup.end();
    }
  };
}
