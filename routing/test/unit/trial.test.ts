import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, trialEndsAt } from "../../src/trial";

const DAY = 24 * 60 * 60 * 1000;

describe("trialEndsAt", () => {
  it("is fourteen days after the Trial's start", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(trialEndsAt(new Date("2026-06-01T09:30:15.250Z"))).toEqual(new Date("2026-06-15T09:30:15.250Z"));
  });

  it("is exactly 14 times 24 hours later across a change to summer time", () => {
    // Berlin moves its clocks forward on 29 March 2026: the end is an hour later on the wall clock.
    const start = new Date("2026-03-20T23:15:00Z");

    const end = trialEndsAt(start);

    expect(end.getTime() - start.getTime()).toBe(14 * DAY);
    expect(end.toISOString()).toBe("2026-04-03T23:15:00.000Z");
  });

  it("is exactly 14 times 24 hours later across a change to winter time", () => {
    const start = new Date("2026-10-20T10:00:00Z");

    expect(trialEndsAt(start).getTime() - start.getTime()).toBe(14 * DAY);
  });

  it("leaves the start as it was", () => {
    const start = new Date("2026-06-01T00:00:00Z");
    trialEndsAt(start);
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
