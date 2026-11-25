/**
 * The Withdrawal (#230): the Contract holder withdraws from the Subscription on `/withdraw`, as
 * § 356a BGB asks for. Who gets in and who sees the form is as on `/cancel` (`contract-visit.ts`),
 * and no Family without a recorded founder gets the form.
 *
 * - Within the withdrawal period (`withdrawal-period.ts`) the Subscription ends at once at Stripe,
 *   without proration or a last invoice, and everything paid for it is refunded. The Family is
 *   Locked once Stripe tells of the end (`stripe-events.ts`).
 * - After the period the declaration is an ordinary Cancellation to the earliest date, settled as
 *   on `/cancel`. A Cancellation pending to that date or an earlier one stays as it is.
 * - Either way the page shows the receipt, and the holder gets the mail in their language, only
 *   once Stripe took it; if it did not, nothing is recorded and no mail goes out.
 * - The Subscription notes when the Withdrawal came in, before anything else is asked of Stripe.
 *   A form posted again finds that note: it is one Withdrawal, one refund and one mail, and it
 *   finishes what a failure of Stripe left undone.
 */
import type pg from "pg";
import { endDatesOf, type EndDate } from "./cancel-dates";
import { withdrawalMail, type WithdrawalMailValues } from "./contract-mails";
import { noWithdrawHolderPage, nothingToWithdrawPage, withdrawFailedPage, withdrawHolderPage, withdrawPage, withdrawReceiptPage } from "./contract-pages";
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
  runs,
  underFamilyLock,
  type Admitted,
  type ContractAnswer,
  type ContractRequest,
  type ContractSetup,
} from "./contract-visit";
import { mailLanguageOf, type Contract, type Language, type Person } from "./contract-wording";
import { directory as directoryOn, inTransaction, type DirectoryEntry, type Subscription } from "./directory";
import { founderOf } from "./founder";
import { reasonOf } from "./log";
import { person, type LogtoPerson } from "./logto-management";
import { noAccessPage } from "./order-pages";
import { outbox } from "./outbox";
import type { StripeSubscription } from "./stripe";
import { hasEnded, recordOf, WITHDRAWAL_RECEIVED_AT } from "./stripe-subscription";
import { isWithinWithdrawalPeriod, withdrawalPeriodEnd } from "./withdrawal-period";

/** The mail's type in the outbox. */
const MAIL_TYPE = "withdrawal";

/** The holder's visit: their Subscription as the Directory keeps it, and who they are at Logto. */
type Visit = { setup: ContractSetup; language: Language; entry: DirectoryEntry; record: Subscription; holder: LogtoPerson; csrf: string; now: Date };

/** The Subscription as Stripe has it now, and the contract it is. */
type Live = { subscription: StripeSubscription; contract: Contract };

/** A Withdrawal: the Subscription it is from, and when it came in. */
type Withdrawal = Live & { receivedAt: Date };

/** Answers a request for `/withdraw`. */
export async function answerWithdraw(request: ContractRequest, setup: ContractSetup): Promise<ContractAnswer> {
  const { language } = request;
  const letIn = await admitted(request, setup, "withdraw", withdrawFailedPage);
  if ("status" in letIn) return letIn;
  const visit = await visitOf(setup, language, letIn);
  if ("status" in visit) return visit;
  return letIn.form ? declared(visit) : shown(visit);
}

/** The Contract holder's visit; for everybody else, why there is no form for them. */
async function visitOf(setup: ContractSetup, language: Language, { session, now, form }: Admitted): Promise<Visit | ContractAnswer> {
  const posted = form !== null;
  const entry = await setup.directory.findByOrganization(session.organizationId);
  if (!entry || !runs(entry) || !(await isAdmin(setup, session))) return html(403, noAccessPage(language));
  if (!(await founderOf(setup, entry.familyId))) return html(posted ? 403 : 200, noWithdrawHolderPage(language));
  const record = await setup.directory.lastSubscriptionOf(entry.familyId);
  if (!record) return html(posted ? 409 : 200, nothingToWithdrawPage(language));
  const holder = await person(setup.idp, record.holder);
  if (!holder) throw new Error(`The holder ${record.holder} of a Subscription is gone from Logto`);
  if (record.holder !== session.userId) return html(posted ? 403 : 200, withdrawHolderPage(language, nameOf(holder, record.holder)));
  return { setup, language, entry, record, holder, csrf: session.csrf, now };
}

/** The holder as the pages and the mail name them. */
const personOf = ({ record, holder }: Visit): Person => ({ name: nameOf(holder, record.holder), email: holder.email ?? "" });

/** `/withdraw`: the form, while the Subscription runs. */
async function shown(visit: Visit): Promise<ContractAnswer> {
  const { language, csrf } = visit;
  const live = await liveOf(visit).catch((error: unknown) => failed(visit, error));
  if (!live) return html(200, nothingToWithdrawPage(language));
  if ("headers" in live) return live;
  if (hasEnded(live.subscription)) return html(200, nothingToWithdrawPage(language));
  return html(200, withdrawPage(language, { holder: personOf(visit), contract: live.contract, csrf }));
}

/** The Subscription at Stripe, ended or not; undefined if it is none the Tariff knows the billing of. */
async function liveOf({ setup, entry, record, now }: Visit): Promise<Live | undefined> {
  const subscription = await setup.stripe.subscription(record.subscriptionId);
  const { billing, orderedAt } = recordOf(subscription, record);
  if (billing === null) return undefined;
  return { subscription, contract: { billing, familyName: await familyNameOf(setup, entry), orderedOn: orderedAt ?? record.orderedAt ?? now } };
}

