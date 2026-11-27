/**
 * The Cancellation (#229): the Contract holder cancels the Subscription on `/cancel`, to the end of
 * a billing period they choose, and may take that back until then.
 *
 * - Without a session the browser goes to central sign-in and comes back.
 * - Only an Admin of the Family sees anything, and only the Contract holder the form: another Admin
 *   reads who the holder is.
 * - A form counts only with the session's token.
 * - The end dates are worked out anew when the form comes in, from the Subscription as Stripe has
 *   it, and under the Family's lock: a form posted twice is one Cancellation and one mail.
 * - Stripe ends the Subscription at exactly the chosen date and prorates nothing. Only once it took
 *   that, the Directory keeps it and the confirmation goes to the holder; if it did not, nothing is
 *   recorded and no mail goes out.
 * - What a yearly Subscription pays back is noted at the Subscription, and paid when it ends
 *   (`stripe-events.ts`). Taking the Cancellation back drops the note and sends no mail.
 */
import type pg from "pg";
import { endDatesOf, type EndDate } from "./cancel-dates";
import { cancellationMail } from "./contract-mails";
import { cancelFailedPage, cancelHolderPage, cancelledPage, cancelPage, cancelReceiptPage, END_DATE_FIELD, nothingToCancelPage, UNDO_FIELD } from "./contract-pages";
import {
  admitted,
  cancellableOf,
  familyNameOf,
  html,
  instantOf,
  isAdmin,
  nameOf,
  notedAt,
  notedOf,
  redirect,
  runs,
  underFamilyLock,
  type ContractAnswer,
  type ContractRequest,
  type ContractSetup,
} from "./contract-visit";
import { CONTRACT_PATHS, mailLanguageOf, type Contract, type Language, type Person } from "./contract-wording";
import { directory as directoryOn, inTransaction, type DirectoryEntry, type Subscription } from "./directory";
import { reasonOf } from "./log";
import { person, type LogtoPerson } from "./logto-management";
import { noAccessPage } from "./order-pages";
import { outbox } from "./outbox";
import type { RoutingSession } from "./routing-session";
import type { StripeSubscription } from "./stripe";
import { CANCELLATION_RECEIVED_AT, CANCELLATION_REFUND_CENTS, hasEnded, recordOf, WITHDRAWAL_RECEIVED_AT } from "./stripe-subscription";

/** What the Cancellation works with. */
export type CancelSetup = ContractSetup;

/** A browser's request for `/cancel`. */
export type CancelRequest = ContractRequest;

/** The Router's answer. */
export type CancelAnswer = ContractAnswer;

/** The holder's visit: their running Subscription as the Directory keeps it, and who they are at Logto. */
type Visit = { setup: CancelSetup; language: Language; entry: DirectoryEntry; record: Subscription; holder: LogtoPerson; csrf: string; now: Date };

/** The Subscription as Stripe has it now, and what follows from it. */
type Live = { subscription: StripeSubscription; contract: Contract; endDates: [EndDate, ...EndDate[]] };

/** Answers a request for `/cancel`. */
export async function answerCancel(request: CancelRequest, setup: CancelSetup): Promise<CancelAnswer> {
  const { language } = request;
  const letIn = await admitted(request, setup, "cancel", cancelFailedPage);
  if ("status" in letIn) return letIn;
  const { session, now, form } = letIn;
  if (!form) return answerVisit(setup, language, session, now, 200, shown);
  return answerVisit(setup, language, session, now, 403, (visit) => declared(visit, form));
}

/** Answers the Contract holder by `answer`, and everybody else with why there is no form for them; another Admin with `other`. */
async function answerVisit(setup: CancelSetup, language: Language, session: RoutingSession, now: Date, other: 200 | 403, answer: (visit: Visit) => Promise<CancelAnswer>): Promise<CancelAnswer> {
  const entry = await setup.directory.findByOrganization(session.organizationId);
  if (!entry || !runs(entry) || !(await isAdmin(setup, session))) return html(403, noAccessPage(language));
  const record = await setup.directory.subscriptionOf(entry.familyId);
  if (!record) return html(200, nothingToCancelPage(language, entry.familyId));
  const holder = await person(setup.idp, record.holder);
  if (!holder) throw new Error(`The holder ${record.holder} of a Subscription is gone from Logto`);
  if (record.holder !== session.userId) return html(other, cancelHolderPage(language, entry.familyId, nameOf(holder, record.holder)));
  return answer({ setup, language, entry, record, holder, csrf: session.csrf, now });
}

/** The holder as the pages and the mail name them. */
const personOf = ({ record, holder }: Visit): Person => ({ name: nameOf(holder, record.holder), email: holder.email ?? "" });

/** `/cancel`: the form, or the pending Cancellation with the button that takes it back. */
async function shown(visit: Visit): Promise<CancelAnswer> {
  const { language, csrf, entry } = visit;
  const live = await liveOf(visit).catch((error: unknown) => failed(visit, error));
  if (!live) return html(200, nothingToCancelPage(language, entry.familyId));
  if ("headers" in live) return live;
  const endsOn = instantOf(live.subscription.cancel_at);
  if (endsOn) return html(200, cancelledPage(language, entry.familyId, { endsOn, csrf }));
  return html(200, formOf(visit, live));
}

