import { createHash, randomBytes } from "node:crypto";
import type { CentralSignIn } from "./config";
import { signInClaims, type SignInClaims } from "./id-token";
import { landingOf, type FindByOrganization, type Landing } from "./landing";
import type { PostRegisterAgain } from "./post-register";
import { signInCallbackUrl, signOutRedirectUrl } from "./sign-in-client";
import { openCookie, sealCookie } from "./sign-in-cookie";
import { INVITATION_PATH, languageOf, SIGN_OUT_PATH, signInPage, WAITING_PATH, type SignInPage } from "./sign-in-pages";

/**
 * Central sign-in (#154): the landing page's "Anmelden" signs the person in at Logto with the
 * Router's own OIDC client, reads the Organizations their ID token claims and sends them into
 * their Family, or to a page that says why not (spec/centralSignIn.qnt). The core signs the person
 * in again itself: the Router only finds the Family. Nothing is taken from Logto's customData.
 *
 * - `GET /sign-in` sends the browser to Logto, `GET /sign-in/again` does so with `prompt=none`,
 *   `GET /sign-in/register` on Logto's sign-up screen (`first_screen=register`).
 * - `GET /sign-in/invitation` (`routing invite`) does so with the invitation link's one-time token.
 * - `GET /sign-in/out` (Abmelden, #173) ends Logto's session and sends the person to the landing page.
 * - `GET /sign-in/callback` ends the sign-in and lands the person (see `landingOf`).
 * - `GET /sign-in/waiting`, which the waiting page asks every few seconds, lands them again by
 *   the Organization claimed at the callback, or signs in again silently if none was claimed:
 *   the Organization of a registration is created after its first sign-in. After 2 minutes of
 *   waiting the page also gives the support contact and Abmelden (#173), and keeps asking.
 *
 * A sign-in whose ID token claims no Organization is a registration whose PostRegister is on its
 * way, or was lost: Logto never sends it again (#155). So the callback of a sign-in the person
 * made has the core run PostRegister for them again, and they wait for the Family it makes. The
 * silent sign-ins of the waiting page send none: the next sign-in of the person tries again.
 *
 * A claim that is stale, because the person left the Organization between the ID token and the
 * callback, still sends them to the Family, whose core refuses them: accepted, no special case.
 */

/** The scopes central sign-in asks Logto for; the last puts the `organizations` claim in the ID token. */
const SCOPES = "openid email urn:logto:scope:organizations";

/** What the browser keeps from sending it to Logto until it comes back. */
const TRANSACTION_COOKIE = "__Host-sign-in";
const TRANSACTION_LIFETIME_MS = 10 * 60_000;

/** The Organization the waiting page waits for, as claimed at the callback; null if none was. */
const WAITING_COOKIE = "__Host-sign-in-waiting";
const WAITING_LIFETIME_MS = 60 * 60_000;

type Transaction = { state: string; verifier: string; nonce: string; silent: boolean };
/** `since`: when the person began to wait, in ms; a cookie sealed before #173 has none. */
type Waiting = { organizationId: string | null; since?: number };

/** How long a person waits before the waiting page gives them the support contact and Abmelden. */
const LONG_WAIT_MS = 2 * 60_000;

/** A browser's request below /sign-in. */
export type SignInRequest = { method: string | undefined; target: string; cookie: string | undefined; acceptLanguage: string | undefined };

/** The Router's answer, and where the person landed if they did. */
export type SignInAnswer = { status: number; headers: Record<string, string | string[]>; body: string; landing?: Landing };

/** What central sign-in works with. */
export type SignInSetup = {
  client: CentralSignIn;
  publicUrl: string;
  operatorKey: Buffer;
  /** The Directory's entry for an Organization. */
  find: FindByOrganization;
  /** The ID token for the code, from Logto's token endpoint; undefined if Logto gave none. */
  exchange: (code: string, verifier: string) => Promise<string | undefined>;
  /** Has a core run PostRegister for the person again. */
  postRegisterAgain: PostRegisterAgain;
  now: () => Date;
};

