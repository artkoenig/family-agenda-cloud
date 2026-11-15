import { decodeProtectedHeader, jwtDecrypt } from "jose";
import { describe, expect, it } from "vitest";
import { CONTEXT_LIFETIME_SECONDS, sealContext, type ContextClaims } from "../../src/context";

const contextKey = Buffer.alloc(32, 7);
const sealedAt = new Date("2026-05-01T10:00:00.000Z");
const sealedAtSeconds = sealedAt.getTime() / 1000;

const claims: ContextClaims = {
  familyId: "f-123",
  database: { host: "db.internal", port: 5432, name: "family_f_123", user: "family_f_123", password: "db-password" },
  familyKey: "family-key",
  blobLocation: "/srv/blobs/f-123",
  timeZone: "Europe/Berlin",
  publicUrl: "https://app.family-agenda.cloud/f-123",
  pathPrefix: "/f-123",
  identityProvider: null,
  identityProviderSignIn: "known-admins-only",
};

/** Opens a sealed Context as a core does. */
const open = (sealed: string, at: Date, key: Buffer = contextKey) => jwtDecrypt(sealed, key, { currentDate: at });

describe("sealContext", () => {
  it("seals the claims so that the Context key opens them", async () => {
    const { payload } = await open(await sealContext(contextKey, claims, sealedAt), sealedAt);
    expect(payload).toEqual({ ...claims, iat: sealedAtSeconds, exp: sealedAtSeconds + 60 });
  });

  it("encrypts directly with the Context key, A256GCM", async () => {
    expect(decodeProtectedHeader(await sealContext(contextKey, claims, sealedAt))).toEqual({ alg: "dir", enc: "A256GCM" });
  });

  it("opens for a minute", async () => {
    expect(CONTEXT_LIFETIME_SECONDS).toBe(60);
    const sealed = await sealContext(contextKey, claims, sealedAt);
    await expect(open(sealed, new Date(sealedAt.getTime() + 59_000))).resolves.toBeDefined();
    await expect(open(sealed, new Date(sealedAt.getTime() + 61_000))).rejects.toThrow(/"exp" claim timestamp check failed/);
  });

  it("is sealed now unless told otherwise", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { payload } = await jwtDecrypt(await sealContext(contextKey, claims), contextKey);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it("does not open with another key", async () => {
    const sealed = await sealContext(contextKey, claims, sealedAt);
    await expect(open(sealed, sealedAt, Buffer.alloc(32, 8))).rejects.toThrow();
  });

  it("does not open once tampered with", async () => {
    const parts = (await sealContext(contextKey, claims, sealedAt)).split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    await expect(open(parts.join("."), sealedAt)).rejects.toThrow();
  });
});