/** What the posted form declares, under the Family's lock: a Withdrawal that came in when the Subscription first noted one, else now. */
function declared(visit: Visit): Promise<ContractAnswer> {
  return underFamilyLock(visit.setup.directoryPool, visit.entry.familyId, async (client) => {
    const live = await liveOf(visit).catch((error: unknown) => failed(visit, error));
    if (!live) return html(409, nothingToWithdrawPage(visit.language));
    if ("headers" in live) return live;
    const noted = notedAt(live.subscription, WITHDRAWAL_RECEIVED_AT);
    const withdrawal = { ...live, receivedAt: noted ?? visit.now };
    const within = isWithinWithdrawalPeriod(live.contract.orderedOn, withdrawal.receivedAt);
    const taken = await (within ? withdrawn(visit, client, withdrawal, noted !== null) : cancelled(visit, client, withdrawal, noted !== null)).catch((error: unknown) => failed(visit, error));
    return taken ?? html(409, nothingToWithdrawPage(visit.language));
  });
}

/**
 * Within the period: ends the Subscription at once and refunds all that was paid. One that has
 * ended already was ended by a Withdrawal only if it notes one; that one is finished here unless
 * its mail is out. Undefined if there is nothing to withdraw from.
 */
async function withdrawn(visit: Visit, client: pg.PoolClient, withdrawal: Withdrawal, noted: boolean): Promise<ContractAnswer | undefined> {
  const { setup, record } = visit;
  const { subscription, receivedAt } = withdrawal;
  const ended = hasEnded(subscription);
  if (ended && !noted) return undefined;
  if (ended && (await outbox(client).holds({ type: MAIL_TYPE, familyId: record.familyId }, record.orderedAt ?? new Date(0)))) return receipt(visit, withdrawal);
  if (!noted) await setup.stripe.addMetadata(subscription.id, { [WITHDRAWAL_RECEIVED_AT]: receivedAt.toISOString() });
  const taken = ended ? subscription : await setup.stripe.cancelSubscription(subscription.id);
  const refundCents = await setup.stripe.refundSubscription(subscription.id);
  await recorded(visit, client, taken, withdrawal, { case: "within", refundCents });
  setup.log.info("Took a Withdrawal within its period", { familyId: record.familyId, subscription: subscription.id, refundCents });
  return receipt(visit, withdrawal);
}

/**
 * After the period: an ordinary Cancellation to the earliest date. One the Subscription notes
 * already is not taken twice, and a Cancellation pending to no later date stays as it is.
 * Undefined if the Subscription has ended.
 */
async function cancelled(visit: Visit, client: pg.PoolClient, withdrawal: Withdrawal, noted: boolean): Promise<ContractAnswer | undefined> {
  const { setup, entry, record, now } = visit;
  const { subscription, contract } = withdrawal;
  if (hasEnded(subscription)) return undefined;
  const pending = instantOf(subscription.cancel_at);
  if (noted && pending) return receipt(visit, withdrawal);
  const endDates = endDatesOf(cancellableOf(subscription, contract.billing, entry, now), now);
  const { end, settlement, metadata } = endOf(endDates, pending, now);
  const note = { ...metadata, [WITHDRAWAL_RECEIVED_AT]: now.toISOString() };
  const taken = await setup.stripe.setEnd(subscription.id, end, note, `withdraw:${subscription.id}:${end.getTime()}:${now.getTime()}`);
  await recorded(visit, client, taken, withdrawal, { case: "after", endedOn: withdrawalPeriodEnd(contract.orderedOn), endsOn: end, settlement });
  setup.log.info("Took a Withdrawal after its period as a Cancellation", { familyId: record.familyId, subscription: subscription.id, endsOn: end.toISOString() });
  return receipt(visit, withdrawal);
}

/**
 * The end the Subscription gets, and what it notes of it: the earliest date, unless a Cancellation
 * is pending to that date or an earlier one, which then keeps what it noted.
 */
function endOf([earliest, ...later]: [EndDate, ...EndDate[]], pending: Date | null, now: Date): EndDate & { metadata: Record<string, string> } {
  if (pending === null || pending > earliest.end) return { ...earliest, metadata: notedOf(earliest, now) };
  const offered = [earliest, ...later].find(({ end }) => end.getTime() === pending.getTime());
  return { end: pending, settlement: offered?.settlement ?? { case: "plain" }, metadata: {} };
}

/** Keeps the Subscription as Stripe has it now, and puts the mail to the holder in the outbox, in one transaction. */
async function recorded(visit: Visit, client: pg.PoolClient, taken: StripeSubscription, { contract, receivedAt }: Withdrawal, period: WithdrawalMailValues["period"]): Promise<void> {
  const { setup, record } = visit;
  const recipient = personOf(visit);
  const mail = recipient.email === "" ? undefined : withdrawalMail(mailLanguageOf(visit.holder.locale), { recipient, contract, receivedAt, period }, setup.imprint);
  if (!mail) setup.log.error("The holder of a withdrawn Subscription has no email address", { familyId: record.familyId });
  await inTransaction(client, async () => {
    await directoryOn(client).saveSubscription(recordOf(taken, record));
    if (mail) await outbox(client).enqueue(mail, { type: MAIL_TYPE, familyId: record.familyId });
  });
}

const receipt = (visit: Visit, { contract, receivedAt }: Withdrawal): ContractAnswer =>
  html(200, withdrawReceiptPage(visit.language, { holder: personOf(visit), contract, receivedAt }));

/** Stripe did not answer or refused: the page says to try again. */
function failed({ setup, language, record }: Visit, error: unknown): ContractAnswer {
  setup.log.error("Stripe did not take a request of /withdraw", { familyId: record.familyId, subscription: record.subscriptionId, reason: reasonOf(error) });
  return html(502, withdrawFailedPage(language));
}
