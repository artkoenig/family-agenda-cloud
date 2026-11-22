import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * The cookies central sign-in keeps in the browser between its requests: what it sent to Logto
 * (state, PKCE verifier, nonce) and, on the waiting page, the Organization the ID token claimed.
 * Sealed with a key derived from the Operator key, so that nobody can read or forge one: a forged
 * claim would send anyone into any Family. No I/O.
 */

const VERSION = "v1";

/** The AES-256 key for the sign-in cookies, derived from the Operator key for this purpose alone. */
const cookieKeyOf = (operatorKey: Buffer): Buffer =>
  Buffer.from(hkdfSync("sha256", operatorKey, "family-agenda-routing", `central sign-in cookie ${VERSION}`, 32));

/** The cookie's name, bound into its seal, so that one cookie cannot stand in for another. */
const additionalData = (name: string): Buffer => Buffer.from(`central sign-in ${VERSION} ${name}`);

/** Seals `value` as the cookie `name`: `v1.<iv>.<ciphertext>.<tag>`, base64url, which opens until `lifetimeMs` after `now`. */
export function sealCookie(operatorKey: Buffer, name: string, value: object, lifetimeMs: number, now: Date = new Date()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieKeyOf(operatorKey), iv);
  cipher.setAAD(additionalData(name));
  const plaintext = JSON.stringify({ value, expiresAt: now.getTime() + lifetimeMs });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [VERSION, ...[iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url"))].join(".");
}

/** What the cookie `name` holds; undefined if it is not one sealed so, was changed, or expired. */
export function openCookie(operatorKey: Buffer, name: string, sealed: string, now: Date = new Date()): unknown {
  const [version, iv = "", ciphertext = "", tag = "", ...more] = sealed.split(".");
  if (version !== VERSION || more.length > 0) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", cookieKeyOf(operatorKey), Buffer.from(iv, "base64url"), { authTagLength: 16 });
    decipher.setAAD(additionalData(name));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
    const { value, expiresAt } = JSON.parse(plaintext) as { value: unknown; expiresAt: number };
    return now.getTime() < expiresAt ? value : undefined;
  } catch {
    return undefined;
  }
}
