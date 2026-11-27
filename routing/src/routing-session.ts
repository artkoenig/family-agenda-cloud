/**
 * Who is signed in, for the Routing module's own pages (#226): central sign-in's callback sets it
 * as a sealed cookie, and Abmelden clears it. Whether the person is still an Admin of the Family
 * is asked at Logto when a page needs it. No I/O.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { clearCookie, setCookie } from "./cookies";
import type { SignInClaims } from "./id-token";
import { openCookie, sealCookie } from "./sign-in-cookie";

/**
 * The person's Logto user id, their Organization, and when they signed in at Logto, in seconds; null
 * if Logto did not say. `csrf` is the session's own random token, which every form of the contract
 * pages posts back (#229).
 */
export type RoutingSession = { userId: string; organizationId: string; authTime: number | null; csrf: string };

const SESSION_COOKIE = "__Host-session";
const SESSION_LIFETIME_MS = 8 * 60 * 60_000;

/** The cookie of the person the claims name; cleared unless they claim exactly one Organization, which names the Family. */
export function sessionCookie(operatorKey: Buffer, { userId, organizations, authTime }: SignInClaims, now: Date): string {
  const [organizationId, ...others] = organizations;
  if (organizationId === undefined || others.length > 0) return clearSessionCookie();
  const session: RoutingSession = { userId, organizationId, authTime, csrf: randomBytes(18).toString("base64url") };
  return setCookie(SESSION_COOKIE, sealCookie(operatorKey, SESSION_COOKIE, session, SESSION_LIFETIME_MS, now), SESSION_LIFETIME_MS);
}

export const clearSessionCookie = (): string => clearCookie(SESSION_COOKIE);

/** Who is signed in by the browser's cookies; its shape is the Router's own, as nobody else can seal one. */
export function sessionOf(operatorKey: Buffer, cookies: ReadonlyMap<string, string>, now: Date): RoutingSession | undefined {
  const sealed = cookies.get(SESSION_COOKIE);
  const session = sealed === undefined ? undefined : (openCookie(operatorKey, SESSION_COOKIE, sealed, now) as Partial<RoutingSession> | undefined);
  // A session sealed before it had a token is none: the person signs in again.
  return typeof session?.csrf === "string" ? (session as RoutingSession) : undefined;
}

/** How old a sign-in at Logto may be for the Family to be deleted with it (#231), in seconds. */
export const FRESH_SIGN_IN_SECONDS = 10 * 60;

/** Whether the person signed in at Logto no longer ago than that; not if Logto did not say when. */
export function isFreshSignIn({ authTime }: RoutingSession, now: Date): boolean {
  return authTime !== null && now.getTime() / 1000 - authTime <= FRESH_SIGN_IN_SECONDS;
}

/** Whether a form posted the session's token. */
export function isOwnForm({ csrf }: RoutingSession, posted: string | null): boolean {
  const [own, given] = [Buffer.from(csrf), Buffer.from(posted ?? "")];
  return own.length === given.length && timingSafeEqual(own, given);
}
