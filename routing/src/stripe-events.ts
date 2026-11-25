/**
 * Stripe's webhook (#227): how a Family becomes and stays a paying one after its order. Each event
 * names a Subscription, which is read anew from Stripe, so that events delivered twice or out of
 * order all end in its current state: the Directory keeps it, and the Family's lock follows it.
 *
 * - `active` unlocks the Family, `unpaid` locks it and mails the Contract holder once, and
 *   `canceled` locks it; any other status leaves it as it is.
 * - A completed Checkout sends the contract confirmation of § 312f BGB, once per Subscription.
 * - Of two running Subscriptions of a Family, the newer one is cancelled and refunded.
 *
 * An event is noted as handled once all of it is done: until then it is answered 5xx, and Stripe
 * delivers it again.
 */
import type pg from "pg";
import type Stripe from "stripe";
import { mailLanguageOf, type Person } from "./contract-wording";
import type { Config, StripeSettings } from "./config";
import { confirmationMail } from "./confirmation-mail";
import { inTransaction, isRunning, type DirectoryEntry } from "./directory";
import { lockFamily, unlockFamily } from "./family-status";
import { confirmationLegalTexts } from "./legal-site";
import { reasonOf, type Log } from "./log";
import { person, type IdpManagement, type LogtoPerson } from "./logto-management";
import { organizations } from "./organizations";
import { outbox } from "./outbox";
import type { Resolve } from "./pool";
import { provisioning, withFamilyLock, type ScheduledProvisioning } from "./provisioning";
import type { FamilySchedules } from "./scheduler";
import { signedEvent, type StripePort, type StripeSubscription } from "./stripe";
import { DUPLICATE, firstPaymentOf, hasEnded, isDuplicate, newerOf, noticeOf, ordererOf, recordOf, unusedCentsOf, type CompletedSession, type Notice, type Orderer } from "./stripe-subscription";
import { unpaidMail } from "./unpaid-mail";

/** What the webhook works with. */
export type StripeEventsSetup = {
  config: Config;
  settings: Pick<StripeSettings, "webhookSecret" | "imprint">;
  idp: IdpManagement;
  stripe: StripePort;
  schedules: FamilySchedules;
  directoryPool: pg.Pool;
  log: Log;
  resolve: Resolve;
  now: () => Date;
};

/** A request to the webhook; `body` reads what is posted, undefined if that is too long. */
export type StripeEventRequest = { method: string | undefined; signature: string | undefined; body: () => Promise<Buffer | undefined> };

export type StripeEventAnswer = { status: number; headers: Record<string, string>; body: string };

const said = (status: number, body: string, headers: Record<string, string> = {}): StripeEventAnswer => ({
  status,
  headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers },
  body: `${body}\n`,
});

/** Answers a request to the webhook: 2xx once the event is handled, or if there is nothing to do on it. */
export async function answerStripeEvent(request: StripeEventRequest, setup: StripeEventsSetup): Promise<StripeEventAnswer> {
  if (request.method !== "POST") return said(405, "POST only", { allow: "POST" });
  const body = await request.body();
  if (!body) return said(413, "Too long");
  const event = signedEvent(body, request.signature ?? "", setup.settings.webhookSecret);
  if (!event) {
    setup.log.error("A Stripe event was refused", { reason: "unsigned" });
    return said(400, "Not signed by Stripe");
  }
  const notice = noticeOf(event);
  if (!notice) return said(200, "Nothing to do");
  return handled(setup, event, notice);
}

/** Handles the event on a connection of its own: the Family's lock is the session's. */
async function handled(setup: StripeEventsSetup, event: Stripe.Event, notice: Notice): Promise<StripeEventAnswer> {
  const field = { event: event.id, type: event.type, subscription: notice.subscriptionId };
  const client = await setup.directoryPool.connect();
  try {
    await handle({ ...setup, work: { ...provisioning(setup.config, client, setup.log, setup.resolve), schedules: setup.schedules } }, event, notice);
    client.release();
  } catch (error) {
    client.release(true);
    setup.log.error("Handling a Stripe event failed; Stripe delivers it again", { ...field, reason: reasonOf(error) });
    return said(500, "Failed");
  }
  return said(200, "Handled");
}

type Handling = StripeEventsSetup & { work: ScheduledProvisioning };

/** The Family an event is about: its entry, who ordered its Subscription, and that as it is now at Stripe. */
type Case = { handling: Handling; entry: DirectoryEntry; orderer: Orderer; subscription: StripeSubscription };

