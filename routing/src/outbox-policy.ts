/**
 * How the mail outbox treats its entries (#233): when a mail that failed is tried again, when the
 * Operator is told, how many mails an hour go out, how long a sent mail is kept, and what of a
 * failure may be logged and kept. No I/O.
 */

/** Mails sent in any one hour, so that they stay below IONOS's 500 together with Logto's codes and the alerts (#192). */
export const HOURLY_LIMIT = 300;

/** Days a sent mail stays in the outbox before the daily sweep deletes it (#196 item 5). */
export const SENT_RETENTION_DAYS = 30;

/** The failure in a row on which the sender logs an error, which the `health` cron mails the Operator (ADR-0003). */
export const ALERT_AFTER_FAILURES = 5;

const FIRST_DELAY_MINUTES = 1;
const CEILING_MINUTES = 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Minutes to wait after the `failures`-th failure in a row: one, doubled after each further one, an hour at most. */
export const retryDelayMinutes = (failures: number): number => Math.min(FIRST_DELAY_MINUTES * 2 ** (failures - 1), CEILING_MINUTES);

/** When a mail whose `failures`-th attempt failed at `failedAt` is tried again. */
export const nextAttemptAt = (failedAt: Date, failures: number): Date => new Date(failedAt.getTime() + retryDelayMinutes(failures) * MINUTE_MS);

/** Whether the `failures`-th failure in a row is the one logged as an error: once per mail. */
export const sendsAlert = (failures: number): boolean => failures === ALERT_AFTER_FAILURES;

/** The sweep at `now` deletes what was sent at this time or before. */
export const sweptBefore = (now: Date): Date => new Date(now.getTime() - SENT_RETENTION_DAYS * DAY_MS);

const MAIL_TYPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Whether the text is a mail's type, such as `confirmation` or `trial-reminder-1`: what log lines name a mail by. */
export const isMailType = (text: string): boolean => MAIL_TYPE.test(text);

/**
 * Why sending failed, for the log: the error's code and the SMTP server's response code, such as
 * `EENVELOPE 550`. Never the message, which can name the recipient.
 */
export function smtpReasonOf(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  if (typeof code !== "string") return "unknown";
  return typeof responseCode === "number" ? `${code} ${responseCode}` : code;
}

/** What a mail address ends at in an SMTP server's message: white space, angle brackets and quotes. */
const ADDRESS_BOUNDS = /([\s<>"']+)/;

/** The text with every mail address in it, any word with an `@`, replaced by `address`, for the last error the outbox keeps. */
export const withoutAddresses = (text: string): string =>
  text
    .split(ADDRESS_BOUNDS)
    .map((part) => (part.includes("@") ? "address" : part))
    .join("");
