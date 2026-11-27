import { rm, stat } from "node:fs/promises";
import type { Config } from "./config";
import { familyDeletedMail, familyDeletedNoticeMail, type ContractMail, type FamilyDeletedMailValues } from "./contract-mails";
import { mailLanguageOf, type Person } from "./contract-wording";
import { inTransaction, type DirectoryEntry } from "./directory";
import { dropFamilyDatabase, familyDatabaseNames } from "./family-databases";
import { blobLocationOf, isFamilyId } from "./family-id";
import { founderOf } from "./founder";
import { person, type IdpManagement } from "./logto-management";
import { organizations } from "./organizations";
import { outbox } from "./outbox";
import { existingEntry, ProvisioningError, withFamilyLock, type ScheduledProvisioning } from "./provisioning";

export type DeleteFamilyInput = {
  familyId: string;
  /** The Family id once more, typed by the Operator: nothing is deleted unless it matches. */
  confirmation: string;
};

/** What a deletion works with. */
export type Deletion = Pick<ScheduledProvisioning, "config" | "client" | "directory" | "schedules" | "log">;

/**
 * What the Family's Admins are told of its deletion: who deleted it, an Admin on `/delete` (#231)
 * or the automatic deletion of a Family Locked for 30 days (#228), when, and the running
 * Subscription the deletion cancelled, if any.
 */
export type DeletionTold = { by: { admin: string } | "automatic"; at: Date; subscription: FamilyDeletedMailValues["subscription"] };

/** The mails' types in the outbox: the one to who deleted the Family, and the one to every other Admin. */
export const FAMILY_DELETED_MAIL = "family-deleted";
export const FAMILY_DELETED_NOTICE_MAIL = "family-deleted-notice";

/** `routing delete`: deletes the Family the Operator typed the id of twice, and tells nobody. */
export async function deleteFamily(provisioning: ScheduledProvisioning, input: DeleteFamilyInput): Promise<void> {
  const { familyId } = input;
  if (!isFamilyId(familyId)) throw new ProvisioningError(`${familyId} is not a Family id; nothing was deleted`);
  if (input.confirmation !== familyId) {
    throw new ProvisioningError("The confirmation does not match the Family id; nothing was deleted");
  }
  await deleteFamilyAndTell(provisioning, familyId);
}

/**
 * Deletes a Family, or finishes deleting one after a failure part-way: every step is safe to run
 * again and ends in the state of an undisturbed run. The one flow of every deletion: an Operator's
 * (`routing delete`), an Admin's on `/delete` (#231) and the automatic one (#228).
 *
 * The first step marks the Family deleted and destroys its wrapped family key and database
 * password, so that from then on nothing routes to it or triggers its due work, and what is left of its
 * data opens with no key the Routing module still has. Its entry stays, as the record that it was
 * deleted, with no secrets in it, nor anything of its Organization but the id.
 *
 * If `told` says of what, the Admins are told right then, while Logto still knows them: each gets a
 * mail in their language, written before the Family is marked and put in the outbox once. A run
 * that finishes a deletion puts in no second one, and one without `told`, as an Operator's, none at all.
 *
 * Its Admins' Logto users are deleted, so that none of them can sign in any more, and only once
 * Logto lists no members its Organization: once that is gone, nothing tells whose users were left.
 * The time deleting finished is noted only after the last step, so that a deleted Family without it
 * was not deleted to the end. Old row versions of the Directory not yet vacuumed, its write-ahead
 * log and its backups still hold the wrapped values until they are overwritten or expire; they
 * open only with the Operator key.
 */
export async function deleteFamilyAndTell(deletion: Deletion, familyId: string, told?: DeletionTold): Promise<void> {
  const { config, client, directory, schedules, log } = deletion;
  if (!isFamilyId(familyId)) throw new ProvisioningError(`${familyId} is not a Family id; nothing was deleted`);
  const entry = await existingEntry(directory, familyId);
  refuseForeign(entry, blobLocationOf(config, familyId));
  refuseWithoutManagement(entry, config);
  if (entry.deletedAt) {
    log.info("The Family was deleted already", { familyId, deletedAt: entry.deletedAt.toISOString() });
    return;
  }
  log.info(entry.status === "deleted" ? "Finishing the deletion of the Family" : "Deleting the Family", { familyId });

  // Under the Family's lock: a resume under way cannot give it its schedules back once removed, and two runs tell the Admins once.
  await withFamilyLock(client, familyId, async () => {
    // Read from Logto before anything is deleted: if it does not answer, the Family stays, and who deletes it tries again.
    const mails = told ? await mailsOf(deletion, entry, told) : [];

    await directory.markDeleted(familyId);
    log.info("The Family is marked deleted; its wrapped family key and database password are destroyed", { familyId });

    if (mails.length > 0) {
      await inTransaction(client, async () => {
        for (const { type, mail } of mails) await outbox(client).enqueue(mail, { type, familyId });
      });
      log.info("The Family's Admins are told of the deletion", { familyId, mails: mails.length });
    }

    await schedules.remove(familyId);
    log.info("The Family's schedules are removed", { familyId });
  });

  await dropFamilyDatabase(client, entry, config.familyDatabaseCloseTimeoutMs);
  log.info("The Family's database and role are dropped", { familyId });

  await removeBlobs(config.blobRoot, entry.blobLocation);
  log.info("The Family's blob location is removed", { familyId });

  await deleteAdminsAndOrganization(deletion, entry);

  await directory.finishDeletion(familyId);
  log.info("The Family is deleted", { familyId });
}