async function handle(handling: Handling, event: Stripe.Event, { subscriptionId, session }: Notice): Promise<void> {
  const { stripe, log, work } = handling;
  const orderer = ordererOf(await stripe.subscription(subscriptionId));
  if (!orderer || !(await work.directory.find(orderer.familyId))) {
    log.error("A Stripe event is about a Subscription of no Family", { event: event.id, subscription: subscriptionId });
    return;
  }
  await withFamilyLock(work.client, orderer.familyId, async () => {
    if (await work.directory.isEventHandled(event.id)) return;
    await follow(handling, orderer, subscriptionId, session);
    await work.directory.recordEvent(event.id);
    log.info("Handled a Stripe event", { event: event.id, type: event.type, familyId: orderer.familyId });
  });
}

/** Lets the Directory and the Family follow the Subscription, under the Family's lock: read here, it is none before another event's. */
async function follow(handling: Handling, orderer: Orderer, subscriptionId: string, session: CompletedSession | null): Promise<void> {
  const { stripe, work } = handling;
  const found = await stripe.subscription(subscriptionId);
  const subscription = await withoutDuplicate(handling, orderer, found);
  const entry = await work.directory.find(orderer.familyId);
  if (!entry) throw new Error(`Family ${orderer.familyId} is gone from the Directory`);
  const at: Case = { handling, entry, orderer, subscription };
  await saved(at);
  if (isDuplicate(subscription)) return;
  await familyFollows(at);
  await unusedPaidBack(at);
  if (session) await confirm(at, session);
}

/** Pays back the unused months of a yearly Subscription that its Cancellation has ended (#229). */
async function unusedPaidBack({ handling, orderer, subscription }: Case): Promise<void> {
  const cents = unusedCentsOf(subscription);
  if (cents === 0) return;
  await handling.stripe.refundUnused(subscription.id, cents);
  handling.log.info("Paid back the unused months of a cancelled Subscription", { familyId: orderer.familyId, subscription: subscription.id, cents });
}

/**
 * Ends the newer one if the Family now has two running Subscriptions, the founder having completed
 * two Checkouts; answers this one as it is after that. A Subscription ended so is marked at Stripe,
 * so that a payment of it that only arrives later, as by SEPA, is refunded too.
 */
async function withoutDuplicate(handling: Handling, orderer: Orderer, subscription: StripeSubscription): Promise<StripeSubscription> {
  if (isDuplicate(subscription)) return undone(handling, subscription);
  const other = isRunning(subscription.status) ? await otherRunning(handling, orderer, subscription) : undefined;
  if (!other) return subscription;
  const newer = newerOf(subscription, other);
  handling.log.error("A Family has a second running Subscription; the newer one is cancelled and refunded", { familyId: orderer.familyId, subscription: newer.id });
  await handling.stripe.addMetadata(newer.id, DUPLICATE);
  const ended = await undone(handling, newer);
  if (newer === subscription) return { ...ended, metadata: { ...ended.metadata, ...DUPLICATE } };
  await handling.work.directory.saveSubscription(recordOf(ended, orderer));
  return subscription;
}

/** The Family's other running Subscription, as it is now at Stripe; the Directory keeps it if it runs no more. */
async function otherRunning({ stripe, work }: Handling, orderer: Orderer, { id }: StripeSubscription): Promise<StripeSubscription | undefined> {
  const recorded = await work.directory.subscriptionOf(orderer.familyId);
  if (!recorded || recorded.subscriptionId === id) return undefined;
  const other = await stripe.subscription(recorded.subscriptionId);
  if (isRunning(other.status)) return other;
  await work.directory.saveSubscription(recordOf(other, { familyId: recorded.familyId, holder: recorded.holder }));
  return undefined;
}

/** Cancels the Subscription, unless it has ended, and refunds it; answers it as it is then. */
async function undone({ stripe }: Handling, subscription: StripeSubscription): Promise<StripeSubscription> {
  const ended = hasEnded(subscription) ? subscription : await stripe.cancelSubscription(subscription.id);
  await stripe.refundSubscription(subscription.id);
  return ended;
}

/** Whether the Family has a Subscription running beside this one. */
async function anotherRuns({ handling, entry, subscription }: Case): Promise<boolean> {
  const running = await handling.work.directory.subscriptionOf(entry.familyId);
  return running !== null && running.subscriptionId !== subscription.id;
}

