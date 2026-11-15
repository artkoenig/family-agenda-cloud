import { describe, expect, it } from "vitest";
import { familyLine, rollOutReport } from "../../src/cli-reports";

const a = "0f8fad5b-d9cb-469f-a165-70867728950e";
const b = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ranAt = new Date("2026-03-01T08:00:00.000Z");
const retryAt = new Date("2026-03-01T08:04:00.000Z");

describe("rollOutReport", () => {
  it("counts the Families prepared and exits 0 when none failed", () => {
    expect(rollOutReport({ coreVersion: "0.4.0", prepared: [a, b], failed: [], newer: [] })).toEqual({
      text: "Prepared 2 Families for core version 0.4.0\n",
      exitCode: 0,
    });
  });

  it("says Family for one and Families for none", () => {
    expect(rollOutReport({ coreVersion: "0.4.0", prepared: [a], failed: [], newer: [] }).text).toBe("Prepared 1 Family for core version 0.4.0\n");
    expect(rollOutReport({ coreVersion: "0.4.0", prepared: [], failed: [], newer: [] }).text).toBe("Prepared 0 Families for core version 0.4.0\n");
  });

  it("names each Family it failed for, with why, and exits 1", () => {
    const report = rollOutReport({ coreVersion: "0.4.0", prepared: [], failed: [{ familyId: a, error: "core said 500" }, { familyId: b, error: "timeout" }], newer: [] });
    expect(report).toEqual({
      text: `Prepared 0 Families for core version 0.4.0\nFailed for 2 Families; run roll-out again to retry:\n${a}\tcore said 500\n${b}\ttimeout\n`,
      exitCode: 1,
    });
  });

  it("names each Family prepared for a newer core version, and exits 1", () => {
    const report = rollOutReport({ coreVersion: "0.4.0", prepared: [b], failed: [], newer: [{ familyId: a, coreVersion: "0.5.0" }] });
    expect(report).toEqual({
      text: `Prepared 1 Family for core version 0.4.0\nRefused 1 Family; going back to an older core version needs a restore:\n${a}\tprepared for a newer core version 0.5.0\n`,
      exitCode: 1,
    });
  });

  it("names the failed Families before the refused ones", () => {
    const report = rollOutReport({ coreVersion: "0.4.0", prepared: [], failed: [{ familyId: b, error: "x" }], newer: [{ familyId: a, coreVersion: "1.0.0" }] });
    expect(report.text.split("\n")).toEqual([
      "Prepared 0 Families for core version 0.4.0",
      "Failed for 1 Family; run roll-out again to retry:",
      `${b}\tx`,
      "Refused 1 Family; going back to an older core version needs a restore:",
      `${a}\tprepared for a newer core version 1.0.0`,
      "",
    ]);
    expect(report.exitCode).toBe(1);
  });
});

describe("familyLine", () => {
  it("says a Family's due work never ran", () => {
    expect(familyLine({ familyId: a, status: "active", dueWork: null, preparationFailure: null })).toBe(`${a}\tactive\tdue work never ran`);
  });

  it("says when its due work ran and what it polled", () => {
    const dueWork = { ranAt, outcome: "succeeded", sources: { ran: 3, failed: 1 } } as const;
    expect(familyLine({ familyId: a, status: "suspended", dueWork, preparationFailure: null })).toBe(
      `${a}\tsuspended\tdue work ran 2026-03-01T08:00:00.000Z\tsucceeded: 3 Sources polled, 1 failed`,
    );
  });

  it.each([
    [1, "1 failure in a row"],
    [4, "4 failures in a row"],
  ])("says why its due work failed %i time(s) in a row, and when it is tried next", (failures, inARow) => {
    const dueWork = { ranAt, outcome: "failed", error: "core said 503", failures, retryAt } as const;
    expect(familyLine({ familyId: a, status: "active", dueWork, preparationFailure: null })).toBe(
      `${a}\tactive\tdue work ran 2026-03-01T08:00:00.000Z\tfailed: core said 503\t${inARow}, next try 2026-03-01T08:04:00.000Z`,
    );
  });

  it("says why preparing it for a core version failed, last", () => {
    const preparationFailure = { coreVersion: "0.4.0", error: "migration failed" };
    expect(familyLine({ familyId: a, status: "active", dueWork: null, preparationFailure })).toBe(
      `${a}\tactive\tdue work never ran\tpreparing for 0.4.0 failed: migration failed`,
    );
  });
});
