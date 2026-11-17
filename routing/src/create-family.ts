import type { Config } from "./config";
import type { Directory, DirectoryEntry } from "./directory";
import { familyUrl, sealedContext, unwrappedFamily, type Family } from "./family-context";
import { ensureFamilyDatabase, familyDatabaseLeftBehind, familyDatabaseNames } from "./family-databases";
import { blobLocationOf } from "./family-id";
import { ProvisioningError, withFamilyLock, type Provisioning } from "./provisioning";
import type { FamilySchedules } from "./scheduler";
import { drawDatabasePassword, drawFamilyKey, wrapperFor } from "./secrets";

export type CreateFamilyInput = {
  /** The Logto Organization whose members with the role `admin` are the Family's Admins. */
  organizationId: string;
  /** The time zone the Operator named; the configured default for a new Family when absent. */
  timeZone?: string;
  familyId: string;
  /**
   * Where `familyId` comes from: `drawn` now for a new Family; named by the `operator` to finish
   * a Family after a failure part-way; or drawn by the core whose `family.created` announced a
   * `registration`, new or delivered again.
   */
  familyIdFrom: "drawn" | "operator" | "registration";
};

/** The Family's address, where its Admins sign in. */
const familyAddress = (config: Config, familyId: string): string => `${familyUrl(config, familyId)}/`;

/**
 * Creates a Family, or finishes creating one after a failure part-way: every step is safe to run
 * again with the same Family id and ends in the state of an undisturbed run. Answers its address.
 */
export async function createFamily(provisioning: Provisioning & { schedules: FamilySchedules }, input: CreateFamilyInput): Promise<string> {
  // Two deliveries of one family.created may arrive side by side; they run one after the other.
  return withFamilyLock(provisioning.client, input.familyId, () => creating(provisioning, input));
}

async function creating(provisioning: Provisioning & { schedules: FamilySchedules }, input: CreateFamilyInput): Promise<string> {
  const { config, client, directory, core, schedules, log } = provisioning;
  const { familyId } = input;
  if (input.familyIdFrom === "drawn") await refuseUnfinished(directory);
  const existing = await existingOf(provisioning, input);
  if (existing && existing.organizationId !== input.organizationId) {
    throw new ProvisioningError(`The Family ${familyId} belongs to the Organization ${existing.organizationId ?? "(none)"}, not ${input.organizationId}`);
  }
  log.info(existing ? "Finishing the Family" : "Creating the Family", { familyId, organizationId: input.organizationId });
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
    organizationId: input.organizationId,
    wrappedFamilyKey: wrapper.wrap("family-key", family.familyKey),
    wrappedDatabasePassword: wrapper.wrap("database-password", family.databasePassword),
  });
  log.info("The Family is in the Directory, being prepared", { familyId });

  // The core that opens the Family first prepares its database and records its Organization.
  await core.openFamily(sealedContext(config, family));
  log.info("A core opened the Family", { familyId });

  // Before it is active, so that an active Family always has them; a Family that is not active is skipped.
  await schedules.create(familyId, family.timeZone);
  log.info("The Family's schedules exist", { familyId });

  await directory.activate(familyId);
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
 * The entry of the Family to finish, or undefined for a new Family and one whose creation stopped
 * before its entry was written. A Family id the Operator names that has left no trace is refused:
 * the Operator does not choose Family ids.
 */
async function existingOf({ client, directory }: Provisioning, { familyId, familyIdFrom }: CreateFamilyInput): Promise<DirectoryEntry | undefined> {
  if (familyIdFrom === "drawn") return undefined;
  const entry = await directory.find(familyId);
  if (entry || familyIdFrom === "registration") return entry;
  if (await familyDatabaseLeftBehind(client, familyDatabaseNames(familyId))) return undefined;
  throw new ProvisioningError(`Nothing of the Family ${familyId} was created; run create without --family-id`);
}

/** A Family that is not in the Directory yet: its key and password drawn now. */
function newFamily(config: Config, { familyId, timeZone, organizationId }: CreateFamilyInput): Family {
  return {
    familyId,
    ...familyDatabaseNames(familyId),
    blobLocation: blobLocationOf(config, familyId),
    timeZone: timeZone ?? config.defaultTimeZone,
    organizationId,
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
