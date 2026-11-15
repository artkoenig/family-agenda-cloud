import type { Config } from "./config";

/**
 * A Family id: how it is written, where it stands in a request's path, and where the Family's
 * blobs are. No I/O.
 */

/** A UUID in lower case, the way the Directory keeps a Family id. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const FAMILY_ID = new RegExp(`^${UUID}$`);

/** A Family id as the first segment of a path, and the rest. */
const FAMILY_PATH = new RegExp(`^/(${UUID})(?=[/?]|$)(.*)$`, "s");

/** Whether the text is a Family id: a UUID, in lower case. */
export const isFamilyId = (text: string): boolean => FAMILY_ID.test(text);

/**
 * The Family id that is the first segment of the path, and the path after it on the core, which
 * starts with a slash; undefined for a path that does not start with a Family id.
 */
export function familyIdInPath(target: string): { familyId: string; path: string } | undefined {
  const [, familyId, rest = ""] = FAMILY_PATH.exec(target) ?? [];
  if (familyId === undefined) return undefined;
  return { familyId, path: rest.startsWith("/") ? rest : `/${rest}` };
}

/** The directory, as the cores see it, that holds the Family's blobs. */
export const blobLocationOf = (config: Pick<Config, "blobRoot">, familyId: string): string => `${config.blobRoot}/${familyId}`;
