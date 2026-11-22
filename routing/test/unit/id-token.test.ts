import { describe, expect, it } from "vitest";
import { organizationsClaimed } from "../../src/id-token";

const expected = { issuer: "https://auth.family-agenda.cloud/oidc", clientId: "central", nonce: "n-1" };
const now = new Date("2026-11-22T12:00:00Z");
const seconds = now.getTime() / 1000;

/** An ID token as Logto issues it; the signature is not read (see id-token.ts). */
const idToken = (payload: Record<string, unknown>) =>
  [{ alg: "ES384", typ: "JWT" }, payload].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".c2lnbmF0dXJl";

const valid = { iss: expected.issuer, aud: "central", sub: "u-1", nonce: "n-1", iat: seconds - 5, exp: seconds + 3600, organizations: ["org_a"] };

describe("organizationsClaimed", () => {
  it("answers the Organizations of a token for this client, from its issuer, with its nonce", () => {
    expect(organizationsClaimed(idToken(valid), expected, now)).toEqual(["org_a"]);
  });

  it("answers every Organization claimed", () => {
    expect(organizationsClaimed(idToken({ ...valid, organizations: ["org_a", "org_b"] }), expected, now)).toEqual(["org_a", "org_b"]);
  });

  it("answers none for a token without the claim", () => {
    const withoutClaim: Partial<typeof valid> = { ...valid };
    delete withoutClaim.organizations;
    expect(organizationsClaimed(idToken(withoutClaim), expected, now)).toEqual([]);
  });

  it("accepts an audience list that names this client", () => {
    expect(organizationsClaimed(idToken({ ...valid, aud: ["other", "central"] }), expected, now)).toEqual(["org_a"]);
  });

  it.each([
    ["another issuer", { iss: "https://evil.example/oidc" }],
    ["another client", { aud: "core" }],
    ["an audience list without this client", { aud: ["core"] }],
    ["another nonce", { nonce: "n-2" }],
    ["no nonce", { nonce: undefined }],
    ["an expired token", { exp: seconds }],
    ["no expiry", { exp: undefined }],
    ["an expiry that is no number", { exp: String(seconds + 3600) }],
    ["a claim that is no list", { organizations: "org_a" }],
    ["a claim with something other than an Organization id", { organizations: ["org a"] }],
    ["a claim with a number", { organizations: [1] }],
  ])("refuses %s", (_, change) => {
    expect(organizationsClaimed(idToken({ ...valid, ...change }), expected, now)).toBeUndefined();
  });

  it("refuses a token of other than three parts, even with a payload for this sign-in", () => {
    const [header, payload] = idToken(valid).split(".");

    expect(organizationsClaimed(`${header}.${payload}`, expected, now)).toBeUndefined();
    expect(organizationsClaimed(`${idToken(valid)}.more`, expected, now)).toBeUndefined();
  });

  it.each(["", "a.b", "a.b.c.d", "e30.!!!.c", `e30.${Buffer.from("[]").toString("base64url")}.c`, `e30.${Buffer.from("null").toString("base64url")}.c`])(
    "refuses %j, which is no ID token",
    (text) => {
      expect(organizationsClaimed(text, expected, now)).toBeUndefined();
    },
  );
});
