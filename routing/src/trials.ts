/**
 * Starting Trials: for every Family once the Operator opens Trials, and from then on for each Family
 * that registers, at its creation; for one Family by hand. A Family has one Trial, and none once it
 * had a Subscription.
 */
import type { Directory } from "./directory";
import { existingEntry, ProvisioningError } from "./provisioning";
import { trialEndsAt } from "./trial";

/** A Trial that started: of which Family, and when it ends. */
export type StartedTrial = { familyId: string; startsAt: Date; endsAt: Date };

/**
 * Starts the Family's Trial now. Refuses a Family that is deleted, has a Trial already, or had a
 * Subscription; changes nothing then.
 */
export async function startTrial(directory: Directory, familyId: string): Promise<StartedTrial> {
  const startsAt = await directory.startTrial(familyId);
  if (startsAt) return { familyId, startsAt, endsAt: trialEndsAt(startsAt) };
  const { status, trialStartsAt } = await existingEntry(directory, familyId);
  if (status === "deleted") throw new ProvisioningError(`The Family ${familyId} is deleted and gets no Trial`);
  if (trialStartsAt) throw new ProvisioningError(`The Family ${familyId} had its Trial already; it started ${trialStartsAt.toISOString()}`);
  throw new ProvisioningError(`The Family ${familyId} had a Subscription and gets no Trial`);
}
