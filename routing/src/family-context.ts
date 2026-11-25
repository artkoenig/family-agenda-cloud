import { posix } from "node:path";
import type { Config } from "./config";
import { sealContext, type AdminSection } from "./context";
import { CONTRACT_FRAGMENT_PATHS } from "./contract-wording";
import type { DirectoryEntry } from "./directory";
import { CONTRACT_SECTION } from "./routing-pages";
import { wrapperFor } from "./secrets";

/** Everything a Family is made of, its secrets unwrapped: held in memory only. */
export type Family = {
  familyId: string;
  databaseName: string;
  databaseRole: string;
  blobLocation: string;
  timeZone: string;
  /** The Family's Logto Organization; null for a Family created before registration. */
  organizationId: string | null;
  /** The Family's founder, as the Directory records it; null while it is not known. */
  registeredBy: string | null;
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
    organizationId: entry.organizationId,
    registeredBy: entry.registeredBy,
    familyKey: wrapper.unwrap("family-key", entry.wrappedFamilyKey),
    databasePassword: wrapper.unwrap("database-password", entry.wrappedDatabasePassword),
  };
}

/** The Context a core opens the Family with, sealed for one call or request. */
export function sealedContext(config: Config, family: Family): string {
  return sealContext(config.contextKey, {
    familyId: family.familyId,
    databaseUrl: databaseUrlOf(config, family),
    // Drawn as base64; the core takes base64url, which is the same 32 bytes.
    familyKey: Buffer.from(family.familyKey, "base64").toString("base64url"),
    blobDirectory: blobDirectoryOf(family),
    timeZone: family.timeZone,
    publicUrl: familyUrl(config, family.familyId),
    ...(family.organizationId === null ? {} : { organizationId: family.organizationId }),
    ...sectionsOf(config, family),
  });
}

/** The Contract section (contract-section.ts) for the founder, where there is one and the Router serves the fragment. A core takes only an `https:` address. */
function sectionsOf(config: Config, { registeredBy }: Family): { sections?: AdminSection[] } {
  if (registeredBy === null || !config.publicUrl.startsWith("https:") || !config.stripe || !config.idpManagement) return {};
  const { de, en } = CONTRACT_FRAGMENT_PATHS;
  return {
    sections: [{ id: CONTRACT_SECTION, label: { en: "Contract", de: "Vertrag" }, onlyFor: registeredBy, src: { en: `${config.publicUrl}${en}`, de: `${config.publicUrl}${de}` } }],
  };
}

/** The core keeps the Family's blobs in <blobDirectory>/<familyId>, so the blob location must end in the Family id. */
function blobDirectoryOf({ familyId, blobLocation }: Family): string {
  if (posix.basename(blobLocation) !== familyId) throw new Error(`The blob location ${blobLocation} of the Family ${familyId} is not named by its Family id`);
  return posix.dirname(blobLocation);
}

/** The Family's database as a Postgres connection string, with the Family's role and its password. */
function databaseUrlOf(config: Config, family: Family): string {
  const url = new URL("postgres://placeholder");
  url.hostname = config.familyDatabaseHost;
  url.port = String(config.familyDatabasePort);
  url.username = encodeURIComponent(family.databaseRole);
  url.password = encodeURIComponent(family.databasePassword);
  url.pathname = `/${encodeURIComponent(family.databaseName)}`;
  return url.toString();
}
