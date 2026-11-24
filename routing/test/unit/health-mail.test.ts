import { describe, expect, it } from "vitest";
import type { Reported } from "../../src/health-check";
import { MAX_REPORTED, digestMail, digestText } from "../../src/health-mail";

const NOW = new Date("2026-11-24T10:05:00.000Z");

const reported = (fields: Partial<Reported> = {}): Reported => ({
  container: "family-agenda-core-1",
  message: "Polling Sources failed: <n>",
  example: "Polling Sources failed: 3",
  count: 1,
  suppressed: 0,
  lastMailed: undefined,
  ...fields,
});

/** The headers and the decoded text of a mail. */
const read = (mail: string) => {
  const [head = "", body = ""] = mail.split("\r\n\r\n");
  return { headers: head.split("\r\n"), body, text: Buffer.from(body.replaceAll("\r\n", ""), "base64").toString("utf8") };
};

describe("the digest's text", () => {
  it("names each container and message, with its count and one example", () => {
    const text = digestText(
      [
        reported({ count: 3 }),
        reported({ container: "family-agenda-postgres-1", message: "FATAL: x", example: "… FATAL: x", count: 1, suppressed: 7, lastMailed: "2026-11-23T09:00:00.000Z" }),
        reported({ container: "family-agenda-router-1", message: "Core unreachable", example: "{…}", count: 0, suppressed: 1, lastMailed: "2026-11-23T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(text).toBe(
      [
        "The health check of the Cube found this at 2026-11-24T10:05:00.000Z:",
        "",
        "family-agenda-core-1: 3 times since the last run",
        "  Polling Sources failed: <n>",
        "  Example: Polling Sources failed: 3",
        "",
        "family-agenda-postgres-1: once since the last run, and 7 times after the mail of 2026-11-23T09:00:00.000Z",
        "  FATAL: x",
        "  Example: … FATAL: x",
        "",
        "family-agenda-router-1: not since the last run, and once after the mail of 2026-11-23T09:00:00.000Z",
        "  Core unreachable",
        "  Example: {…}",
        "",
        "Each of these is mailed again a day after this mail at the soonest; until then it is counted.",
        "The lines of a container: journalctl -u docker.service CONTAINER_NAME=<container> --since -1h",
        '(docs/runbook/setup.md, "The health check").',
      ].join("\n"),
    );
  });

  it("shows at most 50, and counts the rest", () => {
    const text = digestText(
      Array.from({ length: MAX_REPORTED + 2 }, (_, index) => reported({ message: `m${index}` })),
      NOW,
    );
    expect(text).toContain("  m49\n");
    expect(text).not.toContain("  m50\n");
    expect(text).toContain("And 2 more, which the journal holds.");
    expect(digestText([reported()], NOW)).not.toContain("more, which");
  });
});

describe("the digest mail", () => {
  it("is a message as SMTP sends it, from no-reply to the Operator, its UTF-8 text in base64", () => {
    const entries = [reported(), reported({ container: "family-agenda-core-2", message: "Error: ä" })];
    const mail = digestMail({ reported: entries, to: "operator@example.org", now: NOW, messageId: "health-1" });
    const { headers, body, text } = read(mail);

    expect(headers).toEqual([
      "From: Family Agenda Cube <no-reply@family-agenda.cloud>",
      "To: operator@example.org",
      "Subject: Family Agenda Cube: 2 findings in 2 containers",
      "Date: Tue, 24 Nov 2026 10:05:00 +0000",
      "Message-ID: <health-1@family-agenda.cloud>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ]);
    expect(text).toBe(digestText(entries, NOW).replaceAll("\n", "\r\n"));
    expect(body.split("\r\n").every((line) => line.length <= 76)).toBe(true);
    expect(mail.endsWith("\r\n")).toBe(true);
    expect(mail.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("names one finding in one container in the singular", () => {
    expect(read(digestMail({ reported: [reported()], to: "o@example.org", now: NOW, messageId: "x" })).headers[2]).toBe("Subject: Family Agenda Cube: 1 finding in 1 container");
  });
});
