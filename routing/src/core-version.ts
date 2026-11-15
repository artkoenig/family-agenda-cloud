/** The core versions a Family is prepared for, against the one the pool runs (CORE_VERSION). No I/O. */

/**
 * The version a Family prepared for `preparedFor` is prepared for, if it is a later release than
 * `coreVersion`, both `major.minor.patch`: an older core cannot read a database a newer one
 * migrated. Undefined for a Family prepared for none yet, or for text that is not a version.
 */
export const newerPreparedVersion = (preparedFor: string | null, coreVersion: string): string | undefined =>
  preparedFor !== null && isNewer(preparedFor, coreVersion) ? preparedFor : undefined;

/** Whether `version` is a later release than `than`, both `major.minor.patch`; text that is not one is not later. */
function isNewer(version: string, than: string): boolean {
  const [a, b] = [version, than].map((text) => (/^\d+\.\d+\.\d+$/.test(text) ? text.split(".").map(Number) : undefined));
  if (!a || !b) return false;
  const index = a.findIndex((part, at) => part !== b[at]);
  return index !== -1 && (a[index] ?? 0) > (b[index] ?? 0);
}
