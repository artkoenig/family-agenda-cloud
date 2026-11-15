import type { DirectoryEntry } from "./directory";

/**
 * Whether a Family is served and scheduled: only an active Family is, and only once it is prepared
 * for the core version the pool runs (CORE_VERSION), as a core never opens a database it cannot
 * read. No I/O.
 */

/**
 * - `served`: active and prepared for the running core version; it is routed to and scheduled.
 * - `awaiting-rollout`: active, but not prepared for the running core version; a rollout prepares it.
 * - `withheld`: suspended, or still being prepared by `create`; its data stays, but it is not served.
 * - `gone`: deleted, or unknown to the Directory.
 */
export type Readiness = "served" | "awaiting-rollout" | "withheld" | "gone";

/** A Family's entry, if the Directory has one, with its readiness; only a Family that is gone may have none. */
export type ReadyEntry<E> = { readiness: Exclude<Readiness, "gone">; entry: E } | { readiness: "gone"; entry: E | undefined };

/** How ready the Family with this entry, if any, is for the running core version `coreVersion`. */
export function readinessOf<E extends Pick<DirectoryEntry, "status" | "coreVersion">>(entry: E | undefined, coreVersion: string): ReadyEntry<E> {
  if (!entry || entry.status === "deleted") return { readiness: "gone", entry };
  if (entry.status !== "active") return { readiness: "withheld", entry };
  return { readiness: entry.coreVersion === coreVersion ? "served" : "awaiting-rollout", entry };
}
