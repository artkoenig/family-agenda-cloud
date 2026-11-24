import { isOrganizationId } from "./family-id";

/**
 * The claims central sign-in reads from the ID token Logto issues to it: the person, their
 * verified email and their Organizations. No I/O.
 *
 * The token's signature is not checked: central sign-in takes the token straight from Logto's
 * token endpoint, over TLS and with its client secret, which OpenID Connect Core 1.0 §3.1.3.7
 * (6) allows in place of the signature. Its issuer, audience, nonce and expiry are checked.
 */

/** What the token must say: who issued it, for which client, and the nonce of the sign-in it ends. */
export type ExpectedToken = { issuer: string; clientId: string; nonce: string };

type Payload = { iss?: unknown; aud?: unknown; sub?: unknown; email?: unknown; email_verified?: unknown; nonce?: unknown; auth_time?: unknown; exp?: unknown; organizations?: unknown };

/**
 * What the ID token says of the person: their Logto user id (`sub`), their email if Logto
 * verified it (null otherwise), the Organization ids they are a member of, none if the token
 * has no such claim, and when they signed in at Logto (`auth_time`, in seconds; null if it says none).
 */
export type SignInClaims = { userId: string; email: string | null; organizations: string[]; authTime: number | null };

/** The claims of the ID token; undefined if it is not a token for this sign-in. */
export function signInClaims(idToken: string, expected: ExpectedToken, now: Date = new Date()): SignInClaims | undefined {
  const payload = payloadOf(idToken);
  if (!payload || !isForThisSignIn(payload, expected, now)) return undefined;
  const { sub, organizations = [], auth_time: authTime } = payload;
  if (typeof sub !== "string" || sub === "") return undefined;
  if (!Array.isArray(organizations) || !organizations.every((id) => typeof id === "string" && isOrganizationId(id))) return undefined;
  return { userId: sub, email: verifiedEmail(payload), organizations: organizations as string[], authTime: typeof authTime === "number" ? authTime : null };
}

const verifiedEmail = ({ email, email_verified: verified }: Payload): string | null => (typeof email === "string" && email !== "" && verified === true ? email : null);

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
