import { describe, expect, it } from "vitest";
import { cookiesOf } from "../../src/cookies";
import { clearSessionCookie, isOwnForm, sessionCookie, sessionOf } from "../../src/routing-session";
import { sealCookie } from "../../src/sign-in-cookie";

const key = Buffer.alloc(32, 7);
const now = new Date("2026-11-24T12:00:00Z");
const claims = { userId: "u-1", email: null, organizations: ["org_a"], authTime: 1_790_000_000 };
const sentBack = (cookie: string) => cookiesOf(cookie.split(";")[0]);

describe("the session of the Routing module's pages", () => {
  it("is the person, their Organization and when they signed in, for eight hours", () => {
    const cookie = sessionCookie(key, claims, now);
    expect(cookie).toMatch(/^__Host-session=[^;]+; Path=\/; Max-Age=28800; Secure; HttpOnly; SameSite=Lax$/);
    expect(cookie).not.toContain("org_a");
    expect(sessionOf(key, sentBack(cookie), now)).toEqual({ userId: "u-1", organizationId: "org_a", authTime: 1_790_000_000, csrf: expect.stringMatching(/^[\w-]{24}$/) as string });
    expect(sessionOf(key, sentBack(cookie), new Date(now.getTime() + 8 * 3_600_000 + 1))).toBeUndefined();
  });

  it("is none of another key's, and none without a cookie", () => {
    expect(sessionOf(Buffer.alloc(32, 8), sentBack(sessionCookie(key, claims, now)), now)).toBeUndefined();
    expect(sessionOf(key, new Map(), now)).toBeUndefined();
  });

  it("has a random token of its own, which a form of its pages posts back", () => {
    const [one, other] = [sessionCookie(key, claims, now), sessionCookie(key, claims, now)].map((cookie) => sessionOf(key, sentBack(cookie), now)!);
    expect(one!.csrf).not.toBe(other!.csrf);
    expect(isOwnForm(one!, one!.csrf)).toBe(true);
    for (const posted of [null, "", other!.csrf, `${one!.csrf}x`]) expect(isOwnForm(one!, posted)).toBe(false);
  });

  it("is none if it was sealed without a token", () => {
    const sealed = sealCookie(key, "__Host-session", { userId: "u-1", organizationId: "org_a", authTime: null }, 60_000, now);
    expect(sessionOf(key, new Map([["__Host-session", sealed]]), now)).toBeUndefined();
  });

  it.each([[[]], [["org_a", "org_b"]]])("is cleared for the Organizations %j", (organizations) => {
    expect(sessionCookie(key, { ...claims, organizations }, now)).toBe(clearSessionCookie());
    expect(clearSessionCookie()).toBe("__Host-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax");
  });
});
