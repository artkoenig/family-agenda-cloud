import type { DirectoryEntry } from "./directory";

/**
 * Where central sign-in sends a person, by the Organizations their ID token claims and the
 * Directory's entries for them (spec/centralSignIn.qnt: `landingOf`). The Directory is the one
 * mapping from Organization to Family (#128): an Organization it does not know is one whose
 * family.created is on its way. No I/O: the Directory is asked through `find`.
 */

/**
 * - `family`: into the active Family; the core signs the person in itself.
 * - `preparing`: "Deine Family wird vorbereitet", which asks again. Also for a claim of no
 *   Organization: a registration whose Family is on its way (#128), or one whose PostRegister central sign-in sent again (#155).
 * - `unavailable`: the Family is suspended or deleted.
 * - `several`: more than one Organization, which the one-Family-per-person rule rules out.
 */
export type Landing = { page: "family"; familyId: string } | { page: "preparing" } | { page: "unavailable" } | { page: "several" };

/** The Directory's entry for an Organization, null if it knows none. */
export type FindByOrganization = (organizationId: string) => Promise<Pick<DirectoryEntry, "familyId" | "status"> | null>;

/** Where a person whose ID token claims `organizations` lands. */
export async function landingOf(organizations: readonly string[], find: FindByOrganization): Promise<Landing> {
  const [organizationId, ...others] = organizations;
  if (organizationId === undefined) return { page: "preparing" };
  if (others.length > 0) return { page: "several" };
  const entry = await find(organizationId);
  if (entry === null || entry.status === "being_prepared") return { page: "preparing" };
  if (entry.status === "active") return { page: "family", familyId: entry.familyId };
  return { page: "unavailable" };
}
