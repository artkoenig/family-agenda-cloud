import type { DirectoryEntry } from "./directory";

/**
 * Whether a Family is served and scheduled: only an active Family is. Whether a core can open its
 * database is the core's to say, when it is handed the Family's Context. No I/O.
 */

/**
 * - `served`: active; it is routed to and scheduled.
 * - `withheld`: suspended, or still being prepared by `create`; its data stays, but it is not served.
 * - `gone`: deleted, or unknown to the Directory.
 */
export type Readiness = "served" | "withheld" | "gone";

/** A Family's entry, if the Directory has one, with its readiness; only a Family that is gone may have none. */
export type ReadyEntry<E> = { readiness: Exclude<Readiness, "gone">; entry: E } | { readiness: "gone"; entry: E | undefined };

/** How ready the Family with this entry, if any, is. */
export function readinessOf<E extends Pick<DirectoryEntry, "status">>(entry: E | undefined): ReadyEntry<E> {
  if (!entry || entry.status === "deleted") return { readiness: "gone", entry };
  return { readiness: entry.status === "active" ? "served" : "withheld", entry };
}
