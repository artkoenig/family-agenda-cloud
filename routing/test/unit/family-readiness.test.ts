import { describe, expect, it } from "vitest";
import type { FamilyStatus } from "../../src/directory";
import { readinessOf } from "../../src/family-readiness";

const entry = (status: FamilyStatus, coreVersion: string | null = "0.3.1") => ({ familyId: "f-1", status, coreVersion });

const readiness = (...args: Parameters<typeof readinessOf>) => readinessOf(...args).readiness;

describe("readinessOf", () => {
  it.each([
    ["active", "0.3.1"],
    ["active", "0.3.0"],
    ["suspended", "0.3.1"],
    ["deleted", "0.3.1"],
  ] as const)("answers the entry of a Family %s on %s with its readiness", (status, coreVersion) => {
    const known = entry(status);
    expect(readinessOf(known, coreVersion).entry).toBe(known);
  });

  it("answers no entry for a Family the Directory does not know", () => {
    expect(readinessOf(undefined, "0.3.1")).toEqual({ readiness: "gone", entry: undefined });
  });

  it("is served for an active Family prepared for the running core version", () => {
    expect(readiness(entry("active"), "0.3.1")).toBe("served");
  });

  it.each([
    ["an older core version", "0.3.0"],
    ["a newer core version", "0.4.0"],
    ["no core version at all", null],
  ])("awaits a rollout for an active Family prepared for %s", (_case, coreVersion) => {
    expect(readiness(entry("active", coreVersion), "0.3.1")).toBe("awaiting-rollout");
  });

  it.each(["suspended", "being_prepared"] as const)("is withheld for a Family %s, whatever it is prepared for", (status) => {
    expect(readiness(entry(status), "0.3.1")).toBe("withheld");
    expect(readiness(entry(status, "0.1.0"), "0.3.1")).toBe("withheld");
  });

  it("is gone for a deleted Family", () => {
    expect(readiness(entry("deleted"), "0.3.1")).toBe("gone");
  });

  it("is gone for a Family the Directory does not know", () => {
    expect(readiness(undefined, "0.3.1")).toBe("gone");
  });
});
