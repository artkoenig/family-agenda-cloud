import type pg from "pg";
import type { SourcesPolled } from "./core";
import { trialEndsAt } from "./trial";

/**
 * Only an active Family is routed to and scheduled. A Family is `locked` while it is active and
 * the Directory holds a lock of it: the Directory keeps the status `active` and the lock beside it,
 * so that a suspension wins over the lock and a resumption finds it again.
 */
export type FamilyStatus = "being_prepared" | "active" | "locked" | "suspended" | "deleted";

/** Why a Family is locked: its Trial ended without a Subscription, its Subscription ended, or it is not paid. */
export type LockReason = "trial_ended" | "subscription_ended" | "unpaid";

/** The statuses of a Subscription that is running; any other ended it, or never started it. */
const RUNNING_SUBSCRIPTION = ["trialing", "active", "past_due", "unpaid"];

/** A Family's Subscription, as Stripe last told of it. */
export type Subscription = {
  subscriptionId: string;
  familyId: string;
  customerId: string | null;
  /** Who holds the Subscription: the Admin who ordered it. */
  holder: string;
  billing: "monthly" | "yearly" | null;
  /** Stripe's status of the Subscription, such as `active` or `canceled`. */
  status: string;
  orderedAt: Date | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  endedAt: Date | null;
  confirmationSentAt: Date | null;
};

/** A Family's entry in the Directory. Its family key and database password are kept wrapped only. */
export type DirectoryEntry = {
  familyId: string;
  status: FamilyStatus;
  databaseName: string;
  databaseRole: string;
  blobLocation: string;
  timeZone: string;
  /**
   * The Logto Organization whose members with the role `admin` are the Family's Admins, as the
   * core named it in `family.created`; null for a Family created before registration.
   */
  organizationId: string | null;
  wrappedFamilyKey: string | null;
  wrappedDatabasePassword: string | null;
  createdAt: Date;
  /** When deleting the Family finished; null while it is not deleted, or not to the end. */
  deletedAt: Date | null;
  /** When the Family's one Trial started; null while it has none. */
  trialStartsAt: Date | null;
  /** When the Family's Trial ends, exactly 14 days after it started; null while it has none. */
  trialEndsAt: Date | null;
  /** The Logto user id of the Admin who registered the Family, its founder; null while it is not known. */
  registeredBy: string | null;
  /** Since when the Family is locked, whatever its status; null while it is not. */
  lockedAt: Date | null;
  lockReason: LockReason | null;
};

/**
 * How a Family's due work last ran: when the Scheduler triggered it, and whether the core ran it,
 * with how many due Sources it polled and how many of those failed, or why it did not. A failed run
 * says how many runs in a row have failed with it, and when the Scheduler tries the Family again.
 */
export type DueWorkRun =
  | { ranAt: Date; outcome: "succeeded"; sources: SourcesPolled }
  | { ranAt: Date; outcome: "failed"; error: string; failures: number; retryAt: Date };

/**
 * How long a Family whose due work failed waits before it is tried again, in whole minutes counted
 * from the minute the failed run started in: the first delay after one failure, twice as long after
 * each further failure in a row, and never longer than the ceiling.
 */
export type RetryDelays = { firstDelayMinutes: number; ceilingMinutes: number };

/** How a run of due work ended, as the Scheduler notes it; a failure with how it is retried. */
export type DueWorkOutcome =
  | { ranAt: Date; outcome: "succeeded"; sources: SourcesPolled }
  | { ranAt: Date; outcome: "failed"; error: string; retry: RetryDelays };

/** What the Operator sees of a Family: its status, and how its due work last ran, if it ever did. */
export type FamilyOverview = { familyId: string; status: FamilyStatus; dueWork: DueWorkRun | null };

export type NewDirectoryEntry = Omit<
  DirectoryEntry,
  "status" | "createdAt" | "deletedAt" | "trialStartsAt" | "trialEndsAt" | "registeredBy" | "lockedAt" | "lockReason"