/** Keeps the Subscription in the Directory; one that just became `unpaid`, with the mail that says so. */
async function saved(at: Case): Promise<void> {
  const { handling, entry, orderer, subscription } = at;
  const { client, directory } = handling.work;
  const before = await directory.subscription(subscription.id);
  const mail = subscription.status === "unpaid" && before?.status !== "unpaid" && isLockable(entry) ? await lockMail(at) : undefined;
  await inTransaction(client, async () => {
    await directory.saveSubscription(recordOf(subscription, orderer));
    if (mail) await outbox(client).enqueue(mail, { type: "unpaid", familyId: entry.familyId });
  });
}

/** Whether the Family can be locked and unlocked: it is neither deleted nor being prepared. */
const isLockable = ({ status }: DirectoryEntry): boolean => status !== "deleted" && status !== "being_prepared";

/** Locks or unlocks the Family as the Subscription's status says. */
async function familyFollows(at: Case): Promise<void> {
  const { handling, entry, subscription } = at;
  const { work, log, now } = handling;
  const { familyId } = entry;
  if (!isLockable(entry)) {
    if (isRunning(subscription.status)) log.error("A Subscription runs of a Family that is deleted or not prepared", { familyId, subscription: subscription.id });
    return;
  }
  if (subscription.status === "active") await unlockFamily(work, familyId);
  if (subscription.status === "unpaid") await lockFamily(work, familyId, "unpaid", now());
  if (subscription.status === "canceled" && !(await anotherRuns(at))) await lockFamily(work, familyId, "subscription_ended", endOf(at));
}

const endOf = ({ handling, orderer, subscription }: Case): Date => recordOf(subscription, orderer).endedAt ?? handling.now();

/** The mail that the Family is locked as the Subscription is not paid; none if the holder has no address any more. */
async function lockMail(at: Case) {
  const { handling, entry } = at;
  const found = await person(handling.idp, at.orderer.holder);
  const holder = personOf(found, null);
  if (!holder) {
    handling.log.error("The holder of an unpaid Subscription has no email address", { familyId: entry.familyId });
    return undefined;
  }
  return unpaidMail(mailLanguageOf(found?.locale), { holder, familyName: await familyNameOf(at), lockedAt: entry.lockedAt ?? handling.now() }, handling.settings.imprint);
}

/** Sends the contract confirmation, unless it was sent or another Subscription runs, and has Stripe write its invoices in German. */
async function confirm(at: Case, session: CompletedSession): Promise<void> {
  const { handling, orderer, subscription } = at;
  const { client, directory } = handling.work;
  const record = recordOf(subscription, orderer);
  const sent = (await directory.subscription(subscription.id))?.confirmationSentAt ?? null;
  if (sent === null && !(await anotherRuns(at))) {
    const mail = await confirmationOf(at, session);
    if (mail) {
      await inTransaction(client, async () => {
        await outbox(client).enqueue(mail, { type: "confirmation", familyId: orderer.familyId });
        await directory.recordConfirmation(subscription.id, handling.now());
      });
    }
  }
  if (record.customerId !== null) await handling.stripe.setCustomerLocales(record.customerId, ["de"]);
}

/** The contract confirmation; none, which the Operator must see to, if it cannot say whose or which contract it is. */
async function confirmationOf(at: Case, session: CompletedSession) {
  const { handling, orderer, subscription } = at;
  const { billing, orderedAt } = recordOf(subscription, orderer);
  const holder = personOf(await person(handling.idp, orderer.holder), session.customer_details);
  if (!holder || billing === null) {
    handling.log.error("A contract confirmation could not be written", { familyId: orderer.familyId, subscription: subscription.id });
    return undefined;
  }
  const contract = { billing, familyName: await familyNameOf(at), orderedOn: orderedAt ?? handling.now() };
  return confirmationMail(mailLanguageOf(session.locale), { holder, contract, firstPaymentAt: firstPaymentOf(subscription, session) }, confirmationLegalTexts(), handling.settings.imprint);
}

/** The holder as a mail's recipient: as Logto keeps them, or else as they ordered; undefined without an address. */
function personOf(atLogto: LogtoPerson | undefined, ordered: Nameable | null): Person | undefined {
  const candidates: Nameable[] = [atLogto, ordered].filter((candidate) => candidate != null);
  const email = firstOf(candidates.map((candidate) => candidate.email));
  return email === undefined ? undefined : { email, name: firstOf(candidates.map(({ name }) => name)) ?? email };
}

type Nameable = { name: string | null; email: string | null };

const firstOf = (texts: (string | null)[]): string | undefined => texts.find((text) => text !== null) ?? undefined;

/** The Family's name: its Organization's, or its id if that is gone. */
async function familyNameOf({ handling, entry }: Case): Promise<string> {
  const name = entry.organizationId === null ? null : await organizations(handling.idp).name(entry.organizationId);
  return name ?? entry.familyId;
}
