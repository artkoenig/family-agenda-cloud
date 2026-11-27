/**
 * Stripe, as far as the Routing module calls it: behind a small port, which the tests answer
 * themselves (#226, #227).
 */
import Stripe from "stripe";
import type { StripeSettings } from "./config";
import type { Billing } from "./contract-wording";
import { priceFault, type TariffPrice } from "./order-session";

/** Stripe's Subscription, as far as the Routing module reads it. */
export type StripeSubscription = Pick<Stripe.Subscription, "id" | "status" | "created" | "billing_cycle_anchor" | "metadata" | "trial_end" | "cancel_at" | "ended_at"> & {
  customer: string | { id: string };
  items: { data: { current_period_end: number; price: { recurring: Pick<Stripe.Price.Recurring, "interval"> | null } }[] };
};

export type StripePort = {
  price(id: string): Promise<TariffPrice>;
  /** Creates the Session and answers the address of its Checkout. */
  createSession(params: Stripe.Checkout.SessionCreateParams): Promise<string>;
  /** The Family's Sessions that can still be paid. */
  openSessions(familyId: string): Promise<string[]>;
  /** Ends an open Session, so that it can no longer be paid. */
  expireSession(id: string): Promise<void>;
  /** The Subscription, as it is now. */
  subscription(id: string): Promise<StripeSubscription>;
  /** Adds to the Subscription's metadata. */
  addMetadata(subscriptionId: string, metadata: Record<string, string>): Promise<void>;
  /** Ends the Subscription at once, without a last invoice; answers it as it is then. */
  cancelSubscription(id: string): Promise<StripeSubscription>;
  /** Refunds in full whatever was paid for the Subscription, and not refunded before; answers all that was paid, in cents. */
  refundSubscription(id: string): Promise<number>;
  /**
   * Ends the Subscription at exactly `end`, or never if that is null, prorating nothing, and adds to
   * its metadata; answers it as it is then.
   */
  setEnd(id: string, end: Date | null, metadata: Record<string, string>, idempotencyKey: string): Promise<StripeSubscription>;
  /** Pays back so much of the Subscription's last paid invoice by a credit note, unless it was before. */
  refundUnused(id: string, cents: number): Promise<void>;
  /** Sets the languages of the Customer's invoices and mails from Stripe. */
  setCustomerLocales(customerId: string, locales: string[]): Promise<void>;
  /** The id of the Portal's configuration (`PORTAL_FEATURES`), which it creates or brings up to date. */
  portalConfiguration(): Promise<string>;
  /** Creates a session of the Portal and answers its address. */
  portalSession(params: Stripe.BillingPortal.SessionCreateParams): Promise<string>;
};

/**
 * What the Portal offers: payment method, invoices and billing address. A Subscription is cancelled on
 * our page alone (#229), so the Portal asks no questions and makes no offers (#186).
 */
const PORTAL_FEATURES: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  customer_update: { enabled: true, allowed_updates: ["address"] },
  subscription_cancel: { enabled: false },
  subscription_pause: { enabled: false },
  subscription_update: { enabled: false },
};

/** Tells the Routing module's configuration of the Portal from any other. */
const PORTAL_METADATA = { integration: "family-agenda-portal" };

/** Marks the credit note that pays back the unused months of a cancelled yearly Subscription (#229). */
const UNUSED_METADATA = "unusedMonthsOf";

/** The id of what Stripe names by its id alone, or expanded. */
export const idOf = (reference: string | { id: string }): string => (typeof reference === "string" ? reference : reference.id);

/** Where Stripe's API is; `api.stripe.com` unless given. */
type StripeHost = { host: string; port: number; protocol: "http" | "https" };