> & {
  organizationId: string;
  wrappedFamilyKey: string;
  wrappedDatabasePassword: string;
  /** Whether the Family's Trial starts when it is created, if Trials are open by then: a Family that registered. */
  trialIfOpen: boolean;
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
  // When deleting the Family finished: a deleted Family without it was not deleted to the end.
  "ALTER TABLE family ADD COLUMN deleted_at timestamptz",
  // How each Family's due work last ran, written by the Scheduler (#95).
  `ALTER TABLE family
     ADD COLUMN due_work_ran_at timestamptz,
     ADD COLUMN due_work_outcome text CHECK (due_work_outcome IN ('succeeded', 'failed')),
     ADD COLUMN due_work_sources_ran integer,
     ADD COLUMN due_work_sources_failed integer,
     ADD COLUMN due_work_error text`,
  // How many runs of due work in a row have failed, and when the Scheduler tries again (#97).
  `ALTER TABLE family
     ADD COLUMN due_work_failures integer NOT NULL DEFAULT 0,
     ADD COLUMN due_work_retry_at timestamptz`,
  // Why preparing the Family for a core version last failed, and for which; cleared once it is prepared (#99).
  `ALTER TABLE family
     ADD COLUMN preparation_failed_for text,
     ADD COLUMN preparation_error text`,
  // A core prepares a Family when it first opens it, so the Directory keeps no core version (#119).
  `ALTER TABLE family
     DROP COLUMN core_version,
     DROP COLUMN preparation_failed_for,
     DROP COLUMN preparation_error`,
  // The Family's Logto Organization, named by the core's family.created (#90).
  "ALTER TABLE family ADD COLUMN IF NOT EXISTS organization_id text UNIQUE",
  // A Family's one Trial, its founder, and its lock, which leaves its status as it is (#225).
  `ALTER TABLE family
     ADD COLUMN trial_starts_at timestamptz,
     ADD COLUMN registered_by text,
     ADD COLUMN locked_at timestamptz,
     ADD COLUMN lock_reason text CHECK (lock_reason IN ('trial_ended', 'subscription_ended', 'unpaid'))`,
  // The Routing module's settings, in one row: since when Trials are open (#225).
  `CREATE TABLE setting (
     id boolean PRIMARY KEY DEFAULT true CHECK (id),
     trials_opened_at timestamptz
   )`,
  // Each Family's Subscriptions, as Stripe tells of them (#225).
  `CREATE TABLE subscription (
     subscription_id text PRIMARY KEY,
     family_id uuid NOT NULL REFERENCES family,
     customer_id text,
     holder text NOT NULL,
     billing text CHECK (billing IN ('monthly', 'yearly')),
     status text NOT NULL,
     ordered_at timestamptz,
     trial_end timestamptz,
     current_period_end timestamptz,
     cancel_at timestamptz,
     ended_at timestamptz,
     confirmation_sent_at timestamptz
   )`,
  "CREATE INDEX subscription_family_id ON subscription (family_id)",
  // The Stripe events received, so that one delivered again is handled once (#225).
  `CREATE TABLE stripe_event (
     event_id text PRIMARY KEY,
     received_at timestamptz NOT NULL DEFAULT now()
   )`,
];

/** An arbitrary, fixed key of the advisory lock that keeps two migrations of the Directory apart. */
const MIGRATION_LOCK = 7_320_092;

