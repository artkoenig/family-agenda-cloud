/**
 * What a core's answers to the triggered operations say, read from their JSON bodies. Each reader
 * answers undefined for an answer that does not say it, and the caller fails the call. No I/O.
 */

/** An operation's answer: its JSON body as an object. */
export type Answer = Record<string, unknown>;

/** A JSON object answered, or {} for an empty body, one that is not JSON or not an object. */
export function answerOf(text: string): Answer {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Answer) : {};
  } catch {
    return {};
  }
}

/** The core version prepare-family answers, the one the Family's database is now prepared for. */
export const preparedVersion = ({ coreVersion }: Answer): string | undefined => (typeof coreVersion === "string" ? coreVersion : undefined);

/**
 * Whether reset-admin-password's 404 says that the Family has no Admin with that email. A 404
 * without that error code is a core that does not offer the operation.
 */
export const isUnknownAdmin = ({ error }: Answer): boolean => error === "unknown-admin";

/** The new password reset-admin-password answers. */
export const newPassword = ({ password }: Answer): string | undefined => (typeof password === "string" && password ? password : undefined);

/** How many due Sources run-due-work polled, and of those how many failed. */
export function sourcesPolled({ ran, failed }: Answer): { ran: number; failed: number } | undefined {
  return Number.isInteger(ran) && Number.isInteger(failed) ? { ran: ran as number, failed: failed as number } : undefined;
}
