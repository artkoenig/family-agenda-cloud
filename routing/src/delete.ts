/**
 * Deleting the Family (#231): its founder deletes it on `/delete`. Who gets in is as on `/cancel`
 * (`contract-visit.ts`).
 *
 * - Only the Family's founder sees the form; another Admin reads who that is, and a Family without
 *   a recorded founder gets the support's address.
 * - A sign-in at Logto older than 10 minutes is made again before the page is shown and before
 *   anything is deleted: central sign-in asks Logto for one no older.
 * - Nothing happens unless the form is ticked.
 * - A running Subscription that is not ending yet is cancelled to its earliest date first, as on
 *   `/cancel`; its record stays. If Stripe does not take that, nothing is deleted.
 * - Then the Family is deleted as `routing delete` does (`delete-family.ts`), which also tells its
 *   Admins. A run that fails after the Family is marked deleted is logged, and an Operator finishes
 *   it with `routing delete`; the person is signed out all the same.
 * - In the end the browser ends Logto's session and is at the landing page.
 */
import { endDatesOf } from "./cancel-dates";
import type { FamilyDeletedMailValues } from "./contract-mails";
import { deleteFailedPage, deletePage, deleterPage, noDeleterPage, UNDERSTOOD_FIELD } from "./contract-pages";
import {
  admitted,
  cancellableOf,
  familyOf,
  html,
  instantOf,
  nameOf,
  notedOf,
  redirect,
  settlementOf,
  statusOf,
  underFamilyLock,
  type Admitted,
  type ContractAnswer,
  type ContractRequest,
  type ContractSetup,
} from "./contract-visit";
import { CONTRACT_PATHS, type Language } from "./contract-wording";
import { deleteFamilyAndTell } from "./delete-family";
import { directory as directoryOn, type DirectoryEntry } from "./directory";
import { founderOf } from "./founder";
import { reasonOf } from "./log";
import { person } from "./logto-management";
import { noAccessPage } from "./order-pages";
import { signInPathFor } from "./routing-pages";
import { isFreshSignIn, type RoutingSession } from "./routing-session";
import type { FamilySchedules } from "./scheduler";
import { SIGN_OUT_PATH } from "./sign-in-pages";
import { hasEnded, recordOf } from "./stripe-subscription";
import { isWithinWithdrawalPeriod, withdrawalPeriodEnd } from "./withdrawal-period";

/** What deleting works with: what the contract pages do, and the Family's schedules to remove. */
export type DeleteSetup = ContractSetup & { schedules: FamilySchedules };

/** The founder's visit, signed in freshly. */
type Visit = { setup: DeleteSetup; language: Language; entry: DirectoryEntry; session: RoutingSession; now: Date };

/** Answers a request for `/delete`. */
export async function answerDelete(request: ContractRequest, setup: DeleteSetup): Promise<ContractAnswer> {
  const { language } = request;
  const letIn = await admitted(request, setup, "delete", deleteFailedPage);
  if ("status" in letIn) return letIn;
  if (!isFreshSignIn(letIn.session, letIn.now)) return redirect(letIn.form ? 303 : 302, signInPathFor(CONTRACT_PATHS.delete[language]));
  const visit = await visitOf(setup, language, letIn);
  if ("status" in visit) return visit;
  if (!letIn.form) return shown(visit, 200);
  return letIn.form.get(UNDERSTOOD_FIELD) === "on" ? deleted(visit) : shown(visit, 400);
}

/** The founder's visit; for everybody else, why there is no form for them. A founder Logto knows no more is none. */
async function visitOf(setup: DeleteSetup, language: Language, { session, now, form }: Admitted): Promise<Visit | ContractAnswer> {
  const refused = (page: string): ContractAnswer => html(statusOf(form, 403), page);
  const entry = await familyOf(setup, session);
  if (!entry) return html(403, noAccessPage(language));
  const founder = await founderOf(setup, entry.familyId);
  const deleter = founder ? await person(setup.idp, founder) : undefined;
  if (!founder || !deleter) return refused(noDeleterPage(language, entry.familyId));
  if (founder !== session.userId) return refused(deleterPage(language, entry.familyId, nameOf(deleter, founder)));
  return { setup, language, entry, session, now };
}

