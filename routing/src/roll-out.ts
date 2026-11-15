import type { DirectoryEntry, FailedPreparation } from "./directory";
import { sealedContext, unwrappedFamily } from "./family-context";
import { isNewer } from "./family-readiness";
import { reasonOf } from "./log";
import type { Provisioning } from "./provisioning";

/**
 * How a rollout ended: the Families it prepared, those it could not prepare, with why, and those
 * it refused because they are prepared for a newer core version than the pool runs.
 */
export type RollOutResult = {
  coreVersion: string;
  prepared: string[];
  failed: FailedPreparation[];
  newer: { familyId: string; coreVersion: string }[];
};

/**
 * Prepares every Family that is behind for the core version the pool runs (CORE_VERSION), one
 * after another, oldest first, through the core's "prepare the Family", and notes the version for
 * each on success. Until then the Router answers the Family 503 and the Scheduler triggers nothing
 * for it; once noted, it is routed and scheduled again.
 *
 * - Active and suspended Families are prepared. A suspended Family keeps its status: it is ready
 *   for the running version when it is resumed.
 * - A Family being prepared is left to `create --family-id`, which prepares it on the running core
 *   as it finishes it; a deleted Family has no database to prepare and is skipped.
 * - A failure is noted in the Directory and the rollout carries on with the next Family. So is a
 *   core that answers a version other than CORE_VERSION: the pool and CORE_VERSION disagree.
 * - Running it again prepares only the Families still behind. For a Family whose preparation
 *   succeeded but was not noted it calls "prepare the Family" again, which the core's contract
 *   makes safe: prepare-family is idempotent.
 * - A Family prepared for a newer core version than CORE_VERSION is refused and named, not
 *   prepared: an older core cannot read a database a newer one migrated. Going back to an older
 *   release is a restore of the backup taken before the upgrade, not a rollout.
 * - While a rollout runs, every path of a Family it has not reached yet, the Agenda feed that
 *   calendar apps subscribe to too, answers 503 with `Retry-After: 30` until it is prepared.
 */
export async function rollOut(provisioning: Provisioning): Promise<RollOutResult> {
  const { config, directory, log } = provisioning;
  const { coreVersion } = config;
  const result: RollOutResult = { coreVersion, prepared: [], failed: [], newer: [] };
  const behind = await directory.behind(coreVersion);
  log.info("Rolling out the core version", { coreVersion, families: behind.length });
  for (const entry of behind) {
    const { familyId } = entry;
    if (entry.coreVersion !== null && isNewer(entry.coreVersion, coreVersion)) {
      result.newer.push({ familyId, coreVersion: entry.coreVersion });
      log.error("The Family is prepared for a newer core version; it is not prepared for an older one", {
        familyId,
        familyCoreVersion: entry.coreVersion,
        coreVersion,
      });
      continue;
    }
    try {
      await prepare(provisioning, entry);
      result.prepared.push(familyId);
    } catch (error) {
      const reason = reasonOf(error);
      await directory.notePreparationFailed(familyId, { coreVersion, error: reason });
      result.failed.push({ familyId, error: reason });
      log.error("Preparing the Family for the core version failed", { familyId, coreVersion, reason });
    }
  }
  return result;
}

/** Prepares the Family for CORE_VERSION and notes it. */
async function prepare({ config, directory, core, log }: Provisioning, entry: DirectoryEntry): Promise<void> {
  const { coreVersion } = config;
  const { familyId } = entry;
  const answered = await core.prepareFamily(await sealedContext(config, unwrappedFamily(config, entry)));
  if (answered.coreVersion !== coreVersion) {
    throw new Error(`The core answered version ${answered.coreVersion}, not the CORE_VERSION ${coreVersion}`);
  }
  await directory.notePrepared(familyId, coreVersion);
  log.info("The Family is prepared for the core version", { familyId, coreVersion });
}