/** Answers a request below /sign-in. */
export async function answerSignIn(request: SignInRequest, setup: SignInSetup): Promise<SignInAnswer> {
  if (request.method !== "GET" && request.method !== "HEAD") return { status: 405, headers: { ...NO_STORE, allow: "GET, HEAD" }, body: "" };
  const url = new URL(request.target, "https://router.invalid");
  const route = Object.hasOwn(ROUTES, url.pathname) ? ROUTES[url.pathname] : undefined;
  if (!route) return { status: 404, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" }, body: "Not found\n" };
  return route({ setup, cookies: cookiesOf(request.cookie), language: languageOf(request.acceptLanguage), now: setup.now() }, url.searchParams);
}

type Route = (context: Context, query: URLSearchParams) => SignInAnswer | Promise<SignInAnswer>;

/**
 * Registration from the landing page ("2 Wochen testen"): a sign-in that opens on Logto's sign-up
 * screen. It ends as any sign-in: the person waits for the Family their PostRegister makes.
 */
const REGISTER_PATH = "/sign-in/register";

const ROUTES: Record<string, Route> = {
  "/sign-in": (context) => toLogto(context, false),
  "/sign-in/again": (context) => toLogto(context, true),
  [REGISTER_PATH]: (context) => toLogto(context, false, { first_screen: "register" }),
  [INVITATION_PATH]: (context, query) => toLogto(context, false, invitationOf(query)),
  "/sign-in/callback": callback,
  [WAITING_PATH]: waiting,
  [SIGN_OUT_PATH]: signOut,
};

/**
 * The one-time token and the email it is for, by which Logto signs the person in or creates their
 * account, even while registration is closed; nothing else of the link goes to Logto. No
 * `first_screen`, with which Logto leaves the token unused.
 */
function invitationOf(query: URLSearchParams): Record<string, string> {
  const parameters = new Map<string, string>();
  for (const name of ["one_time_token", "login_hint"]) {
    const value = query.get(name);
    if (value !== null) parameters.set(name, value);
  }
  return Object.fromEntries(parameters);
}

type Context = { setup: SignInSetup; cookies: Map<string, string>; language: ReturnType<typeof languageOf>; now: Date };

const NO_STORE = { "cache-control": "no-store" };

const random = (): string => randomBytes(32).toString("base64url");

/** Sends the browser to Logto's authorization endpoint, `prompt=none` if `silent`, with the `extra` parameters. */
function toLogto({ setup, now }: Context, silent: boolean, extra: Record<string, string> = {}): SignInAnswer {
  const transaction: Transaction = { state: random(), verifier: random(), nonce: random(), silent };
  const authorization = new URL(`${setup.client.issuerUrl}/auth`);
  authorization.search = new URLSearchParams({
    client_id: setup.client.clientId,
    redirect_uri: signInCallbackUrl(setup.publicUrl),
    response_type: "code",
    scope: SCOPES,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: createHash("sha256").update(transaction.verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(silent ? { prompt: "none" } : {}),
    ...extra,
  }).toString();
  const cookie = setCookie(TRANSACTION_COOKIE, sealCookie(setup.operatorKey, TRANSACTION_COOKIE, transaction, TRANSACTION_LIFETIME_MS, now), TRANSACTION_LIFETIME_MS);
  return redirect(authorization.toString(), [cookie]);
}

/** Ends the sign-in Logto sent the browser back from, and lands the person. */
async function callback(context: Context, query: URLSearchParams): Promise<SignInAnswer> {
  const cleared = clearCookie(TRANSACTION_COOKIE);
  const ended = endedSignIn(context, query, cleared);
  if ("status" in ended) return ended;
  const claims = await claimsOf(context, ended);
  if (!claims) return page(context, "failed", 502, [cleared]);
  await postRegisterAgainIfNoOrganization(context, ended.transaction, claims);
  const since = waitingSince(context, ended.transaction);
  return land(context, claims.organizations, [cleared], { since, cookie: waitingCookie(context, claims.organizations, since) });
}

type EndedSignIn = { transaction: Transaction; code: string };

/** The sign-in Logto's answer ends, with the code for its ID token; else the answer to the browser. */
function endedSignIn(context: Context, query: URLSearchParams, cleared: string): EndedSignIn | SignInAnswer {
  const transaction = opened(context, TRANSACTION_COOKIE) as Transaction | undefined;
  const failed = page(context, "failed", 400, [cleared]);
  if (!transaction || query.get("state") !== transaction.state) return failed;
  // A silent sign-in Logto could not do, as when its session ended, is done again with the person.
  if (query.has("error")) return transaction.silent ? redirect("/sign-in", [cleared]) : failed;
  const code = query.get("code");
  return code ? { transaction, code } : failed;
}

/** What the ID token for the code claims; undefined if Logto gave no token for this sign-in. */
async function claimsOf({ setup, now }: Context, { transaction, code }: EndedSignIn): Promise<SignInClaims | undefined> {
  const idToken = await setup.exchange(code, transaction.verifier);
  if (idToken === undefined) return undefined;
  return signInClaims(idToken, { issuer: setup.client.issuerUrl, clientId: setup.client.clientId, nonce: transaction.nonce }, now);
}

/**
 * Has the core run PostRegister again for a person of no Organization who signed in themselves.
 * Without a verified email there is nothing to send: the core registers none without one.
 */
async function postRegisterAgainIfNoOrganization({ setup }: Context, transaction: Transaction, { userId, email, organizations }: SignInClaims): Promise<void> {
  if (transaction.silent || organizations.length > 0 || email === null) return;
  await setup.postRegisterAgain({ userId, email });
}

/**
 * Abmelden: sends the browser to Logto's end session endpoint with the Router's client, back to the
 * landing page, and clears central sign-in's cookies. No id_token_hint: the Router keeps no token.
 */
function signOut({ setup }: Context): SignInAnswer {
  const endSession = new URL(`${setup.client.issuerUrl}/session/end`);
  endSession.search = new URLSearchParams({ client_id: setup.client.clientId, post_logout_redirect_uri: signOutRedirectUrl(setup.publicUrl) }).toString();
  return redirect(endSession.toString(), [clearCookie(TRANSACTION_COOKIE), clearCookie(WAITING_COOKIE)]);
}

/** What the waiting page asks: lands the person by the claim of the callback, or signs in again if it claimed none. */
async function waiting(context: Context): Promise<SignInAnswer> {
  const claim = openedWaiting(context);
  if (!claim) return redirect("/sign-in", []);
  if (claim.organizationId === null) return redirect("/sign-in/again", []);
  return land(context, [claim.organizationId], [], { since: claim.since ?? context.now.getTime() });
}

/**
 * Since when the person waits: since this sign-in if they made it, else since the waiting began
 * that this silent sign-in of the waiting page goes on with.
 */
function waitingSince(context: Context, transaction: Transaction): number {
  const going = transaction.silent ? openedWaiting(context) : undefined;
  return going?.since ?? context.now.getTime();
}

/** Since when the person waits, and the waiting cookie to set (none: it stays as it is). */
type WaitBy = { since: number; cookie?: string };

/**
 * The page or Family the person lands in, with `cookies` set. While they wait the waiting cookie
 * is the one of `waitBy`; once they land elsewhere it is cleared.
 */
async function land(context: Context, organizations: readonly string[], cookies: string[], waitBy: WaitBy): Promise<SignInAnswer> {
  const landing = await landingOf(organizations, context.setup.find);
  const waitingCookies = landing.page === "preparing" ? [waitBy.cookie ?? []].flat() : [clearCookie(WAITING_COOKIE)];
  return { ...landed(context, landing, [...cookies, ...waitingCookies], waitBy.since), landing };
}

function landed(context: Context, landing: Landing, cookies: string[], waitingSince: number): SignInAnswer {
  switch (landing.page) {
    case "family":
      return redirect(`/${landing.familyId}/`, cookies);
    case "preparing":
      return page(context, "preparing", 200, cookies, context.now.getTime() - waitingSince >= LONG_WAIT_MS);
    case "unavailable":
      return page(context, "unavailable", 200, cookies);
    case "several":
      return page(context, "several", 500, cookies);
  }
}

/** The cookie the waiting page waits by: the one Organization claimed, or none, and since when. */
function waitingCookie({ setup, now }: Context, organizations: readonly string[], since: number): string {
  const waitingFor: Waiting = { organizationId: organizations[0] ?? null, since };
  return setCookie(WAITING_COOKIE, sealCookie(setup.operatorKey, WAITING_COOKIE, waitingFor, WAITING_LIFETIME_MS, now), WAITING_LIFETIME_MS);
}

/** What the sealed cookie `name` holds, if it opens; its shape is the Router's own, as nobody else can seal one. */
function opened({ setup, cookies, now }: Context, name: string): unknown {
  const sealed = cookies.get(name);
  return sealed === undefined ? undefined : openCookie(setup.operatorKey, name, sealed, now);
}

const openedWaiting = (context: Context): Waiting | undefined => opened(context, WAITING_COOKIE) as Waiting | undefined;

function page({ language }: Context, kind: SignInPage, status: number, cookies: string[], waitedLong = false): SignInAnswer {
  return { status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8", "set-cookie": cookies }, body: signInPage(kind, language, waitedLong) };
}

function redirect(location: string, cookies: string[]): SignInAnswer {
  return { status: 302, headers: { ...NO_STORE, location, "set-cookie": cookies }, body: "" };
}

const setCookie = (name: string, value: string, lifetimeMs: number): string =>
  `${name}=${value}; Path=/; Max-Age=${String(lifetimeMs / 1000)}; Secure; HttpOnly; SameSite=Lax`;

const clearCookie = (name: string): string => `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;

/** The browser's cookies by name; the first of a name, as browsers send the most specific first. */
function cookiesOf(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of (header ?? "").split(";")) {
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (separator > 0 && !cookies.has(name)) cookies.set(name, pair.slice(separator + 1).trim());
  }
  return cookies;
}

/**
 * Logto's token endpoint for central sign-in's client: the ID token for a code, with the PKCE
 * verifier, or undefined if Logto refuses it or does not answer.
 */
export function tokenExchange(client: CentralSignIn, publicUrl: string): SignInSetup["exchange"] {
  const basic = Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`).toString("base64");
  return async (code, verifier) => {
    const response = await fetch(`${client.issuerUrl}/token`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: signInCallbackUrl(publicUrl) }).toString(),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
    if (!response?.ok) return undefined;
    const { id_token: idToken } = (await response.json()) as { id_token?: unknown };
    return typeof idToken === "string" ? idToken : undefined;
  };
}