/** An Admin as Logto knows them, to write to. */
type Recipient = { userId: string; person: Person; locale: string | null };

/** A mail of the deletion, with its type in the outbox. */
type DeletionMail = { type: string; mail: ContractMail };

/**
 * The mails of the deletion, none if one is in the outbox already: to who deleted the Family, or
 * to its founder after an automatic deletion, the mail that says what becomes of the Subscription;
 * to every other Admin the notice.
 */
async function mailsOf({ config, client, directory, log }: Deletion, entry: DirectoryEntry, told: DeletionTold): Promise<DeletionMail[]> {
  const { familyId, organizationId } = entry;
  const idp = config.idpManagement;
  if (organizationId === null || idp === null) return [];
  const box = outbox(client);
  const ever = new Date(0);
  if ((await box.holds({ type: FAMILY_DELETED_MAIL, familyId }, ever)) || (await box.holds({ type: FAMILY_DELETED_NOTICE_MAIL, familyId }, ever))) {
    log.info("The Family's Admins were told of the deletion already", { familyId });
    return [];
  }
  const admins = await recipientsOf(idp, organizationId);
  const first = told.by === "automatic" ? await founderOf({ config, directory }, familyId) : told.by.admin;
  const deleter = told.by === "automatic" ? "automatic" : { admin: admins.find(({ userId }) => userId === first)?.person.name ?? first ?? "" };
  const imprint = config.stripe?.imprint;
  return admins.flatMap(({ userId, person: recipient, locale }): DeletionMail[] => {
    if (recipient.email === "") {
      log.error("An Admin of a deleted Family has no email address", { familyId, userId });
      return [];
    }
    const language = mailLanguageOf(locale);
    if (userId !== first) return [{ type: FAMILY_DELETED_NOTICE_MAIL, mail: familyDeletedNoticeMail(language, { recipient, deletedAt: told.at, by: deleter }, imprint) }];
    const by = told.by === "automatic" ? "automatic" : "recipient";
    return [{ type: FAMILY_DELETED_MAIL, mail: familyDeletedMail(language, { recipient, deletedAt: told.at, by, subscription: told.subscription }, imprint) }];
  });
}

/** The Organization's Admins, each as Logto names them: by their name, else their address, else their id. */
async function recipientsOf(idp: IdpManagement, organizationId: string): Promise<Recipient[]> {
  const admins = await organizations(idp).admins(organizationId);
  return Promise.all(
    admins.map(async ({ userId }) => {
      const known = await person(idp, userId);
      return { userId, person: { name: known?.name ?? known?.email ?? userId, email: known?.email ?? "" }, locale: known?.locale ?? null };
    }),
  );
}

/**
 * Refuses an entry whose database, role or blob location is not the one its Family id gives: only
 * what Provisioning made for this Family is ever dropped or removed.
 */
function refuseForeign(entry: DirectoryEntry, blobLocation: string): void {
  const { databaseName, databaseRole } = familyDatabaseNames(entry.familyId);
  if (entry.databaseName !== databaseName || entry.databaseRole !== databaseRole) {
    throw new ProvisioningError(`The Family's database and role are not ${databaseName}; nothing was deleted`);
  }
  if (entry.blobLocation !== blobLocation) {
    throw new ProvisioningError(`The Family's blob location is not ${blobLocation}; nothing was deleted`);
  }
}

/** Refuses a Family with an Organization while there is no Management API to delete it in. */
function refuseWithoutManagement(entry: DirectoryEntry, config: Config): void {
  if (entry.organizationId !== null && config.idpManagement === null) {
    throw new ProvisioningError("IDP_MANAGEMENT_* is not set, so the Family's Organization cannot be deleted; nothing was deleted");
  }
}

/**
 * Deletes the Family's Admins' Logto users and then its Organization, if it has one. Users or an
 * Organization gone already are deleted; a run that failed part-way deletes the members left.
 */
async function deleteAdminsAndOrganization({ config, log }: Deletion, { familyId, organizationId }: DirectoryEntry): Promise<void> {
  if (organizationId === null || config.idpManagement === null) return;
  const organization = organizations(config.idpManagement);
  const users = await organization.deleteMemberUsers(organizationId);
  log.info("The Family's Admins' users are deleted", { familyId, users });
  await organization.delete(organizationId);
  log.info("The Family's Organization is deleted", { familyId, organizationId });
}

/**
 * Removes the blob location with all in it. A blob root that is not there, such as the bucket
 * while it is not mounted, fails the step, so that blobs it cannot see are not reported gone.
 */
async function removeBlobs(blobRoot: string, blobLocation: string): Promise<void> {
  const root = await stat(blobRoot).catch(() => undefined);
  if (!root?.isDirectory()) throw new Error(`The blob root ${blobRoot} is not there`);
  await rm(blobLocation, { recursive: true, force: true });
}
