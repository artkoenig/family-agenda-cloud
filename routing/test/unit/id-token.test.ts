import { describe, expect, it } from "vitest";
import { signInClaims } from "../../src/id-token";

const expected = { issuer: "https://auth.family-agenda.cloud/oidc", clientId: "central", nonce: "n-1" };
const now = new Date("2026-11-22T12:00:00Z");
const seconds = now.getTime() / 1000;

/** An ID token as Logto issues it; the signature is not read (see id-token.ts). */
const idToken = (payload: Record<string, unknown>) =>
  [{ alg: "ES384", typ: "JWT" }, payload].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".c2lnbmF0dXJl";

const valid = { iss: expected.issuer, aud: "central", sub: "u-1", email: "u-1@family.test", email_verified: true, nonce: "n-1", iat: seconds - 5, exp: seconds + 3600, organizations: ["org_a"] };

describe("signInClaims", () => {
  it("answers the Organizations of a token for this client, from its issuer, with its nonce", () => {
    expect(signInClaims(idToken(valid), expected, now)?.organizations).toEqual(["org_a"]);
  });

  it("answers the person's user id and verified email", () => {
    expect(signInClaims(idToken(valid), expected, now)).toEqual({ userId: "u-1", email: "u-1@family.test", organizations: ["org_a"] });
  });

  it.each([
    ["not verified", { email_verified: false }],
    ["verified only by a text", { email_verified: "true" }],
    ["empty", { email: "" }],
    ["no text", { email: 1 }],
    ["missing", { email: undefined, email_verified: undefined }],
  ])("answers no email for one %s", (_, change) => {
    expect(signInClaims(idToken({ ...valid, ...change }), expected, now)?.email).toBeNull();
  });

  it("answers every Organization claimed", () => {
    expect(signInClaims(idToken({ ...valid, organizations: ["org_a", "org_b"] }), expected, now)?.organizations).toEqual(["org_a", "org_b"]);
  });

  it("answers none for a token without the claim", () => {
    const withoutClaim: Partial<typeof valid> = { ...valid };
    delete withoutClaim.organizations;
    expect(signInClaims(idToken(withoutClaim), expected, now)?.organizations).toEqual([]);
  });

  it("accepts an audience list that names this client", () => {
    expect(signInClaims(idToken({ ...valid, aud: ["other", "central"] }), expected, now)?.organizations).toEqual(["org_a"]);
  });

  it.each([
    ["another issuer", { iss: "https://evil.example/oidc" }],
    ["another client", { aud: "core" }],
    ["an audience list without this client", { aud: ["core"] }],
    ["no subject", { sub: undefined }],
    ["an empty subject", { sub: "" }],
    ["a subject that is no text", { sub: 1 }],
    ["another nonce", { nonce: "n-2" }],
    ["no nonce", { nonce: undefined }],
    ["an expired token", { exp: seconds }],
    ["no expiry", { exp: undefined }],
    ["an expiry that is no number", { exp: String(seconds + 3600) }],
    ["a claim that is no list", { organizations: "org_a" }],
    ["a claim with something other than an Organization id", { organizations: ["org a"] }],
    ["a claim with a number", { organizations: [1] }],
  ])("refuses %s", (_, change) => {
    expect(signInClaims(idToken({ ...valid, ...change }), expected, now)).toBeUndefined();
  });

  it("refuses a token of other than three parts, even with a payload for this sign-in", () => {
    const [header, payload] = idToken(valid).split(".");

    expect(signInClaims(`${header}.${payload}`, expected, now)).toBeUndefined();
    expect(signInClaims(`${idToken(valid)}.more`, expected, now)).toBeUndefined();
  });

  it.each(["", "a.b", "a.b.c.d", "e30.!!!.c", `e30.${Buffer.from("[]").toString("base64url")}.c`, `e30.${Buffer.from("null").toString("base64url")}.c`])(
    "refuses %j, which is no ID token",
    (text) => {
      expect(signInClaims(text, expected, now)).toBeUndefined();
    },
  );
});
