import { describe, expect, it } from "vitest";
import { ConfigError, directoryConnection, readConfig } from "../../src/config";

const operatorKey = Buffer.alloc(32, 1);
const contextKey = "a context key of 32 characters or more";
const triggerToken = "a trigger token of 32 characters or more";

/** The least environment the Routing module starts with. */
const minimal = {
  DIRECTORY_DATABASE_URL: "postgres://routing@db.internal:6543/directory",
  DIRECTORY_DATABASE_PASSWORD: "directory-password",
  OPERATOR_KEY: operatorKey.toString("base64"),
  CONTEXT_KEY: contextKey,
  TRIGGER_TOKEN: triggerToken,
  CORE_URL: "http://core:3002",
  CORE_TRIGGER_URL: "http://core:3001",
  BLOB_ROOT: "/srv/blobs",
};

const without = (name: keyof typeof minimal) => {
  const env: Record<string, string | undefined> = { ...minimal };
  env[name] = undefined;
  return env;
};

describe("readConfig", () => {
  it("reads the minimal environment, with defaults for everything else", () => {
    expect(readConfig(minimal)).toEqual({
      directoryDatabaseUrl: "postgres://routing@db.internal:6543/directory",
      directoryDatabasePassword: "directory-password",
      operatorKey,
      contextKey,
      coreUrl: "http://core:3002",
      coreTriggerUrl: "http://core:3001",
      triggerToken,
      familyDatabaseHost: "db.internal",
      familyDatabasePort: 6543,
      familyDatabaseCloseTimeoutMs: 30_000,
      blobRoot: "/srv/blobs",
      publicUrl: "https://app.family-agenda.cloud",
      defaultTimeZone: "Europe/Berlin",
      callbackPath: "/sso/callback",
      familyWebhookSecret: null,
      receiverPort: 8081,
      idpManagement: null,
      google: null,
      centralSignIn: null,
      listenHost: "0.0.0.0",
      listenPort: 8080,
      trustProxy: false,
    });
  });

  it("takes every optional setting from the environment", () => {
    const config = readConfig({
      ...minimal,
      FAMILY_DATABASE_HOST: "families.internal",
      FAMILY_DATABASE_PORT: "7000",
      FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS: "5",
      PUBLIC_URL: "https://agenda.example//",
      TIME_ZONE: "America/New_York",
      LISTEN_HOST: "127.0.0.1",
      PORT: "0",
      TRUST_PROXY: "true",
      OIDC_CALLBACK_URL: "https://app.family-agenda.cloud/auth/callback",
      FAMILY_WEBHOOK_SECRET: "a webhook secret of 32 characters or more",
      RECEIVER_PORT: "9000",
      IDP_MANAGEMENT_ENDPOINT: "http://logto:3001/",
      IDP_MANAGEMENT_CLIENT_ID: "m2m",
      IDP_MANAGEMENT_CLIENT_SECRET: "m2m-secret",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google-secret",
      OIDC_ISSUER_URL: "https://auth.family-agenda.cloud/oidc/",
      CENTRAL_SIGN_IN_CLIENT_ID: "central",
      CENTRAL_SIGN_IN_CLIENT_SECRET: "central-secret",
    });
    expect(config).toMatchObject({
      familyDatabaseHost: "families.internal",
      familyDatabasePort: 7000,
      familyDatabaseCloseTimeoutMs: 5000,
      publicUrl: "https://agenda.example",
      defaultTimeZone: "America/New_York",
      listenHost: "127.0.0.1",
      listenPort: 0,
      trustProxy: true,
      callbackPath: "/auth/callback",
      familyWebhookSecret: "a webhook secret of 32 characters or more",
      receiverPort: 9000,
      idpManagement: { endpoint: "http://logto:3001", clientId: "m2m", clientSecret: "m2m-secret" },
      google: { clientId: "client.apps.googleusercontent.com", clientSecret: "google-secret" },
      centralSignIn: { issuerUrl: "https://auth.family-agenda.cloud/oidc", clientId: "central", clientSecret: "central-secret" },
    });
  });

  it("takes empty CENTRAL_SIGN_IN_CLIENT_* as not set, as Compose passes them before the setup wizard ran", () => {
    expect(readConfig({ ...minimal, OIDC_ISSUER_URL: "https://auth.family-agenda.cloud/oidc", CENTRAL_SIGN_IN_CLIENT_ID: "", CENTRAL_SIGN_IN_CLIENT_SECRET: "" }).centralSignIn).toBeNull();
  });

  it.each(["CENTRAL_SIGN_IN_CLIENT_ID", "CENTRAL_SIGN_IN_CLIENT_SECRET"])("refuses central sign-in without %s", (name) => {
    const env: Record<string, string | undefined> = { ...minimal, OIDC_ISSUER_URL: "https://auth.example/oidc", CENTRAL_SIGN_IN_CLIENT_ID: "c", CENTRAL_SIGN_IN_CLIENT_SECRET: "s" };
    env[name] = undefined;
    expect(() => readConfig(env)).toThrow(new ConfigError("CENTRAL_SIGN_IN_CLIENT_ID and CENTRAL_SIGN_IN_CLIENT_SECRET must be set both, or none"));
  });

  it("refuses central sign-in without OIDC_ISSUER_URL", () => {
    expect(() => readConfig({ ...minimal, CENTRAL_SIGN_IN_CLIENT_ID: "c", CENTRAL_SIGN_IN_CLIENT_SECRET: "s" })).toThrow(new ConfigError("OIDC_ISSUER_URL is not set"));
  });

  it.each(["auth.example/oidc", "ftp://auth.example/oidc", "http://"])("refuses OIDC_ISSUER_URL %j", (issuer) => {
    expect(() => readConfig({ ...minimal, OIDC_ISSUER_URL: issuer, CENTRAL_SIGN_IN_CLIENT_ID: "c", CENTRAL_SIGN_IN_CLIENT_SECRET: "s" })).toThrow(
      new ConfigError("OIDC_ISSUER_URL must be an http or https address, Logto's issuer"),
    );
  });

  it.each(["https://app.example/sign-in", "https://app.example/sign-in/callback"])("refuses OIDC_CALLBACK_URL %j, below central sign-in", (url) => {
    expect(() => readConfig({ ...minimal, OIDC_CALLBACK_URL: url })).toThrow(new ConfigError("OIDC_CALLBACK_URL must not be below /sign-in, central sign-in's paths"));
  });

  it("takes OIDC_CALLBACK_URL /sign-inside, which only begins like central sign-in's paths", () => {
    expect(readConfig({ ...minimal, OIDC_CALLBACK_URL: "https://app.example/sign-inside" }).callbackPath).toBe("/sign-inside");
  });

  it("takes empty GOOGLE_CLIENT_* as not set, as Compose passes them unset", () => {
    expect(readConfig({ ...minimal, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).google).toBeNull();
  });

  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])("refuses a Google client without %s", (name) => {
    const env: Record<string, string | undefined> = { ...minimal, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
    env[name] = undefined;
    expect(() => readConfig(env)).toThrow(new ConfigError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set both, or none"));
  });

  it("uses Postgres' default port for the Families' databases when the Directory's address names none", () => {
    expect(readConfig({ ...minimal, DIRECTORY_DATABASE_URL: "postgres://routing@db.internal/directory" }).familyDatabasePort).toBe(5432);
  });

  it("trusts the proxy only when TRUST_PROXY is exactly true", () => {
    expect(readConfig({ ...minimal, TRUST_PROXY: "yes" }).trustProxy).toBe(false);
  });

  it("drops the trailing slashes of BLOB_ROOT", () => {
    expect(readConfig({ ...minimal, BLOB_ROOT: "/srv/blobs//" }).blobRoot).toBe("/srv/blobs");
  });

  it.each(Object.keys(minimal) as (keyof typeof minimal)[])("refuses an environment without %s", (name) => {
    expect(() => readConfig(without(name))).toThrow(new ConfigError(`${name} is not set`));
  });

  it("refuses with a ConfigError", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
  });

  it("refuses an empty setting as not set", () => {
    expect(() => readConfig({ ...minimal, BLOB_ROOT: "" })).toThrow(new ConfigError("BLOB_ROOT is not set"));
  });

  it("refuses a Directory address with a password in it", () => {
    expect(() => readConfig({ ...minimal, DIRECTORY_DATABASE_URL: "postgres://routing:secret@db.internal/directory" })).toThrow(
      new ConfigError("DIRECTORY_DATABASE_URL must not contain a password; set DIRECTORY_DATABASE_PASSWORD"),
    );
  });

  it.each(["CONTEXT_KEY", "TRIGGER_TOKEN"])("refuses a %s shorter than 32 characters, as the core does", (name) => {
    expect(() => readConfig({ ...minimal, [name]: "x".repeat(31) })).toThrow(
      new ConfigError(`${name} must be 32 characters or more (openssl rand -base64 32)`),
    );
    expect(readConfig({ ...minimal, [name]: "x".repeat(32) })).toBeDefined();
  });

  it("takes the Context key as the text it is, as the core does", () => {
    expect(readConfig({ ...minimal, CONTEXT_KEY: "c2hvcnQ= but long enough for the core" }).contextKey).toBe("c2hvcnQ= but long enough for the core");
  });

  it("names the pool by one address for the pages and one for the triggered operations, without trailing slashes", () => {
    const config = readConfig({ ...minimal, CORE_URL: " http://core:3002// ", CORE_TRIGGER_URL: "http://core:3001/" });
    expect(config.coreUrl).toBe("http://core:3002");
    expect(config.coreTriggerUrl).toBe("http://core:3001");
    expect(readConfig({ ...minimal, CORE_URL: "http://core" }).coreUrl).toBe("http://core");
    expect(config).not.toHaveProperty("coreUrls");
    expect(config).not.toHaveProperty("coreTriggerUrls");
  });

  it.each(["CORE_URL", "CORE_TRIGGER_URL"])("refuses a %s that lists several cores, or is no http address", (name) => {
    for (const value of ["http://core-1:3002,http://core-2:3002", "core:3002", "https://core:3002", "http://core:3002/below", "http://core:3002?x", "http://core:3002#x", "http://user@core:3002", "http://core:port", "http://", "x http://core:3002", " "]) {
      expect(() => readConfig({ ...minimal, [name]: value }), value).toThrow(
        new ConfigError(`${name} must be one http address without a path, the cores' service and port, such as http://core:3002`),
      );
    }
  });

  it("is not asked for a core version", () => {
    expect(readConfig(minimal)).not.toHaveProperty("coreVersion");
  });

  it.each(["OPERATOR_KEY"])("refuses a %s that is not 32 bytes", (name) => {
    for (const length of [31, 33]) {
      expect(() => readConfig({ ...minimal, [name]: Buffer.alloc(length).toString("base64") })).toThrow(
        new ConfigError(`${name} must be 32 bytes in base64 (openssl rand -base64 32)`),
      );
    }
  });

  it.each(["65536", "-1", "80a", "123456", "", " 80"])("refuses PORT %j", (port) => {
    expect(() => readConfig({ ...minimal, PORT: port })).toThrow(new ConfigError("PORT must be a port number, 0 to 65535"));
  });

  it.each(["0", "10000", "-1", "1.5", "5s", "", " 5"])("refuses FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS %j", (seconds) => {
    expect(() => readConfig({ ...minimal, FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS: seconds })).toThrow(
      new ConfigError("FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS must be a whole number of seconds, 1 to 9999"),
    );
  });

  it.each([["1", 1000], ["9999", 9_999_000]])("takes FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS %s", (seconds, ms) => {
    expect(readConfig({ ...minimal, FAMILY_DATABASE_CLOSE_TIMEOUT_SECONDS: seconds }).familyDatabaseCloseTimeoutMs).toBe(ms);
  });

  it("accepts the highest port", () => {
    expect(readConfig({ ...minimal, PORT: "65535" }).listenPort).toBe(65_535);
  });

  it.each(["/sso/callback", "https://app.example", "ftp://app.example/cb", "https://app.example/cb?x", "https://app.example/cb#x"])("refuses OIDC_CALLBACK_URL %j", (url) => {
    expect(() => readConfig({ ...minimal, OIDC_CALLBACK_URL: url })).toThrow(
      new ConfigError("OIDC_CALLBACK_URL must be an http or https address with a path, without query or fragment"),
    );
  });

  it("refuses a FAMILY_WEBHOOK_SECRET shorter than 32 characters, as the core does", () => {
    expect(() => readConfig({ ...minimal, FAMILY_WEBHOOK_SECRET: "x".repeat(31) })).toThrow(
      new ConfigError("FAMILY_WEBHOOK_SECRET must be 32 characters or more (openssl rand -base64 32)"),
    );
  });

  it.each(["IDP_MANAGEMENT_ENDPOINT", "IDP_MANAGEMENT_CLIENT_ID", "IDP_MANAGEMENT_CLIENT_SECRET"])("refuses IDP_MANAGEMENT_* without %s", (name) => {
    const env: Record<string, string | undefined> = {
      ...minimal,
      IDP_MANAGEMENT_ENDPOINT: "http://logto:3001",
      IDP_MANAGEMENT_CLIENT_ID: "m2m",
      IDP_MANAGEMENT_CLIENT_SECRET: "m2m-secret",
    };
    env[name] = undefined;
    expect(() => readConfig(env)).toThrow(
      new ConfigError("IDP_MANAGEMENT_ENDPOINT, IDP_MANAGEMENT_CLIENT_ID, IDP_MANAGEMENT_CLIENT_SECRET must be set all three, or none"),
    );
  });

  it.each(["logto:3001", "ftp://logto", "http://"])("refuses IDP_MANAGEMENT_ENDPOINT %j", (endpoint) => {
    expect(() => readConfig({ ...minimal, IDP_MANAGEMENT_ENDPOINT: endpoint, IDP_MANAGEMENT_CLIENT_ID: "m2m", IDP_MANAGEMENT_CLIENT_SECRET: "s" })).toThrow(
      new ConfigError("IDP_MANAGEMENT_ENDPOINT must be an http or https address, Logto's"),
    );
  });

  it("refuses a RECEIVER_PORT that is no port", () => {
    expect(() => readConfig({ ...minimal, RECEIVER_PORT: "x" })).toThrow(new ConfigError("RECEIVER_PORT must be a port number, 0 to 65535"));
  });

  it("ignores the cores' OIDC settings, which only the cores read", () => {
    expect(readConfig({ ...minimal, OIDC_ISSUER_URL: "https://idp.example" })).not.toHaveProperty("identityProvider");
  });
});

describe("directoryConnection", () => {
  it("opens the Directory with the address' parts, decoded, and the password set apart", () => {
    const config = readConfig({ ...minimal, DIRECTORY_DATABASE_URL: "postgres://routing%40ops@db.internal:6543/the%20directory" });
    expect(directoryConnection(config)).toEqual({
      host: "db.internal",
      port: 6543,
      user: "routing@ops",
      database: "the directory",
      password: "directory-password",
    });
  });

  it("uses Postgres' default port when the address names none", () => {
    const config = readConfig({ ...minimal, DIRECTORY_DATABASE_URL: "postgres://routing@db.internal/directory" });
    expect(directoryConnection(config).port).toBe(5432);
  });
});
