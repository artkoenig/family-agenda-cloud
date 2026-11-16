import { describe, expect, it } from "vitest";
import { answerOf, isUnknownAdmin, newPassword, runningVersion, dueWorkOf } from "../../src/core-answers";

describe("answerOf", () => {
  it("reads a JSON object", () => {
    expect(answerOf('{"coreVersion":"1.2.0","ran":3}')).toEqual({ coreVersion: "1.2.0", ran: 3 });
  });

  it.each([
    ["an empty body", ""],
    ["text that is not JSON", "Bad gateway"],
    ["null", "null"],
    ["a number", "42"],
    ["a string", '"ok"'],
  ])("reads %s as {}", (_, text) => {
    expect(answerOf(text)).toStrictEqual({});
  });

  it("reads an array as it is, as no operation's answer names a field of one", () => {
    expect(answerOf("[1]")).toEqual([1]);
  });
});

describe("runningVersion", () => {
  it("is the release /api/health answers", () => {
    expect(runningVersion({ status: "ok", version: "0.7.0" })).toBe("0.7.0");
  });

  it.each([{}, { version: 12 }, { version: null }, { version: "" }])("is none for %j", (answer) => {
    expect(runningVersion(answer)).toBeUndefined();
  });
});

describe("isUnknownAdmin", () => {
  it("takes the error code of a Family without that Admin", () => {
    expect(isUnknownAdmin({ error: "unknown-admin" })).toBe(true);
  });

  it.each([{}, { error: "unknown-family" }, { error: "Unknown-Admin" }])("does not take %j, a core without the operation", (answer) => {
    expect(isUnknownAdmin(answer)).toBe(false);
  });
});

describe("newPassword", () => {
  it("is the password the core drew", () => {
    expect(newPassword({ email: "admin@example.org", newPassword: "correct horse battery staple" })).toBe("correct horse battery staple");
  });

  it.each([{}, { newPassword: "" }, { newPassword: 42 }, { password: "the old field" }])("is none for %j", (answer) => {
    expect(newPassword(answer)).toBeUndefined();
  });
});

describe("dueWorkOf", () => {
  const report = (ran: unknown[], failed: unknown[]) => ({ ran, failed, invalid: [], refused: [], lost: [] });
  const failure = (sourceId: string) => ({ sourceId, kind: "temporary", message: "timed out" });
  const extracted = { ok: true, report: {} };

  it("is how many due Sources were polled, those that ran and those that failed, and how many of them failed", () => {
    const answer = { polled: { ok: true, report: report(["s-1", "s-2"], [failure("s-3")]) }, extracted };
    expect(dueWorkOf(answer)).toStrictEqual({ ran: 3, failed: 1 });
  });

  it("takes a run that polled nothing", () => {
    expect(dueWorkOf({ polled: { ok: true, report: report([], []) }, extracted })).toStrictEqual({ ran: 0, failed: 0 });
  });

  it("is why polling failed", () => {
    expect(dueWorkOf({ polled: { ok: false, error: "database unavailable" }, extracted })).toStrictEqual({ error: "polling the Sources: database unavailable" });
  });

  it("is why extracting the messages failed", () => {
    const answer = { polled: { ok: true, report: report([], []) }, extracted: { ok: false, error: "disk full" } };
    expect(dueWorkOf(answer)).toStrictEqual({ error: "extracting the messages: disk full" });
  });

  it("says no reason was given for a failed step without one", () => {
    expect(dueWorkOf({ polled: { ok: false }, extracted })).toStrictEqual({ error: "polling the Sources: no reason given" });
  });

  it.each([
    {},
    { ran: 3, failed: 1 },
    { polled: { ok: true, report: report([], []) } },
    { polled: { ok: true }, extracted },
    { polled: { ok: "yes", report: report([], []) }, extracted },
    { polled: null, extracted },
    { polled: { ok: true, report: { ran: 2, failed: 0 } }, extracted },
    { polled: { ok: true, report: { ran: [] } }, extracted },
  ])("is none for %j", (answer) => {
    expect(dueWorkOf(answer)).toBeUndefined();
  });
});
