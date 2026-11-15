import { rm, stat } from "node:fs/promises";
import { ProvisioningError, type Provisioning } from "./create-family";
import { dropFamilyDatabase } from "./family-databases";

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
 * password, so that from then on nothing routes to it or schedules it, and what is left of its
 * data opens with no key the Routing module still has. Its entry stays, as the record that it was
 * deleted, with no secrets in it.
 */
export async function deleteFamily(provisioning: Omit<Provisioning, "core">, input: DeleteFamilyInput): Promise<void> {
  const { config, client, directory, log } = provisioning;
  const { familyId } = input;
  if (input.confirmation !== familyId) {
    throw new ProvisioningError("The confirmation does not match the Family id; nothing was deleted");
  }
  const entry = await directory.find(familyId);
  if (!entry) throw new ProvisioningError(`There is no Family ${familyId}`);
  const blobLocation = `${config.blobRoot}/${familyId}`;
  if (entry.blobLocation !== blobLocation) {
    throw new ProvisioningError(`The Family's blob location is not ${blobLocation}; nothing was deleted`);
  }
  log.info(entry.status === "deleted" ? "Finishing the deletion of the Family" : "Deleting the Family", { familyId });

  await directory.markDeleted(familyId);
  log.info("The Family is marked deleted; its wrapped family key and database password are destroyed", { familyId });

  removeSchedules();

  await dropFamilyDatabase(client, entry);
  log.info("The Family's database and role are dropped", { familyId });

  await removeBlobs(config.blobRoot, blobLocation);
  log.info("The Family's blob location is removed", { familyId });

  log.info("The Family is deleted", { familyId });
}

/**
 * Removes the blob location with all in it. A blob root that is not there, such as a shared volume
 * that is not mounted, fails the step, so that blobs it cannot see are not reported gone.
 */
async function removeBlobs(blobRoot: string, blobLocation: string): Promise<void> {
  const root = await stat(blobRoot).catch(() => undefined);
  if (!root?.isDirectory()) throw new Error(`The blob root ${blobRoot} is not there`);
  await rm(blobLocation, { recursive: true, force: true });
}

/**
 * Removes the Family's schedules. The Scheduler (#95) does not exist yet, so there are none; it
 * fills this seam. A deleted Family is not active, so the Scheduler skips it in any case.
 */
function removeSchedules(): void {
  // Nothing to remove until #95: no Family has schedules yet.
}
