import { describe, expect, it } from "vitest";
import { answerOf, isUnknownAdmin, newPassword, preparedVersion, sourcesPolled } from "../../src/core-answers";

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

describe("preparedVersion", () => {
  it("is the core version the core answered", () => {
    expect(preparedVersion({ coreVersion: "1.2.0" })).toBe("1.2.0");
  });

  it.each([{}, { coreVersion: 12 }, { coreVersion: null }])("is none for %j", (answer) => {
    expect(preparedVersion(answer)).toBeUndefined();
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
    expect(newPassword({ password: "correct horse battery staple" })).toBe("correct horse battery staple");
  });

  it.each([{}, { password: "" }, { password: 42 }])("is none for %j", (answer) => {
    expect(newPassword(answer)).toBeUndefined();
  });
});

describe("sourcesPolled", () => {
  it("is how many due Sources ran and how many of them failed", () => {
    expect(sourcesPolled({ ran: 3, failed: 1, extra: true })).toStrictEqual({ ran: 3, failed: 1 });
  });

  it("takes a run that polled nothing", () => {
    expect(sourcesPolled({ ran: 0, failed: 0 })).toStrictEqual({ ran: 0, failed: 0 });
  });

  it.each([{}, { ran: 3 }, { failed: 1 }, { ran: 1.5, failed: 0 }, { ran: 2, failed: "0" }, { ran: "2", failed: 0 }])("is none for %j", (answer) => {
    expect(sourcesPolled(answer)).toBeUndefined();
  });
});
