/**
 * The Routing module's settings, from the environment only. The Operator key, the Context key and
 * the Directory's database password are secrets: they live in the `.env` on the Cube and are read
 * from nowhere else.
 */
/** The Identity Provider all Families sign in through, named as the core names its `OIDC_*` settings. */
export type IdentityProviderSettings = { issuerUrl: string; clientId: string; clientSecret: string; requiredGroup: string };

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
  identityProvider: IdentityProviderSettings | null;
  /** Where the Router listens for the browsers' requests. */
  listenHost: string;
  listenPort: number;
  /**
   * Whether the Router takes the client's address and scheme from the `X-Forwarded-*` headers of
   * the proxy in front of it (Caddy). Only behind a proxy the Operator runs.
   */
  trustProxy: boolean;
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
    coreUrls: coreUrls(env),
    familyDatabaseHost: env.FAMILY_DATABASE_HOST ?? directoryDatabaseUrl.hostname,
    familyDatabasePort: Number(env.FAMILY_DATABASE_PORT ?? (directoryDatabaseUrl.port || "5432")),
    blobRoot: withoutTrailingSlash(required(env, "BLOB_ROOT")),
    publicUrl: withoutTrailingSlash(env.PUBLIC_URL ?? "https://app.family-agenda.cloud"),
    defaultTimeZone: env.TIME_ZONE ?? "Europe/Berlin",
    identityProvider: identityProvider(env),
    ...listenSettings(env),
  };
}

/** The cores of the pool, separated by commas; at least one. */
function coreUrls(env: Env): string[] {
  const urls = required(env, "CORE_URLS")
    .split(",")
    .map((url) => withoutTrailingSlash(url.trim()))
    .filter(Boolean);
  if (urls.length === 0) throw new ConfigError("CORE_URLS must name at least one core");
  return urls;
}

/** Where and how the Router listens. */
function listenSettings(env: Env): Pick<Config, "listenHost" | "listenPort" | "trustProxy"> {
  const port = env.PORT ?? "8080";
  // 0 lets the system choose a free port.
  if (!/^\d{1,5}$/.test(port) || Number(port) > 65_535) throw new ConfigError("PORT must be a port number, 0 to 65535");
  return { listenHost: env.LISTEN_HOST ?? "0.0.0.0", listenPort: Number(port), trustProxy: env.TRUST_PROXY === "true" };
}

/** How to open the Directory's database. */
export function directoryConnection(config: Config): { host: string; port: number; user: string; database: string; password: string } {
  const url = new URL(config.directoryDatabaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "5432"),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    password: config.directoryDatabasePassword,
  };
}

function identityProvider(env: Env): IdentityProviderSettings | null {
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