export type Directory = {
  find(familyId: string): Promise<DirectoryEntry | undefined>;
  /**
   * The Family of the Logto Organization, in any status, deleted included; null when no Family has
   * that Organization, as when its family.created is still on its way (#128).
   */
  findByOrganization(organizationId: string): Promise<DirectoryEntry | null>;
  /** The Family ids of the Families still being prepared, oldest first. */
  beingPrepared(): Promise<string[]>;
  /**
   * Writes a new entry as being prepared, with its Trial started at its creation if it asks for one
   * and Trials are open; leaves an existing entry of that Family as it is.
   */
  add(entry: NewDirectoryEntry): Promise<void>;
  /** Marks the Family active. */
  activate(familyId: string): Promise<void>;
  /** Marks an active Family suspended, leaving any other status as it is; answers the status it has now. */
  suspend(familyId: string): Promise<FamilyStatus | undefined>;
  /** Marks a suspended Family active again, leaving any other status as it is; answers the status it has now. */
  resume(familyId: string): Promise<FamilyStatus | undefined>;
  /** Marks the Family deleted and destroys its wrapped family key and database password. */
  markDeleted(familyId: string): Promise<void>;
  /** Notes that deleting the Family finished, unless it was noted before. */
  finishDeletion(familyId: string): Promise<void>;
  /**
   * Notes how the Family's due work last ran, in place of the run before: a failure counts one more
   * in a row and sets when the Family is tried again, a success ends the row. Answers the run as
   * noted, or null when there is no such Family.
   */
  recordDueWork(familyId: string, run: DueWorkOutcome): Promise<DueWorkRun | null>;
  /** How the Family's due work last ran; null if it never did, or there is no such Family. */
  lastDueWork(familyId: string): Promise<DueWorkRun | null>;
  /** Every Family, oldest first. */
  overview(): Promise<FamilyOverview[]>;
  /**
   * Notes that Trials are open, unless they were before, and starts a Trial now for every Family
   * that has none, is not deleted, never had a Subscription and is not one of `except`. Answers the
   * Families whose Trial it started. A Family added at the same time gets its Trial either way.
   */
  openTrials(except: string[]): Promise<string[]>;
  /**
   * Starts the Family's Trial now, if it has none, is not deleted and never had a Subscription;
   * answers when it started, or null if it did not.
   */
  startTrial(familyId: string): Promise<Date | null>;
  /** The Family's running Subscription, the latest ordered; null when it has none. */
  subscriptionOf(familyId: string): Promise<Subscription | null>;
  /**
   * Records the founder, unless one is recorded and `overwrite` is false; answers the founder the
   * Family has now, undefined when there is no such Family.
   */
  recordFounder(familyId: string, userId: string, overwrite: boolean): Promise<string | null | undefined>;
  /**
   * Locks an active or suspended Family unless it is locked, keeping when and why it was first
   * locked; leaves any other Family as it is. Answers the status it has now.
   */
  lock(familyId: string, reason: LockReason, at: Date): Promise<FamilyStatus | undefined>;
  /** Unlocks an active or suspended Family; answers the status it has now. */
  unlock(familyId: string): Promise<FamilyStatus | undefined>;
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

/** A Family's status as the family table holds it, with its lock beside it. */
type StoredStatus = { status: Exclude<FamilyStatus, "locked">; locked_at: Date | null };

/** The status a Family has: an active Family is locked while the Directory holds a lock of it. */
const statusOf = ({ status, locked_at }: StoredStatus): FamilyStatus => (status === "active" && locked_at ? "locked" : status);

type Row = StoredStatus & {
  family_id: string;
  database_name: string;
  database_role: string;
  blob_location: string;
  time_zone: string;
  organization_id: string | null;
  wrapped_family_key: string | null;
  wrapped_database_password: string | null;
  created_at: Date;
  deleted_at: Date | null;
  trial_starts_at: Date | null;
  registered_by: string | null;
  lock_reason: LockReason | null;
};

type OverviewRow = StoredStatus & {
  family_id: string;
  due_work_ran_at: Date | null;
  due_work_outcome: "succeeded" | "failed" | null;
  due_work_sources_ran: number | null;
  due_work_sources_failed: number | null;
  due_work_error: string | null;
  due_work_failures: number;
  /**
   * For a failed run, when the Family is tried again. Selected as coalesce(due_work_retry_at,
   * due_work_ran_at) (see DUE_WORK_COLUMNS): a run that failed before migration 4 noted retries has
   * none, and is due again at once.
   */
  due_work_retry_at: Date;
};

const DUE_WORK_COLUMNS =
  "due_work_ran_at, due_work_outcome, due_work_sources_ran, due_work_sources_failed, due_work_error, due_work_failures, " +
  "coalesce(due_work_retry_at, due_work_ran_at) AS due_work_retry_at";

function dueWorkRun(row: OverviewRow): DueWorkRun | null {
  if (!row.due_work_ran_at) return null;
  if (row.due_work_outcome === "succeeded") {
    const sources = { ran: row.due_work_sources_ran ?? 0, failed: row.due_work_sources_failed ?? 0 };
    return { ranAt: row.due_work_ran_at, outcome: "succeeded", sources };
  }
  return {
    ranAt: row.due_work_ran_at,
    outcome: "failed",
    error: row.due_work_error ?? "",
    failures: row.due_work_failures,
    retryAt: row.due_work_retry_at,
  };
}

/** Changes the Family's status from `from` to `to`, and no other; answers the status it has now. */
async function changeStatus(client: Pick<pg.ClientBase, "query">, familyId: string, from: StoredStatus["status"], to: StoredStatus["status"]) {
  return statusAfter(client, "UPDATE family SET status = CASE WHEN status = $2 THEN $3 ELSE status END WHERE family_id = $1 RETURNING status, locked_at", [
    familyId,
    from,
    to,
  ]);
}

/** Runs the statement, which returns the status and lock of the Family it changed; answers the status it has now. */
async function statusAfter(client: Pick<pg.ClientBase, "query">, statement: string, values: unknown[]): Promise<FamilyStatus | undefined> {
  const { rows } = await client.query<StoredStatus>(statement, values);
  const row = rows[0];
  return row && statusOf(row);
}

/** Only an active or suspended Family is locked or unlocked. */
const LOCKABLE = "status IN ('active', 'suspended')";

/** A Family that never had a Subscription; `f` is the Family. */
const NEVER_SUBSCRIBED = "NOT EXISTS (SELECT 1 FROM subscription s WHERE s.family_id = f.family_id)";

type SubscriptionRow = {
  subscription_id: string;
  family_id: string;
  customer_id: string | null;
  holder: string;
  billing: "monthly" | "yearly" | null;
  status: string;
  ordered_at: Date | null;
  trial_end: Date | null;
  current_period_end: Date | null;
  cancel_at: Date | null;
  ended_at: Date | null;
  confirmation_sent_at: Date | null;
};

function subscriptionOf(row: SubscriptionRow): Subscription {
  return {
    subscriptionId: row.subscription_id,
    familyId: row.family_id,
    customerId: row.customer_id,
    holder: row.holder,
    billing: row.billing,
    status: row.status,
    orderedAt: row.ordered_at,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAt: row.cancel_at,
    endedAt: row.ended_at,
    confirmationSentAt: row.confirmation_sent_at,
  };
}

/** Runs `work` in a transaction on the client: committed if it ends, rolled back if it throws. */
async function inTransaction<T>(client: Pick<pg.ClientBase, "query">, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** The entry a row of the family table holds. */
function entryOf(row: Row): DirectoryEntry {
  return {
    familyId: row.family_id,
    status: statusOf(row),
    databaseName: row.database_name,
    databaseRole: row.database_role,
    blobLocation: row.blob_location,
    timeZone: row.time_zone,
    organizationId: row.organization_id,
    wrappedFamilyKey: row.wrapped_family_key,
    wrappedDatabasePassword: row.wrapped_database_password,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    trialStartsAt: row.trial_starts_at,
    trialEndsAt: row.trial_starts_at && trialEndsAt(row.trial_starts_at),
    registeredBy: row.registered_by,
    lockedAt: row.locked_at,
    lockReason: row.lock_reason,
  };
}

export function directory(client: Pick<pg.ClientBase, "query">): Directory {
  return {
    async find(familyId) {
      const { rows } = await client.query<Row>("SELECT * FROM family WHERE family_id = $1", [familyId]);
      const row = rows[0];
      return row && entryOf(row);
    },
    async findByOrganization(organizationId) {
      const { rows } = await client.query<Row>("SELECT * FROM family WHERE organization_id = $1", [organizationId]);
      const row = rows[0];
      return row ? entryOf(row) : null;
    },
    async beingPrepared() {
      const { rows } = await client.query<{ family_id: string }>(
        "SELECT family_id FROM family WHERE status = 'being_prepared' ORDER BY created_at, family_id",
      );
      return rows.map(({ family_id }) => family_id);
    },
    async add(entry) {
      await client.query(
        `INSERT INTO family (family_id, status, database_name, database_role, blob_location, time_zone, organization_id, wrapped_family_key, wrapped_database_password,
           trial_starts_at)
         VALUES ($1, 'being_prepared', $2, $3, $4, $5, $6, $7, $8,
           CASE WHEN $9::boolean THEN (SELECT now() FROM setting WHERE trials_opened_at IS NOT NULL) END)
         ON CONFLICT (family_id) DO NOTHING`,
        [
          entry.familyId,
          entry.databaseName,
          entry.databaseRole,
          entry.blobLocation,
          entry.timeZone,
          entry.organizationId,
          entry.wrappedFamilyKey,
          entry.wrappedDatabasePassword,
          entry.trialIfOpen,
        ],
      );
    },
    async activate(familyId) {
      await client.query("UPDATE family SET status = 'active' WHERE family_id = $1", [familyId]);
    },
    suspend: (familyId) => changeStatus(client, familyId, "active", "suspended"),
    resume: (familyId) => changeStatus(client, familyId, "suspended", "active"),
    async markDeleted(familyId) {
      await client.query(
        "UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL WHERE family_id = $1",
        [familyId],
      );
    },
    async finishDeletion(familyId) {
      await client.query("UPDATE family SET deleted_at = now() WHERE family_id = $1 AND deleted_at IS NULL", [familyId]);
    },
    async recordDueWork(familyId, run) {
      const succeeded = run.outcome === "succeeded";
      // One statement, so that two failures noted at once both count. In SET, the columns hold the
      // row as it was: the delay grows with the failures in a row before this one.
      const { rows } = await client.query<OverviewRow>(
        `UPDATE family SET due_work_ran_at = $2, due_work_outcome = $3::text, due_work_sources_ran = $4, due_work_sources_failed = $5,
           due_work_error = $6,
           due_work_failures = CASE WHEN $3::text = 'failed' THEN due_work_failures + 1 ELSE 0 END,
           due_work_retry_at = CASE WHEN $3::text = 'failed'
             THEN date_trunc('minute', $2::timestamptz) + least($7::integer * power(2, due_work_failures), $8::integer) * interval '1 minute'
           END
         WHERE family_id = $1
         RETURNING family_id, status, locked_at, ${DUE_WORK_COLUMNS}`,
        [
          familyId,
          run.ranAt,
          run.outcome,
          succeeded ? run.sources.ran : null,
          succeeded ? run.sources.failed : null,
          succeeded ? null : run.error,
          succeeded ? null : run.retry.firstDelayMinutes,
          succeeded ? null : run.retry.ceilingMinutes,
        ],
      );
      const row = rows[0];
      return row ? dueWorkRun(row) : null;
    },
    async lastDueWork(familyId) {
      const { rows } = await client.query<OverviewRow>(`SELECT family_id, status, locked_at, ${DUE_WORK_COLUMNS} FROM family WHERE family_id = $1`, [familyId]);
      const row = rows[0];
      return row ? dueWorkRun(row) : null;
    },
    async overview() {
      const { rows } = await client.query<OverviewRow>(
        `SELECT family_id, status, locked_at, ${DUE_WORK_COLUMNS} FROM family ORDER BY created_at, family_id`,
      );
      return rows.map((row) => ({ familyId: row.family_id, status: statusOf(row), dueWork: dueWorkRun(row) }));
    },
    openTrials: (except) =>
      inTransaction(client, async () => {
        // Keeps out a Family being added until the Trials are open, so that it gets its Trial either way.
        await client.query("LOCK TABLE family IN SHARE ROW EXCLUSIVE MODE");
        await client.query(
          `INSERT INTO setting (id, trials_opened_at) VALUES (true, now())
           ON CONFLICT (id) DO UPDATE SET trials_opened_at = coalesce(setting.trials_opened_at, excluded.trials_opened_at)`,
        );
        const { rows } = await client.query<{ family_id: string }>(
          `UPDATE family f SET trial_starts_at = now()
           WHERE trial_starts_at IS NULL AND status <> 'deleted' AND ${NEVER_SUBSCRIBED} AND NOT (family_id = ANY($1::uuid[]))
           RETURNING family_id`,
          [except],
        );
        return rows.map(({ family_id }) => family_id).sort();
      }),
    async startTrial(familyId) {
      const { rows } = await client.query<{ trial_starts_at: Date }>(
        `UPDATE family f SET trial_starts_at = now()
         WHERE family_id = $1 AND trial_starts_at IS NULL AND status <> 'deleted' AND ${NEVER_SUBSCRIBED}
         RETURNING trial_starts_at`,
        [familyId],
      );
      return rows[0]?.trial_starts_at ?? null;
    },
    async subscriptionOf(familyId) {
      const { rows } = await client.query<SubscriptionRow>(
        `SELECT * FROM subscription WHERE family_id = $1 AND status = ANY($2::text[])
         ORDER BY ordered_at DESC NULLS LAST, subscription_id LIMIT 1`,
        [familyId, RUNNING_SUBSCRIPTION],
      );
      const row = rows[0];
      return row ? subscriptionOf(row) : null;
    },
    async recordFounder(familyId, userId, overwrite) {
      const { rows } = await client.query<{ registered_by: string | null }>(
        "UPDATE family SET registered_by = CASE WHEN $3 OR registered_by IS NULL THEN $2 ELSE registered_by END WHERE family_id = $1 RETURNING registered_by",
        [familyId, userId, overwrite],
      );
      return rows[0]?.registered_by;
    },
    lock: (familyId, reason, at) =>
      statusAfter(
        client,
        `UPDATE family SET
           locked_at = CASE WHEN ${LOCKABLE} THEN coalesce(locked_at, $3) ELSE locked_at END,
           lock_reason = CASE WHEN ${LOCKABLE} AND locked_at IS NULL THEN $2 ELSE lock_reason END
         WHERE family_id = $1 RETURNING status, locked_at`,
        [familyId, reason, at],
      ),
    unlock: (familyId) =>
      statusAfter(
        client,
        `UPDATE family SET
           locked_at = CASE WHEN ${LOCKABLE} THEN NULL ELSE locked_at END,
           lock_reason = CASE WHEN ${LOCKABLE} THEN NULL ELSE lock_reason END
         WHERE family_id = $1 RETURNING status, locked_at`,
        [familyId],
      ),
  };
}
