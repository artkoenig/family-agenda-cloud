import type { Config } from "./config";
import type { Directory, DirectoryEntry } from "./directory";
import { familyUrl, sealedContext, unwrappedFamily, type Family } from "./family-context";
import { ensureFamilyDatabase, familyDatabaseLeftBehind, familyDatabaseNames } from "./family-databases";
import { blobLocationOf, ProvisioningError, type Provisioning } from "./provisioning";
import type { FamilySchedules } from "./scheduler";
import { drawDatabasePassword, drawFamilyKey, wrapperFor } from "./secrets";

export type CreateFamilyInput = {
  adminEmail: string;
  /** The time zone the Operator named; the configured default for a new Family when absent. */
  timeZone?: string;
  /** A newly drawn Family id, or that of a Family to finish creating after a failure part-way. */
  familyId: string;
  /** Whether `familyId` names a Family to finish creating, rather than a new one. */
  resume: boolean;
};

/** The address the Operator sends to the Family's first Admin. */
const familyAddress = (config: Config, familyId: string): string => `${familyUrl(config, familyId)}/`;

/**
 * Creates a Family, or finishes creating one after a failure part-way: every step is safe to run
 * again with the same Family id and ends in the state of an undisturbed run. Answers its address.
 */
export async function createFamily(provisioning: Provisioning & { schedules: FamilySchedules }, input: CreateFamilyInput): Promise<string> {
  const { config, client, directory, core, schedules, log } = provisioning;
  const { familyId } = input;
  if (!input.resume) await refuseUnfinished(directory);
  const existing = input.resume ? await resumable(provisioning, input) : undefined;
  log.info(existing ? "Finishing the Family" : "Creating the Family", { familyId });
  if (existing?.status === "active") {
    await schedules.create(familyId, existing.timeZone);
    log.info("The Family is active already", { familyId });
    return familyAddress(config, familyId);
  }
  const family = existing ? resumedFamily(config, existing, input) : newFamily(config, input);
  const wrapper = wrapperFor(config.operatorKey, familyId);

  await ensureFamilyDatabase(client, family, family.databasePassword);
  log.info("The Family's database and role exist", { familyId });

  await directory.add({
    familyId,
    databaseName: family.databaseName,
    databaseRole: family.databaseRole,
    blobLocation: family.blobLocation,
    timeZone: family.timeZone,
    wrappedFamilyKey: wrapper.wrap("family-key", family.familyKey),
    wrappedDatabasePassword: wrapper.wrap("database-password", family.databasePassword),
  });
  log.info("The Family is in the Directory, being prepared", { familyId });

  const { coreVersion } = await core.prepareFamily(await sealedContext(config, family));
  log.info("The core prepared the Family", { familyId, coreVersion });

  await core.enterAdmin(await sealedContext(config, family), input.adminEmail);
  log.info("The core entered the first Admin", { familyId });

  // Before it is active, so that an active Family always has them; a Family that is not active is skipped.
  await schedules.create(familyId, family.timeZone);
  log.info("The Family's schedules exist", { familyId });

  await directory.activate(familyId, coreVersion);
  log.info("The Family is active", { familyId });
  return familyAddress(config, familyId);
}

/** A new Family is refused while another is half-made, so that a careless re-run leaves none behind. */
async function refuseUnfinished(directory: Directory): Promise<void> {
  const [unfinished] = await directory.beingPrepared();
  if (unfinished) {
    throw new ProvisioningError(
      `The Family ${unfinished} is still being prepared; finish it first with create --family-id ${unfinished}`,
    );
  }
}

/**
 * The entry of the Family to finish, or undefined when creating it stopped before its entry was
 * written. A Family id that has left no trace is refused: the Operator does not choose Family ids.
 */
async function resumable({ client, directory }: Provisioning, { familyId }: CreateFamilyInput): Promise<DirectoryEntry | undefined> {
  const entry = await directory.find(familyId);
  if (entry) return entry;
  if (await familyDatabaseLeftBehind(client, familyDatabaseNames(familyId))) return undefined;
  throw new ProvisioningError(`Nothing of the Family ${familyId} was created; run create without --family-id`);
}

/** A Family that is not in the Directory yet: its key and password drawn now. */
function newFamily(config: Config, { familyId, timeZone }: CreateFamilyInput): Family {
  return {
    familyId,
    ...familyDatabaseNames(familyId),
    blobLocation: blobLocationOf(config, familyId),
    timeZone: timeZone ?? config.defaultTimeZone,
    familyKey: drawFamilyKey(),
    databasePassword: drawDatabasePassword(),
  };
}

/** A Family whose creation stopped part-way, as its Directory entry has it. */
function resumedFamily(config: Config, entry: DirectoryEntry, input: CreateFamilyInput): Family {
  if (entry.status !== "being_prepared") throw new ProvisioningError(`The Family is ${entry.status} and cannot be created again`);
  if (input.timeZone !== undefined && input.timeZone !== entry.timeZone) {
    throw new ProvisioningError(`The Family was begun with the time zone ${entry.timeZone}, not ${input.timeZone}`);
  }
  return unwrappedFamily(config, entry);
}
