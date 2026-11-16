import type pg from "pg";
import type { Config } from "./config";
import { coreClient, type Core } from "./core";
import { directory, type Directory, type DirectoryEntry } from "./directory";
import type { Log } from "./log";
import type { Resolve } from "./pool";
import type { FamilySchedules } from "./scheduler";

/** What Provisioning's commands work with. */
export type Provisioning = {
  config: Config;
  /** The Routing module's connection to the Directory's server, which creates the Families' databases too. */
  client: pg.ClientBase;
  directory: Directory;
  core: Core;
  log: Log;
};

/** What Provisioning works with, on the Directory's connection. */
export function provisioning(config: Config, client: pg.ClientBase, log: Log, resolve?: Resolve): Provisioning {
  return { config, client, directory: directory(client), core: coreClient(config, log, { resolve }), log };
}

/** What the commands that change a Family's schedules work with. */
export type ScheduledProvisioning = Provisioning & { schedules: FamilySchedules };

/** A command was refused before it changed anything. */
export class ProvisioningError extends Error {}

/** The Family's entry; a Family the Directory does not know is refused. */
export async function existingEntry(directory: Directory, familyId: string): Promise<DirectoryEntry> {
  const entry = await directory.find(familyId);
  if (!entry) throw new ProvisioningError(`There is no Family ${familyId}`);
  return entry;
}

/** The first key of the advisory locks that keep two status changes of one Family apart. */
const FAMILY_LOCK = 7_320_098;

/**
 * Runs `work` while holding the Family's lock on the Directory's connection, so that suspending,
 * resuming and deleting the Family change its status and its schedules one after the other. The
 * lock is the session's: the schedules are written on another connection.
 */
export async function withFamilyLock<T>(client: Pick<pg.ClientBase, "query">, familyId: string, work: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1, hashtext($2))", [FAMILY_LOCK, familyId]);
  try {
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [FAMILY_LOCK, familyId]);
  }
}
