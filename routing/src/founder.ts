/**
 * A Family's founder: the Admin who registered it, whose Logto user id the core that created the
 * Family's Organization wrote into its custom data as `founderUserId`. The Directory records it as
 * the Family's `registered_by`: when the Family is created, or for a Family created before, the
 * first time it is needed; the Operator records it by hand with `set-founder`.
 */
import type { Directory } from "./directory";
import type { IdpManagement } from "./logto-management";
import { organizations } from "./organizations";
import { existingEntry, ProvisioningError, type Provisioning } from "./provisioning";

/** What `set-founder` is asked for. */
export type SetFounderInput = {
  familyId: string;
  /** The Admin to record as the Family's founder: their email or Logto user id. */
  admin: string;
  /** Whether a founder recorded before is overwritten. */
  force: boolean;
};

/**
 * The Family's founder: as the Directory records it, or else as its Organization names it, which
 * is recorded then. Null when neither names one, when the Family has no Organization, and without
 * IDP_MANAGEMENT_*; undefined when there is no such Family.
 */
export async function founderOf({ config, directory }: Pick<Provisioning, "config" | "directory">, familyId: string): Promise<string | null | undefined> {
  const entry = await directory.find(familyId);
  if (!entry || entry.registeredBy !== null) return entry?.registeredBy;
  if (entry.organizationId === null || config.idpManagement === null) return null;
  const founder = await organizations(config.idpManagement).founder(entry.organizationId);
  return founder === null ? null : recorded(directory, familyId, founder, false);
}

/**
 * Records the Admin that `admin` names, by email or Logto user id, as the Family's founder. Refuses
 * anyone who is not an Admin of the Family now, and a founder recorded before, unless `force`.
 * Answers the founder's user id.
 */
export async function setFounder(directory: Directory, idp: IdpManagement, input: SetFounderInput): Promise<string> {
  const { familyId, admin, force } = input;
  const { organizationId } = await existingEntry(directory, familyId);
  if (organizationId === null) throw new ProvisioningError(`The Family ${familyId} has no Logto Organization, so no Admin to be its founder`);
  const named = admin.toLowerCase();
  const admins = await organizations(idp).admins(organizationId);
  const found = admins.find(({ userId, email }) => userId === admin || email?.toLowerCase() === named);
  if (!found) throw new ProvisioningError(`${admin} is no Admin of the Family ${familyId}`);
  const founder = await recorded(directory, familyId, found.userId, force);
  if (founder !== found.userId) {
    throw new ProvisioningError(`The Family ${familyId} has the founder ${founder} recorded already; run set-founder with --force to overwrite it`);
  }
  return founder;
}

/** Records the founder, unless one is recorded and `overwrite` is false; answers the founder the Family has now. */
async function recorded(directory: Directory, familyId: string, userId: string, overwrite: boolean): Promise<string | null> {
  // An entry stays once made.
  return (await directory.recordFounder(familyId, userId, overwrite)) ?? null;
}
