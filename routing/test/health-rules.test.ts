import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { RULES } from "../src/health-rules";

/** The services of cube/compose.yaml: the keys indented by two under `services:`. */
const servicesOf = (compose: string) =>
  (compose.split(/^services:$/m)[1] ?? "").split(/^\S/m)[0]!.match(/^ {2}[a-z0-9-]+(?=:$)/gm)!.map((name) => name.trim());

it("the health check's rule file has a rule for every service of cube/compose.yaml", async () => {
  const services = servicesOf(await readFile(new URL("../../cube/compose.yaml", import.meta.url), "utf8"));
  expect(services.length).toBeGreaterThan(10);
  expect(services.filter((service) => !(service in RULES))).toEqual([]);
});
