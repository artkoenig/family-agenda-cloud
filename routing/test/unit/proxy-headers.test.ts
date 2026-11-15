import { describe, expect, it } from "vitest";
import { headersFromCore, headersToCore } from "../../src/proxy-headers";

const browser = (headers: Record<string, string | string[]>, remoteAddress: string | undefined = "198.51.100.7") => ({
  headers: { host: "agenda.example", ...headers },
  remoteAddress,
});

describe("headersToCore", () => {
  it("passes the browser's own headers on", () => {
    const headers = headersToCore(browser({ accept: "text/html", cookie: "session=1", "set-cookie": ["a=1", "b=2"] }), false);
    expect(headers).toMatchObject({ accept: "text/html", cookie: "session=1", "set-cookie": ["a=1", "b=2"] });
  });

  it.each(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"])(
    "drops the hop-by-hop header %s",
    (name) => {
      expect(headersToCore(browser({ [name]: "x", accept: "*/*" }), false)).not.toHaveProperty(name);
    },
  );

  it("drops the headers the browser's Connection header names, in any case and spacing", () => {
    const headers = headersToCore(browser({ connection: "X-Secret ,  x-other", "x-secret": "1", "x-other": "2", "x-kept": "3" }), false);
    expect(headers).not.toHaveProperty("x-secret");
    expect(headers).not.toHaveProperty("x-other");
    expect(headers).toHaveProperty("x-kept", "3");
  });

  it("drops a Context, a Forwarded and the Host the browser sent", () => {
    const headers = headersToCore(browser({ "x-family-agenda-context": "forged", forwarded: "for=203.0.113.9" }), false);
    expect(headers).not.toHaveProperty("x-family-agenda-context");
    expect(headers).not.toHaveProperty("forwarded");
    expect(headers).not.toHaveProperty("host");
  });

  it("describes the client as the Router sees it, whatever the request claims, without TRUST_PROXY", () => {
    const headers = headersToCore(
      browser({ "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" }),
      false,
    );
    expect(headers).toMatchObject({ "x-forwarded-for": "198.51.100.7", "x-forwarded-proto": "http", "x-forwarded-host": "agenda.example" });
  });

  it("describes the client as the trusted proxy forwarded it with TRUST_PROXY: the last address, the first scheme and host", () => {
    const headers = headersToCore(
      browser({
        "x-forwarded-for": "203.0.113.9, 192.0.2.1 ,10.0.0.5",
        "x-forwarded-proto": " https , http",
        "x-forwarded-host": "agenda.example, inner.example",
      }),
      true,
    );
    expect(headers).toMatchObject({ "x-forwarded-for": "10.0.0.5", "x-forwarded-proto": "https", "x-forwarded-host": "agenda.example" });
  });

  it("falls back to what the Router sees, with TRUST_PROXY, for what the proxy did not forward", () => {
    expect(headersToCore(browser({}), true)).toEqual({
      "x-forwarded-for": "198.51.100.7",
      "x-forwarded-proto": "http",
      "x-forwarded-host": "agenda.example",
    });
  });

  it("writes what it has when the Router knows neither the client's address nor the host", () => {
    expect(headersToCore({ headers: {}, remoteAddress: undefined }, false)).toEqual({
      "x-forwarded-for": "undefined",
      "x-forwarded-proto": "http",
      "x-forwarded-host": "undefined",
    });
  });
});

describe("headersFromCore", () => {
  it("passes the core's headers on, in order, names in their case and repeated ones repeated", () => {
    const raw = ["Content-Type", "text/html", "Set-Cookie", "a=1", "Set-Cookie", "b=2"];
    expect(headersFromCore(raw)).toEqual(raw);
  });

  it("drops the hop-by-hop headers, in any case", () => {
    const raw = ["Connection", "keep-alive", "Keep-Alive", "timeout=5", "Transfer-Encoding", "chunked", "TE", "trailers", "Upgrade", "h2c", "Trailer", "x", "Proxy-Authenticate", "Basic", "Proxy-Authorization", "y", "ETag", "\"1\""];
    expect(headersFromCore(raw)).toEqual(["ETag", "\"1\""]);
  });

  it("drops the headers any Connection header of the core names", () => {
    const raw = ["Connection", "X-Internal", "X-Internal", "1", "connection", " x-debug ,close", "X-Debug", "2", "X-Kept", "3"];
    expect(headersFromCore(raw)).toEqual(["X-Kept", "3"]);
  });

  it("drops a name that has no value", () => {
    expect(headersFromCore(["X-Kept", "3", "X-Odd"])).toEqual(["X-Kept", "3"]);
  });

  it("keeps a header with an empty value", () => {
    expect(headersFromCore(["X-Empty", ""])).toEqual(["X-Empty", ""]);
  });

  it("answers none for none", () => {
    expect(headersFromCore([])).toEqual([]);
  });
});
