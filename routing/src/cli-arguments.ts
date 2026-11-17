import { parseArgs } from "node:util";
import type { CreateFamilyInput } from "./create-family";
import type { DeleteFamilyInput } from "./delete-family";
import { isFamilyId, isOrganizationId } from "./family-id";

/**
 * The Operator's arguments to each command, checked and read into what the command works with.
 * No I/O: a new Family id is drawn by the caller's `drawFamilyId`.
 */

/** Arguments the command does not take; the Operator is shown the usage. */
export class UsageError extends Error {}

/**
 * What `create` is asked for; `defaultTimeZone` is the configured one for a new Family, and
 * `drawFamilyId` draws the Family id of a new Family, for none named.
 */
export function parseCreate(args: string[], defaultTimeZone: string, drawFamilyId: () => string): CreateFamilyInput {
  const values = options(args, ["organization-id", "time-zone", "family-id"]);
  const organizationId = values["organization-id"];
  if (!organizationId || !isOrganizationId(organizationId)) throw new UsageError("--organization-id needs the id of the Family's Logto Organization");
  const timeZone = values["time-zone"];
  const effectiveTimeZone = timeZone ?? defaultTimeZone;
  if (!isTimeZone(effectiveTimeZone)) throw new UsageError(`Unknown time zone ${effectiveTimeZone}`);
  return { organizationId, ...familyIdOption(values["family-id"], drawFamilyId), ...(timeZone === undefined ? {} : { timeZone }) };
}

/** The Family to finish that --family-id names, or a newly drawn Family id. */
function familyIdOption(value: string | undefined, drawFamilyId: () => string): Pick<CreateFamilyInput, "familyId" | "familyIdFrom"> {
  if (value === undefined) return { familyId: drawFamilyId(), familyIdFrom: "drawn" };
  return { familyId: familyIdValue(value), familyIdFrom: "operator" };
}

/** The Family id that --family-id names, in the lower case the Directory keeps. */
function familyIdValue(value: string | undefined): string {
  const familyId = value?.toLowerCase();
  if (!familyId || !isFamilyId(familyId)) throw new UsageError("--family-id needs a Family id, a UUID");
  return familyId;
}

function options(args: string[], names: string[]): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args, options: Object.fromEntries(names.map((name) => [name, { type: "string" }])), strict: true });
    return values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** What `delete` is asked for. */
export function parseDelete(args: string[]): DeleteFamilyInput {
  const values = options(args, ["family-id", "confirm"]);
  // deleteFamily itself checks that it is a Family id.
  const familyId = values["family-id"];
  if (!familyId) throw new UsageError("--family-id needs the Family id of the Family to delete");
  const confirmation = values.confirm;
  if (confirmation === undefined) throw new UsageError("--confirm needs the Family id once more");
  return { familyId: familyId.toLowerCase(), confirmation: confirmation.toLowerCase() };
}

/** The Family that `suspend` or `resume` is asked for. */
export function parseFamilyId(args: string[]): string {
  return familyIdValue(options(args, ["family-id"])["family-id"]);
}
