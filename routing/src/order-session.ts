/**
 * The Checkout Session of an order (#226): its create params, which Sessions of a Family are still
 * open, and whether Stripe's Prices are the Tariff's. No I/O.
 */
import type Stripe from "stripe";
import { checkoutTexts, firstPayment, type OrderingFamily } from "./checkout-texts";
import { PRICE_CENTS, type Billing, type Language } from "./contract-wording";
import { ORDER_PATHS } from "./routing-pages";

/** An order: whose Family, who becomes the Contract holder, and what they chose, at `now`. */
export type Order = {
  familyId: string;
  family: OrderingFamily;
  holder: { userId: string; email: string | null };
  billing: Billing;
  /** Stripe's Price of the billing. */
  price: string;
  /** The language of Checkout: the holder's at Logto. */
  language: Language;
  /** The language of the page the order is made on, and comes back to. */
  pageLanguage: Language;
  publicUrl: string;
  now: Date;
};

/** Names these Sessions in Stripe's Dashboard: a label and a fixed random suffix. */
const INTEGRATION = "family-agenda-order-qhzvtkwm";

/** How long a Session can be paid: short, as it carries the first payment's date of when it was made. */
const SESSION_LIFETIME_SECONDS = 60 * 60;

const secondsOf = (instant: Date): number => Math.ceil(instant.getTime() / 1000);

/**
 * Pays first at `anchor`, and nothing for the days before it. Not a `trial_end`: Checkout would offer
 * a trial of its own, and Stripe takes none under 48 hours.
 */
const anchoredAt = (anchor: Date) => ({ billing_cycle_anchor: secondsOf(anchor), proration_behavior: "none" as const });

/** What the order is, as Stripe creates its Session. */
export function checkoutSessionParams(order: Order): Stripe.Checkout.SessionCreateParams {
  const { familyId, family, holder, billing, price, language, pageLanguage, publicUrl, now } = order;
  const { billingCycleAnchor, dueAt } = firstPayment(family, now);
  const metadata = { familyId, holder: holder.userId };
  return {
    mode: "subscription",
    ui_mode: "hosted_page",
    integration_identifier: INTEGRATION,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: familyId,
    metadata,
    subscription_data: { metadata, ...(billingCycleAnchor === null ? {} : anchoredAt(billingCycleAnchor)) },
    ...checkoutTexts(language, billing, dueAt),
    allowed_payment_method_types: ["card", "sepa_debit"],
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    ...(holder.email === null ? {} : { customer_email: holder.email }),
    expires_at: secondsOf(now) + SESSION_LIFETIME_SECONDS,
    success_url: `${publicUrl}${ORDER_PATHS.done[pageLanguage]}`,
    cancel_url: `${publicUrl}${ORDER_PATHS.order[pageLanguage]}`,
  };
}

/** Stripe's Price, as far as the Tariff says what it is. */
export type TariffPrice = Pick<Stripe.Price, "active" | "currency" | "tax_behavior" | "type" | "unit_amount"> & {
  recurring: Pick<Stripe.Price.Recurring, "interval" | "interval_count"> | null;
};

const INTERVAL: Record<Billing, Stripe.Price.Recurring.Interval> = { monthly: "month", yearly: "year" };

/** Why the Price is not the Tariff's, billed `billing`; undefined if it is. */
export function priceFault(price: TariffPrice, billing: Billing): string | undefined {
  const faults: (readonly [boolean, string])[] = [
    [price.active, "is not active"],
    [price.currency === "eur", "is not in EUR"],
    [price.type === "recurring" && price.recurring?.interval === INTERVAL[billing] && price.recurring.interval_count === 1, `is not billed every ${INTERVAL[billing]}`],
    [price.tax_behavior === "inclusive", "does not include the tax"],
    [price.unit_amount === PRICE_CENTS[billing], `is not ${String(PRICE_CENTS[billing])} cents`],
  ];
  return faults.find(([holds]) => !holds)?.[1];
}
