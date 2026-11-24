import type { FamilyStatus, LockReason } from "./directory";
import { existingEntry, ProvisioningError, withFamilyLock, type ScheduledProvisioning } from "./provisioning";

/** What the Operator asked to happen to the Family. */
type StatusChange = "suspended" | "resumed" | "locked" | "unlocked";

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
    if (before === "active" || before === "locked") log.info("The Family is suspended; nothing routes to it", { familyId });
    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  });
}

/**
 * Resumes a suspended Family: it is routed to again and gets its schedules back. Resuming an active
 * Family, or one whose resumption stopped part-way, creates whatever of its schedules is missing.
 * A Family locked before or while it was suspended is Locked once it is resumed: it stays without
 * schedules and is not routed to. Answers the status it has now, `active` or `locked`.
 */
export async function resumeFamily(provisioning: ScheduledProvisioning, familyId: string): Promise<"active" | "locked"> {
  const { client, directory, log } = provisioning;
  return withFamilyLock(client, familyId, async () => {
    const { status: before, timeZone } = await existingEntry(directory, familyId);
    const status = (await directory.resume(familyId)) ?? before;
    if (status !== "active" && status !== "locked") throw refusal(familyId, status, "resumed");
    if (before === "suspended") log.info(status === "locked" ? "The Family is resumed, and Locked" : "The Family is active again", { familyId });
    await schedulesFollow(provisioning, familyId, status, timeZone);
    return status;
  });
}

/**
 * Locks a Family: from then on nothing routes to it and its schedules are gone, so that it runs no
 * due work; its data stays. A suspended Family stays suspended, and is Locked once it is resumed.
 * Locking a Locked Family keeps when and why it was first locked, and removes what is left of its
 * schedules. The lock and the schedules change under the Family's lock, as a suspension does.
 */
export async function lockFamily(provisioning: ScheduledProvisioning, familyId: string, reason: LockReason, at: Date): Promise<void> {
  const { client, directory, schedules, log } = provisioning;
  await withFamilyLock(client, familyId, async () => {
    const { status: before, lockedAt } = await existingEntry(directory, familyId);
    const status = (await directory.lock(familyId, reason, at)) ?? before;
    if (status !== "locked" && status !== "suspended") throw refusal(familyId, status, "locked");
    if (lockedAt === null) log.info("The Family is locked; nothing routes to it", { familyId, reason });
    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  });
}

/**
 * Unlocks a Family: an active Family is routed to again and gets its schedules back; a suspended
 * one stays suspended, without schedules. Unlocking a Family that is not locked, or one whose
 * unlocking stopped part-way, makes its schedules follow its status. Answers the status it has now.
 */
export async function unlockFamily(provisioning: ScheduledProvisioning, familyId: string): Promise<"active" | "suspended"> {
  const { client, directory, log } = provisioning;
  return withFamilyLock(client, familyId, async () => {
    const { status: before, lockedAt, timeZone } = await existingEntry(directory, familyId);
    const status = (await directory.unlock(familyId)) ?? before;
    if (status !== "active" && status !== "suspended") throw refusal(familyId, status, "unlocked");
    if (lockedAt !== null) log.info("The Family is unlocked", { familyId, status });
    await schedulesFollow(provisioning, familyId, status, timeZone);
    return status;
  });
}

/** Creates the schedules of an active Family, and removes those of any other. */
async function schedulesFollow({ schedules, log }: ScheduledProvisioning, familyId: string, status: FamilyStatus, timeZone: string): Promise<void> {
  if (status === "active") {
    await schedules.create(familyId, timeZone);
    log.info("The Family's schedules are in place", { familyId });
  } else {
    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  }
}

/** Why a Family with this status cannot be changed so: it is deleted or being prepared. */
function refusal(familyId: string, status: FamilyStatus, change: StatusChange): ProvisioningError {
  if (status === "being_prepared") {
    return new ProvisioningError(`The Family ${familyId} is being prepared and cannot be ${change}; finish preparing it first`);
  }
  return new ProvisioningError(`The Family ${familyId} is ${status} and cannot be ${change}`);
}
