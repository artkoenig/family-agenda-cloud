import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openCookie, sealCookie } from "../../src/sign-in-cookie";

const operatorKey = randomBytes(32);
const now = new Date("2026-11-22T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

/** A cookie sealed by v1 under FIXED_KEY, holding `{ organizationId: "org_a" }` until `now`. */
const FIXED_KEY = Buffer.alloc(32, 7);
const SEALED_BEFORE = "v1.NwT34AGEL7UNK17N.BFlHVsJun4tXDPE1VeBi0LS_c1_qwcdAuw_C2xDl-t358FsF3zw9DuLxstEnm5H786Xl2BiBTUY3Um_xCP8.kkjUu9EPCKp9DKgrBcAD_Q";

describe("a sealed sign-in cookie", () => {
  it("opens to what was sealed, with the key and name it was sealed with, before it expires", () => {
    const sealed = sealCookie(operatorKey, "waiting", { organizationId: "org_a" }, 60_000, now);

    expect(openCookie(operatorKey, "waiting", sealed, later(59_999))).toEqual({ organizationId: "org_a" });
  });

  it("does not open once it expired", () => {
    const sealed = sealCookie(operatorKey, "waiting", { organizationId: "org_a" }, 60_000, now);

    expect(openCookie(operatorKey, "waiting", sealed, later(60_000))).toBeUndefined();
  });

  it("does not open under another name: one cookie cannot stand in for another", () => {
    const sealed = sealCookie(operatorKey, "transaction", { organizationId: "org_a" }, 60_000, now);

    expect(openCookie(operatorKey, "waiting", sealed, now)).toBeUndefined();
  });

  it("does not open with another Operator key", () => {
    const sealed = sealCookie(operatorKey, "waiting", { organizationId: "org_a" }, 60_000, now);

    expect(openCookie(randomBytes(32), "waiting", sealed, now)).toBeUndefined();
  });

  it("does not open once changed", () => {
    const sealed = sealCookie(operatorKey, "waiting", { organizationId: "org_a" }, 60_000, now);
    const [version, iv, ciphertext, tag] = sealed.split(".");
    const flipped = Buffer.from(ciphertext!, "base64url");
    flipped[0]! ^= 1;

    expect(openCookie(operatorKey, "waiting", [version, iv, flipped.toString("base64url"), tag].join("."), now)).toBeUndefined();
  });

  it.each(["", "v1", "v1.a.b", "v2.a.b.c", "v1.!.!.!", "v1.AAAA.AAAA.AAAA"])("does not open from %j", (text) => {
    expect(openCookie(operatorKey, "waiting", text, now)).toBeUndefined();
  });

  it("opens a cookie sealed before, by this version: a deploy keeps the browsers' cookies", () => {
    const sealed = sealCookie(FIXED_KEY, "waiting", { organizationId: "org_a" }, 1, now);

    expect(sealed).toMatch(/^v1\.[\w-]{16}\.[\w-]+\.[\w-]{22}$/);
    expect(openCookie(FIXED_KEY, "waiting", SEALED_BEFORE, later(-1))).toEqual({ organizationId: "org_a" });
  });

  it("does not open with another version", () => {
    expect(openCookie(FIXED_KEY, "waiting", SEALED_BEFORE.replace(/^v1/, "v2"), later(-1))).toBeUndefined();
  });

  it("does not open with a part more", () => {
    expect(openCookie(FIXED_KEY, "waiting", `${SEALED_BEFORE}.more`, later(-1))).toBeUndefined();
  });

  it("does not open with a shortened tag", () => {
    const [version, iv, ciphertext, tag = ""] = SEALED_BEFORE.split(".");
    const short = Buffer.from(tag, "base64url").subarray(0, 12).toString("base64url");

    expect(openCookie(FIXED_KEY, "waiting", [version, iv, ciphertext, short].join("."), later(-1))).toBeUndefined();
  });

  it("reveals nothing of what it holds", () => {
    const sealed = sealCookie(operatorKey, "waiting", { organizationId: "org_secret" }, 60_000, now);

    expect(sealed).not.toContain("org_secret");
    expect(Buffer.from(sealed.split(".")[2]!, "base64url").toString()).not.toContain("org_secret");
  });
});
