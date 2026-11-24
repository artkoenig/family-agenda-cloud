import type { FamilyOverview } from "./directory";
import type { WaitingMail } from "./outbox";

/** What the Operator is told after a command: the text on the output and the exit code. No I/O. */

/** A Family's line in `families`: its Family id, its status, and when its due work last ran and how it ended. */
export function familyLine({ familyId, status, dueWork }: FamilyOverview): string {
  const columns: string[] = [familyId, status];
  if (!dueWork) columns.push("due work never ran");
  else if (dueWork.outcome === "succeeded") {
    columns.push(`due work ran ${dueWork.ranAt.toISOString()}`, `succeeded: ${dueWork.sources.ran} Sources polled, ${dueWork.sources.failed} failed`);
  } else {
    columns.push(
      `due work ran ${dueWork.ranAt.toISOString()}`,
      `failed: ${dueWork.error}`,
      `${dueWork.failures} ${dueWork.failures === 1 ? "failure" : "failures"} in a row, next try ${dueWork.retryAt.toISOString()}`,
    );
  }
  return columns.join("\t");
}

/**
 * A mail's line in `outbox`: its id, type and Family (a dash for none), when it was put in, and
 * whether it was tried, how often, when next and why it failed last. Never its address, subject
 * or text: the last error has its addresses masked.
 */
export function waitingMailLine({ id, type, familyId, createdAt, attempts, nextAttemptAt, lastError }: WaitingMail): string {
  const columns = [id, type, familyId ?? "-", `queued ${createdAt.toISOString()}`];
  if (attempts === 0) columns.push(`not tried yet, due ${nextAttemptAt.toISOString()}`);
  else columns.push(`${attempts} failed ${attempts === 1 ? "attempt" : "attempts"}, next try ${nextAttemptAt.toISOString()}`, `last error: ${lastError ?? "unknown"}`);
  return columns.join("\t");
}
