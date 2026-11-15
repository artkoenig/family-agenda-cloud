import type { DirectoryEntry } from "./directory";
import { ProvisioningError, type Provisioning } from "./provisioning";
import type { FamilySchedules } from "./scheduler";

/** What suspending and resuming work with: the Directory and the Family's schedules, no core. */
export type SuspendProvisioning = Pick<Provisioning, "directory" | "log"> & { schedules: FamilySchedules };

/**
 * Suspends a Family: from then on nothing routes to it and its schedules are gone, so that no due
 * work, purge or sweep is triggered for it. Its database, role, blobs and wrapped family key stay.
 * Suspending a suspended Family, or one whose suspension stopped part-way, removes what is left of
 * its schedules and changes nothing else.
 */
export async function suspendFamily(provisioning: SuspendProvisioning, familyId: string): Promise<void> {
  const { directory, schedules, log } = provisioning;
  const entry = await changeable(provisioning, familyId, "suspended");
  if (entry.status === "active") {
    await directory.suspend(familyId);
    log.info("The Family is suspended; nothing routes to it", { familyId });
  }
  await schedules.remove(familyId);
  log.info("The Family's schedules are removed", { familyId });
}

/**
 * Resumes a suspended Family: it is routed to again and gets its schedules back. Resuming an active
 * Family, or one whose resumption stopped part-way, creates whatever of its schedules is missing.
 */
export async function resumeFamily(provisioning: SuspendProvisioning, familyId: string): Promise<void> {
  const { directory, schedules, log } = provisioning;
  const entry = await changeable(provisioning, familyId, "resumed");
  if (entry.status === "suspended") {
    await directory.resume(familyId);
    log.info("The Family is active again", { familyId });
  }
  await schedules.create(familyId, entry.timeZone);
  log.info("The Family's schedules are in place", { familyId });
}

/** The Family's entry, if it is active or suspended; a Family of any other status is refused. */
async function changeable({ directory }: SuspendProvisioning, familyId: string, change: string): Promise<DirectoryEntry> {
  const entry = await directory.find(familyId);
  if (!entry) throw new ProvisioningError(`There is no Family ${familyId}`);
  if (entry.status === "deleted") throw new ProvisioningError(`The Family ${familyId} is deleted and cannot be ${change}`);
  if (entry.status === "being_prepared") {
    throw new ProvisioningError(`The Family ${familyId} is being prepared and cannot be ${change}; finish preparing it first`);
  }
  return entry;
}
