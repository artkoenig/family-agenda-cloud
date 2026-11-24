import { describe, expect, it } from "vitest";
import type { FamilyStatus } from "../../src/directory";
import { readinessOf } from "../../src/family-readiness";

const entry = (status: FamilyStatus) => ({ familyId: "f-1", status });

describe("readinessOf", () => {
  it.each(["active", "locked", "suspended", "being_prepared", "deleted"] as const)("answers the entry of a Family %s with its readiness", (status) => {
    const known = entry(status);
    expect(readinessOf(known).entry).toBe(known);
  });

  it("answers no entry for a Family the Directory does not know", () => {
    expect(readinessOf(undefined)).toEqual({ readiness: "gone", entry: undefined });
  });

  it("is served for an active Family", () => {
    expect(readinessOf(entry("active")).readiness).toBe("served");
  });

  it.each(["locked", "suspended", "being_prepared"] as const)("is withheld for a Family %s", (status) => {
    expect(readinessOf(entry(status)).readiness).toBe("withheld");
  });

  it("is gone for a deleted Family", () => {
    expect(readinessOf(entry("deleted")).readiness).toBe("gone");
  });
});
