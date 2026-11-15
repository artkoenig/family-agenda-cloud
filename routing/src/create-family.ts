import type pg from "pg";
import type { Config } from "./config";
import { sealContext, type ContextClaims } from "./context";
import type { Core } from "./core";
import type { Directory, DirectoryEntry } from "./directory";
import { ensureFamilyDatabase, familyDatabaseLeftBehind, familyDatabaseNames } from "./family-databases";
import type { Log } from "./log";
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

export type Provisioning = {
  config: Config;
  /** The Routing module's connection to the Directory's server, which creates the Families' databases too. */
  client: pg.ClientBase;
  directory: Directory;
  core: Core;
  log: Log;
};

export class ProvisioningError extends Error {}

/**
 * The Family's public address, without a trailing slash: the core emits its addresses below it.
 * The address given to the Operator is this with a trailing slash.
 */
export const familyUrl = (config: Config, familyId: string): string => `${config.publicUrl}/${familyId}`;

/** The address the Operator sends to the Family's first Admin. */
const familyAddress = (config: Config, familyId: string): string => `${familyUrl(config, familyId)}/`;

/** Everything a Family is made of, its secrets unwrapped: held in memory only. */
type Family = {
  familyId: string;
  databaseName: string;
  databaseRole: string;
  blobLocation: string;
  timeZone: string;
  familyKey: string;
  databasePassword: string;
};

/**
 * Creates a Family, or finishes creating one after a failure part-way: every step is safe to run
 * again with the same Family id and ends in the state of an undisturbed run. Answers its address.
 */
export async function createFamily(provisioning: Provisioning, input: CreateFamilyInput): Promise<string> {
  const { config, client, directory, core, log } = provisioning;
  const { familyId } = input;
  if (!input.resume) await refuseUnfinished(directory);
  const existing = input.resume ? await resumable(provisioning, input) : undefined;
  log.info(existing ? "Finishing the Family" : "Creating the Family", { familyId });
  if (existing?.status === "active") {
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
    blobLocation: `${config.blobRoot}/${familyId}`,
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
  if (!entry.wrappedFamilyKey || !entry.wrappedDatabasePassword) throw new ProvisioningError("The Family's entry holds no keys");
  const wrapper = wrapperFor(config.operatorKey, entry.familyId);
  return {
    familyId: entry.familyId,
    databaseName: entry.databaseName,
    databaseRole: entry.databaseRole,
    blobLocation: entry.blobLocation,
    timeZone: entry.timeZone,
    familyKey: wrapper.unwrap("family-key", entry.wrappedFamilyKey),
    databasePassword: wrapper.unwrap("database-password", entry.wrappedDatabasePassword),
  };
}

/** The Context a core opens the Family with, sealed for one call. */
function sealedContext(config: Config, family: Family): Promise<string> {
  const claims: ContextClaims = {
    familyId: family.familyId,
    database: {
      host: config.familyDatabaseHost,
      port: config.familyDatabasePort,
      name: family.databaseName,
      user: family.databaseRole,
      password: family.databasePassword,
    },
    familyKey: family.familyKey,
    blobLocation: family.blobLocation,
    timeZone: family.timeZone,
    publicUrl: familyUrl(config, family.familyId),
    pathPrefix: `/${family.familyId}`,
    identityProvider: config.identityProvider,
    identityProviderSignIn: "known-admins-only",
  };
  return sealContext(config.contextKey, claims);
}
