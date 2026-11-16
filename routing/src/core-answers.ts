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

/** What a core answers for a database a newer release migrated: another core, of that release, may open it. */
const MIGRATED_BY_NEWER_RELEASE = "migrated-by-newer-release";

/** Why a core answers 503 instead of opening a Family: it is preparing its database, or cannot reach it. */
const NOT_OPENED_NOW = new Set<unknown>(["migrating", "unavailable"]);

/**
 * Why a core did not open the Family, if its answer says that it did not: `409
 * migrated-by-newer-release` from a core of an older release than the one that migrated the
 * Family's database, `503 migrating` from one that is preparing it, `503 unavailable` from one that
 * cannot reach it. Undefined for every other answer, a 409 or 503 without such an error among
 * them. A core that refuses so has changed nothing, so another core of the pool may be asked the
 * same, whatever the request or operation.
 *
 * `error` is the answer's error code: a triggered operation's `error`, a page's `pageErrorCode`.
 */
export function openingRefusal(status: number, error: unknown): string | undefined {
  if (status === 503) return NOT_OPENED_NOW.has(error) ? `503 ${String(error)}` : undefined;
  return status === 409 && error === MIGRATED_BY_NEWER_RELEASE ? `409 ${MIGRATED_BY_NEWER_RELEASE}` : undefined;
}

/** The error code a page's refusal begins with, as in `migrating: the Family's database is being prepared`. */
export const pageErrorCode = (text: string): string | undefined => /^([a-z][a-z-]*): /.exec(text)?.[1];

/**
 * Whether reset-admin-password's 404 says that the Family has no Admin with that email. A 404
 * without that error code is a core that does not offer the operation.
 */
export const isUnknownAdmin = ({ error }: Answer): boolean => error === "unknown-admin";

/** The new password reset-admin-password answers. */
export const newPassword = ({ newPassword }: Answer): string | undefined => (typeof newPassword === "string" && newPassword ? newPassword : undefined);

/** How many due Sources a run of due work polled, and of those how many failed. */
export type SourcesPolled = { ran: number; failed: number };

/** What due-work answers: the Sources it polled, or why a step of it failed. */
export type DueWork = SourcesPolled | { error: string };

/**
 * How many due Sources due-work polled, and of those how many failed; or why a step of it failed:
 * polling the Sources, or extracting the messages after. The core answers `{ polled, extracted }`,
 * each `{ ok: true, report }` or `{ ok: false, error }`, the report of polling naming the Sources
 * that `ran` and those that `failed`.
 */
export function dueWorkOf({ polled, extracted }: Answer): DueWork | undefined {
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
