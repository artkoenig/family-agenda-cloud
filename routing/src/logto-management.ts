/**
 * Logto's Management API, signed in as the machine-to-machine application the cores use
 * (IDP_MANAGEMENT_*).
 */
import { mailLanguageOf, type Language } from "./contract-wording";

/** Where Logto's Management API is and how to sign in to it. */
export type IdpManagement = { endpoint: string; clientId: string; clientSecret: string };

/** The resource indicator of a self-hosted Logto's Management API. */
const MANAGEMENT_RESOURCE = "https://default.logto.app/api";

/** Calls `path` of the Management API with a fresh access token. */
export async function managementFetch({ endpoint, clientId, clientSecret }: IdpManagement, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await accessToken(endpoint, clientId, clientSecret)}`);
  return fetch(`${endpoint}${path}`, { ...init, headers });
}

async function accessToken(endpoint: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", resource: MANAGEMENT_RESOURCE, scope: "all" }).toString(),
  });
  if (!response.ok) throw new Error(`Logto refused the management client's credentials with ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** Calls `path` with `body` as JSON, if any; throws, saying what it was `doing`, unless Logto answers ok. */
export async function managementCall(idp: IdpManagement, method: string, path: string, body: unknown, doing: string): Promise<Response> {
  const response = await managementFetch(idp, path, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Logto's Management API answered ${doing} with ${response.status}: ${await response.text()}`);
  return response;
}

/**
 * The person's locale as Logto keeps it: the user's `profile.locale` (Logto's `UserProfile`, the
 * OIDC `locale` claim), read through GET /api/users/:id; null when it has none.
 *
 * Logto 1.46.0 sets none of its own: neither sign-up (the experience flow's new user has no
 * profile) nor a social sign-in (it syncs name, avatar, email and phone) writes `profile.locale`,
 * and nothing of Family Agenda's writes it either. Until something does, every person has none,
 * and every mail goes out in German (#243).
 */
export async function userLocale(idp: IdpManagement, userId: string): Promise<string | null> {
  const response = await managementCall(idp, "GET", `/api/users/${encodeURIComponent(userId)}`, undefined, "reading the user's locale");
  const { profile } = (await response.json()) as { profile?: { locale?: unknown } | null };
  return typeof profile?.locale === "string" && profile.locale !== "" ? profile.locale : null;
}

/** The language of the person's mails: German for a German locale at Logto or none, else English (`mailLanguageOf`). */
export async function recipientLanguage(idp: IdpManagement, userId: string): Promise<Language> {
  return mailLanguageOf(await userLocale(idp, userId));
}
