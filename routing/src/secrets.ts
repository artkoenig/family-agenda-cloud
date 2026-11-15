import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/** A Family's key for its Source credentials: 32 random bytes, base64. */
export const drawFamilyKey = (): string => randomBytes(32).toString("base64");

/** The password of a Family's database role. */
export const drawDatabasePassword = (): string => randomBytes(32).toString("base64url");

/** What a wrapped value is for, bound into it so that it cannot be passed off as another. */
export type WrapPurpose = "family-key" | "database-password";

const VERSION = "v1";

/**
 * Wraps a secret with the Operator key (AES-256-GCM), bound to its Family and purpose: only the
 * wrapped form is stored in the Directory.
 */
export function wrap(operatorKey: Buffer, familyId: string, purpose: WrapPurpose, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", operatorKey, iv).setAAD(aad(familyId, purpose));
  const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return [VERSION, iv.toString("base64url"), sealed.toString("base64url")].join(".");
}

export function unwrap(operatorKey: Buffer, familyId: string, purpose: WrapPurpose, wrapped: string): string {
  const [version, iv, sealed] = wrapped.split(".");
  if (version !== VERSION || !iv || !sealed) throw new Error(`The wrapped ${purpose} has an unknown format`);
  const bytes = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", operatorKey, Buffer.from(iv, "base64url")).setAAD(aad(familyId, purpose));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString("utf8");
}

const aad = (familyId: string, purpose: WrapPurpose) => Buffer.from(`${familyId}/${purpose}`, "utf8");

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 7677). Handing Postgres the
 * verifier instead of the password keeps the password out of its statement log.
 */
export function scramVerifier(password: string, iterations = 4096): string {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const storedKey = createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const serverKey = hmac(salted, "Server Key");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

const hmac = (key: Buffer, text: string) => createHmac("sha256", key).update(text).digest();
