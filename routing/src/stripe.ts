/**
 * Stripe, as far as the Routing module calls it: behind a small port, which the tests answer
 * themselves (#226).
 */
import Stripe from "stripe";
import type { StripeSettings } from "./config";
import type { Billing } from "./contract-wording";
import { priceFault, type TariffPrice } from "./order-session";

export type StripePort = {
  price(id: string): Promise<TariffPrice>;
  /** Creates the Session and answers the address of its Checkout. */
  createSession(params: Stripe.Checkout.SessionCreateParams): Promise<string>;
  /** The Family's Sessions that can still be paid. */
  openSessions(familyId: string): Promise<string[]>;
  /** Ends an open Session, so that it can no longer be paid. */
  expireSession(id: string): Promise<void>;
};

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
  };
}

/** Throws, saying why, unless Stripe's Prices are the Tariff's: what Checkout charges is what the order page says. */
export async function checkPrices(stripe: StripePort, prices: StripeSettings["prices"]): Promise<void> {
  await Promise.all(
    (["monthly", "yearly"] satisfies Billing[]).map(async (billing) => {
      const fault = priceFault(await stripe.price(prices[billing]), billing);
      if (fault !== undefined) throw new Error(`Stripe's ${billing} Price ${prices[billing]} ${fault}`);
    }),
  );
}
