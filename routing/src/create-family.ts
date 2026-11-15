import type pg from "pg";
import type { Config } from "./config";
import { sealContext, type ContextClaims } from "./context";
import type { Core } from "./core";
import type { Directory, DirectoryEntry } from "./directory";
import { ensureFamilyDatabase, familyDatabaseNames } from "./family-databases";
import type { Log } from "./log";
import { drawDatabasePassword, drawFamilyKey, unwrap, wrap } from "./secrets";

export type CreateFamilyInput = {
  adminEmail: string;
  timeZone: string;
  /** A newly drawn Family id, or that of a Family to finish creating after a failure part-way. */
  familyId: string;
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

/** The address the Family is served at. */
export const familyAddress = (config: Config, familyId: string): string => `${config.publicUrl}/${familyId}/`;

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
  log.info("Creating the Family", { familyId });
  const existing = await directory.find(familyId);
  if (existing?.status === "active") {
    log.info("The Family is active already", { familyId });
    return familyAddress(config, familyId);
  }
  const family = existing ? resumedFamily(config, existing) : newFamily(config, input);

  await ensureFamilyDatabase(client, family, family.databasePassword);
  log.info("The Family's database and role exist", { familyId });

  await directory.add({
    familyId,
    databaseName: family.databaseName,
    databaseRole: family.databaseRole,
    blobLocation: family.blobLocation,
    timeZone: family.timeZone,
    wrappedFamilyKey: wrap(config.operatorKey, familyId, "family-key", family.familyKey),
    wrappedDatabasePassword: wrap(config.operatorKey, familyId, "database-password", family.databasePassword),
  });
  log.info("The Family is in the Directory, being prepared", { familyId });

  const { coreVersion } = await core.prepareFamily(await sealContext(config.contextKey, contextOf(config, family)));
  log.info("The core prepared the Family", { familyId, coreVersion });

  await core.enterAdmin(await sealContext(config.contextKey, contextOf(config, family)), input.adminEmail);
  log.info("The core entered the first Admin", { familyId });

  await directory.activate(familyId, coreVersion);
  log.info("The Family is active", { familyId });
  return familyAddress(config, familyId);
}

/** A Family that is not in the Directory yet: its id from the input, its key and password drawn now. */
function newFamily(config: Config, { familyId, timeZone }: CreateFamilyInput): Family {
  return {
    familyId,
    ...familyDatabaseNames(familyId),
    blobLocation: `${config.blobRoot}/${familyId}`,
    timeZone,
    familyKey: drawFamilyKey(),
    databasePassword: drawDatabasePassword(),
  };
}

/** A Family whose creation stopped part-way, as its Directory entry has it. */
function resumedFamily(config: Config, entry: DirectoryEntry): Family {
  if (entry.status !== "being_prepared") throw new ProvisioningError(`The Family is ${entry.status} and cannot be created again`);
  if (!entry.wrappedFamilyKey || !entry.wrappedDatabasePassword) throw new ProvisioningError("The Family's entry holds no keys");
  return {
    familyId: entry.familyId,
    databaseName: entry.databaseName,
    databaseRole: entry.databaseRole,
    blobLocation: entry.blobLocation,
    timeZone: entry.timeZone,
    familyKey: unwrap(config.operatorKey, entry.familyId, "family-key", entry.wrappedFamilyKey),
    databasePassword: unwrap(config.operatorKey, entry.familyId, "database-password", entry.wrappedDatabasePassword),
  };
}

/** The Context a core opens the Family with. */
function contextOf(config: Config, family: Family): ContextClaims {
  return {
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
    publicUrl: `${config.publicUrl}/${family.familyId}`,
    pathPrefix: `/${family.familyId}`,
    identityProvider: config.identityProvider,
    identityProviderSignIn: "known-admins-only",
  };
}
