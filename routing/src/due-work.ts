import type { DueWorkRun } from "./directory";

/** When the Scheduler runs a Family's due work again after a run that failed. No I/O. */

/** A run of due work that failed. */
export type FailedRun = Extract<DueWorkRun, { outcome: "failed" }>;

/** Whether the Family's due work, which last ran as `last`, waits at `now` for its retry: it failed, and the retry is not due yet. */
export const waitsForRetry = (last: DueWorkRun | null, now: Date): last is FailedRun => last?.outcome === "failed" && now < last.retryAt;
