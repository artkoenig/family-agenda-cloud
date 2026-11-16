import type { FamilyOverview } from "./directory";

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
