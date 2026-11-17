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
  /** Encrypts and signs the Contexts the cores open; shared with the cores, 32 characters or more. */
  contextKey: string;
  /**
   * The pool of cores where it serves the pages: the cores' service and their `CALLER_PORT`. The
   * name stands for however many cores run now, and is resolved at each call (see pool.ts).
   */
  coreUrl: string;
  /** The pool of cores where it serves the triggered operations: the cores' service and their `TRIGGER_PORT`. */
  coreTriggerUrl: string;
  /** The token the cores' triggered operations require, as `Authorization: Bearer`; shared with the cores. */
  triggerToken: string;
  /** Where the cores reach the Families' databases; the Directory's server unless set. */
  familyDatabaseHost: string;
  familyDatabasePort: number;
  /** How long deleting a Family waits for the cores to close their connections to its database. */
  familyDatabaseCloseTimeoutMs: number;
  /** The directory, as the cores see it, that holds one blob location per Family. */
  blobRoot: string;
  /** The origin all Families are served from. */
  publicUrl: string;
  /** The time zone of a new Family unless the command names one. */
  defaultTimeZone: string;
  /**
   * The path of the cores' one sign-in callback `OIDC_CALLBACK_URL`, which the Router passes on
   * without a Context; `/sso/callback` unless set.
   */
  callbackPath: string;
  /**
   * The secret the cores sign `family.created` with (their `FAMILY_WEBHOOK_SECRET`), 32
   * characters or more; only the receiver needs it.
   */
  familyWebhookSecret: string | null;
  /** Where the receiver listens for the cores' `family.created`. */
  receiverPort: number;
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
    contextKey: secret(env, "CONTEXT_KEY"),
    coreUrl: poolAddress(env, "CORE_URL"),
    coreTriggerUrl: poolAddress(env, "CORE_TRIGGER_URL"),
    triggerToken: secret(env, "TRIGGER_TOKEN"),
    familyDatabaseHost: env.FAMILY_DATABASE_HOST ?? directoryDatabaseUrl.hostname,
    familyDatabasePort: Number(env.FAMILY_DATABASE_PORT ?? (directoryDatabaseUrl.port || "5432")),
    familyDatabaseCloseTimeoutMs: closeTimeoutMs(env),
    blobRoot: withoutTrailingSlash(required(env, "BLOB_ROOT")),
    publicUrl: withoutTrailingSlash(env.PUBLIC_URL ?? "https://app.family-agenda.cloud"),
    defaultTimeZone: env.TIME_ZONE ?? "Europe/Berlin",
    callbackPath: callbackPath(env),
    familyWebhookSecret: env.FAMILY_WEBHOOK_SECRET ? secret(env, "FAMILY_WEBHOOK_SECRET") : null,
    receiverPort: port(env, "RECEIVER_PORT", "8081"),
    ...listenSettings(env),
  };
}

/** An http address of a host and its port alone: no credentials, path, query or fragment, and no list. */
const POOL_ADDRESS = /^http:\/\/[^/?#@,\s]+$/;

/** The one address `name` gives the pool: http, a host and a port, nothing below it. */
function poolAddress(env: Env, name: string): string {
  const address = withoutTrailingSlash(required(env, name).trim());
  if (!POOL_ADDRESS.test(address) || !URL.canParse(address)) {
    throw new ConfigError(`${name} must be one http address without a path, the cores' service and port, such as http://core:3002`);
  }
  return address;
}

/** FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS, whole seconds; 30 unless set, three times a core's idle timeout. */
function closeTimeoutMs(env: Env): number {
  const seconds = env.FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS ?? "30";
  if (!/^\d{1,4}$/.test(seconds) || Number(seconds) === 0) {
    throw new ConfigError("FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS must be a whole number of seconds, 1 to 9999");
  }
  return Number(seconds) * 1000;
}

/** Where and how the Router listens. */
function listenSettings(env: Env): Pick<Config, "listenHost" | "listenPort" | "trustProxy"> {
  return { listenHost: env.LISTEN_HOST ?? "0.0.0.0", listenPort: port(env, "PORT", "8080"), trustProxy: env.TRUST_PROXY === "true" };
}

/** The port `name` gives, `fallback` unless set; 0 lets the system choose a free port. */
function port(env: Env, name: string, fallback: string): number {
  const value = env[name] ?? fallback;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65_535) throw new ConfigError(`${name} must be a port number, 0 to 65535`);
  return Number(value);
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

/** The path of OIDC_CALLBACK_URL, an http or https address with a path; `/sso/callback` unless set. */
function callbackPath(env: Env): string {
  const value = env.OIDC_CALLBACK_URL;
  if (value === undefined) return "/sso/callback";
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (!url || !/^https?:$/.test(url.protocol) || url.pathname === "/" || url.search || url.hash) {
    throw new ConfigError("OIDC_CALLBACK_URL must be an http or https address with a path, without query or fragment");
  }
  return url.pathname;
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

/** A secret shared with the cores: 32 characters or more, as the core requires (`openssl rand -base64 32`). */
function secret(env: Env, name: string): string {
  const value = required(env, name);
  if (value.length < 32) throw new ConfigError(`${name} must be 32 characters or more (openssl rand -base64 32)`);
  return value;
}

function withoutTrailingSlash(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end--;
  return text.slice(0, end);
}
