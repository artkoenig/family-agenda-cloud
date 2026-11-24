/**
 * Who is signed in, for the Routing module's own pages (#226): central sign-in's callback sets it
 * as a sealed cookie, and Abmelden clears it. Whether the person is still an Admin of the Family
 * is asked at Logto when a page needs it. No I/O.
 */
import { clearCookie, setCookie } from "./cookies";
import type { SignInClaims } from "./id-token";
import { openCookie, sealCookie } from "./sign-in-cookie";

/** The person's Logto user id, their Organization, and when they signed in at Logto, in seconds; null if Logto did not say. */
export type RoutingSession = { userId: string; organizationId: string; authTime: number | null };

const SESSION_COOKIE = "__Host-session";
const SESSION_LIFETIME_MS = 8 * 60 * 60_000;

/** The cookie of the person the claims name; cleared unless they claim exactly one Organization, which names the Family. */
export function sessionCookie(operatorKey: Buffer, { userId, organizations, authTime }: SignInClaims, now: Date): string {
  const [organizationId, ...others] = organizations;
  if (organizationId === undefined || others.length > 0) return clearSessionCookie();
  const session: RoutingSession = { userId, organizationId, authTime };
  return setCookie(SESSION_COOKIE, sealCookie(operatorKey, SESSION_COOKIE, session, SESSION_LIFETIME_MS, now), SESSION_LIFETIME_MS);
}

export const clearSessionCookie = (): string => clearCookie(SESSION_COOKIE);

/** Who is signed in by the browser's cookies; its shape is the Router's own, as nobody else can seal one. */
export function sessionOf(operatorKey: Buffer, cookies: ReadonlyMap<string, string>, now: Date): RoutingSession | undefined {
  const sealed = cookies.get(SESSION_COOKIE);
  return sealed === undefined ? undefined : (openCookie(operatorKey, SESSION_COOKIE, sealed, now) as RoutingSession | undefined);
}
