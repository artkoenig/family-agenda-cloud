import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recipientLanguage, userLocale, type IdpManagement } from "../src/logto-management";
import { startStandInLogto, type StandInLogto } from "./support/stand-in-logto";

let logto: StandInLogto;
let idp: IdpManagement;
beforeEach(async () => {
  logto = await startStandInLogto();
  idp = { endpoint: logto.env.IDP_MANAGEMENT_ENDPOINT, clientId: logto.env.IDP_MANAGEMENT_CLIENT_ID, clientSecret: logto.env.IDP_MANAGEMENT_CLIENT_SECRET };
});
afterEach(async () => {
  await logto.close();
});

describe("A mail's language", () => {
  it("is German for a person whose locale at Logto is German", async () => {
    logto.setLocale("user-de", "de-DE");
    logto.setLocale("user-de-plain", "de");

    expect(await userLocale(idp, "user-de")).toBe("de-DE");
    expect(await recipientLanguage(idp, "user-de")).toBe("de");
    expect(await recipientLanguage(idp, "user-de-plain")).toBe("de");
  });

  it("is English for a person whose locale is English, and German for one who has none, as Logto 1.46.0 keeps none from sign-up", async () => {
    logto.setLocale("user-en", "en-GB");
    logto.setLocale("user-none", null);

    expect(await recipientLanguage(idp, "user-en")).toBe("en");
    expect(await userLocale(idp, "user-none")).toBeNull();
    expect(await recipientLanguage(idp, "user-none")).toBe("de");
  });

  it("is not guessed for a person Logto does not know", async () => {
    await expect(recipientLanguage(idp, "user-gone")).rejects.toThrow("Logto's Management API answered reading the user's locale with 404");
  });
});
