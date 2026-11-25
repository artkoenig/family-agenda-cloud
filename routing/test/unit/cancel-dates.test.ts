import { describe, expect, it } from "vitest";
import { END_DATES, endDatesOf, monthsAfter } from "../../src/cancel-dates";

const at = (iso: string) => new Date(iso);
const anchor = at("2026-01-15T09:30:00Z");
const endsOf = (dates: readonly { end: Date }[]) => dates.map(({ end }) => end.toISOString());

describe("The dates a Subscription can be cancelled to", () => {
  it("are the ends of a monthly one's billing periods, from the current one on", () => {
    const dates = endDatesOf({ billing: "monthly", anchor }, at("2026-03-20T00:00:00Z"));
    expect(dates).toHaveLength(END_DATES);
    expect(endsOf(dates).slice(0, 3)).toEqual(["2026-04-15T09:30:00.000Z", "2026-05-15T09:30:00.000Z", "2026-06-15T09:30:00.000Z"]);
    expect(dates.every(({ settlement }) => settlement.case === "plain")).toBe(true);
  });

  it("begin with the next period's end at the very end of a period", () => {
    expect(endsOf(endDatesOf({ billing: "monthly", anchor }, at("2026-04-15T09:30:00Z")))[0]).toBe("2026-05-15T09:30:00.000Z");
    expect(endsOf(endDatesOf({ billing: "monthly", anchor }, at("2026-04-15T09:29:59Z")))[0]).toBe("2026-04-15T09:30:00.000Z");
    expect(endsOf(endDatesOf({ billing: "monthly", anchor }, anchor))[0]).toBe("2026-02-15T09:30:00.000Z");
  });

  it("begin with the end of year one for a yearly one in its first year, then go on by months of year two", () => {
    const dates = endDatesOf({ billing: "yearly", anchor }, at("2026-03-20T00:00:00Z"));
    expect(dates).toHaveLength(END_DATES);
    expect(dates.slice(0, 3)).toEqual([
      { end: at("2027-01-15T09:30:00Z"), settlement: { case: "plain" } },
      { end: at("2027-02-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 4574 } },
      { end: at("2027-03-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 4158 } },
    ]);
  });

  it("begin with the end of the current monthly cycle for a yearly one after year one, paying back the months left", () => {
    const dates = endDatesOf({ billing: "yearly", anchor }, at("2027-10-20T00:00:00Z"));
    expect(dates.slice(0, 4)).toEqual([
      { end: at("2027-11-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 831 } },
      { end: at("2027-12-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 415 } },
      { end: at("2028-01-15T09:30:00Z"), settlement: { case: "plain" } },
      { end: at("2028-02-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 4574 } },
    ]);
  });

  it("counts a yearly one at the end of year one as after it", () => {
    expect(endDatesOf({ billing: "yearly", anchor }, at("2027-01-15T09:30:00Z"))[0]).toEqual({ end: at("2027-02-15T09:30:00Z"), settlement: { case: "yearly-after-year-one", refundCents: 4574 } });
  });

  it.each(["monthly", "yearly"] as const)("begin with the Trial's end for a %s one ordered during the Trial, charging nothing", (billing) => {
    const dates = endDatesOf({ billing, anchor }, at("2026-01-10T00:00:00Z"));
    expect(dates).toHaveLength(END_DATES);
    expect(dates[0]).toEqual({ end: anchor, settlement: { case: "ordered-during-trial" } });
    expect(dates[1]).toEqual({ end: at(billing === "monthly" ? "2026-02-15T09:30:00Z" : "2027-01-15T09:30:00Z"), settlement: { case: "plain" } });
  });

  it("are a month's last day where it has no such day", () => {
    const end = at("2026-01-31T22:00:00Z");
    expect([1, 2, 3, 13, 25].map((months) => monthsAfter(end, months).toISOString())).toEqual([
      "2026-02-28T22:00:00.000Z",
      "2026-03-31T22:00:00.000Z",
      "2026-04-30T22:00:00.000Z",
      "2027-02-28T22:00:00.000Z",
      "2028-02-29T22:00:00.000Z",
    ]);
  });
});
