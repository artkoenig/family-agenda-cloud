import type { DirectoryEntry, DueWorkRun } from "./directory";

/**
 * Whether a Family is served and scheduled: only an active Family is, and only once it is prepared
 * for the core version the pool runs (CORE_VERSION), as a core never opens a database it cannot
 * read. No I/O.
 */

/**
 * - `prepared`: active and prepared for the running core version; it is routed to and scheduled.
 * - `unprepared`: active, but not prepared for the running core version; it waits for a rollout.
 * - `inactive`: suspended or still being prepared.
 * - `gone`: deleted, or unknown to the Directory.
 */
export type Readiness = "prepared" | "unprepared" | "inactive" | "gone";

/** A Family's entry, if the Directory has one, with its readiness; only a Family that is gone may have none. */
export type ReadyEntry<E> = { readiness: Exclude<Readiness, "gone">; entry: E } | { readiness: "gone"; entry: E | undefined };

/** How ready the Family with this entry, if any, is for the running core version `coreVersion`. */
export function readinessOf<E extends Pick<DirectoryEntry, "status" | "coreVersion">>(entry: E | undefined, coreVersion: string): ReadyEntry<E> {
  if (!entry || entry.status === "deleted") return { readiness: "gone", entry };
  if (entry.status !== "active") return { readiness: "inactive", entry };
  return { readiness: entry.coreVersion === coreVersion ? "prepared" : "unprepared", entry };
}

/** Whether `version` is a later release than `than`, both `major.minor.patch`; text that is not one is not later. */
export function isNewer(version: string, than: string): boolean {
  const [a, b] = [version, than].map((text) => (/^\d+\.\d+\.\d+$/.test(text) ? text.split(".").map(Number) : undefined));
  if (!a || !b) return false;
  const index = a.findIndex((part, at) => part !== b[at]);
  return index !== -1 && (a[index] ?? 0) > (b[index] ?? 0);
}

/** A run of due work that failed. */
export type FailedRun = Extract<DueWorkRun, { outcome: "failed" }>;

/** Whether the Family's due work, which last ran as `last`, waits at `now` for its retry: it failed, and the retry is not due yet. */
export const waitsForRetry = (last: DueWorkRun | null, now: Date): last is FailedRun => last?.outcome === "failed" && now < last.retryAt;
