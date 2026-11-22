import { managementCall, type IdpManagement } from "./logto-management";

/**
 * Central sign-in's own OIDC client at Logto (#154): a Traditional web application, whose one
 * redirect URI is `<PUBLIC_URL>/sign-in/callback`, apart from the cores' application and its
 * OIDC_CALLBACK_URL. Found by its name, so that setting it up again changes the same one.
 */

/** The application's name in Logto's Console. */
export const SIGN_IN_CLIENT_NAME = "Family Agenda central sign-in";

/** Where Logto sends the browser back to central sign-in. */
export const signInCallbackUrl = (publicUrl: string): string => `${publicUrl}/sign-in/callback`;

/** What the Router needs of the client: its CENTRAL_SIGN_IN_CLIENT_ID and _SECRET. */
export type SignInClient = { clientId: string; clientSecret: string; created: boolean };

type Application = { id: string; name: string; type: string; secret?: unknown };

/** Creates the application, or sets the redirect URI of the one there is. Safe to run again. */
export async function setSignInClient(idp: IdpManagement, publicUrl: string): Promise<SignInClient> {
  const oidcClientMetadata = { redirectUris: [signInCallbackUrl(publicUrl)], postLogoutRedirectUris: [] };
  const applications = (await (await managementCall(idp, "GET", "/api/applications", undefined, "listing the applications")).json()) as Application[];
  const existing = applications.find(({ name, type }) => name === SIGN_IN_CLIENT_NAME && type === "Traditional");
  const application = existing
    ? ((await (await managementCall(idp, "PATCH", `/api/applications/${encodeURIComponent(existing.id)}`, { oidcClientMetadata }, "updating the application")).json()) as Application)
    : ((await (await managementCall(idp, "POST", "/api/applications", { name: SIGN_IN_CLIENT_NAME, type: "Traditional", oidcClientMetadata }, "creating the application")).json()) as Application);
  // Logto keeps the secret it made with the application on it, beside any added later.
  if (typeof application.secret !== "string" || application.secret === "") throw new Error("Logto answered with no secret of central sign-in's client");
  return { clientId: application.id, clientSecret: application.secret, created: !existing };
}
