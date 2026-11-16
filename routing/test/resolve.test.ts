import { describe, expect, it } from "vitest";
import { systemResolve } from "../src/resolve";

const hrefs = (urls: URL[]) => urls.map(({ href }) => href);

describe("systemResolve", () => {
  it("answers an address that names one host address as it is", async () => {
    expect(hrefs(await systemResolve(new URL("http://127.0.0.1:3002")))).toEqual(["http://127.0.0.1:3002/"]);
    expect(hrefs(await systemResolve(new URL("http://[::1]:3001")))).toEqual(["http://[::1]:3001/"]);
  });

  it("answers the address once for each host address its name resolves to, with the same port", async () => {
    const cores = hrefs(await systemResolve(new URL("http://localhost:3002")));

    expect(cores.length).toBeGreaterThan(0);
    for (const core of cores) expect(["http://127.0.0.1:3002/", "http://[::1]:3002/"]).toContain(core);
    expect(new Set(cores).size).toBe(cores.length);
    expect(cores).toEqual([...cores].sort());
  });

  it("fails for a name that does not resolve", async () => {
    await expect(systemResolve(new URL("http://no-such-pool.invalid:3002"))).rejects.toThrow();
  });
});
