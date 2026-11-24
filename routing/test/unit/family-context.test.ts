import { describe, expect, it } from "vitest";
import { readConfig, type Config } from "../../src/config";
import type { DirectoryEntry } from "../../src/directory";
import { familyUrl, sealedContext, unwrappedFamily, type Family } from "../../src/family-context";
import { wrapperFor } from "../../src/secrets";
import { openContext } from "../support/core-context";

const operatorKey = Buffer.alloc(32, 5);
const contextKey = "the context key, 32 characters or more";

const config: Config = readConfig({
  DIRECTORY_DATABASE_URL: "postgres://routing@directory.internal/directory",
  DIRECTORY_DATABASE_PASSWORD: "directory-password",
  OPERATOR_KEY: operatorKey.toString("base64"),
  CONTEXT_KEY: contextKey,
  TRIGGER_TOKEN: "the trigger token, 32 characters or more",
  CORE_URL: "http://core:3002",
  CORE_TRIGGER_URL: "http://core:3001",
  BLOB_ROOT: "/srv/blobs",
  FAMILY_DATABASE_HOST: "families.internal",
  FAMILY_DATABASE_PORT: "6432",
  PUBLIC_URL: "https://agenda.example",
});

const wrapper = wrapperFor(operatorKey, "f-1");

const entry: DirectoryEntry = {
  familyId: "f-1",
  status: "active",
  databaseName: "family_f_1",
  databaseRole: "family_f_1_role",
  blobLocation: "/srv/blobs/f-1",
  timeZone: "Europe/Vienna",
  organizationId: "org_1",
  wrappedFamilyKey: wrapper.wrap("family-key", "the family key"),
  wrappedDatabasePassword: wrapper.wrap("database-password", "the database password"),
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  deletedAt: null,
  trialStartsAt: null,
  trialEndsAt: null,
  registeredBy: null,
  lockedAt: null,
  lockReason: null,
};

const family: Family = {
  familyId: "f-1",
  databaseName: "family_f_1",
  databaseRole: "family_f_1_role",
  blobLocation: "/srv/blobs/f-1",
  timeZone: "Europe/Vienna",
  organizationId: "org_1",
  familyKey: "the family key",
  databasePassword: "the database password",
};

describe("familyUrl", () => {
  it("is the Family's address below the public address, without a trailing slash", () => {
    expect(familyUrl(config, "f-1")).toBe("https://agenda.example/f-1");
  });
});

describe("unwrappedFamily", () => {
  it("is the Directory entry with its family key and database password unwrapped", () => {
    expect(unwrappedFamily(config, entry)).toEqual(family);
  });

  it("refuses an entry that holds no family key", () => {
    expect(() => unwrappedFamily(config, { ...entry, wrappedFamilyKey: null })).toThrow("The Directory entry of the Family f-1 holds no keys");
  });

  it("refuses an entry that holds no database password", () => {
    expect(() => unwrappedFamily(config, { ...entry, wrappedDatabasePassword: null })).toThrow(
      "The Directory entry of the Family f-1 holds no keys",
    );
  });

  it("does not unwrap another Family's secrets", () => {
    expect(() => unwrappedFamily(config, { ...entry, familyId: "f-2" })).toThrow();
  });

  it("does not take one secret for the other", () => {
    expect(() =>
      unwrappedFamily(config, { ...entry, wrappedFamilyKey: entry.wrappedDatabasePassword, wrappedDatabasePassword: entry.wrappedFamilyKey }),
    ).toThrow();
  });
});

describe("sealedContext", () => {
  const familyKey = Buffer.alloc(32, 9);
  const withKey: Family = { ...family, familyKey: familyKey.toString("base64") };

  it("is the Family's Context, sealed with the Context key as the core opens it", () => {
    expect(openContext(sealedContext(config, withKey), contextKey)).toEqual({
      familyId: "f-1",
      databaseUrl: "postgres://family_f_1_role:the%20database%20password@families.internal:6432/family_f_1",
      familyKey: familyKey.toString("base64url"),
      blobDirectory: "/srv/blobs",
      timeZone: "Europe/Vienna",
      publicUrl: "https://agenda.example/f-1",
      organizationId: "org_1",
      expiresAt: expect.any(Number) as number,
    });
  });

  it("names the database so that a password of any characters reads back as it is", () => {
    const password = "p@ss:w/rd?#%+ ";
    const { databaseUrl } = openContext(sealedContext(config, { ...withKey, databasePassword: password }), contextKey);
    const url = new URL(databaseUrl);
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(decodeURIComponent(url.username)).toBe("family_f_1_role");
  });

  it("refuses a blob location not named by the Family id, where the core would look for other blobs", () => {
    expect(() => sealedContext(config, { ...withKey, blobLocation: "/srv/blobs/f-2" })).toThrow(/blob location/);
  });

  it("names no Organization for a Family created before registration, which the core then records on its first opening", () => {
    expect(openContext(sealedContext(config, { ...withKey, organizationId: null }), contextKey)).not.toHaveProperty("organizationId");
  });
});
