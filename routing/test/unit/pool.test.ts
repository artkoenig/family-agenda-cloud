import { describe, expect, it } from "vitest";
import type { Log } from "../../src/log";
import { hostnameOf, poolAt, type Resolve } from "../../src/pool";

const hrefs = (urls: URL[]) => urls.map(({ href }) => href);

describe("hostnameOf", () => {
  it("is the host a connection is made to: an IPv6 address without its brackets, any other as it is", () => {
    expect(hostnameOf(new URL("http://[::1]:3002"))).toBe("::1");
    expect(hostnameOf(new URL("http://127.0.0.1:3002"))).toBe("127.0.0.1");
    expect(hostnameOf(new URL("http://core:3002"))).toBe("core");
  });
});

describe("poolAt", () => {
  const logged: { message: string; fields: unknown }[] = [];
  const log: Log = {
    info: () => {},
    error: (message, fields) => {
      logged.push({ message, fields });
    },
  };
  const standingFor =
    (...rounds: string[][]): Resolve =>
    () =>
      Promise.resolve((rounds.shift() ?? []).map((url) => new URL(url)));

  it("is named by its address's host and port", () => {
    expect(poolAt("http://core:3002", standingFor(), log).host).toBe("core:3002");
  });

  it("asks what its name stands for at each call, and takes the cores in turn", async () => {
    const asked: string[] = [];
    const a = "http://10.0.0.2:3002/";
    const b = "http://10.0.0.3:3002/";
    const c = "http://10.0.0.4:3002/";
    const rounds = standingFor([a, b], [a, b], [a, b, c], [c]);
    const pool = poolAt("http://core:3002", (address) => {
      asked.push(address.href);
      return rounds(address);
    }, log);

    expect(hrefs(await pool.cores())).toEqual([a, b]);
    expect(hrefs(await pool.cores())).toEqual([b, a]);
    expect(hrefs(await pool.cores())).toEqual([c, a, b]);
    expect(hrefs(await pool.cores())).toEqual([c]);
    expect(asked).toEqual(Array(4).fill("http://core:3002/"));
    expect(logged).toEqual([]);
  });

  it("has no core, and says so in the log, while its name stands for none or does not resolve", async () => {
    logged.length = 0;
    const notFound = Object.assign(new Error("getaddrinfo ENOTFOUND core"), { code: "ENOTFOUND" });
    let round = 0;
    const pool = poolAt("http://core:3002", () => (round++ === 0 ? Promise.resolve([]) : Promise.reject(notFound)), log);

    expect(await pool.cores()).toEqual([]);
    expect(await pool.cores()).toEqual([]);
    expect(logged).toEqual([
      { message: "The pool's name stands for no core", fields: { pool: "core:3002" } },
      { message: "The pool's name did not resolve", fields: { pool: "core:3002", reason: "ENOTFOUND" } },
    ]);
  });
});
