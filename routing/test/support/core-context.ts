import { createDecipheriv, hkdfSync } from "node:crypto";
import type { ContextClaims } from "../../src/context";

/**
 * Opens a sealed Context as the core does (its documented Context format),
 * written down independently of src/context.ts so that a mistake there shows. Throws for a
 * Context that is not `v1.<iv>.<ciphertext>.<tag>`, was not sealed with the key, was altered, or
 * has expired by `at` beyond the core's 30 s of skew, or lasts longer than a day.
 */
export function openContext(sealed: string, contextKey: string, at: Date = new Date()): ContextClaims {
  const [version, ...rest] = sealed.split(".");
  if (version !== "v1" || rest.length !== 3) throw new Error("not a v1 Context");
  const [iv, ciphertext, tag] = rest.map((part) => Buffer.from(part, "base64url")) as [Buffer, Buffer, Buffer];
  if (iv.length !== 12 || tag.length !== 16) throw new Error("not a v1 Context");
  const key = Buffer.from(hkdfSync("sha256", contextKey, "family-agenda", "context v1 aes-256-gcm", 32));
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from("family-agenda context v1"));
  decipher.setAuthTag(tag);
  const context = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as ContextClaims;
  if (context.expiresAt + 30_000 <= at.getTime()) throw new Error("expired");
  if (context.expiresAt - at.getTime() > 24 * 60 * 60_000) throw new Error("lasts too long");
  return context;
}