/** Stripe with the restricted key. Its API version is fixed: the one this SDK is pinned for. */
export function stripePort(secretKey: string, at?: StripeHost): StripePort {
  const stripe = new Stripe(secretKey, { apiVersion: "2026-11-18.endive", maxNetworkRetries: 2, timeout: 10_000, telemetry: false, ...at });
  return {
    price: (id) => stripe.prices.retrieve(id),
    async createSession(params) {
      const { id, url } = await stripe.checkout.sessions.create(params);
      if (url === null) throw new Error(`Stripe's Checkout Session ${id} has no address`);
      return url;
    },
    async openSessions(familyId) {
      const open: string[] = [];
      for await (const session of stripe.checkout.sessions.list({ status: "open", limit: 100 })) {
        if (session.client_reference_id === familyId) open.push(session.id);
      }
      return open;
    },
    async expireSession(id) {
      await stripe.checkout.sessions.expire(id);
    },
    subscription: (id) => stripe.subscriptions.retrieve(id),
    async addMetadata(subscriptionId, metadata) {
      await stripe.subscriptions.update(subscriptionId, { metadata });
    },
    cancelSubscription: (id) => stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false }),
    async refundSubscription(id) {
      let cents = 0;
      for await (const invoice of stripe.invoices.list({ subscription: id, limit: 100 })) {
        for await (const { payment, amount_paid } of stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 })) {
          await refund(stripe, payment);
          cents += amount_paid ?? 0;
        }
      }
      return cents;
    },
    setEnd: (id, end, metadata, idempotencyKey) =>
      stripe.subscriptions.update(id, { cancel_at: end === null ? "" : Math.floor(end.getTime() / 1000), proration_behavior: "none", metadata }, { idempotencyKey }),
    async refundUnused(id, cents) {
      const [invoice] = (await stripe.invoices.list({ subscription: id, status: "paid", limit: 1 })).data;
      if (invoice?.id === undefined) throw new Error(`Stripe's Subscription ${id} has no paid invoice to pay back from`);
      for await (const { metadata } of stripe.creditNotes.list({ invoice: invoice.id, limit: 100 })) {
        if (metadata?.[UNUSED_METADATA] === id) return;
      }
      await stripe.creditNotes.create({ invoice: invoice.id, amount: cents, refund_amount: cents, metadata: { [UNUSED_METADATA]: id } }, { idempotencyKey: `unused:${id}` });
    },
    async setCustomerLocales(customerId, locales) {
      await stripe.customers.update(customerId, { preferred_locales: locales });
    },
    async portalConfiguration() {
      for await (const { id, metadata } of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
        if (metadata?.integration !== PORTAL_METADATA.integration) continue;
        await stripe.billingPortal.configurations.update(id, { features: PORTAL_FEATURES });
        return id;
      }
      return (await stripe.billingPortal.configurations.create({ features: PORTAL_FEATURES, metadata: PORTAL_METADATA })).id;
    },
    async portalSession(params) {
      return (await stripe.billingPortal.sessions.create(params)).url;
    },
  };
}

/** Refunds a payment in full, unless it was before. */
async function refund(stripe: Stripe, { type, payment_intent, charge }: Stripe.InvoicePayment.Payment): Promise<void> {
  const paid = payment_intent ? { payment_intent: idOf(payment_intent) } : charge && { charge: idOf(charge) };
  if (!paid) throw new Error(`A payment by ${type} cannot be refunded`);
  try {
    await stripe.refunds.create({ ...paid, reason: "duplicate" });
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeError) || error.code !== "charge_already_refunded") throw error;
  }
}

/** The event Stripe posted, if it signed it with the webhook's secret. */
export function signedEvent(body: Buffer, signature: string, webhookSecret: string): Stripe.Event | undefined {
  try {
    return Stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return undefined;
  }
}

/** Throws, saying why, unless Stripe's Prices are the Tariff's: what Checkout charges is what its summary says. */
export async function checkPrices(stripe: StripePort, prices: StripeSettings["prices"]): Promise<void> {
  await Promise.all(
    (["monthly", "yearly"] satisfies Billing[]).map(async (billing) => {
      const fault = priceFault(await stripe.price(prices[billing]), billing);
      if (fault !== undefined) throw new Error(`Stripe's ${billing} Price ${prices[billing]} ${fault}`);
    }),
  );
}
