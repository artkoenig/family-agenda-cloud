/**
 * What Stripe's events and Subscriptions say (#227): which Subscription an event is about, whose
 * Family's it is, and what the Directory keeps of it. No I/O.
 */
import type Stripe from "stripe";
import type { Billing } from "./contract-wording";
import type { Subscription } from "./directory";
import { idOf, type StripeSubscription } from "./stripe";

/** The Checkout Session of an order that came in, as far as its confirmation needs it. */
export type CompletedSession = Pick<Stripe.Checkout.Session, "locale" | "customer_details"> & {
  /** Whether the order was paid at once. */
  paidAtOnce: boolean;
};

/** What an event is about: a Subscription, and the Session it was ordered in if the order just came in. */
export type Notice = { subscriptionId: string; session: CompletedSession | null };

/** What the event is about; undefined if the Routing module does nothing on it. */
export function noticeOf(event: Stripe.Event): Notice | undefined {
  switch (event.type) {
    case "checkout.session.completed":
      return noticeOfSession(event.data.object);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return { subscriptionId: event.data.object.id, session: null };
    case "invoice.paid":
    case "invoice.payment_failed":
      return noticeOfInvoice(event.data.object);
    default:
      return undefined;
  }
}

function noticeOfSession({ subscription, invoice, locale, customer_details }: Stripe.Checkout.Session): Notice | undefined {
  return subscription === null ? undefined : { subscriptionId: idOf(subscription), session: { locale, customer_details, paidAtOnce: invoice !== null } };
}

function noticeOfInvoice({ parent }: Stripe.Invoice): Notice | undefined {
  const subscription = parent?.subscription_details?.subscription;
  return subscription ? { subscriptionId: idOf(subscription), session: null } : undefined;
}

/** The Family the Subscription was ordered for and its Contract holder, as the order named them in its metadata. */
export type Orderer = { familyId: string; holder: string };

const FAMILY_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Who ordered the Subscription; undefined if it was no order of a Family's. */
export function ordererOf({ metadata: { familyId, holder } }: StripeSubscription): Orderer | undefined {
  return familyId !== undefined && FAMILY_ID.test(familyId) && holder ? { familyId, holder } : undefined;
}

/** The metadata of a Subscription ordered beside a running one. */
export const DUPLICATE = { duplicate: "true" };

export const isDuplicate = ({ metadata }: StripeSubscription): boolean => metadata.duplicate === DUPLICATE.duplicate;

/** Whether the Subscription has ended for good, so that it cannot be cancelled any more. */
export const hasEnded = ({ status }: StripeSubscription): boolean => status === "canceled" || status === "incomplete_expired";

/** Which of two Subscriptions was ordered later. */
export function newerOf(one: StripeSubscription, other: StripeSubscription): StripeSubscription {
  if (one.created !== other.created) return one.created > other.created ? one : other;
  return one.id > other.id ? one : other;
}

/** Only Stripe's seconds; nothing for what it does not tell. */
const instantOf = (seconds: number | null | undefined): Date | null => (typeof seconds === "number" ? new Date(seconds * 1000) : null);

const BILLING: Partial<Record<string, Billing>> = { month: "monthly", year: "yearly" };

/** What the Directory keeps of the Subscription. */
export function recordOf(subscription: StripeSubscription, { familyId, holder }: Orderer): Omit<Subscription, "confirmationSentAt"> {
  const [item] = subscription.items.data;
  return {
    subscriptionId: subscription.id,
    familyId,
    customerId: idOf(subscription.customer),
    holder,
    billing: BILLING[item?.price.recurring?.interval ?? ""] ?? null,
    status: subscription.status,
    orderedAt: instantOf(subscription.created),
    trialEnd: instantOf(subscription.trial_end),
    currentPeriodEnd: instantOf(item?.current_period_end),
    cancelAt: instantOf(subscription.cancel_at),
    endedAt: instantOf(subscription.ended_at),
  };
}

/**
 * When the order is first paid: at once, or at the Subscription's anchor. The anchor alone does not
 * tell: Stripe charges at once for a Checkout paid after its anchor, and moves it a period on.
 */
export function firstPaymentOf({ created, billing_cycle_anchor }: StripeSubscription, { paidAtOnce }: CompletedSession): Date {
  return new Date((paidAtOnce ? created : billing_cycle_anchor) * 1000);
}

/** What the Subscription's metadata notes of a pending Cancellation (#229): when it came in, and what its end pays back. */
export const CANCELLATION_RECEIVED_AT = "cancellationReceivedAt";
export const CANCELLATION_REFUND_CENTS = "cancellationRefundCents";

/**
 * The cents to pay back now that the Subscription has ended: what its Cancellation noted, if it ended
 * by that and not earlier, as for a payment that failed. 0 if there is nothing to pay back.
 */
export function unusedCentsOf({ status, cancel_at, ended_at, metadata }: StripeSubscription): number {
  const cents = Number(metadata[CANCELLATION_REFUND_CENTS] ?? "");
  const endedByCancellation = status === "canceled" && cancel_at !== null && ended_at !== null && ended_at >= cancel_at;
  return endedByCancellation && Number.isInteger(cents) && cents > 0 ? cents : 0;
}
