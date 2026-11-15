import { describe, expect, it } from "vitest";
import type { DueWorkRun, FamilyStatus } from "../../src/directory";
import { isNewer, readinessOf, waitsForRetry } from "../../src/family-readiness";

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


  it("is prepared for an active Family prepared for the running core version", () => {
    expect(readiness(entry("active"), "0.3.1")).toBe("prepared");
  });

  it.each([
    ["an older core version", "0.3.0"],
    ["a newer core version", "0.4.0"],
    ["no core version at all", null],
  ])("is unprepared for an active Family prepared for %s", (_case, coreVersion) => {
    expect(readiness(entry("active", coreVersion), "0.3.1")).toBe("unprepared");
  });

  it.each(["suspended", "being_prepared"] as const)("is inactive for a Family %s, whatever it is prepared for", (status) => {
    expect(readiness(entry(status), "0.3.1")).toBe("inactive");
    expect(readiness(entry(status, "0.1.0"), "0.3.1")).toBe("inactive");
  });

  it("is gone for a deleted Family", () => {
    expect(readiness(entry("deleted"), "0.3.1")).toBe("gone");
  });

  it("is gone for a Family the Directory does not know", () => {
    expect(readiness(undefined, "0.3.1")).toBe("gone");
  });
});

describe("isNewer", () => {
  it.each([
    ["0.3.2", "0.3.1"],
    ["0.4.0", "0.3.9"],
    ["1.0.0", "0.9.9"],
    ["0.10.0", "0.9.0"],
    ["10.0.0", "9.99.99"],
  ])("finds %s newer than %s", (version, than) => {
    expect(isNewer(version, than)).toBe(true);
  });

  it.each([
    ["the same version", "0.3.1", "0.3.1"],
    ["an older patch", "0.3.0", "0.3.1"],
    ["an older minor, though a later patch", "0.2.9", "0.3.0"],
    ["an older major, though a later minor", "0.9.0", "1.0.0"],
    ["a version compared as numbers, not as text", "0.9.0", "0.10.0"],
  ])("does not find %s newer", (_case, version, than) => {
    expect(isNewer(version, than)).toBe(false);
  });

  it.each([
    ["a version with a pre-release", "0.4.0-rc.1", "0.3.1"],
    ["a version with two parts", "1.0", "0.3.1"],
    ["a version with four parts", "1.0.0.0", "0.3.1"],
    ["a version with a leading v", "v1.0.0", "0.3.1"],
    ["text before the version", "x1.0.0", "0.3.1"],
    ["text after the version", "1.0.0x", "0.3.1"],
    ["empty text", "", "0.3.1"],
    ["a CORE_VERSION that is not major.minor.patch", "1.0.0", "0.3"],
  ])("does not take %s as newer", (_case, version, than) => {
    expect(isNewer(version, than)).toBe(false);
  });
});

describe("waitsForRetry", () => {
  const retryAt = new Date("2026-05-01T10:04:00.000Z");
  const failed: DueWorkRun = { ranAt: new Date("2026-05-01T10:00:00.000Z"), outcome: "failed", error: "boom", failures: 2, retryAt };
  const succeeded: DueWorkRun = { ranAt: new Date("2026-05-01T10:00:00.000Z"), outcome: "succeeded", sources: { ran: 1, failed: 0 } };

  it("waits after a failure until the retry is due", () => {
    expect(waitsForRetry(failed, new Date("2026-05-01T10:03:59.999Z"))).toBe(true);
  });

  it("does not wait once the retry is due", () => {
    expect(waitsForRetry(failed, retryAt)).toBe(false);
    expect(waitsForRetry(failed, new Date("2026-05-01T10:05:00.000Z"))).toBe(false);
  });

  it("does not wait after a run that succeeded", () => {
    expect(waitsForRetry(succeeded, new Date("2026-05-01T09:00:00.000Z"))).toBe(false);
  });

  it("does not wait for a Family whose due work never ran", () => {
    expect(waitsForRetry(null, new Date("2026-05-01T10:00:00.000Z"))).toBe(false);
  });
});
