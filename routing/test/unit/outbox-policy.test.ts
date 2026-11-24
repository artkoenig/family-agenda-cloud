import { describe, expect, it } from "vitest";
import {
  ALERT_AFTER_FAILURES,
  HOURLY_LIMIT,
  isMailType,
  nextAttemptAt,
  retryDelayMinutes,
  sendsAlert,
  smtpReasonOf,
  SENT_RETENTION_DAYS,
  sweptBefore,
  withoutAddresses,
} from "../../src/outbox-policy";

describe("retryDelayMinutes", () => {
  it("waits one minute after the first failure and twice as long after each further one", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelayMinutes)).toEqual([1, 2, 4, 8, 16, 32, 60]);
  });

  it("never waits longer than an hour", () => {
    expect(retryDelayMinutes(8)).toBe(60);
    expect(retryDelayMinutes(100)).toBe(60);
  });
});

describe("nextAttemptAt", () => {
  it("is the delay after the failed attempt", () => {
    const failedAt = new Date("2026-11-24T10:00:30.000Z");
    expect(nextAttemptAt(failedAt, 1)).toEqual(new Date("2026-11-24T10:01:30.000Z"));
    expect(nextAttemptAt(failedAt, 3)).toEqual(new Date("2026-11-24T10:04:30.000Z"));
  });
});

describe("sendsAlert", () => {
  it("is true for the one failure in a row that the Operator is told of, and no other", () => {
    expect(ALERT_AFTER_FAILURES).toBe(5);
    expect([1, 2, 3, 4, 5, 6, 7].map(sendsAlert)).toEqual([false, false, false, false, true, false, false]);
  });
});

describe("the limits", () => {
  it("sends at most 300 mails an hour, and keeps a sent mail 30 days", () => {
    expect(HOURLY_LIMIT).toBe(300);
    expect(SENT_RETENTION_DAYS).toBe(30);
  });

  it("sweeps what was sent 30 days or longer before now", () => {
    expect(sweptBefore(new Date("2026-11-24T10:00:00.000Z"))).toEqual(new Date("2026-10-25T10:00:00.000Z"));
  });
});

describe("isMailType", () => {
  it("takes lower-case words joined by hyphens, with digits", () => {
    expect(["confirmation", "trial-reminder-1", "family-deleted"].every(isMailType)).toBe(true);
  });

  it("refuses anything else, so that a log line holds nothing but the type", () => {
    expect(["", "Confirmation", "-x", "1st", "trial reminder", "a@b.c", "x\n"].some(isMailType)).toBe(false);
  });
});

describe("smtpReasonOf", () => {
  it("names the error's code and the server's response code, never its message", () => {
    const error = Object.assign(new Error("Can't send mail - all recipients were rejected: 550 <anna@example.org> unknown"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    expect(smtpReasonOf(error)).toBe("EENVELOPE 550");
  });

  it("names the code alone when the server did not answer", () => {
    expect(smtpReasonOf(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:465"), { code: "ESOCKET" }))).toBe("ESOCKET");
  });

  it("says the error is unknown when it carries no code", () => {
    expect(smtpReasonOf(new Error("anna@example.org"))).toBe("unknown");
    expect(smtpReasonOf("anna@example.org")).toBe("unknown");
    expect(smtpReasonOf(Object.assign(new Error("x"), { code: 42, responseCode: "550" }))).toBe("unknown");
  });
});

describe("withoutAddresses", () => {
  it("masks every mail address in the text", () => {
    expect(withoutAddresses("550 5.1.1 <anna.b+x@mail.example.org>: Recipient rejected; also bo@x.de")).toBe(
      "550 5.1.1 <address>: Recipient rejected; also address",
    );
  });

  it("keeps the quotes, brackets and white space around an address", () => {
    expect(withoutAddresses(`to "anna@example.org", 'bo@example.org'\t<cy@example.org>`)).toBe(`to "address", 'address'\t<address>`);
  });

  it("leaves text without an address as it is", () => {
    expect(withoutAddresses("421 Too many connections")).toBe("421 Too many connections");
  });
});
