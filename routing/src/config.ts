/**
 * The Routing module's settings, from the environment only. The Operator key, the Context key and
 * the Directory's database password are secrets: they live in the `.env` on the Cube and are read
 * from nowhere else.
 */
export type Config = {
  /** The Directory's database, without its password. */
  directoryDatabaseUrl: string;
  directoryDatabasePassword: string;
  /** Wraps every family key and Family database password stored in the Directory. */
  operatorKey: Buffer;
  /** Encrypts and signs the Contexts the cores open; shared with the cores. */
  contextKey: Buffer;
  /** The cores of the pool. */
  coreUrls: string[];
  /** Where the cores reach the Families' databases; the Directory's server unless set. */
  familyDatabaseHost: string;
  familyDatabasePort: number;
  /** The directory, as the cores see it, that holds one blob location per Family. */
  blobRoot: string;
  /** The origin all Families are served from. */
  publicUrl: string;
  /** The time zone of a new Family unless the command names one. */
  defaultTimeZone: string;
  identityProvider: { issuerUrl: string; clientId: string; clientSecret: string; requiredGroup: string } | null;
};

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

export function readConfig(env: Env): Config {
  const directoryDatabaseUrl = new URL(required(env, "DIRECTORY_DATABASE_URL"));
  if (directoryDatabaseUrl.password) {
    throw new ConfigError("DIRECTORY_DATABASE_URL must not contain a password; set DIRECTORY_DATABASE_PASSWORD");
  }
  return {
    directoryDatabaseUrl: directoryDatabaseUrl.toString(),
    directoryDatabasePassword: required(env, "DIRECTORY_DATABASE_PASSWORD"),
    operatorKey: key(env, "OPERATOR_KEY"),
    contextKey: key(env, "CONTEXT_KEY"),
    coreUrls: required(env, "CORE_URLS")
      .split(",")
      .map((url) => withoutTrailingSlash(url.trim()))
      .filter(Boolean),
    familyDatabaseHost: env.FAMILY_DATABASE_HOST ?? directoryDatabaseUrl.hostname,
    familyDatabasePort: Number(env.FAMILY_DATABASE_PORT ?? (directoryDatabaseUrl.port || "5432")),
    blobRoot: withoutTrailingSlash(required(env, "BLOB_ROOT")),
    publicUrl: withoutTrailingSlash(env.PUBLIC_URL ?? "https://app.family-agenda.cloud"),
    defaultTimeZone: env.TIME_ZONE ?? "Europe/Berlin",
    identityProvider: identityProvider(env),
  };
}

/** The Identity Provider all Families sign in through, named as the core names its settings. */
function identityProvider(env: Env): Config["identityProvider"] {
  if (!env.OIDC_ISSUER_URL) return null;
  return {
    issuerUrl: env.OIDC_ISSUER_URL,
    clientId: required(env, "OIDC_CLIENT_ID"),
    clientSecret: required(env, "OIDC_CLIENT_SECRET"),
    requiredGroup: required(env, "OIDC_REQUIRED_GROUP"),
  };
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`${name} is not set`);
  return value;
}

/** A 32-byte key, given as base64 (`openssl rand -base64 32`). */
function key(env: Env, name: string): Buffer {
  const value = Buffer.from(required(env, name), "base64");
  if (value.length !== 32) throw new ConfigError(`${name} must be 32 bytes in base64 (openssl rand -base64 32)`);
  return value;
}

function withoutTrailingSlash(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end--;
  return text.slice(0, end);
}
