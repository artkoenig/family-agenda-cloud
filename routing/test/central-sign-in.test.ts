import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { emailOf } from "./support/stand-in-logto";

/** The origin the Router serves, as the browser sees it; the test browser sends it to the Router. */
const PUBLIC_URL = "https://app.family-agenda.test";

/** Where the browser is after following the redirects of central sign-in and Logto. */
type Visit = { status: number; path: string; body: string; headers: Headers };

/**
 * A browser with a cookie jar that follows redirects within central sign-in and to Logto, and
 * stops at any other path of the Router: the Family it lands in.
 */
function browserFor(router: Router, acceptLanguage = "de-DE,de;q=0.9") {
  const jar = new Map<string, string>();
  const toRouter = (url: URL) => (url.origin === PUBLIC_URL ? new URL(url.pathname + url.search, router.url) : url);
  return {
    jar,
    async visit(path: string): Promise<Visit> {
      let url = new URL(path, PUBLIC_URL);
      for (let hop = 0; hop < 20; hop++) {
        const isRouter = url.origin === PUBLIC_URL;
        const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
        const answer = await fetch(toRouter(url), {
          redirect: "manual",
          headers: { "accept-language": acceptLanguage, ...(isRouter && cookie ? { cookie } : {}) },
        });
        if (isRouter) keepCookies(jar, answer.headers.getSetCookie());
        const location = answer.headers.get("location");
        const body = await answer.text();
        if (!location) return { status: answer.status, path: isRouter ? url.pathname : url.href, body, headers: answer.headers };
        url = new URL(location, url);
        if (url.origin === PUBLIC_URL && !url.pathname.startsWith("/sign-in")) return { status: answer.status, path: url.pathname, body, headers: answer.headers };
      }
      throw new Error("Too many redirects");
    },
  };
}

function keepCookies(jar: Map<string, string>, setCookies: string[]) {
  for (const setCookie of setCookies) {
    const [pair = "", ...attributes] = setCookie.split(";").map((part) => part.trim());
    const [name = "", value = ""] = pair.split(/=(.*)/s);
    if (attributes.some((attribute) => attribute.toLowerCase() === "max-age=0")) jar.delete(name);
    else jar.set(name, value);
  }
}

let routing: TestRouting;
let router: Router;
/** How far the Router's clock is ahead of the system's. */
let ahead = 0;
const waitFor = (ms: number) => (ahead += ms);

/** Sets up the central sign-in client at Logto, as the setup wizard does, and starts the Router with it. */
async function startWithCentralSignIn(): Promise<Router> {
  // `routing serve` brings the Directory's schema up to date before the Router starts.
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  const client = await routing.run(["sign-in-client"], { PUBLIC_URL });
  expect(client, client.stderr).toMatchObject({ exitCode: 0 });
  const env = Object.fromEntries(
    client.stdout
      .trim()
      .split("\n")
      .map((line): [string, string] => {
        const [key = "", value = ""] = line.split(/=(.*)/s);
        return [key, value];
      }),
  );
  return routing.startRouter({ PUBLIC_URL, OIDC_ISSUER_URL: routing.logto.issuer, ...env }, () => new Date(Date.now() + ahead));
}

beforeEach(async () => {
  ahead = 0;
  routing = await setUpRouting();
  router = await startWithCentralSignIn();
});
afterEach(async () => {
  await routing.close();
});

