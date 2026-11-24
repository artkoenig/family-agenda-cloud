import type { Reported } from "./health-check";

/**
 * The health check's digest mail to the Operator (#208): one per run with something new, grouped
 * by container and message, each with its count and one example line. A whole message as SMTP
 * sends it (RFC 5322, CRLF lines, the UTF-8 text in base64). No I/O.
 */

/** The address the health check's mails come from, the one of Logto's and the contract mails. */
export const ALERT_FROM = "no-reply@family-agenda.cloud";

/** At most this many lines in one mail; the rest are counted at the end. */
export const MAX_REPORTED = 50;

const times = (count: number) => (count === 1 ? "once" : `${count} times`);

function countOf({ count, suppressed, lastMailed }: Reported): string {
  const now = count > 0 ? `${times(count)} since the last run` : "not since the last run";
  return suppressed > 0 && lastMailed ? `${now}, and ${times(suppressed)} after the mail of ${lastMailed}` : now;
}

/** The mail's text. */
export function digestText(reported: Reported[], now: Date): string {
  const shown = reported.slice(0, MAX_REPORTED);
  const lines = [`The health check of the Cube found this at ${now.toISOString()}:`, ""];
  for (const entry of shown) lines.push(`${entry.container}: ${countOf(entry)}`, `  ${entry.message}`, `  Example: ${entry.example}`, "");
  if (reported.length > shown.length) lines.push(`And ${reported.length - shown.length} more, which the journal holds.`, "");
  lines.push(
    "Each of these is mailed again a day after this mail at the soonest; until then it is counted.",
    "The lines of a container: journalctl -u docker.service CONTAINER_NAME=<container> --since -1h",
    "(docs/runbook/setup.md, \"The health check\").",
  );
  return lines.join("\n");
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const subjectOf = (reported: Reported[]): string => {
  const containers = new Set(reported.map(({ container }) => container)).size;
  return `Family Agenda Cube: ${plural(reported.length, "finding")} in ${plural(containers, "container")}`;
};

/** The base64 of the text, in lines of 76 characters. */
const base64Lines = (text: string): string[] => Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g) ?? [];

/** The digest mail, to `to`, as SMTP sends it. */
export function digestMail({ reported, to, now, messageId }: { reported: Reported[]; to: string; now: Date; messageId: string }): string {
  return [
    `From: Family Agenda Cube <${ALERT_FROM}>`,
    `To: ${to}`,
    `Subject: ${subjectOf(reported)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${messageId}@family-agenda.cloud>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...base64Lines(digestText(reported, now).replaceAll("\n", "\r\n")),
    "",
  ].join("\r\n");
}
