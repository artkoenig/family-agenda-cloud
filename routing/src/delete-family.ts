import { rm, stat } from "node:fs/promises";
import type { Config } from "./config";
import type { DirectoryEntry } from "./directory";
import { dropFamilyDatabase, familyDatabaseNames } from "./family-databases";
import { blobLocationOf, isFamilyId } from "./family-id";
import { organizations } from "./organizations";
import { existingEntry, ProvisioningError, withFamilyLock, type ScheduledProvisioning } from "./provisioning";

export type DeleteFamilyInput = {
  familyId: string;
  /** The Family id once more, typed by the Operator: nothing is deleted unless it matches. */
  confirmation: string;
};

/**
 * Deletes a Family, or finishes deleting one after a failure part-way: every step is safe to run
 * again and ends in the state of an undisturbed run.
 *
 * The first step marks the Family deleted and destroys its wrapped family key and database
 * password, so that from then on nothing routes to it or triggers its due work, and what is left of its
 * data opens with no key the Routing module still has. Its entry stays, as the record that it was
 * deleted, with no secrets in it, nor anything of its Organization but the id. Its Admins' Logto
 * users are deleted, so that none of them can sign in any more, and only then its Organization:
 * once the Organization is gone, nothing tells whose users were left. The
 * time deleting finished is noted only after the last step, so
 * that a deleted Family without it was not deleted to the end. Old row versions of the Directory
 * not yet vacuumed, its write-ahead log and its backups still hold the wrapped values until they
 * are overwritten or expire; they open only with the Operator key.
 */
export async function deleteFamily(provisioning: ScheduledProvisioning, input: DeleteFamilyInput): Promise<void> {
  const { config, client, directory, schedules, log } = provisioning;
  const { familyId } = input;
  if (!isFamilyId(familyId)) throw new ProvisioningError(`${familyId} is not a Family id; nothing was deleted`);
  if (input.confirmation !== familyId) {
    throw new ProvisioningError("The confirmation does not match the Family id; nothing was deleted");
  }
  const entry = await existingEntry(directory, familyId);
  refuseForeign(entry, blobLocationOf(config, familyId));
  refuseWithoutManagement(entry, config);
  if (entry.deletedAt) {
    log.info("The Family was deleted already", { familyId, deletedAt: entry.deletedAt.toISOString() });
    return;
  }
  log.info(entry.status === "deleted" ? "Finishing the deletion of the Family" : "Deleting the Family", { familyId });

  // Under the Family's lock: a resume under way cannot give it its schedules back once removed.
  await withFamilyLock(client, familyId, async () => {
    await directory.markDeleted(familyId);
    log.info("The Family is marked deleted; its wrapped family key and database password are destroyed", { familyId });

    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  });

  await dropFamilyDatabase(client, entry, config.familyDatabaseCloseTimeoutMs);
  log.info("The Family's database and role are dropped", { familyId });

  await removeBlobs(config.blobRoot, entry.blobLocation);
  log.info("The Family's blob location is removed", { familyId });

  await deleteOrganization(provisioning, entry);

  await directory.finishDeletion(familyId);
  log.info("The Family is deleted", { familyId });
}

/**
 * Refuses an entry whose database, role or blob location is not the one its Family id gives: only
 * what Provisioning made for this Family is ever dropped or removed.
 */
function refuseForeign(entry: DirectoryEntry, blobLocation: string): void {
  const { databaseName, databaseRole } = familyDatabaseNames(entry.familyId);
  if (entry.databaseName !== databaseName || entry.databaseRole !== databaseRole) {
    throw new ProvisioningError(`The Family's database and role are not ${databaseName}; nothing was deleted`);
  }
  if (entry.blobLocation !== blobLocation) {
    throw new ProvisioningError(`The Family's blob location is not ${blobLocation}; nothing was deleted`);
  }
}

/** Refuses a Family with an Organization while there is no Management API to delete it in. */
function refuseWithoutManagement(entry: DirectoryEntry, config: Config): void {
  if (entry.organizationId !== null && config.idpManagement === null) {
    throw new ProvisioningError("IDP_MANAGEMENT_* is not set, so the Family's Organization cannot be deleted; nothing was deleted");
  }
}

/**
 * Deletes the Family's Admins' Logto users and then its Organization, if it has one. Users or an
 * Organization gone already are deleted; a run that failed part-way deletes the members left.
 */
async function deleteOrganization({ config, log }: ScheduledProvisioning, { familyId, organizationId }: DirectoryEntry): Promise<void> {
  if (organizationId === null || config.idpManagement === null) return;
  const organization = organizations(config.idpManagement);
  const users = await organization.deleteMembers(organizationId);
  log.info("The Family's Admins' users are deleted", { familyId, users });
  await organization.delete(organizationId);
  log.info("The Family's Organization is deleted", { familyId, organizationId });
}

/**
 * Removes the blob location with all in it. A blob root that is not there, such as the bucket
 * while it is not mounted, fails the step, so that blobs it cannot see are not reported gone.
 */
async function removeBlobs(blobRoot: string, blobLocation: string): Promise<void> {
  const root = await stat(blobRoot).catch(() => undefined);
  if (!root?.isDirectory()) throw new Error(`The blob root ${blobRoot} is not there`);
  await rm(blobLocation, { recursive: true, force: true });
}
