import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** The Cube's Compose project (cube/compose.yaml) as it hands out Stripe's key (#226). */
type Service = { environment?: Record<string, string>; networks?: string[] | Record<string, unknown> };
const compose = parse(readFileSync(fileURLToPath(new URL("../../cube/compose.yaml", import.meta.url)), "utf8"), { merge: true }) as { services: Record<string, Service> };
const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY"];

describe("The Cube's Compose project", () => {
  it.each(KEYS)("gives %s to the Router and to no other service", (key) => {
    const holders = Object.entries(compose.services).filter(([, { environment }]) => key in (environment ?? {}));
    expect(holders.map(([name]) => name)).toEqual(["router"]);
    expect(compose.services["router"]!.environment![key]).toBe(`\${${key}:-}`);
  });

  it("leaves the Router every other setting of the Routing module, and lets it reach Stripe", () => {
    const { environment, networks } = compose.services["router"]!;
    expect(Object.keys(environment!).filter((key) => !KEYS.includes(key))).toEqual(Object.keys(compose.services["scheduler"]!.environment!));
    expect(networks).toEqual(["edge", "pool", "directory", "outbound"]);
  });
});