function formOf(visit: Visit, { contract, endDates }: Live): string {
  const [first, ...later] = endDates;
  return cancelPage(visit.language, { holder: personOf(visit), contract, endDates: [first.end, ...later.map(({ end }) => end)], csrf: visit.csrf });
}

/** The Subscription at Stripe; undefined if it has ended there, or is none the Tariff knows the billing of. */
async function liveOf({ setup, entry, record, now }: Visit): Promise<Live | undefined> {
  const subscription = await setup.stripe.subscription(record.subscriptionId);
  const { billing, orderedAt } = recordOf(subscription, record);
  if (hasEnded(subscription) || billing === null) return undefined;
  const contract = { billing, familyName: await familyNameOf(setup, entry), orderedOn: orderedAt ?? record.orderedAt ?? now };
  return { subscription, contract, endDates: endDatesOf(cancellableOf(subscription, billing, entry, now), now) };
}

/** What a posted form declares, under the Family's lock. */
function declared(visit: Visit, form: URLSearchParams): Promise<CancelAnswer> {
  return underFamilyLock(visit.setup.directoryPool, visit.entry.familyId, async (client) => {
    const live = await liveOf(visit).catch((error: unknown) => failed(visit, error));
    if (!live) return html(409, nothingToCancelPage(visit.language, visit.entry.familyId));
    if ("headers" in live) return live;
    return form.has(UNDO_FIELD) ? undone(visit, client, live) : cancelled(visit, client, live, form.get(END_DATE_FIELD));
  });
}

/** The Cancellation to the posted end date, if that is one of those offered now. */
async function cancelled(visit: Visit, client: pg.PoolClient, live: Live, posted: string | null): Promise<CancelAnswer> {
  const { setup, language, record, now } = visit;
  const { subscription, contract } = live;
  const pending = instantOf(subscription.cancel_at);
  if (pending) return alreadyCancelled(visit, live, pending, posted);
  const chosen = live.endDates.find(({ end }) => end.toISOString() === posted);
  if (!chosen) return html(400, formOf(visit, live));
  const { end } = chosen;
  const taken = await setup.stripe.setEnd(subscription.id, end, notedOf(chosen, now), `cancel:${subscription.id}:${end.getTime()}:${now.getTime()}`).catch((error: unknown) => failed(visit, error));
  if ("headers" in taken) return taken;
  const mail = confirmationOf(visit, contract, chosen);
  await inTransaction(client, async () => {
    await directoryOn(client).saveSubscription(recordOf(taken, record));
    if (mail) await outbox(client).enqueue(mail, { type: "cancellation", familyId: record.familyId });
  });
  setup.log.info("Took a Cancellation", { familyId: record.familyId, subscription: subscription.id, endsOn: end.toISOString() });
  return html(200, cancelReceiptPage(language, record.familyId, { holder: personOf(visit), contract, receivedAt: now, endsOn: end }));
}

/** The confirmation to the holder, in their language; none, and a line in the log, if Logto has no address of theirs. */
function confirmationOf(visit: Visit, contract: Contract, { end, settlement }: EndDate) {
  const { setup, record, now } = visit;
  const recipient = personOf(visit);
  if (recipient.email !== "") return cancellationMail(mailLanguageOf(visit.holder.locale), { recipient, contract, receivedAt: now, endsOn: end, settlement }, setup.imprint);
  setup.log.error("The holder of a cancelled Subscription has no email address", { familyId: record.familyId });
  return undefined;
}

/** A form posted again shows the receipt it had before; any other end date, the Cancellation that is pending. */
function alreadyCancelled(visit: Visit, { subscription, contract }: Live, endsOn: Date, posted: string | null): CancelAnswer {
  const { language, now, record } = visit;
  if (endsOn.toISOString() !== posted) return redirect(303, CONTRACT_PATHS.cancel[language]);
  const receivedAt = notedAt(subscription, CANCELLATION_RECEIVED_AT) ?? now;
  return html(200, cancelReceiptPage(language, record.familyId, { holder: personOf(visit), contract, receivedAt, endsOn }));
}

/** Takes the pending Cancellation back, and with it what its end would have paid back. */
async function undone(visit: Visit, client: pg.PoolClient, { subscription }: Live): Promise<CancelAnswer> {
  const { setup, language, record, now } = visit;
  if (subscription.cancel_at !== null) {
    const noted = { [CANCELLATION_RECEIVED_AT]: "", [CANCELLATION_REFUND_CENTS]: "", [WITHDRAWAL_RECEIVED_AT]: "" };
    const taken = await setup.stripe.setEnd(subscription.id, null, noted, `undo:${subscription.id}:${subscription.cancel_at}:${now.getTime()}`).catch((error: unknown) => failed(visit, error));
    if ("headers" in taken) return taken;
    await directoryOn(client).saveSubscription(recordOf(taken, record));
    setup.log.info("Took a Cancellation back", { familyId: record.familyId, subscription: subscription.id });
  }
  return redirect(303, CONTRACT_PATHS.cancel[language]);
}

/** Stripe did not answer or refused: nothing is recorded, and the page says so. */
function failed({ setup, language, record }: Visit, error: unknown): CancelAnswer {
  setup.log.error("Stripe did not take a request of /cancel", { familyId: record.familyId, subscription: record.subscriptionId, reason: reasonOf(error) });
  return html(502, cancelFailedPage(language, record.familyId));
}
