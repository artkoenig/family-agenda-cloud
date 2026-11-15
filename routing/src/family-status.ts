import type { FamilyStatus } from "./directory";
import { existingEntry, ProvisioningError, withFamilyLock, type ScheduledProvisioning } from "./provisioning";

/** What the Operator asked to happen to the Family. */
type StatusChange = "suspended" | "resumed";

/**
 * Suspends a Family: from then on nothing routes to it and its schedules are gone, so that no due
 * work, purge or sweep is triggered for it. Its database, role, blobs and wrapped family key stay.
 * Suspending a suspended Family, or one whose suspension stopped part-way, removes what is left of
 * its schedules and changes nothing else.
 *
 * The status and the schedules change under the Family's lock, and the schedules follow the status
 * the Directory answers to the change, so that a resume or delete at the same time cannot leave a
 * Family whose schedules do not match its status.
 */
export async function suspendFamily(provisioning: ScheduledProvisioning, familyId: string): Promise<void> {
  const { client, directory, schedules, log } = provisioning;
  await withFamilyLock(client, familyId, async () => {
    const { status: before } = await existingEntry(directory, familyId);
    // An entry stays once made, so the change finds it.
    const status = (await directory.suspend(familyId)) ?? before;
    if (status !== "suspended") throw refusal(familyId, status, "suspended");
    if (before === "active") log.info("The Family is suspended; nothing routes to it", { familyId });
    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  });
}

/**
 * Resumes a suspended Family: it is routed to again and gets its schedules back. Resuming an active
 * Family, or one whose resumption stopped part-way, creates whatever of its schedules is missing.
 */
export async function resumeFamily(provisioning: ScheduledProvisioning, familyId: string): Promise<void> {
  const { client, directory, schedules, log } = provisioning;
  await withFamilyLock(client, familyId, async () => {
    const { status: before, timeZone } = await existingEntry(directory, familyId);
    const status = (await directory.resume(familyId)) ?? before;
    if (status !== "active") throw refusal(familyId, status, "resumed");
    if (before === "suspended") log.info("The Family is active again", { familyId });
    await schedules.create(familyId, timeZone);
    log.info("The Family's schedules are in place", { familyId });
  });
}

/** Why a Family with this status cannot be suspended or resumed: it is deleted or being prepared. */
function refusal(familyId: string, status: FamilyStatus, change: StatusChange): ProvisioningError {
  if (status === "being_prepared") {
    return new ProvisioningError(`The Family ${familyId} is being prepared and cannot be ${change}; finish preparing it first`);
  }
  return new ProvisioningError(`The Family ${familyId} is ${status} and cannot be ${change}`);
}
