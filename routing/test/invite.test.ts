import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

const CENTRAL_SIGN_IN = { OIDC_ISSUER_URL: "https://auth.family-agenda.test/oidc", CENTRAL_SIGN_IN_CLIENT_ID: "client", CENTRAL_SIGN_IN_CLIENT_SECRET: "secret" };
const invite = (args: string[], env: Record<string, string | undefined> = {}) => routing.run(["invite", ...args], { PUBLIC_URL: "https://app.family-agenda.test", ...CENTRAL_SIGN_IN, ...env });
const mails = () => routing.directory("SELECT id, type, family_id, mail_to, subject, body FROM mail_outbox ORDER BY id");

async function expectRefused(result: Promise<{ exitCode: number; stderr: string }>, reason: string) {
  const { exitCode, stderr } = await result;
  expect(exitCode).toBe(1);
  expect(stderr).toContain(reason);
  expect(stderr).not.toContain("@");
  expect(routing.logto.oneTimeTokens).toEqual([]);
  expect(await mails()).toEqual([]);
}

describe("invite", () => {
  it("puts a mail about no Family into the outbox, its link carrying a one-time token for 7 days", async () => {
    const result = await invite(["Anna+X@Example.com"]);

    const [mail, ...others] = await mails();
    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: `The invitation is in the outbox as mail ${String(mail!.id)}; its link works once and for 7 days\n` });
    expect(others).toEqual([]);
    expect(routing.logto.oneTimeTokens).toEqual([{ email: "anna+x@example.com", expiresIn: 604_800 }]);
    expect(mail).toMatchObject({ type: "family-invitation", family_id: null, mail_to: "anna+x@example.com", subject: "Einladung zum Testbetrieb von Family Agenda" });
    expect(String(mail!.body)).toContain("\nhttps://app.family-agenda.test/sign-in/invitation?one_time_token=one-time-1&login_hint=anna%2Bx%40example.com\n");
    expect(result.stdout + result.stderr).not.toMatch(/one-time-1|@/);
  });

  it("writes in English with --language en", async () => {
    expect(await invite(["anna@example.com", "--language", "en"])).toMatchObject({ exitCode: 0 });
    expect((await mails())[0]).toMatchObject({ subject: "Invitation to the Family Agenda trial run" });
  });

  it("invites a person who has an account and no Family, again", async () => {
    routing.logto.setLocale("anna", null);
    expect(await invite(["anna@example.com"])).toMatchObject({ exitCode: 0 });
    expect(await invite(["anna@example.com"])).toMatchObject({ exitCode: 0 });
    expect(await mails()).toHaveLength(2);
  });

  it("refuses a person who is in a Family", async () => {
    routing.logto.addMember("org_1", "anna");
    await expectRefused(invite(["Anna@example.com"]), "The person already is in a Family");
    routing.logto.setLocale("bert", null);
    expect(await invite(["bert@example.com"])).toMatchObject({ exitCode: 0 });
  });

  it.each(["Pending", "Accepted"])("refuses a person with an Admin's invitation that is %s", async (status) => {
    routing.logto.addInvitation("anna@example.com", status);
    await expectRefused(invite(["anna@example.com"]), "The person has an Admin's invitation");
  });

  it.each(["Expired", "Revoked"])("invites a person whose Admin's invitation is %s", async (status) => {
    routing.logto.addInvitation("anna@example.com", status);
    expect(await invite(["anna@example.com"])).toMatchObject({ exitCode: 0 });
  });

  it("sends nothing when Logto refuses", async () => {
    routing.logto.failWith(503);
    await expectRefused(invite(["anna@example.com"]), "answered finding the person's user with 503");
  });

  it("needs Logto's Management API and central sign-in", async () => {
    const noIdp = { IDP_MANAGEMENT_ENDPOINT: undefined, IDP_MANAGEMENT_CLIENT_ID: undefined, IDP_MANAGEMENT_CLIENT_SECRET: undefined };
    const result = await invite(["anna@example.com"], noIdp);
    expect(result).toMatchObject({ exitCode: 2 });
    expect(result.stderr).toContain("invite needs IDP_MANAGEMENT_ENDPOINT");
    const noSignIn = await invite(["anna@example.com"], { CENTRAL_SIGN_IN_CLIENT_ID: undefined, CENTRAL_SIGN_IN_CLIENT_SECRET: undefined });
    expect(noSignIn).toMatchObject({ exitCode: 2 });
    expect(noSignIn.stderr).toContain("invite needs CENTRAL_SIGN_IN_CLIENT_ID");
  });
});