/** Creates an active Family of the Organization through the command line; answers its Family id. */
async function createFamily(organizationId: string): Promise<string> {
  const result = await routing.run(["create", "--organization-id", organizationId]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
}

const setStatus = (familyId: string, status: string) => routing.directory("UPDATE family SET status = $2 WHERE family_id = $1", [familyId, status]);

/** Signs the person in at Logto as a member of these Organizations. */
function signInMemberOf(userId: string, ...organizationIds: string[]) {
  for (const organizationId of organizationIds) routing.logto.addMember(organizationId, userId);
  routing.logto.signInAs(userId);
}

describe("Central sign-in", () => {
  it("lands a member of an active Family's Organization in the Family", async () => {
    const familyId = await createFamily("org_active");
    signInMemberOf("u-1", "org_active");

    expect(await browserFor(router).visit("/sign-in")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("logs where the person landed by the Family id, not by the Organization", async () => {
    const familyId = await createFamily("org_logged");
    signInMemberOf("u-1", "org_logged");

    await browserFor(router).visit("/sign-in");

    const [line] = routing.log().split("\n").filter((logged) => logged.includes("Central sign-in landed"));
    expect(line).toContain(`"landing":"family","familyId":"${familyId}"`);
    expect(line).not.toContain("org_logged");
  });

  it("lets an Organization the Directory does not know wait, and lands the person once its Family is active", async () => {
    signInMemberOf("u-1", "org_new");
    const browser = browserFor(router);

    const waiting = await browser.visit("/sign-in");
    expect(waiting).toMatchObject({ status: 200, path: "/sign-in/callback" });
    expect(waiting.body).toContain("Deine Family wird vorbereitet");
    expect(waiting.body).toContain('<meta http-equiv="refresh" content="5;url=/sign-in/waiting">');
    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 200, path: "/sign-in/waiting" });

    const familyId = await createFamily("org_new");

    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("tells a person who waits 2 minutes whom to write to and lets them sign out, and still lands them once the Family is ready", async () => {
    signInMemberOf("u-1", "org_slow");
    const browser = browserFor(router);
    const HINT = 'Dauert es länger? Schreib uns: <a href="mailto:support@family-agenda.cloud">support@family-agenda.cloud</a>';

    expect((await browser.visit("/sign-in")).body).not.toContain(HINT);
    waitFor(119_000);
    expect((await browser.visit("/sign-in/waiting")).body).not.toContain("/sign-in/out");
    waitFor(1_000);
    const late = await browser.visit("/sign-in/waiting");

    expect(late.body).toContain(HINT);
    expect(late.body).toContain('<a class="fam-button fam-button--primary" href="/sign-in/out">Abmelden</a>');
    expect(late.body).toContain('<meta http-equiv="refresh" content="5;url=/sign-in/waiting">');
    const familyId = await createFamily("org_slow");
    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("counts the 2 minutes of a person of no Organization across the silent sign-ins of the waiting page", async () => {
    signInMemberOf("u-new");
    const browser = browserFor(router, "en-GB");
    await browser.visit("/sign-in");
    waitFor(60_000);
    await browser.visit("/sign-in/waiting");
    waitFor(60_000);

    const late = await browser.visit("/sign-in/waiting");

    expect(late.body).toContain("Taking longer? Write to us:");
    expect(late.body).toContain('<a class="fam-button fam-button--primary" href="/sign-in/out">Sign out</a>');
  });

  it("starts the 2 minutes again when the person signs in again", async () => {
    signInMemberOf("u-new");
    const browser = browserFor(router);
    await browser.visit("/sign-in");
    waitFor(120_000);

    expect((await browser.visit("/sign-in")).body).not.toContain("Dauert es länger?");
  });

  it("lets a Family being prepared wait until it is active", async () => {
    const familyId = await createFamily("org_preparing");
    await setStatus(familyId, "being_prepared");
    signInMemberOf("u-1", "org_preparing");
    const browser = browserFor(router);

    expect((await browser.visit("/sign-in")).body).toContain("Deine Family wird vorbereitet");
    await setStatus(familyId, "active");

    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it.each(["suspended", "deleted"])("shows a %s Family as not available, and sends nobody into it", async (status) => {
    const familyId = await createFamily("org_gone");
    await setStatus(familyId, status);
    signInMemberOf("u-1", "org_gone");

    const visit = await browserFor(router).visit("/sign-in");

    expect(visit).toMatchObject({ status: 200, path: "/sign-in/callback" });
    expect(visit.body).toContain("Family nicht verfügbar");
    expect(visit.body).not.toContain(familyId);
  });

  it("shows a suspended and a deleted Family the same page", async () => {
    const pages: string[] = [];
    for (const status of ["suspended", "deleted"]) {
      const familyId = await createFamily(`org_${status}`);
      await setStatus(familyId, status);
      routing.logto.addMember(`org_${status}`, `u-${status}`);
      routing.logto.signInAs(`u-${status}`);
      pages.push((await browserFor(router).visit("/sign-in")).body);
    }

    expect(pages[0]).toBe(pages[1]);
  });

  describe.each([
    { language: "de-DE", support: "Schreib uns:", signOut: "Abmelden" },
    { language: "en-GB", support: "Write to us:", signOut: "Sign out" },
  ])("in $language", ({ language, support, signOut }) => {
    const SUPPORT_LINK = '<a href="mailto:support@family-agenda.cloud">support@family-agenda.cloud</a>';

    it("gives a person whose Family is not available the support contact and Abmelden", async () => {
      const familyId = await createFamily("org_gone");
      await setStatus(familyId, "suspended");
      signInMemberOf("u-1", "org_gone");

      const { body } = await browserFor(router, language).visit("/sign-in");

      expect(body).toContain(`${support} ${SUPPORT_LINK}`);
      expect(body).toContain(`<a class="fam-button fam-button--primary" href="/sign-in/out">${signOut}</a>`);
    });

    it("gives a person of several Families the support contact and Abmelden", async () => {
      await createFamily("org_one");
      await createFamily("org_two");
      signInMemberOf("u-1", "org_one", "org_two");

      const { body } = await browserFor(router, language).visit("/sign-in");

      expect(body).toContain(SUPPORT_LINK);
      expect(body).toContain(`<a class="fam-button fam-button--primary" href="/sign-in/out">${signOut}</a>`);
    });
  });

  it("stops waiting for a Family that is suspended meanwhile", async () => {
    const familyId = await createFamily("org_later");
    await setStatus(familyId, "being_prepared");
    signInMemberOf("u-1", "org_later");
    const browser = browserFor(router);
    await browser.visit("/sign-in");
    await setStatus(familyId, "suspended");

    expect((await browser.visit("/sign-in/waiting")).body).toContain("Family nicht verfügbar");
    expect(browser.jar.has("__Host-sign-in-waiting")).toBe(false);
  });

  it("lets a person of no Organization wait, signing in again silently until their Organization is there", async () => {
    signInMemberOf("u-new");
    const browser = browserFor(router);

    const waiting = await browser.visit("/sign-in");
    expect(waiting.body).toContain("Deine Family wird vorbereitet");
    expect(waiting.body).not.toMatch(/Keine Family|<form|<button/);
    expect(waiting.body.slice(waiting.body.indexOf("<main"), waiting.body.indexOf("</main>"))).not.toContain("<a ");
    expect((await browser.visit("/sign-in/waiting")).body).toContain("Deine Family wird vorbereitet");

    routing.logto.addMember("org_registered", "u-new");
    const familyId = await createFamily("org_registered");

    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("signs in with the person when the silent sign-in finds Logto's session ended", async () => {
    signInMemberOf("u-new");
    const browser = browserFor(router);
    await browser.visit("/sign-in");
    routing.logto.signInAs(null);

    const visit = await browser.visit("/sign-in/waiting");

    expect(visit).toMatchObject({ status: 200, body: "<h1>Logto sign-in</h1>" });
    expect(new URL(visit.path).searchParams.has("prompt")).toBe(false);
  });

  it("opens Logto's sign-up screen for the landing page's registration", async () => {
    routing.logto.signInAs(null);

    const visit = await browserFor(router).visit("/sign-in/register");

    expect(visit).toMatchObject({ status: 200, body: "<h1>Logto sign-in</h1>" });
    expect(new URL(visit.path).searchParams.get("first_screen")).toBe("register");
  });

  it("lets a person who just registered wait for their Family, and lands them once it is active", async () => {
    signInMemberOf("u-registered");
    const browser = browserFor(router);

    expect((await browser.visit("/sign-in/register")).body).toContain("Deine Family wird vorbereitet");

    routing.logto.addMember("org_registered", "u-registered");
    const familyId = await createFamily("org_registered");

    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("refuses a person of several Organizations with an error page", async () => {
    await createFamily("org_one");
    await createFamily("org_two");
    signInMemberOf("u-1", "org_one", "org_two");

    const visit = await browserFor(router).visit("/sign-in");

    expect(visit).toMatchObject({ status: 500, path: "/sign-in/callback" });
    expect(visit.body).toContain("Anmeldung nicht möglich");
  });

  it("shows its pages in English to a browser that prefers English", async () => {
    signInMemberOf("u-1", "org_new");

    expect((await browserFor(router, "en-GB,en;q=0.9,de;q=0.5").visit("/sign-in")).body).toContain("Your Family is being prepared");
  });

  it("sends a browser without a waiting claim to sign in", async () => {
    const familyId = await createFamily("org_active");
    signInMemberOf("u-1", "org_active");
    const browser = browserFor(router);

    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });

  it("does not take a waiting claim the Router did not seal", async () => {
    await createFamily("org_victim");
    signInMemberOf("u-1");
    const browser = browserFor(router);
    browser.jar.set("__Host-sign-in-waiting", Buffer.from(JSON.stringify({ organizationId: "org_victim" })).toString("base64url"));

    expect((await browser.visit("/sign-in/waiting")).body).toContain("Deine Family wird vorbereitet");
  });

  it("refuses a callback whose state is not the one it sent", async () => {
    await createFamily("org_active");
    signInMemberOf("u-1", "org_active");
    const browser = browserFor(router);
    const toLogto = await fetch(new URL("/sign-in", router.url), { redirect: "manual" });
    keepCookies(browser.jar, toLogto.headers.getSetCookie());
    const back = new URL((await fetch(toLogto.headers.get("location")!, { redirect: "manual" })).headers.get("location")!);
    back.searchParams.set("state", "forged");

    const visit = await browser.visit(back.pathname + back.search);

    expect(visit.status).toBe(400);
    expect(visit.body).toContain("Anmeldung fehlgeschlagen");
  });

  it("refuses a callback without the sign-in it ends", async () => {
    const visit = await browserFor(router).visit("/sign-in/callback?code=c&state=s");

    expect(visit.status).toBe(400);
    expect(visit.body).toContain("Anmeldung fehlgeschlagen");
  });

  it("answers 502 when Logto's token endpoint refuses the code", async () => {
    signInMemberOf("u-1", "org_active");
    routing.logto.failTokens(500);

    expect((await browserFor(router).visit("/sign-in")).status).toBe(502);
  });

  it("answers 502 when Logto's token endpoint does not answer", async () => {
    signInMemberOf("u-1", "org_active");
    routing.logto.failTokens("drop");

    const visit = await browserFor(router).visit("/sign-in");

    expect(visit.status).toBe(502);
    expect(visit.body).toContain("Anmeldung fehlgeschlagen");
  });

  it("asks Logto for the Organizations claim, with PKCE and its own redirect URI", async () => {
    const location = new URL((await fetch(new URL("/sign-in", router.url), { redirect: "manual" })).headers.get("location")!);

    expect(location.href.startsWith(`${routing.logto.issuer}/auth?`)).toBe(true);
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      redirect_uri: `${PUBLIC_URL}/sign-in/callback`,
      scope: "openid email urn:logto:scope:organizations",
      response_type: "code",
      code_challenge_method: "S256",
    });
  });

  it("keeps its cookies to this origin, out of scripts' reach", async () => {
    const [cookie] = (await fetch(new URL("/sign-in", router.url), { redirect: "manual" })).headers.getSetCookie();

    expect(cookie).toMatch(/^__Host-sign-in=v1\.[^;]+; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Lax$/);
  });

  it("answers only GET and HEAD", async () => {
    const posted = await fetch(new URL("/sign-in", router.url), { method: "POST", redirect: "manual" });
    const head = await fetch(new URL("/sign-in", router.url), { method: "HEAD", redirect: "manual" });

    expect({ status: posted.status, allow: posted.headers.get("allow") }).toEqual({ status: 405, allow: "GET, HEAD" });
    expect(head.status).toBe(302);
  });

  it("answers 404 to a path below /sign-in it does not know", async () => {
    expect((await fetch(new URL("/sign-in/elsewhere", router.url), { redirect: "manual" })).status).toBe(404);
  });

  it("refuses a callback with neither code nor error", async () => {
    const browser = browserFor(router);
    const toLogto = await fetch(new URL("/sign-in", router.url), { redirect: "manual" });
    keepCookies(browser.jar, toLogto.headers.getSetCookie());
    const state = new URL(toLogto.headers.get("location") ?? "").searchParams.get("state") ?? "";

    const visit = await browser.visit(`/sign-in/callback?state=${state}`);

    expect(visit).toMatchObject({ status: 400 });
    expect(visit.body).toContain("Anmeldung fehlgeschlagen");
  });

  it("signs the person out at Logto with its own client and back to the landing page, clearing its cookies", async () => {
    signInMemberOf("u-new");
    const browser = browserFor(router);
    await browser.visit("/sign-in");
    expect(browser.jar.has("__Host-sign-in-waiting")).toBe(true);

    const toLogto = new URL((await fetch(new URL("/sign-in/out", router.url), { redirect: "manual" })).headers.get("location")!);
    expect(toLogto.origin + toLogto.pathname).toBe(`${routing.logto.issuer}/session/end`);
    expect(Object.fromEntries(toLogto.searchParams)).toEqual({ client_id: routing.logto.applications[0]!.id, post_logout_redirect_uri: `${PUBLIC_URL}/` });

    expect(await browser.visit("/sign-in/out")).toMatchObject({ status: 302, path: "/" });
    expect([...browser.jar.keys()]).toEqual([]);
    expect((await browser.visit("/sign-in")).body).toBe("<h1>Logto sign-in</h1>");
  });

  it("answers 404 below /sign-in when central sign-in is not set up", async () => {
    const without = await routing.startRouter({ CENTRAL_SIGN_IN_CLIENT_ID: undefined, CENTRAL_SIGN_IN_CLIENT_SECRET: undefined });

    expect((await fetch(new URL("/sign-in", without.url), { redirect: "manual" })).status).toBe(404);
  });
});

/** The PostRegister events the cores received, each with whether it carries Logto's signature by IDP_WEBHOOK_SECRET. */
function postRegisters() {
  return routing.core.requests
    .filter(({ method, path }) => method === "POST" && path === "/idp/events")
    .map(({ headers, body }) => ({
      body,
      signed: headers["logto-signature-sha-256"] === createHmac("sha256", routing.env.IDP_WEBHOOK_SECRET!).update(JSON.stringify(body)).digest("hex"),
    }));
}

describe("Central sign-in of a person whose PostRegister the core missed", () => {
  it("has the core run PostRegister for them again, signed as Logto signs it, and lands them once their Family is there", async () => {
    signInMemberOf("u-lost");
    const browser = browserFor(router);

    expect((await browser.visit("/sign-in")).body).toContain("Deine Family wird vorbereitet");

    expect(postRegisters()).toEqual([
      { body: expect.objectContaining({ event: "PostRegister", user: { id: "u-lost", primaryEmail: emailOf("u-lost") } }) as unknown, signed: true },
    ]);
    routing.logto.addMember("org_repaired", "u-lost");
    const familyId = await createFamily("org_repaired");
    expect(await browser.visit("/sign-in/waiting")).toMatchObject({ status: 302, path: `/${familyId}/` });
  });
  it("sends it once per sign-in of the person, not at each silent sign-in of the waiting page", async () => {
    signInMemberOf("u-slow");
    const browser = browserFor(router);
    await browser.visit("/sign-in");

    await browser.visit("/sign-in/waiting");
    await browser.visit("/sign-in/waiting");
    expect(postRegisters()).toHaveLength(1);

    await browser.visit("/sign-in");
    expect(postRegisters()).toHaveLength(2);
  });

  it("sends none for a person of an Organization", async () => {
    signInMemberOf("u-1", "org_new");

    await browserFor(router).visit("/sign-in");

    expect(postRegisters()).toEqual([]);
  });

  it("lets the person wait when no core takes it, and the next sign-in tries again", async () => {
    signInMemberOf("u-lost");
    await routing.core.goDown();

    const visit = await browserFor(router).visit("/sign-in");

    expect(visit).toMatchObject({ status: 200, path: "/sign-in/callback" });
    expect(visit.body).toContain("Deine Family wird vorbereitet");
    expect(routing.log()).toContain("Sending PostRegister again failed");
    await routing.core.comeBack();

    await browserFor(router).visit("/sign-in");
    expect(postRegisters()).toHaveLength(1);
  });

  it("logs that it sent PostRegister again by the user id, not by the email", async () => {
    signInMemberOf("u-lost");

    await browserFor(router).visit("/sign-in");

    const [line] = routing.log().split("\n").filter((logged) => logged.includes("Sent PostRegister again"));
    expect(line).toContain('"userId":"u-lost"');
    expect(routing.log()).not.toContain(emailOf("u-lost"));
  });
});

describe("Setting up central sign-in's client", () => {
  it("creates one Traditional application redirecting to /sign-in/callback, and updates it when run again", async () => {
    const again = await routing.run(["sign-in-client"], { PUBLIC_URL: "https://agenda.example" });

    expect(again.exitCode).toBe(0);
    expect(routing.logto.applications).toMatchObject([
      { name: "Family Agenda central sign-in", type: "Traditional", oidcClientMetadata: { redirectUris: ["https://agenda.example/sign-in/callback"] } },
    ]);
    const [application] = routing.logto.applications;
    expect(again.stdout).toBe(`CENTRAL_SIGN_IN_CLIENT_ID=${application!.id}\nCENTRAL_SIGN_IN_CLIENT_SECRET=${application!.secret}\n`);
  });

  it("needs IDP_MANAGEMENT_*", async () => {
    expect(await routing.run(["sign-in-client"], { IDP_MANAGEMENT_ENDPOINT: undefined, IDP_MANAGEMENT_CLIENT_ID: undefined, IDP_MANAGEMENT_CLIENT_SECRET: undefined })).toMatchObject({ exitCode: 2 });
  });
});
