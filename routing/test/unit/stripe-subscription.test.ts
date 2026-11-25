import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { firstPaymentOf, hasEnded, isDuplicate, newerOf, noticeOf, ordererOf, recordOf } from "../../src/stripe-subscription";
import { stripeSubscription } from "../support/stand-in-stripe";

const FAMILY = "0b0e7c0e-7b0f-4c7c-9b0e-1c2d3e4f5a6b";

describe("A Subscription of Stripe's", () => {
  it("names its Family and holder", () => {
    expect(ordererOf(stripeSubscription(FAMILY, "sub_1"))).toEqual({ familyId: FAMILY, holder: "u-1" });
    expect(ordererOf(stripeSubscription(FAMILY, "sub_1", { metadata: { familyId: FAMILY } }))).toBeUndefined();
    expect(ordererOf(stripeSubscription(`${FAMILY}0`, "sub_1"))).toBeUndefined();
    expect(ordererOf(stripeSubscription(`0${FAMILY}`, "sub_1"))).toBeUndefined();
  });

  it.each([
    ["month", "monthly"],
    ["year", "yearly"],
    ["week", null],
  ] as const)("is billed by the %s of its Price", (interval, billing) => {
    const items = { data: [{ current_period_end: 1, price: { recurring: { interval } } }] };
    expect(recordOf(stripeSubscription(FAMILY, "sub_1", { items }), { familyId: FAMILY, holder: "u-1" })).toMatchObject({ billing, currentPeriodEnd: new Date(1000) });
  });

  it("without an item has no billing or period, and an expanded Customer by its id", () => {
    expect(recordOf(stripeSubscription(FAMILY, "sub_1", { items: { data: [] }, customer: { id: "cus_x" } }), { familyId: FAMILY, holder: "u-1" })).toMatchObject({ billing: null, currentPeriodEnd: null, customerId: "cus_x" });
  });

  it("has ended when canceled or expired", () => {
    expect((["canceled", "incomplete_expired", "active", "unpaid"] as const).map((status) => hasEnded(stripeSubscription(FAMILY, "s", { status })))).toEqual([true, true, false, false]);
  });

  it("is newer by its creation, and then by its id", () => {
    const one = stripeSubscription(FAMILY, "sub_1", { created: 5 });
    const other = stripeSubscription(FAMILY, "sub_2", { created: 4 });
    expect([newerOf(one, other), newerOf(other, one)]).toEqual([one, one]);
    const same = { ...other, created: 5 };
    expect([newerOf(one, same), newerOf(same, one)]).toEqual([same, same]);
  });

  it("is first paid at its anchor, or at once", () => {
    const session = { locale: null, customer_details: null };
    const subscription = stripeSubscription(FAMILY, "sub_1");
    expect(firstPaymentOf(subscription, { ...session, paidAtOnce: false })).toEqual(new Date(1_781_000_000_000));
    expect(firstPaymentOf(subscription, { ...session, paidAtOnce: true })).toEqual(new Date(1_780_000_000_000));
  });
});

describe("An event of Stripe's", () => {
  const notice = (type: string, object: object) => noticeOf({ type, data: { object } } as unknown as Stripe.Event);

  it.each(["created", "updated", "deleted"])("is about the Subscription that was %s", (what) => {
    expect(notice(`customer.subscription.${what}`, { id: "sub_1" })).toEqual({ subscriptionId: "sub_1", session: null });
  });

  it.each(["paid", "payment_failed"])("is about the Subscription of an invoice: %s", (what) => {
    const of = (parent: unknown) => notice(`invoice.${what}`, { parent });
    expect(of({ subscription_details: { subscription: "sub_1" } })).toEqual({ subscriptionId: "sub_1", session: null });
    expect(of({ subscription_details: { subscription: { id: "sub_2" } } })).toEqual({ subscriptionId: "sub_2", session: null });
    expect(of(null)).toBeUndefined();
    expect(of({ subscription_details: null })).toBeUndefined();
  });

  it("is about the Subscription a completed Session ordered", () => {
    const session = { locale: "de", customer_details: null };
    expect(notice("checkout.session.completed", { ...session, subscription: "sub_1", invoice: null })).toEqual({ subscriptionId: "sub_1", session: { ...session, paidAtOnce: false } });
    expect(notice("checkout.session.completed", { ...session, subscription: "sub_1", invoice: "in_1" })).toEqual({ subscriptionId: "sub_1", session: { ...session, paidAtOnce: true } });
    expect(notice("checkout.session.completed", { ...session, subscription: null, invoice: null })).toBeUndefined();
  });

  it("of another type is about none", () => {
    expect(notice("customer.created", { id: "cus_1" })).toBeUndefined();
  });

  it("finds a duplicate by its mark alone", () => {
    expect(isDuplicate(stripeSubscription(FAMILY, "s", { metadata: { duplicate: "true" } }))).toBe(true);
    expect(isDuplicate(stripeSubscription(FAMILY, "s"))).toBe(false);
  });

  it("without a holder names none", () => {
    expect(ordererOf(stripeSubscription(FAMILY, "s", { metadata: { familyId: FAMILY, holder: "" } }))).toBeUndefined();
    expect(ordererOf(stripeSubscription(FAMILY, "s", { metadata: { holder: "u-1" } }))).toBeUndefined();
  });
});
