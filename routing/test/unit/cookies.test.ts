import { describe, expect, it } from "vitest";
import { clearCookie, cookiesOf, setCookie } from "../../src/cookies";

describe("cookies", () => {
  it("are HttpOnly, Secure and the whole origin's", () => {
    expect(setCookie("__Host-a", "v", 60_000)).toBe("__Host-a=v; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Lax");
    expect(clearCookie("__Host-a")).toBe("__Host-a=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax");
  });

  it("are read by name, the first of a name", () => {
    expect([...cookiesOf(" a=1; b = x=y ;a=2;=3; c; d=")]).toEqual([
      ["a", "1"],
      ["b", "x=y"],
      ["d", ""],
    ]);
    expect(cookiesOf(undefined).size).toBe(0);
  });
});
