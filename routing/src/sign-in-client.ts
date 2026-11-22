import { managementCall, type IdpManagement } from "./logto-management";

/**
 * Central sign-in's own OIDC client at Logto (#154): a Traditional web application, whose one
 * redirect URI is `<PUBLIC_URL>/sign-in/callback` and whose post-logout redirect URI is the
 * landing page (#173), apart from the cores' application and its
 * OIDC_CALLBACK_URL. Found by its name, so that setting it up again changes the same one.
 */

/** The application's name in Logto's Console. */
export const SIGN_IN_CLIENT_NAME = "Family Agenda central sign-in";

/** Where Logto sends the browser back to central sign-in. */
export const signInCallbackUrl = (publicUrl: string): string => `${publicUrl}/sign-in/callback`;

/** Where Logto sends the browser after Abmelden: the landing page, where the person can sign in again. */
export const signOutRedirectUrl = (publicUrl: string): string => `${publicUrl}/`;

/** The client's redirect URIs, after sign-in and after Abmelden. */
const clientMetadata = (publicUrl: string) => ({ redirectUris: [signInCallbackUrl(publicUrl)], postLogoutRedirectUris: [signOutRedirectUrl(publicUrl)] });

/** What the Router needs of the client: its CENTRAL_SIGN_IN_CLIENT_ID and _SECRET. */
export type SignInClient = { clientId: string; clientSecret: string; created: boolean };

type Application = { id: string; name: string; type: string };

/** One of an application's secrets, as `GET /api/applications/:id/secrets` lists them. */
type Secret = { value?: unknown; expiresAt?: number | null };

/** Creates the application, or sets the redirect URIs of the one there is. Safe to run again. */
export async function setSignInClient(idp: IdpManagement, publicUrl: string): Promise<SignInClient> {
  const existing = await findSignInClient(idp);
  const application = existing
    ? await patchRedirectUris(idp, existing, publicUrl)
    : ((await (await managementCall(idp, "POST", "/api/applications", { name: SIGN_IN_CLIENT_NAME, type: "Traditional", oidcClientMetadata: clientMetadata(publicUrl) }, "creating the application")).json()) as Application);
  return { clientId: application.id, clientSecret: await secretOf(idp, application), created: !existing };
}

/**
 * The secret Logto made with the application: Logto lists an application's secrets apart from it,
 * the one it made first, beside any added later. One that has expired is no use.
 */
async function secretOf(idp: IdpManagement, { id }: Application): Promise<string> {
  const response = await managementCall(idp, "GET", `/api/applications/${encodeURIComponent(id)}/secrets`, undefined, "listing the application's secrets");
  const secrets = (await response.json()) as Secret[];
  const now = Date.now();
  const usable = secrets.find(({ value, expiresAt }) => typeof value === "string" && value !== "" && (expiresAt == null || expiresAt > now));
  if (!usable) throw new Error("Logto answered with no secret of central sign-in's client");
  return usable.value as string;
}

/**
 * Sets the redirect URIs of the application there is, so that Logto sends the browser back to the
 * landing page after Abmelden (#173); creates none. False if there is none. Safe to run again.
 */
export async function setSignInClientRedirects(idp: IdpManagement, publicUrl: string): Promise<boolean> {
  const existing = await findSignInClient(idp);
  if (existing) await patchRedirectUris(idp, existing, publicUrl);
  return existing !== undefined;
}

async function findSignInClient(idp: IdpManagement): Promise<Application | undefined> {
  const applications = (await (await managementCall(idp, "GET", "/api/applications", undefined, "listing the applications")).json()) as Application[];
  return applications.find(({ name, type }) => name === SIGN_IN_CLIENT_NAME && type === "Traditional");
}

async function patchRedirectUris(idp: IdpManagement, { id }: Application, publicUrl: string): Promise<Application> {
  const response = await managementCall(idp, "PATCH", `/api/applications/${encodeURIComponent(id)}`, { oidcClientMetadata: clientMetadata(publicUrl) }, "updating the application");
  return (await response.json()) as Application;
}
