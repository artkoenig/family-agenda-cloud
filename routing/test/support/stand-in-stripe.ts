import Stripe from "stripe";
import type { TariffPrice } from "../../src/order-session";
import type { StripePort, StripeSubscription } from "../../src/stripe";

export const CHECKOUT = "https://checkout.stripe.test/session";
export const PORTAL = "https://billing.stripe.test/session";

export const PRICES: Record<string, TariffPrice> = {
  price_m: { active: true, currency: "eur", tax_behavior: "inclusive", type: "recurring", unit_amount: 499, recurring: { interval: "month", interval_count: 1 } },
  price_y: { active: true, currency: "eur", tax_behavior: "inclusive", type: "recurring", unit_amount: 4990, recurring: { interval: "year", interval_count: 1 } },
};

/** The Router's settings with Stripe. */
export const STRIPE_ENV = {
  STRIPE_SECRET_KEY: "key",
  STRIPE_WEBHOOK_SECRET: "webhook-secret",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_YEARLY: "price_y",
  OPERATOR_NAME: "Olga Operator",
  OPERATOR_POSTAL_ADDRESS: "Postflex 1, 12345 Musterstadt",
  AGB_STAND: "1. November 2026",
};

export type StandInStripe = StripePort & {
  /** The parameters of every Checkout Session created, in order. */
  created: Stripe.Checkout.SessionCreateParams[];
  open: Set<string>;
  subscriptions: Map<string, StripeSubscription>;
  /** The ids of the Subscriptions cancelled, and of those refunded, one entry per call. */
  cancelled: string[];
  refunded: string[];
  /** Every end set at a Subscription, and every payback of unused months, one entry per call. */
  ends: { id: string; end: Date | null; metadata: Record<string, string>; idempotencyKey: string }[];
  unused: { id: string; cents: number }[];
  /** Fails every call that sets a Subscription's end, while true. */
  failEnds: boolean;
  /** What was paid for a Subscription, in cents; nothing unless set. */
  paid: Map<string, number>;
  /** Fails every call that ends a Subscription at once, or refunds one, while true. */
  failCancels: boolean;
  failRefunds: boolean;
  customerLocales: Map<string, string[]>;
  portalSessions: Stripe.BillingPortal.SessionCreateParams[];
  /** Fails every call that changes a Customer, until set to false. */
  failCustomers: boolean;
};

/** Stripe in memory, behind the Routing module's port. */
export function standInStripe(prices = PRICES): StandInStripe {
  const stripe: StandInStripe = {
    created: [],
    open: new Set(),
    subscriptions: new Map(),
    cancelled: [],
    refunded: [],
    ends: [],
    unused: [],
    failEnds: false,
    paid: new Map(),
    failCancels: false,
    failRefunds: false,
    customerLocales: new Map(),
    portalSessions: [],
    failCustomers: false,
    price: (id) => Promise.resolve(prices[id]!),
    createSession(params) {
      stripe.created.push(params);
      stripe.open.add(`${params.client_reference_id!}#${stripe.created.length}`);
      return Promise.resolve(CHECKOUT);
    },
    openSessions: (familyId) => Promise.resolve([...stripe.open].filter((id) => id.startsWith(`${familyId}#`))),
    expireSession(id) {
      stripe.open.delete(id);
      return Promise.resolve();
    },
    subscription: (id) => Promise.resolve({ ...stripe.subscriptions.get(id)! }),
    addMetadata(id, metadata) {
      const subscription = stripe.subscriptions.get(id)!;
      stripe.subscriptions.set(id, { ...subscription, metadata: { ...subscription.metadata, ...metadata } });
      return Promise.resolve();
    },
    cancelSubscription(id) {
      if (stripe.failCancels) return Promise.reject(new Error("Stripe is down"));
      stripe.cancelled.push(id);
      const ended = { ...stripe.subscriptions.get(id)!, status: "canceled" as const, ended_at: 1_790_000_000 };
      stripe.subscriptions.set(id, ended);
      return Promise.resolve(ended);
    },
    refundSubscription(id) {
      if (stripe.failRefunds) return Promise.reject(new Error("Stripe is down"));
      stripe.refunded.push(id);
      return Promise.resolve(stripe.paid.get(id) ?? 0);
    },
    setEnd(id, end, metadata, idempotencyKey) {
      if (stripe.failEnds) return Promise.reject(new Error("Stripe is down"));
      stripe.ends.push({ id, end, metadata, idempotencyKey });
      const subscription = stripe.subscriptions.get(id)!;
      const changed = { ...subscription, cancel_at: end === null ? null : Math.floor(end.getTime() / 1000), metadata: { ...subscription.metadata, ...metadata } };
      stripe.subscriptions.set(id, changed);
      return Promise.resolve({ ...changed });
    },
    refundUnused(id, cents) {
      stripe.unused.push({ id, cents });
      return Promise.resolve();
    },
    setCustomerLocales(customerId, locales) {
      if (stripe.failCustomers) return Promise.reject(new Error("Stripe is down"));
      stripe.customerLocales.set(customerId, locales);
      return Promise.resolve();
    },
    portalConfiguration: () => Promise.resolve("bpc_1"),
    portalSession(params) {
      stripe.portalSessions.push(params);
      return Promise.resolve(PORTAL);
    },
  };
  return stripe;
}

/** A monthly Subscription as Stripe has it, ordered for the Family by `u-1`. */
export function stripeSubscription(familyId: string, id: string, changes: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id,
    status: "active",
    created: 1_780_000_000,
    billing_cycle_anchor: 1_781_000_000,
    metadata: { familyId, holder: "u-1" },
    trial_end: null,
    cancel_at: null,
    ended_at: null,
    customer: `cus_${id}`,
    items: { data: [{ current_period_end: 1_782_000_000, price: { recurring: { interval: "month" } } }] },
    ...changes,
  };
}

/** An event's body and the header Stripe signs it with. */
export function signed(event: object, secret = STRIPE_ENV.STRIPE_WEBHOOK_SECRET): { body: string; signature: string } {
  const body = JSON.stringify(event);
  return { body, signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
}
