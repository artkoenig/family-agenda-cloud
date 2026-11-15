import type pg from "pg";

/** Only an active Family is routed to and scheduled. */
export type FamilyStatus = "being_prepared" | "active" | "suspended" | "deleted";

/** A Family's entry in the Directory. Its family key and database password are kept wrapped only. */
export type DirectoryEntry = {
  familyId: string;
  status: FamilyStatus;
  databaseName: string;
  databaseRole: string;
  blobLocation: string;
  timeZone: string;
  wrappedFamilyKey: string | null;
  wrappedDatabasePassword: string | null;
  coreVersion: string | null;
  createdAt: Date;
};

export type NewDirectoryEntry = Omit<DirectoryEntry, "status" | "coreVersion" | "createdAt"> & {
  wrappedFamilyKey: string;
  wrappedDatabasePassword: string;
};

/** The schema of the Directory, one statement per version; a version once released never changes. */
const MIGRATIONS = [
  `CREATE TABLE family (
     family_id uuid PRIMARY KEY,
     status text NOT NULL CHECK (status IN ('being_prepared', 'active', 'suspended', 'deleted')),
     database_name text NOT NULL UNIQUE,
     database_role text NOT NULL UNIQUE,
     blob_location text NOT NULL,
     time_zone text NOT NULL,
     wrapped_family_key text,
     wrapped_database_password text,
     core_version text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
];

/** An arbitrary, fixed key of the advisory lock that keeps two migrations of the Directory apart. */
const MIGRATION_LOCK = 7_320_092;

export type Directory = {
  find(familyId: string): Promise<DirectoryEntry | undefined>;
  /** Writes a new entry as being prepared; leaves an existing entry of that Family as it is. */
  add(entry: NewDirectoryEntry): Promise<void>;
  /** Marks the Family active and notes the core version it was prepared for. */
  activate(familyId: string, coreVersion: string): Promise<void>;
};

/** Brings the Directory's schema up to date. */
export async function migrateDirectory(client: pg.ClientBase): Promise<void> {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
  try {
    await client.query("CREATE TABLE IF NOT EXISTS directory_migration (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const { rows } = await client.query<{ version: number | null }>("SELECT max(version) AS version FROM directory_migration");
    for (const [index, statement] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (version <= (rows[0]?.version ?? 0)) continue;
      await client.query("BEGIN");
      await client.query(statement);
      await client.query("INSERT INTO directory_migration (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]);
  }
}

type Row = {
  family_id: string;
  status: FamilyStatus;
  database_name: string;
  database_role: string;
  blob_location: string;
  time_zone: string;
  wrapped_family_key: string | null;
  wrapped_database_password: string | null;
  core_version: string | null;
  created_at: Date;
};

export function directory(client: pg.ClientBase): Directory {
  return {
    async find(familyId) {
      const { rows } = await client.query<Row>("SELECT * FROM family WHERE family_id = $1", [familyId]);
      const row = rows[0];
      return row && {
        familyId: row.family_id,
        status: row.status,
        databaseName: row.database_name,
        databaseRole: row.database_role,
        blobLocation: row.blob_location,
        timeZone: row.time_zone,
        wrappedFamilyKey: row.wrapped_family_key,
        wrappedDatabasePassword: row.wrapped_database_password,
        coreVersion: row.core_version,
        createdAt: row.created_at,
      };
    },
    async add(entry) {
      await client.query(
        `INSERT INTO family (family_id, status, database_name, database_role, blob_location, time_zone, wrapped_family_key, wrapped_database_password)
         VALUES ($1, 'being_prepared', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (family_id) DO NOTHING`,
        [
          entry.familyId,
          entry.databaseName,
          entry.databaseRole,
          entry.blobLocation,
          entry.timeZone,
          entry.wrappedFamilyKey,
          entry.wrappedDatabasePassword,
        ],
      );
    },
    async activate(familyId, coreVersion) {
      await client.query("UPDATE family SET status = 'active', core_version = $2 WHERE family_id = $1", [familyId, coreVersion]);
    },
  };
}
