import { describe, expect, it } from "vitest";
import { CONTEXT_HEADER, CONTEXT_LIFETIME_MS, sealContext, type ContextClaims } from "../../src/context";
import { openContext } from "../support/core-context";

const contextKey = "a context key of at least 32 characters";
const sealedAt = new Date("2026-05-01T10:00:00.000Z");

const claims: Omit<ContextClaims, "expiresAt"> = {
  familyId: "0b7c1e3a-2f4d-4c5e-8a9b-1c2d3e4f5a6b",
  databaseUrl: "postgres://family_role:db-password@db.internal:5432/family_db",
  familyKey: Buffer.alloc(32, 3).toString("base64url"),
  blobDirectory: "/srv/blobs",
  timeZone: "Europe/Berlin",
  publicUrl: "https://app.family-agenda.cloud/0b7c1e3a-2f4d-4c5e-8a9b-1c2d3e4f5a6b",
};

describe("sealContext", () => {
  it("seals the claims so that the core opens them with the Context key", () => {
    expect(openContext(sealContext(contextKey, claims, sealedAt), contextKey, sealedAt)).toEqual({ ...claims, expiresAt: sealedAt.getTime() + 60_000 });
  });

  it("is in the core's v1 format", () => {
    expect(sealContext(contextKey, claims, sealedAt)).toMatch(/^v1\.[\w-]{16}\.[\w-]+\.[\w-]{22}$/);
  });

  it("is read by the core from X-Family-Context", () => {
    expect(CONTEXT_HEADER).toBe("X-Family-Context");
  });

  it("opens for a minute, and the core's skew of 30 s after", () => {
    expect(CONTEXT_LIFETIME_MS).toBe(60_000);
    const sealed = sealContext(contextKey, claims, sealedAt);
    expect(() => openContext(sealed, contextKey, new Date(sealedAt.getTime() + 89_000))).not.toThrow();
    expect(() => openContext(sealed, contextKey, new Date(sealedAt.getTime() + 91_000))).toThrow("expired");
  });

  it("is sealed now unless told otherwise", () => {
    const before = Date.now();
    const { expiresAt } = openContext(sealContext(contextKey, claims), contextKey);
    expect(expiresAt).toBeGreaterThanOrEqual(before + CONTEXT_LIFETIME_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + CONTEXT_LIFETIME_MS);
  });

  it("does not open with another key", () => {
    expect(() => openContext(sealContext(contextKey, claims, sealedAt), "another context key of 32 characters", sealedAt)).toThrow();
  });

  it("does not open once tampered with", () => {
    const parts = sealContext(contextKey, claims, sealedAt).split(".");
    const ciphertext = Buffer.from(parts[2]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[2] = ciphertext.toString("base64url");
    expect(() => openContext(parts.join("."), contextKey, sealedAt)).toThrow();
  });

  it("draws a new IV for every Context", () => {
    expect(sealContext(contextKey, claims, sealedAt)).not.toBe(sealContext(contextKey, claims, sealedAt));
  });
});
