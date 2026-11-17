import { createHmac, timingSafeEqual } from "node:crypto";
import { isFamilyId, isOrganizationId } from "./family-id";

/**
 * What a core's `family.created` says, read from its signed body. A core posts it once it has
 * created the Family that registered, and its Logto Organization, and posts it again until it is
 * answered with a 2xx. No I/O.
 */

/** The header a core signs `family.created` in: the body's HMAC-SHA256 with FAMILY_WEBHOOK_SECRET, in hex. */
export const SIGNATURE_HEADER = "family-agenda-signature-sha-256";

/** The Family a core announced: its Family id, which the core drew, and its Logto Organization. */
export type FamilyCreated = { familyId: string; organizationId: string };

/** Why a delivery is not taken: it is not signed with the secret, or does not say what `family.created` says. */
export type NotTaken = { refused: "unsigned" | "malformed" };

const HEX_SHA_256 = /^[0-9a-f]{64}$/i;

/**
 * The Family `body` announces, if `signature` is its HMAC-SHA256 with `secret` and it is a
 * `family.created` that names a Family id and an Organization id. Anything else it says, such as
 * the email address the Admin registered with, is not read.
 */
export function familyCreatedOf(body: Buffer, signature: string | undefined, secret: string): FamilyCreated | NotTaken {
  if (!isSigned(body, signature, secret)) return { refused: "unsigned" };
  const announced = jsonObjectOf(body);
  if (announced?.event !== "family.created") return { refused: "malformed" };
  const { familyId, organizationId } = announced;
  if (typeof familyId !== "string" || typeof organizationId !== "string") return { refused: "malformed" };
  const lowerFamilyId = familyId.toLowerCase();
  if (!isFamilyId(lowerFamilyId) || !isOrganizationId(organizationId)) return { refused: "malformed" };
  return { familyId: lowerFamilyId, organizationId };
}

/** Whether `signature` is the body's HMAC-SHA256 with `secret`, in hex. */
function isSigned(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || !HEX_SHA_256.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(body).digest(), Buffer.from(signature, "hex"));
}

function jsonObjectOf(body: Buffer): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
