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

const HOME_LINK_STYLE = [
  ".fa-home{display:flex;width:min(540px,calc(100vw - 40px));margin-bottom:8px;font:var(--font-body-2)}",
  ".fa-home a{padding:12px 4px;color:var(--color-type-primary);text-decoration:underline;text-underline-offset:3px}",
  "html:lang(de) .fa-home:lang(en),html:not(:lang(de)) .fa-home:lang(de){display:none}",
].join("");

/**
 * The way back to the landing page on Logto's sign-in pages. Logto 1.46 has no setting for it; what it
 * has is `customContent`, HTML per page path, which its sign-in app renders above the card, but only
 * on desktop browsers (packages/experience/src/Layout/AppLayout of v1.46.0), not on phones. It is not
 * per language, so it holds the link in both, and shows the language the app sets on `<html lang>`
 * (English unless that is German). The color is the app's own variable, which follows its light and
 * dark theme. The Impressum is not linked here: the landing page and the legal pages link it.
 */
export const HOME_LINK =
  `<style>${HOME_LINK_STYLE}</style>` +
  '<nav class="fa-home" lang="de" aria-label="Family Agenda"><a href="https://family-agenda.cloud/">← Zur Startseite</a></nav>' +
  '<nav class="fa-home" lang="en" aria-label="Family Agenda"><a href="https://family-agenda.cloud/en/">← Back to home page</a></nav>';

/** The paths of Logto's sign-in app that show `HOME_LINK`: signing in, registering, resetting the password. */
export const HOME_LINK_PATHS = ["/sign-in", "/sign-in/password", "/sign-in/verification-code", "/register", "/register/password", "/register/verification-code", "/forgot-password", "/forgot-password/reset", "/forgot-password/verification-code"];

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
    customContent: Object.fromEntries(HOME_LINK_PATHS.map((path) => [path, HOME_LINK])),
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
