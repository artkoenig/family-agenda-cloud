import type pg from "pg";
import { scramVerifier } from "./secrets";

/** The names of a Family's own database and role, both drawn from its Family id. */
export function familyDatabaseNames(familyId: string): { databaseName: string; databaseRole: string } {
  const name = `family_${familyId.replaceAll("-", "")}`;
  return { databaseName: name, databaseRole: name };
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
  { databaseName, databaseRole }: { databaseName: string; databaseRole: string },
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
