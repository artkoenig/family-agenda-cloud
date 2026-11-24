import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_CENTER, signInExperience } from "../src/sign-in-experience";
import { setUpRouting, type TestRouting } from "./support/routing";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

const GOOGLE = { GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "google-secret" };
const CLOSED = "Registration is closed: only invitation links create accounts (REGISTRATION is not open)\n";
const calls = () => routing.logto.settingCalls.map(({ method, path }) => `${method} ${path}`);

describe("sign-in-experience", () => {
  it("without a Google client sets the sign-in experience and the Account Center and leaves Google alone", async () => {
    const result = await routing.run(["sign-in-experience"]);
    expect(result, result.stderr).toMatchObject({
      exitCode: 0,
      stdout: `Logto's sign-in experience is set, without Google: GOOGLE_CLIENT_ID and _SECRET are not set\n${CLOSED}`,
    });
    expect(calls()).toEqual(["PATCH /api/sign-in-exp", "PATCH /api/account-center"]);
    const [signIn, accountCenter] = routing.logto.settingCalls;
    expect(signIn!.body).toEqual(signInExperience(false, "closed"));
    expect(signIn!.body).not.toHaveProperty("socialSignInConnectorTargets");
    expect(accountCenter!.body).toEqual(ACCOUNT_CENTER);
  });

  it("creates the Google connector before naming it a social target", async () => {
    const result = await routing.run(["sign-in-experience"], GOOGLE);
    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `Logto's sign-in experience is set, with Google (connector created)\n${CLOSED}` });
    expect(calls()).toEqual(["GET /api/connectors", "POST /api/connectors", "PATCH /api/sign-in-exp", "PATCH /api/account-center"]);
    expect(routing.logto.connectors).toEqual([
      {
        id: "connector-1",
        connectorId: "google-universal",
        config: { clientId: GOOGLE.GOOGLE_CLIENT_ID, clientSecret: GOOGLE.GOOGLE_CLIENT_SECRET, scope: "openid profile email", prompts: ["select_account"] },
      },
    ]);
    expect(routing.logto.settingCalls[2]!.body).toMatchObject({ socialSignInConnectorTargets: ["google"] });
  });

  it("updates the Google connector when run again, creating no second one", async () => {
    await routing.run(["sign-in-experience"], GOOGLE);
    const result = await routing.run(["sign-in-experience"], { ...GOOGLE, GOOGLE_CLIENT_SECRET: "rotated" });
    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `Logto's sign-in experience is set, with Google (connector updated)\n${CLOSED}` });
    expect(calls().slice(4)).toEqual(["GET /api/connectors", "PATCH /api/connectors/connector-1", "PATCH /api/sign-in-exp", "PATCH /api/account-center"]);
    expect(routing.logto.connectors).toHaveLength(1);
    expect(routing.logto.connectors[0]!.config).toMatchObject({ clientSecret: "rotated" });
  });

  it.each([
    ["missing", undefined],
    ["empty, as Compose passes it unset", ""],
    ["closed", "closed"],
  ])("with REGISTRATION %s lets Logto only sign in, and says registration is closed", async (_case, REGISTRATION) => {
    // An invitee still registers: the invitation link's one-time token lets Logto create the account under
    // `SignIn` (ADR-0011 of the core). The core hands the token on with registration closed (its
    // apps/api/test/http/sign-up-link.test.ts); that Logto honours it is checked on the Cube (launch checklist, 13a).
    const result = await routing.run(["sign-in-experience"], { REGISTRATION });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(result.stdout.endsWith(`\n${CLOSED}`), result.stdout).toBe(true);
    expect(routing.logto.signInExperience).toMatchObject({ signInMode: "SignIn" });
  });

  it("with REGISTRATION=open lets anyone register, and says so", async () => {
    const result = await routing.run(["sign-in-experience"], { REGISTRATION: "open" });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(result.stdout.endsWith("\nRegistration is open: anyone can register (REGISTRATION=open)\n"), result.stdout).toBe(true);
    expect(routing.logto.signInExperience).toMatchObject({ signInMode: "SignInAndRegister" });
  });

  it("closes registration again after the core's logto-setup opened it", async () => {
    // What logto-setup's every run sets when registration is set up (tools/logto-setup/src/setup.ts of the core).
    routing.logto.signInExperience.signInMode = "SignInAndRegister";

    expect(await routing.run(["sign-in-experience"])).toMatchObject({ exitCode: 0 });

    expect(routing.logto.signInExperience).toMatchObject({ signInMode: "SignIn" });
  });

  it("is a configuration error with REGISTRATION neither open nor closed, and changes nothing", async () => {
    const result = await routing.run(["sign-in-experience"], { REGISTRATION: "yes" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("REGISTRATION must be open or closed");
    expect(routing.logto.settingCalls).toEqual([]);
  });

  it("lets Logto send the browser back to the landing page after Abmelden, and changes nothing when run again", async () => {
    const PUBLIC_URL = "https://agenda.example";
    expect(await routing.run(["sign-in-client"], { PUBLIC_URL })).toMatchObject({ exitCode: 0 });
    // A client registered before Abmelden was built (#173).
    routing.logto.applications[0]!.oidcClientMetadata.postLogoutRedirectUris = [];

    expect(await routing.run(["sign-in-experience"], { PUBLIC_URL })).toMatchObject({ exitCode: 0 });
    expect(routing.logto.applications).toMatchObject([
      { oidcClientMetadata: { redirectUris: ["https://agenda.example/sign-in/callback"], postLogoutRedirectUris: ["https://agenda.example/"] } },
    ]);
    const afterFirstRun = structuredClone(routing.logto.applications);

    expect(await routing.run(["sign-in-experience"], { PUBLIC_URL })).toMatchObject({ exitCode: 0 });
    expect(routing.logto.applications).toEqual(afterFirstRun);
  });

  it("creates no central sign-in client where there is none", async () => {
    expect(await routing.run(["sign-in-experience"])).toMatchObject({ exitCode: 0 });

    expect(routing.logto.applications).toEqual([]);
  });

  it("fails, naming what Logto refused", async () => {
    routing.logto.failWith(422);
    const result = await routing.run(["sign-in-experience"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("setting the sign-in experience with 422");
  });

  it("is a configuration error without IDP_MANAGEMENT_*", async () => {
    const result = await routing.run(["sign-in-experience"], {
      IDP_MANAGEMENT_ENDPOINT: undefined,
      IDP_MANAGEMENT_CLIENT_ID: undefined,
      IDP_MANAGEMENT_CLIENT_SECRET: undefined,
    });
    expect(result.exitCode).toBe(2);
    expect(routing.logto.settingCalls).toEqual([]);
  });
});
