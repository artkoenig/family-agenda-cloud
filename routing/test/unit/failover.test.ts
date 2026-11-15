import { describe, expect, it } from "vitest";
import { coresFor, isBodiless, neverConnected, notServing, takingTurns } from "../../src/failover";

describe("takingTurns", () => {
  it("starts each round at the next item, and wraps around", () => {
    const inTurn = takingTurns(["a", "b", "c"]);
    expect(inTurn()).toEqual(["a", "b", "c"]);
    expect(inTurn()).toEqual(["b", "c", "a"]);
    expect(inTurn()).toEqual(["c", "a", "b"]);
    expect(inTurn()).toEqual(["a", "b", "c"]);
  });

  it("answers the one item every time", () => {
    const inTurn = takingTurns(["a"]);
    expect(inTurn()).toEqual(["a"]);
    expect(inTurn()).toEqual(["a"]);
  });

  it("keeps a turn of its own for each pool", () => {
    const first = takingTurns(["a", "b"]);
    const second = takingTurns(["a", "b"]);
    first();
    expect(second()).toEqual(["a", "b"]);
  });

  it("is not changed by what a caller does with a round", () => {
    const items = ["a", "b"];
    const inTurn = takingTurns(items);
    inTurn().pop();
    expect(inTurn()).toEqual(["b", "a"]);
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

describe("coresFor", () => {
  it.each(["GET", "HEAD"])("tries every core in turn for a %s", (method) => {
    expect(coresFor(method, ["b", "c", "a"])).toEqual(["b", "c", "a"]);
  });

  it.each(["POST", "PUT", "DELETE", undefined])("tries the first core only for a %s, whose body cannot be sent twice", (method) => {
    expect(coresFor(method, ["b", "c", "a"])).toEqual(["b"]);
  });
});