/** `/delete`: the form, with what deleting does to a running Subscription, and the way to withdraw from it while its holder still can. */
async function shown({ setup, language, entry, session, now }: Visit, status: number): Promise<ContractAnswer> {
  const record = await setup.directory.subscriptionOf(entry.familyId);
  const orderedAt = record?.holder === session.userId ? record.orderedAt : null;
  const subscription = record && { withdrawalPeriodEndsOn: orderedAt && isWithinWithdrawalPeriod(orderedAt, now) ? withdrawalPeriodEnd(orderedAt) : null };
  const exportHref = `${setup.config.publicUrl}/${entry.familyId}/admin/export/download`;
  return html(status, deletePage(language, { exportHref, subscription, csrf: session.csrf }));
}

/** Cancels the running Subscription, deletes the Family and signs the person out. */
async function deleted(visit: Visit): Promise<ContractAnswer> {
  const { setup, language, entry, session, now } = visit;
  const { familyId } = entry;
  const cancelled = await cancelledSubscription(visit).catch((error: unknown) => {
    setup.log.error("The Subscription could not be cancelled on /delete; nothing was deleted", { familyId, reason: reasonOf(error) });
    return undefined;
  });
  if (cancelled === undefined) return html(502, deleteFailedPage(language, familyId));
  const client = await setup.directoryPool.connect();
  try {
    const { config, schedules, log } = setup;
    await deleteFamilyAndTell({ config, client, directory: directoryOn(client), schedules, log }, familyId, { by: { admin: session.userId }, at: now, subscription: cancelled });
    client.release();
  } catch (error) {
    client.release(true);
    const marked = (await setup.directory.find(familyId).catch(() => undefined))?.status === "deleted";
    setup.log.error(marked ? "Deleting the Family on /delete failed part-way; `routing delete` finishes it" : "The Family could not be deleted on /delete; nothing was deleted", { familyId, reason: reasonOf(error) });
    if (!marked) return html(502, deleteFailedPage(language, familyId));
  }
  return redirect(303, SIGN_OUT_PATH);
}

/**
 * Under the Family's lock: the end of its running Subscription and what that pays back, for the
 * mail; null if none runs. One that is not ending yet is cancelled to its earliest date, which the
 * Directory keeps; a pending Cancellation stays as it is.
 */
function cancelledSubscription({ setup, entry, now }: Visit): Promise<FamilyDeletedMailValues["subscription"]> {
  return underFamilyLock(setup.directoryPool, entry.familyId, async (client) => {
    const directory = directoryOn(client);
    const record = await directory.subscriptionOf(entry.familyId);
    if (!record) return null;
    const subscription = await setup.stripe.subscription(record.subscriptionId);
    if (hasEnded(subscription)) return null;
    const pending = instantOf(subscription.cancel_at);
    if (pending) return { endsOn: pending, settlement: settlementOf(subscription) };
    const { billing } = recordOf(subscription, record);
    if (billing === null) throw new Error(`The Subscription ${subscription.id} has no billing the Tariff knows`);
    const [earliest] = endDatesOf(cancellableOf(subscription, billing, entry, now), now);
    const taken = await setup.stripe.setEnd(subscription.id, earliest.end, notedOf(earliest, now), `delete:${subscription.id}:${earliest.end.getTime()}:${now.getTime()}`);
    await directory.saveSubscription(recordOf(taken, record));
    setup.log.info("Deleting the Family cancelled its Subscription", { familyId: entry.familyId, subscription: subscription.id, endsOn: earliest.end.toISOString() });
    return { endsOn: earliest.end, settlement: earliest.settlement };
  });
}
