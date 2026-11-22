import { isOrganizationId } from "./family-id";

/**
 * The `organizations` claim of the ID token Logto issues to central sign-in. No I/O.
 *
 * The token's signature is not checked: central sign-in takes the token straight from Logto's
 * token endpoint, over TLS and with its client secret, which OpenID Connect Core 1.0 §3.1.3.7
 * (6) allows in place of the signature. Its issuer, audience, nonce and expiry are checked.
 */

/** What the token must say: who issued it, for which client, and the nonce of the sign-in it ends. */
export type ExpectedToken = { issuer: string; clientId: string; nonce: string };

type Payload = { iss?: unknown; aud?: unknown; nonce?: unknown; exp?: unknown; organizations?: unknown };

/** The Organization ids the ID token claims, none if it has no such claim; undefined if it is not a token for this sign-in. */
export function organizationsClaimed(idToken: string, expected: ExpectedToken, now: Date = new Date()): string[] | undefined {
  const payload = payloadOf(idToken);
  if (!payload || !isForThisSignIn(payload, expected, now)) return undefined;
  const { organizations = [] } = payload;
  if (!Array.isArray(organizations) || !organizations.every((id) => typeof id === "string" && isOrganizationId(id))) return undefined;
  return organizations as string[];
}

function isForThisSignIn({ iss, aud, nonce, exp }: Payload, { issuer, clientId, nonce: expectedNonce }: ExpectedToken, now: Date): boolean {
  const audiences: unknown[] = Array.isArray(aud) ? aud : [aud];
  return iss === issuer && audiences.includes(clientId) && nonce === expectedNonce && typeof exp === "number" && exp * 1000 > now.getTime();
}

/**
 * The payload of a JWT `<header>.<payload>.<signature>`, if it is JSON. A payload that is no object
 * has none of the claims `isForThisSignIn` asks for.
 */
function payloadOf(idToken: string): Payload | undefined {
  const [, encoded = "", signature, ...more] = idToken.split(".");
  if (signature === undefined || more.length > 0) return undefined;
  try {
    return (JSON.parse(Buffer.from(encoded, "base64url").toString()) as Payload | null) ?? undefined;
  } catch {
    return undefined;
  }
}
