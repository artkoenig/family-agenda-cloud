import type pg from "pg";
import { scramVerifier } from "./secrets";

/** The names of a Family's own database and of the role that owns it. */
export type FamilyDatabaseNames = { databaseName: string; databaseRole: string };

/** The names of a Family's own database and role, both drawn from its Family id. */
export function familyDatabaseNames(familyId: string): FamilyDatabaseNames {
  const name = `family_${familyId.replaceAll("-", "")}`;
  return { databaseName: name, databaseRole: name };
}

/** Whether creating the Family's role or database began: either of them exists. */
export async function familyDatabaseLeftBehind(
  client: pg.ClientBase,
  { databaseName, databaseRole }: FamilyDatabaseNames,
): Promise<boolean> {
  const { rows } = await client.query<{ found: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) OR EXISTS (SELECT 1 FROM pg_database WHERE datname = $2) AS found",
    [databaseRole, databaseName],
  );
  return rows[0]?.found === true;
}

/**
 * Makes sure the Family's role exists with this password and owns the Family's database, which no
 * other role may connect to. Safe to run again: it creates what is missing and sets the password.
 *
 * The Routing module's role needs CREATEROLE and CREATEDB, not superuser. It keeps a membership in
 * each Family's role that lets it act as that role (SET) but does not give it the role's rights
 * (no INHERIT), so it cannot open a Family's database itself.
 */
export async function ensureFamilyDatabase(
  client: pg.ClientBase,
  { databaseName, databaseRole }: FamilyDatabaseNames,
  password: string,
): Promise<void> {
  const role = client.escapeIdentifier(databaseRole);
  const database = client.escapeIdentifier(databaseName);
  // The password goes to Postgres as its SCRAM verifier only, so that no log of Postgres holds it.
  const verifier = client.escapeLiteral(scramVerifier(password));
  const { rowCount: roleExists } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [databaseRole]);
  await client.query(roleExists ? `ALTER ROLE ${role} PASSWORD ${verifier}` : `CREATE ROLE ${role} LOGIN PASSWORD ${verifier}`);
  await client.query(`GRANT ${role} TO CURRENT_USER WITH SET TRUE, INHERIT FALSE`);
  const { rowCount: databaseExists } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (!databaseExists) await client.query(`CREATE DATABASE ${database} OWNER ${role}`);
  // Every role may connect to a new database; only the Family's own may connect to this one.
  await client.query(`SET ROLE ${role}`);
  try {
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  } finally {
    await client.query("RESET ROLE");
  }
}

/**
 * Drops the Family's database, closing any connection still open to it, and then its role. Safe
 * to run again: what is gone already stays gone. The database is dropped as the Family's role, its
 * owner, which the Routing module may act as; the role by the Routing module, which made it.
 */
export async function dropFamilyDatabase(
  client: pg.ClientBase,
  { databaseName, databaseRole }: FamilyDatabaseNames,
): Promise<void> {
  const role = client.escapeIdentifier(databaseRole);
  const { rowCount: roleExists } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [databaseRole]);
  // A Family's database is owned by its role, so with the role gone the database is gone too.
  if (!roleExists) return;
  await client.query(`SET ROLE ${role}`);
  try {
    await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await client.query("RESET ROLE");
  }
  await client.query(`DROP ROLE ${role}`);
}
