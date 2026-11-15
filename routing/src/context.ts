import { EncryptJWT } from "jose";
import type { IdentityProviderSettings } from "./config";

/**
 * The Family's Context, as the core opens it: what database to open, with which key, below which
 * address. Its format is the one the core defines; until artkoenig/family-agenda#362 documents
 * it, test/support/stand-in-core.ts writes it down.
 */
export type ContextClaims = {
  familyId: string;
  database: { host: string; port: number; name: string; user: string; password: string };
  familyKey: string;
  blobLocation: string;
  timeZone: string;
  /** The Family's public address, without a trailing slash. */
  publicUrl: string;
  pathPrefix: string;
  identityProvider: IdentityProviderSettings | null;
  identityProviderSignIn: "known-admins-only";
};

/** How long a sealed Context opens. */
export const CONTEXT_LIFETIME_SECONDS = 60;

/** Encrypts and signs the Context with the Context key (compact JWE, dir + A256GCM), with a short lifetime. */
export function sealContext(contextKey: Buffer, claims: ContextClaims, now: Date = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new EncryptJWT({ ...claims })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CONTEXT_LIFETIME_SECONDS)
    .encrypt(contextKey);
}
