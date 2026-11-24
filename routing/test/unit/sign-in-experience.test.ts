import { describe, expect, it } from "vitest";
import { ACCOUNT_CENTER, PRIVACY_POLICY_URL, signInExperience, signInMode, TERMS_OF_USE_URL } from "../../src/sign-in-experience";

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
