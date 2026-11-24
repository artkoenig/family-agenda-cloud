import { describe, expect, it } from "vitest";
import { familyLine, waitingMailLine } from "../../src/cli-reports";

const a = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ranAt = new Date("2026-03-01T08:00:00.000Z");
const retryAt = new Date("2026-03-01T08:04:00.000Z");

describe("familyLine", () => {
  it("says a Family's due work never ran", () => {
    expect(familyLine({ familyId: a, status: "active", dueWork: null })).toBe(`${a}\tactive\tdue work never ran`);
  });

  it("says a Family is locked", () => {
    expect(familyLine({ familyId: a, status: "locked", dueWork: null })).toBe(`${a}\tlocked\tdue work never ran`);
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

describe("waitingMailLine", () => {
  const mail = {
    id: "17",
    type: "trial-reminder-1",
    familyId: a,
    createdAt: new Date("2026-11-24T09:00:00.000Z"),
    attempts: 0,
    nextAttemptAt: new Date("2026-11-24T09:00:00.000Z"),
    lastError: null,
  };

  it("names a mail by its id, type and Family, and says it was not tried yet", () => {
    expect(waitingMailLine(mail)).toBe(`17\ttrial-reminder-1\t${a}\tqueued 2026-11-24T09:00:00.000Z\tnot tried yet, due 2026-11-24T09:00:00.000Z`);
  });

  it("says how often a mail failed, when it is tried next, and why it failed last", () => {
    const failed = { ...mail, attempts: 3, nextAttemptAt: new Date("2026-11-24T09:07:00.000Z"), lastError: "451 4.3.0 <address>: Try again later" };
    expect(waitingMailLine(failed)).toBe(
      `17\ttrial-reminder-1\t${a}\tqueued 2026-11-24T09:00:00.000Z\t3 failed attempts, next try 2026-11-24T09:07:00.000Z\tlast error: 451 4.3.0 <address>: Try again later`,
    );
    expect(waitingMailLine({ ...failed, attempts: 1 })).toContain("\t1 failed attempt, next try");
  });

  it("puts a dash for a mail about no Family", () => {
    expect(waitingMailLine({ ...mail, familyId: null })).toBe(`17\ttrial-reminder-1\t-\tqueued 2026-11-24T09:00:00.000Z\tnot tried yet, due 2026-11-24T09:00:00.000Z`);
  });
});
