import type { Config } from "./config";
import { sealContext, type ContextClaims } from "./context";
import type { DirectoryEntry } from "./directory";
import { wrapperFor } from "./secrets";

/** Everything a Family is made of, its secrets unwrapped: held in memory only. */
export type Family = {
  familyId: string;
  databaseName: string;
  databaseRole: string;
  blobLocation: string;
  timeZone: string;
  familyKey: string;
  databasePassword: string;
};

/**
 * The Family's public address, without a trailing slash: the core emits its addresses below it.
 * The address given to the Operator is this with a trailing slash.
 */
export const familyUrl = (config: Config, familyId: string): string => `${config.publicUrl}/${familyId}`;

/**
 * The Family as its Directory entry has it, its family key and database password unwrapped.
 * Throws for an entry that holds no keys, such as that of a deleted Family.
 */
export function unwrappedFamily(config: Config, entry: DirectoryEntry): Family {
  if (!entry.wrappedFamilyKey || !entry.wrappedDatabasePassword) throw new Error(`The Directory entry of the Family ${entry.familyId} holds no keys`);
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

/** The Context a core opens the Family with, sealed for one call or request. */
export function sealedContext(config: Config, family: Family): Promise<string> {
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
