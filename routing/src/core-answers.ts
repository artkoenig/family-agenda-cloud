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

/** The release a core runs, as its /api/health answers it, such as `0.7.0`. */
export const runningVersion = ({ version }: Answer): string | undefined => (typeof version === "string" && version ? version : undefined);

/**
 * Whether reset-admin-password's 404 says that the Family has no Admin with that email. A 404
 * without that error code is a core that does not offer the operation.
 */
export const isUnknownAdmin = ({ error }: Answer): boolean => error === "unknown-admin";

/** The new password reset-admin-password answers. */
export const newPassword = ({ newPassword }: Answer): string | undefined => (typeof newPassword === "string" && newPassword ? newPassword : undefined);

/** What due-work answers: how many due Sources were polled and how many of those failed, or why a step of it failed. */
export type DueWork = { ran: number; failed: number } | { error: string };

/**
 * How many due Sources due-work polled, and of those how many failed; or why a step of it failed:
 * polling the Sources, or extracting the messages after. The core answers `{ polled, extracted }`,
 * each `{ ok: true, report }` or `{ ok: false, error }`, the report of polling naming the Sources
 * that `ran` and those that `failed`.
 */
export function sourcesPolled({ polled, extracted }: Answer): DueWork | undefined {
  const polling = stepOf(polled);
  const extraction = stepOf(extracted);
  if (polling === undefined || extraction === undefined) return undefined;
  if ("error" in polling) return { error: `polling the Sources: ${polling.error}` };
  if ("error" in extraction) return { error: `extracting the messages: ${extraction.error}` };
  const { ran, failed } = polling.report;
  if (!Array.isArray(ran) || !Array.isArray(failed)) return undefined;
  return { ran: ran.length + failed.length, failed: failed.length };
}

/** A step's report, or the error it failed with; undefined for anything else. */
function stepOf(step: unknown): { report: Answer } | { error: string } | undefined {
  if (typeof step !== "object" || step === null) return undefined;
  const { ok, report, error } = step as Answer;
  if (ok === false) return { error: typeof error === "string" ? error : "no reason given" };
  return ok === true && typeof report === "object" && report !== null ? { report: report as Answer } : undefined;
}
