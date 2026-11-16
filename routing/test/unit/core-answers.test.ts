import { describe, expect, it } from "vitest";
import { answerOf, isUnknownAdmin, newPassword, openingRefusal, pageErrorCode, dueWorkOf } from "../../src/core-answers";

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

describe("openingRefusal", () => {
  it("is a 409 that says a newer release migrated the Family's database", () => {
    expect(openingRefusal(409, "migrated-by-newer-release")).toBe("409 migrated-by-newer-release");
  });

  it.each(["old-data-model", "family-id-differs", "conflict", "", undefined, null, 409])("is not a 409 with the error %j, which another core would answer alike", (error) => {
    expect(openingRefusal(409, error)).toBeUndefined();
  });

  it.each(["migrating", "unavailable"])("is a 503 that says %s, and names it", (error) => {
    expect(openingRefusal(503, error)).toBe(`503 ${error}`);
  });

  it.each(["failed", "old-data-model", "migrated-by-newer-release", "", undefined, null, 503])("is not a 503 with the error %j, which may be the Family's own answer", (error) => {
    expect(openingRefusal(503, error)).toBeUndefined();
  });

  it.each([200, 400, 401, 403, 404, 500, 502, 504])("is not a %i, whatever its error", (status) => {
    expect(openingRefusal(status, "migrated-by-newer-release")).toBeUndefined();
    expect(openingRefusal(status, "migrating")).toBeUndefined();
  });
});

describe("pageErrorCode", () => {
  it.each([
    ["migrated-by-newer-release: a newer release migrated the database the Context names; another core may serve it.", "migrated-by-newer-release"],
    ["migrating: the Family's database is being prepared; try again shortly.", "migrating"],
    ["a: b", "a"],
  ])("reads the code the refusal %j begins with", (text, code) => {
    expect(pageErrorCode(text)).toBe(code);
  });

  it.each([
    "The Family cannot be opened now.",
    "",
    "migrating",
    "migrating:",
    "migrating:the Family's database",
    " migrating: the Family's database",
    "Migrating: the Family's database",
    "-migrating: the Family's database",
    "two words: the Family's database",
    "<p>migrating: the Family's database</p>",
    "Conflict\nmigrating: the Family's database",
  ])("reads none from the text %j", (text) => {
    expect(pageErrorCode(text)).toBeUndefined();
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
