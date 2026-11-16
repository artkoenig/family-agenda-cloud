import { describe, expect, it } from "vitest";
import { familyLine } from "../../src/cli-reports";

const a = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ranAt = new Date("2026-03-01T08:00:00.000Z");
const retryAt = new Date("2026-03-01T08:04:00.000Z");

describe("familyLine", () => {
  it("says a Family's due work never ran", () => {
    expect(familyLine({ familyId: a, status: "active", dueWork: null })).toBe(`${a}\tactive\tdue work never ran`);
  });

  it("says when its due work ran and what it polled", () => {
    const dueWork = { ranAt, outcome: "succeeded", sources: { ran: 3, failed: 1 } } as const;
    expect(familyLine({ familyId: a, status: "suspended", dueWork })).toBe(
      `${a}\tsuspended\tdue work ran 2026-03-01T08:00:00.000Z\tsucceeded: 3 Sources polled, 1 failed`,
    );
  });

  it.each([
    [1, "1 failure in a row"],
    [4, "4 failures in a row"],
  ])("says why its due work failed %i time(s) in a row, and when it is tried next", (failures, inARow) => {
    const dueWork = { ranAt, outcome: "failed", error: "core said 503", failures, retryAt } as const;
    expect(familyLine({ familyId: a, status: "active", dueWork })).toBe(
      `${a}\tactive\tdue work ran 2026-03-01T08:00:00.000Z\tfailed: core said 503\t${inARow}, next try 2026-03-01T08:04:00.000Z`,
    );
  });
});
