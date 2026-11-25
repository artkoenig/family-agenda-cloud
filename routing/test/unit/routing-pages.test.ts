import { describe, expect, it } from "vitest";
import { orderPathOf, signInPathFor, wayBackOf } from "../../src/routing-pages";

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

  it("sends a browser to sign in and back", () => {
    expect(signInPathFor("/en/order")).toBe("/sign-in?back=%2Fen%2Forder");
  });
});
