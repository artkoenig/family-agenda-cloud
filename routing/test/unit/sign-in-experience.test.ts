import { describe, expect, it } from "vitest";
import { ACCOUNT_CENTER, HOME_LINK, HOME_LINK_PATHS, PRIVACY_POLICY_URL, signInExperience, signInMode, TERMS_OF_USE_URL } from "../../src/sign-in-experience";

describe("signInExperience", () => {
  it("signs in by email with password first, or code, or passkey; no MFA", () => {
    expect(signInExperience(false, "closed")).toMatchObject({
      signIn: { methods: [{ identifier: "email", password: true, verificationCode: true, isPasswordPrimary: true }] },
      forgotPasswordMethods: ["EmailVerificationCode"],
      passkeySignIn: { enabled: true, showPasskeyButton: true, allowAutofill: true },
      mfa: { factors: [], policy: "NoPrompt" },
    });
  });

  it("asks for the terms at registration only, links them, speaks German unless the browser asks otherwise", () => {
    expect(signInExperience(false, "closed")).toMatchObject({
      agreeToTermsPolicy: "ManualRegistrationOnly",
      termsOfUseUrl: "https://family-agenda.cloud/agb",
      privacyPolicyUrl: "https://family-agenda.cloud/datenschutz",
      languageInfo: { autoDetect: true, fallbackLanguage: "de" },
    });
    expect([TERMS_OF_USE_URL, PRIVACY_POLICY_URL]).toEqual(["https://family-agenda.cloud/agb", "https://family-agenda.cloud/datenschutz"]);
  });

  it("links the landing page in German and English above the card on every page of signing in, registering and resetting the password", () => {
    expect(HOME_LINK).toBe(
      "<style>" +
        ".fa-home{display:flex;width:min(540px,calc(100vw - 40px));margin-bottom:8px;font:var(--font-body-2)}" +
        ".fa-home a{padding:12px 4px;color:var(--color-type-primary);text-decoration:underline;text-underline-offset:3px}" +
        "html:lang(de) .fa-home:lang(en),html:not(:lang(de)) .fa-home:lang(de){display:none}" +
        "</style>" +
        '<nav class="fa-home" lang="de" aria-label="Family Agenda"><a href="https://family-agenda.cloud/">← Zur Startseite</a></nav>' +
        '<nav class="fa-home" lang="en" aria-label="Family Agenda"><a href="https://family-agenda.cloud/en/">← Back to home page</a></nav>',
    );
    expect(HOME_LINK_PATHS).toEqual([
      "/sign-in",
      "/sign-in/password",
      "/sign-in/verification-code",
      "/register",
      "/register/password",
      "/register/verification-code",
      "/forgot-password",
      "/forgot-password/reset",
      "/forgot-password/verification-code",
    ]);
    expect(signInExperience(false, "closed")).toMatchObject({ customContent: Object.fromEntries(HOME_LINK_PATHS.map((path) => [path, HOME_LINK])) });
    expect(Object.keys(signInExperience(true, "open").customContent as object)).toEqual(HOME_LINK_PATHS);
  });

  it("links a Google identity to the account of its email without asking; Google is a target only with its connector", () => {
    expect(signInExperience(true, "open")).toMatchObject({ socialSignIn: { automaticAccountLinking: true }, socialSignInConnectorTargets: ["google"] });
    expect(signInExperience(false, "closed")).toMatchObject({ socialSignIn: { automaticAccountLinking: true } });
    expect(signInExperience(false, "closed")).not.toHaveProperty("socialSignInConnectorTargets");
  });

  it("lets anyone register only with registration open; closed, Logto only signs in", () => {
    expect(signInExperience(true, "open")).toMatchObject({ signInMode: "SignInAndRegister" });
    expect(signInExperience(true, "closed")).toMatchObject({ signInMode: "SignIn" });
    expect([signInMode("open"), signInMode("closed")]).toEqual(["SignInAndRegister", "SignIn"]);
  });

  it("leaves sign-up to logto-setup", () => {
    expect(signInExperience(true, "open")).not.toHaveProperty("signUp");
  });
});

describe("ACCOUNT_CENTER", () => {
  it("lets the Admin change password and passkey and see the email; no MFA", () => {
    expect(ACCOUNT_CENTER).toEqual({ enabled: true, fields: { password: "Edit", passkey: "Edit", email: "ReadOnly", mfa: "Off" } });
  });
});
