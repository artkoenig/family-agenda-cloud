/**
 * Logto's sign-in experience as decided in #132: sign-in by email and password, email and code, or
 * passkey; Google with automatic account linking; terms and privacy accepted at sign-up; German
 * unless the browser asks for another language; the Account Center for password and passkey; no
 * MFA. The core's `logto-setup` resets signIn on every run and leaves the rest alone, so deploying
 * sets all of it again. Sign-up stays as `logto-setup` sets it: email, verified, with a password.
 *
 * Whether anyone may register is the `.env`'s REGISTRATION (#236): `signInMode` is set from it on
 * every run, since `logto-setup` sets `SignInAndRegister` on each of its runs. While it is closed,
 * an invitation link's one-time token still lets the invitee create an account (ADR-0011 of the core).
 */
import { managementCall, type IdpManagement } from "./logto-management";

/** The Google OAuth client Logto's Google connector signs in with. */
export type GoogleClient = { clientId: string; clientSecret: string };

export const TERMS_OF_USE_URL = "https://family-agenda.cloud/agb";
export const PRIVACY_POLICY_URL = "https://family-agenda.cloud/datenschutz";

/**
 * The Impressum on Logto's sign-in pages (§ 5 DDG, #194, #232). Logto 1.46 has no setting for an
 * imprint link: `termsOfUseUrl` and `privacyPolicyUrl` are its only legal links, shown where the
 * terms are agreed to, and `supportEmail` and `supportWebsiteUrl` show on its error pages only. What
 * it has is `customContent`, HTML per page path, which its sign-in app renders above the card, but
 * only on desktop browsers (packages/experience/src/Layout/AppLayout of v1.46.0): not on phones, and
 * not per language, so it links both texts. No custom footer or link exists beyond that, short of
 * replacing the sign-in UI (`customUiAssets`).
 */
export const IMPRINT_CONTENT =
  '<nav aria-label="Impressum / Imprint"><a href="https://family-agenda.cloud/impressum" lang="de">Impressum</a> · <a href="https://family-agenda.cloud/en/imprint" lang="en">Imprint</a></nav>';

/** The paths of Logto's sign-in app that show `IMPRINT_CONTENT`: signing in, registering, resetting the password. */
export const IMPRINT_PATHS = ["/sign-in", "/sign-in/password", "/sign-in/verification-code", "/register", "/register/password", "/register/verification-code", "/forgot-password", "/forgot-password/reset", "/forgot-password/verification-code"];

/** Logto's connector factory for Google; its connectors have the target `google`. */
export const GOOGLE_CONNECTOR_FACTORY = "google-universal";

/** Whether anyone may register at Logto (`open`), or only invitees (`closed`, REGISTRATION unset). */
export type Registration = "open" | "closed";

/** Logto's `signInMode` for the registration setting. */
export const signInMode = (registration: Registration): string => (registration === "open" ? "SignInAndRegister" : "SignIn");

/** The body of `PATCH /api/sign-in-exp`; Google among the social targets only with its connector. */
export function signInExperience(withGoogle: boolean, registration: Registration): Record<string, unknown> {
  return {
    signInMode: signInMode(registration),
    signIn: { methods: [{ identifier: "email", password: true, verificationCode: true, isPasswordPrimary: true }] },
    forgotPasswordMethods: ["EmailVerificationCode"],
    passkeySignIn: { enabled: true, showPasskeyButton: true, allowAutofill: true },
    mfa: { factors: [], policy: "NoPrompt" },
    agreeToTermsPolicy: "ManualRegistrationOnly",
    termsOfUseUrl: TERMS_OF_USE_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    customContent: Object.fromEntries(IMPRINT_PATHS.map((path) => [path, IMPRINT_CONTENT])),
    languageInfo: { autoDetect: true, fallbackLanguage: "de" },
    socialSignIn: { automaticAccountLinking: true },
    ...(withGoogle ? { socialSignInConnectorTargets: ["google"] } : {}),
  };
}

/** The body of `PATCH /api/account-center`: `/account` changes password and passkey, shows the email. */
export const ACCOUNT_CENTER = { enabled: true, fields: { password: "Edit", passkey: "Edit", email: "ReadOnly", mfa: "Off" } };

/** What setting the sign-in experience did about Google. */
export type SignInExperienceResult = { google: "created" | "updated" | "skipped" };

/**
 * Sets the sign-in experience, with registration open or closed, and the Account Center, and
 * Google's connector first when a client is given. Without one Google is left as it is. Safe to run again.
 */
export async function setSignInExperience(idp: IdpManagement, google: GoogleClient | null, registration: Registration): Promise<SignInExperienceResult> {
  const result: SignInExperienceResult = { google: google === null ? "skipped" : await putGoogleConnector(idp, google) };
  await managementCall(idp, "PATCH", "/api/sign-in-exp", signInExperience(google !== null, registration), "setting the sign-in experience");
  await managementCall(idp, "PATCH", "/api/account-center", ACCOUNT_CENTER, "setting the Account Center");
  return result;
}

async function putGoogleConnector(idp: IdpManagement, { clientId, clientSecret }: GoogleClient): Promise<"created" | "updated"> {
  const config = { clientId, clientSecret, scope: "openid profile email", prompts: ["select_account"] };
  const connectors = (await (await managementCall(idp, "GET", "/api/connectors", undefined, "listing the connectors")).json()) as { id: string; connectorId: string }[];
  const existing = connectors.find(({ connectorId }) => connectorId === GOOGLE_CONNECTOR_FACTORY);
  if (existing) {
    await managementCall(idp, "PATCH", `/api/connectors/${encodeURIComponent(existing.id)}`, { config }, "updating the Google connector");
    return "updated";
  }
  await managementCall(idp, "POST", "/api/connectors", { connectorId: GOOGLE_CONNECTOR_FACTORY, config }, "creating the Google connector");
  return "created";
}
