import { describe, expect, it } from "vitest";
import { cancelPathOf, CONTRACT_SECTION_PATH, contractPathOf, orderPathOf, signInPathFor, wayBackOf, withdrawPathOf } from "../../src/routing-pages";

describe("the Routing module's pages", () => {
  it.each([
    ["/order", "order", "de"],
    ["/en/order", "order", "en"],
    ["/order/done", "done", "de"],
    ["/en/order/done", "done", "en"],
    ["/subscription", "subscription", "de"],
    ["/en/subscription", "subscription", "en"],
  ])("knows %s", (path, page, language) => {
    expect(orderPathOf(path)).toEqual({ page, language });
    expect(wayBackOf(path)).toBe(path);
  });

  it.each([null, "", "/", "/order/", "/order?x=1", "/orders", "//evil.test", "//evil.test/order", "https://evil.test/order", "/\\evil.test", "/sign-in", "order", "/order\n"])(
    "never comes back to %j",
    (path) => {
      expect(wayBackOf(path)).toBeUndefined();
    },
  );

  it("knows the Contract section's fragment, which nobody comes back to but at the section", () => {
    expect(contractPathOf("/contract")).toBe("de");
    expect(contractPathOf("/en/contract")).toBe("en");
    for (const path of ["/contract/", "/cancel", "/en"]) expect(contractPathOf(path)).toBeUndefined();
    expect(wayBackOf("/contract")).toBeUndefined();
    expect(CONTRACT_SECTION_PATH).toBe("/admin/sections/contract");
    expect(wayBackOf("/admin/sections/contract")).toBe("/admin/sections/contract");
    expect(wayBackOf("/admin/sections/other")).toBeUndefined();
  });

  it.each([
    ["/cancel", "de"],
    ["/en/cancel", "en"],
  ])("knows %s, where a Subscription is cancelled", (path, language) => {
    expect(cancelPathOf(path)).toBe(language);
    expect(orderPathOf(path)).toBeUndefined();
    expect(wayBackOf(path)).toBe(path);
  });

  it.each(["/cancel/", "/de/cancel", "/order", "/withdraw", ""])("takes %j for no page of a Cancellation", (path) => {
    expect(cancelPathOf(path)).toBeUndefined();
  });

  it.each([
    ["/withdraw", "de"],
    ["/en/withdraw", "en"],
  ] as const)("knows %s as the page to withdraw on, and comes back to it", (path, language) => {
    expect(withdrawPathOf(path)).toBe(language);
    expect(cancelPathOf(path)).toBeUndefined();
    expect(orderPathOf(path)).toBeUndefined();
    expect(wayBackOf(path)).toBe(path);
  });

  it.each(["/withdraw/", "/de/withdraw", "/cancel", "/en/withdraw?x=1", ""])("takes %j for no page of a Withdrawal", (path) => {
    expect(withdrawPathOf(path)).toBeUndefined();
  });

  it("sends a browser to sign in and back", () => {
    expect(signInPathFor("/en/order")).toBe("/sign-in?back=%2Fen%2Forder");
  });
});
