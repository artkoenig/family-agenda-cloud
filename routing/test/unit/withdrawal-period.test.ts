import { describe, expect, it } from "vitest";
import { isWithinWithdrawalPeriod, withdrawalPeriodEnd } from "../../src/withdrawal-period";

describe("the withdrawal period", () => {
  // Ordered on 5 March 2026 in Berlin: its last day is 19 March.
  const ordered = new Date("2026-03-05T08:05:00Z");

  it("lasts until the end of the 14th day after the day of the order, Berlin time", () => {
    expect(isWithinWithdrawalPeriod(ordered, ordered)).toBe(true);
    expect(isWithinWithdrawalPeriod(ordered, new Date("2026-03-19T08:05:00Z"))).toBe(true);
    // 23:59:59 in Berlin on 19 March.
    expect(isWithinWithdrawalPeriod(ordered, new Date("2026-03-19T22:59:59Z"))).toBe(true);
  });

  it("is over from 00:00 on the 15th day, Berlin time", () => {
    expect(isWithinWithdrawalPeriod(ordered, new Date("2026-03-19T23:00:00Z"))).toBe(false);
    expect(isWithinWithdrawalPeriod(ordered, new Date("2026-04-01T10:00:00Z"))).toBe(false);
    expect(isWithinWithdrawalPeriod(ordered, new Date("2027-03-10T10:00:00Z"))).toBe(false);
  });

  it("counts from the day of the order in Berlin, not in UTC", () => {
    // 23:30 UTC on 5 March is 6 March in Berlin: the last day is 20 March.
    const lateEvening = new Date("2026-03-05T23:30:00Z");
    expect(isWithinWithdrawalPeriod(lateEvening, new Date("2026-03-20T22:59:59Z"))).toBe(true);
    expect(isWithinWithdrawalPeriod(lateEvening, new Date("2026-03-20T23:00:00Z"))).toBe(false);
  });

  it("counts calendar days across the changes of daylight saving", () => {
    // Summer time begins on 29 March 2026: 20 March + 14 is 3 April, which ends at 22:00 UTC.
    const beforeSummer = new Date("2026-03-20T10:00:00Z");
    expect(isWithinWithdrawalPeriod(beforeSummer, new Date("2026-04-03T21:59:59Z"))).toBe(true);
    expect(isWithinWithdrawalPeriod(beforeSummer, new Date("2026-04-03T22:00:00Z"))).toBe(false);
    // Summer time ends on 25 October 2026: 20 October + 14 is 3 November, which ends at 23:00 UTC.
    const beforeWinter = new Date("2026-10-20T10:00:00Z");
    expect(isWithinWithdrawalPeriod(beforeWinter, new Date("2026-11-03T22:59:59Z"))).toBe(true);
    expect(isWithinWithdrawalPeriod(beforeWinter, new Date("2026-11-03T23:00:00Z"))).toBe(false);
  });

  it("names its last day by an instant of that day in Berlin", () => {
    expect(withdrawalPeriodEnd(ordered)).toEqual(new Date("2026-03-19T12:00:00Z"));
    expect(withdrawalPeriodEnd(new Date("2026-03-05T23:30:00Z"))).toEqual(new Date("2026-03-20T12:00:00Z"));
    expect(withdrawalPeriodEnd(new Date("2026-12-20T10:00:00Z"))).toEqual(new Date("2027-01-03T12:00:00Z"));
  });
});
