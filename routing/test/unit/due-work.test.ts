import { describe, expect, it } from "vitest";
import type { DueWorkRun } from "../../src/directory";
import { waitsForRetry } from "../../src/due-work";

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
