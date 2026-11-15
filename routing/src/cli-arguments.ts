import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { CreateFamilyInput } from "./create-family";
import type { DeleteFamilyInput } from "./delete-family";
import { isFamilyId } from "./family-id";
import type { ResetAdminPasswordInput } from "./reset-admin-password";

/**
 * The Operator's arguments to each command, checked and read into what the command works with.
 * No I/O.
 */

/** Arguments the command does not take; the Operator is shown the usage. */
export class UsageError extends Error {}

/** What `create` is asked for; `defaultTimeZone` is the configured one for a new Family. */
export function parseCreate(args: string[], defaultTimeZone: string): CreateFamilyInput {
  const values = options(args, ["admin-email", "time-zone", "family-id"]);
  const adminEmail = adminEmailOption(values["admin-email"], "the first Admin");
  const timeZone = values["time-zone"];
  const effectiveTimeZone = timeZone ?? defaultTimeZone;
  if (!isTimeZone(effectiveTimeZone)) throw new UsageError(`Unknown time zone ${effectiveTimeZone}`);
  return { adminEmail, ...familyIdOption(values["family-id"]), ...(timeZone === undefined ? {} : { timeZone }) };
}

/** The Family to finish that --family-id names, or a newly drawn Family id. */
function familyIdOption(value: string | undefined): { familyId: string; resume: boolean } {
  if (value === undefined) return { familyId: randomUUID(), resume: false };
  return { familyId: familyIdValue(value), resume: true };
}

/** The Family id that --family-id names, in the lower case the Directory keeps. */
function familyIdValue(value: string | undefined): string {
  const familyId = value?.toLowerCase();
  if (!familyId || !isFamilyId(familyId)) throw new UsageError("--family-id needs a Family id, a UUID");
  return familyId;
}

/** The email address that --admin-email names; `whose` says which Admin it is for. */
function adminEmailOption(value: string | undefined, whose: string): string {
  if (!value || !isEmailAddress(value)) throw new UsageError(`--admin-email needs the email address of ${whose}`);
  return value;
}

function options(args: string[], names: string[]): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args, options: Object.fromEntries(names.map((name) => [name, { type: "string" }])), strict: true });
    return values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** One @, something before it, and a dotted domain after it; the core checks it further. */
function isEmailAddress(text: string): boolean {
  const [local, domain, ...rest] = text.split("@");
  return rest.length === 0 && Boolean(local) && /^[^\s.]+(\.[^\s.]+)+$/.test(domain ?? "") && !/\s/.test(local ?? "");
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** What `reset-admin-password` is asked for. */
export function parseReset(args: string[]): ResetAdminPasswordInput {
  const values = options(args, ["family-id", "admin-email"]);
  return { familyId: familyIdValue(values["family-id"]), adminEmail: adminEmailOption(values["admin-email"], "the Admin") };
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
