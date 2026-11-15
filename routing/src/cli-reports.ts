import type { FamilyOverview } from "./directory";
import type { RollOutResult } from "./roll-out";

/** What the Operator is told after a command: the text on the output and the exit code. No I/O. */

/** The rollout's report: how many Families it prepared, and each it failed for or refused; 1 for any. */
export function rollOutReport({ coreVersion, prepared, failed, newer }: RollOutResult): { text: string; exitCode: number } {
  const lines = [`Prepared ${familiesCounted(prepared.length)} for core version ${coreVersion}`];
  if (failed.length > 0) lines.push(`Failed for ${familiesCounted(failed.length)}; run roll-out again to retry:`);
  for (const { familyId, error } of failed) lines.push(`${familyId}\t${error}`);
  if (newer.length > 0) lines.push(`Refused ${familiesCounted(newer.length)}; going back to an older core version needs a restore:`);
  for (const { familyId, coreVersion: newerVersion } of newer) lines.push(`${familyId}\tprepared for a newer core version ${newerVersion}`);
  return { text: lines.map((line) => `${line}\n`).join(""), exitCode: failed.length + newer.length === 0 ? 0 : 1 };
}

const familiesCounted = (count: number) => `${count} ${count === 1 ? "Family" : "Families"}`;

/** A Family's line in `families`: its Family id, its status, and when its due work last ran and how it ended. */
export function familyLine({ familyId, status, dueWork, preparationFailure }: FamilyOverview): string {
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
  if (preparationFailure) columns.push(`preparing for ${preparationFailure.coreVersion} failed: ${preparationFailure.error}`);
  return columns.join("\t");
}
