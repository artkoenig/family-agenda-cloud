import { describe, expect, it } from "vitest";
import { isBodiless, mayRefuseOpening, neverConnected, notServing, takingTurns } from "../../src/failover";

describe("takingTurns", () => {
  it("starts each round at the next item, and wraps around", () => {
    const inTurn = takingTurns<string>();
    const items = ["a", "b", "c"];
    expect(inTurn(items)).toEqual(["a", "b", "c"]);
    expect(inTurn(items)).toEqual(["b", "c", "a"]);
    expect(inTurn(items)).toEqual(["c", "a", "b"]);
    expect(inTurn(items)).toEqual(["a", "b", "c"]);
  });

  it("answers the one item every time", () => {
    const inTurn = takingTurns<string>();
    expect(inTurn(["a"])).toEqual(["a"]);
    expect(inTurn(["a"])).toEqual(["a"]);
  });

  it("answers nothing for no items, and goes on with the items there are after", () => {
    const inTurn = takingTurns<string>();
    expect(inTurn([])).toEqual([]);
    expect(inTurn([])).toEqual([]);
    expect(inTurn(["a", "b"])).toEqual(["a", "b"]);
  });

  it("goes on in turn over items that became more or fewer", () => {
    const inTurn = takingTurns<string>();
    expect(inTurn(["a", "b"])).toEqual(["a", "b"]);
    expect(inTurn(["a", "b", "c"])).toEqual(["b", "c", "a"]);
    expect(inTurn(["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(inTurn(["a", "b"])).toEqual(["b", "a"]);
    expect(inTurn(["a"])).toEqual(["a"]);
    expect(inTurn(["a", "b"])).toEqual(["b", "a"]);
  });

  it("keeps a turn of its own for each pool", () => {
    const first = takingTurns<string>();
    const second = takingTurns<string>();
    first(["a", "b"]);
    expect(second(["a", "b"])).toEqual(["a", "b"]);
  });

  it("leaves the items as they are, and is not changed by what a caller does with a round", () => {
    const items = ["a", "b"];
    const inTurn = takingTurns<string>();
    inTurn(items).pop();
    expect(inTurn(items)).toEqual(["b", "a"]);
    expect(items).toEqual(["a", "b"]);
  });
});

describe("neverConnected", () => {
  it.each(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"])(
    "takes %s: the connection was never made",
    (code) => {
      expect(neverConnected(code)).toBe(true);
    },
  );

  it.each(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ETIMEDOUT", "Error", ""])("does not take %s: the core may have run the call", (code) => {
    expect(neverConnected(code)).toBe(false);
  });
});

describe("notServing", () => {
  it.each([502, 503, 504])("takes %i: the core is not serving", (status) => {
    expect(notServing(status)).toBe(true);
  });

  it.each([400, 404, 409, 500, 501, 505])("does not take %i: the core answered", (status) => {
    expect(notServing(status)).toBe(false);
  });
});

describe("isBodiless", () => {
  it.each(["GET", "HEAD"])("takes %s for a request without a body", (method) => {
    expect(isBodiless(method)).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "get", undefined])("takes %s for one that may have a body", (method) => {
    expect(isBodiless(method)).toBe(false);
  });
});

describe("mayRefuseOpening", () => {
  it.each([409, 503])("takes %i for an answer that may be a core's refusal to open the Family", (status) => {
    expect(mayRefuseOpening(status)).toBe(true);
  });

  it.each([200, 302, 400, 401, 403, 404, 408, 410, 500, 502, 504])("takes %i for the Family's own answer", (status) => {
    expect(mayRefuseOpening(status)).toBe(false);
  });
});
