import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * The Family's Context, as the core opens it in supplied mode: what database to open, with which
 * key, below which address. Its format is the core's (docs/configuration.md of the core,
 * "Supplied mode"); test/support/core-context.ts opens it as the core does.
 */
export type ContextClaims = {
  /** The Family id, which the database must hold. */
  familyId: string;
  /** The Family's database, as a Postgres connection string, password included. */
  databaseUrl: string;
  /** The family key: 32 bytes, base64url. */
  familyKey: string;
  /** The directory the Family's blob folder `<blobDirectory>/<familyId>` lies in. */
  blobDirectory: string;
  /** IANA time zone, where the Family's days start. */
  timeZone: string;
  /** The Family's public address, without a trailing slash; its path is the path prefix. */
  publicUrl: string;
  /**
   * The Logto Organization of the Family's Admins: the core records it on the first opening and
   * refuses a Context naming another one (403 `organization-id-differs`).
   */
  organizationId?: string;
  /** Milliseconds since the epoch; the core refuses the Context from then on. */
  expiresAt: number;
};

/** The header a core reads the sealed Context from. */
export const CONTEXT_HEADER = "X-Family-Context";

/** How long a sealed Context opens. */
export const CONTEXT_LIFETIME_MS = 60_000;

const VERSION = "v1";
/** Binds the ciphertext to its purpose and format, as the core expects. */
const ADDITIONAL_DATA = Buffer.from(`family-agenda context ${VERSION}`);

/** The AES-256 key the core derives from the Context key. */
const cipherKeyOf = (contextKey: string): Buffer =>
  Buffer.from(hkdfSync("sha256", contextKey, "family-agenda", `context ${VERSION} aes-256-gcm`, 32));

/**
 * Seals the Context with the Context key as the core opens it: `v1.<iv>.<ciphertext>.<tag>`, all
 * base64url, AES-256-GCM under a key derived from the Context key, so that it is both secret and
 * tamper-proof. It expires a short while after `now`.
 */
export function sealContext(contextKey: string, claims: Omit<ContextClaims, "expiresAt">, now: Date = new Date()): string {
  const context: ContextClaims = { ...claims, expiresAt: now.getTime() + CONTEXT_LIFETIME_MS };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKeyOf(contextKey), iv, { authTagLength: 16 });
  cipher.setAAD(ADDITIONAL_DATA);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(context)), cipher.final()]);
  return [VERSION, ...[iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url"))].join(".");
}
