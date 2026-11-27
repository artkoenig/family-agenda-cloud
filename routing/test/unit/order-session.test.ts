import { describe, expect, it } from "vitest";
import { checkoutTexts } from "../../src/checkout-texts";
import { checkoutSessionParams, priceFault, type Order, type TariffPrice } from "../../src/order-session";

const now = new Date("2026-11-24T12:00:00Z");
const order: Order = {
  familyId: "f-1",
  family: { case: "trial", trialEndsAt: new Date("2026-12-08T10:00:00.400Z") },
  holder: { userId: "u-1", email: "anna@example.org", name: "Anna Muster" },
  price: "price_m",
  language: "de",
  pageLanguage: "de",
  publicUrl: "https://app.example",
  now,
};
const seconds = (iso: string) => Date.parse(iso) / 1000;

describe("the Checkout Session of an order", () => {
  it("is a subscription of the monthly Price, paid first at the end of the Trial, that cancels back to the Family", () => {
    expect(checkoutSessionParams(order)).toEqual({
      mode: "subscription",
      ui_mode: "hosted_page",
      integration_identifier: expect.stringMatching(/-[a-z]{8}$/) as string,
      line_items: [{ price: "price_m", quantity: 1 }],
      client_reference_id: "f-1",
      metadata: { familyId: "f-1", holder: "u-1" },
      subscription_data: { metadata: { familyId: "f-1", holder: "u-1" }, billing_cycle_anchor: seconds("2026-12-08T10:00:01Z"), proration_behavior: "none" },
      ...checkoutTexts("de", new Date("2026-12-08T10:00:00.400Z")),
      allowed_payment_method_types: ["card", "sepa_debit"],
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_email: "anna@example.org",
      expires_at: seconds("2026-11-24T13:00:00Z"),
      success_url: "https://app.example/order/done",
      cancel_url: "https://app.example/f-1/",
    });
  });

  it("is paid at once when the Trial is as good as over", () => {
    const params = checkoutSessionParams({ ...order, family: { case: "trial", trialEndsAt: new Date("2026-11-24T12:00:59Z") } });
    expect(params.subscription_data).toEqual({ metadata: { familyId: "f-1", holder: "u-1" } });
    expect(params).toMatchObject(checkoutTexts("de", now));
  });

  it("is paid at once for a Locked Family", () => {
    const params = checkoutSessionParams({ ...order, family: { case: "locked" } });
    expect(params.subscription_data).toEqual({ metadata: { familyId: "f-1", holder: "u-1" } });
    expect(params).toMatchObject(checkoutTexts("de", now));
  });

  it("speaks the holder's language and comes back to the page's", () => {
    expect(checkoutSessionParams({ ...order, language: "de", pageLanguage: "en" })).toMatchObject({
      locale: "de",
      success_url: "https://app.example/en/order/done",
      cancel_url: "https://app.example/f-1/",
    });
  });

  it("asks for the holder's name if Logto has none", () => {
    expect(checkoutSessionParams({ ...order, holder: { ...order.holder, name: null } })).toMatchObject({ name_collection: { individual: { enabled: true, optional: false } } });
  });

  it("leaves the email to Stripe if Logto has none", () => {
    expect(checkoutSessionParams({ ...order, holder: { ...order.holder, email: null } })).not.toHaveProperty("customer_email");
  });
});

describe("Stripe's Price", () => {
  const monthly: TariffPrice = { active: true, currency: "eur", tax_behavior: "inclusive", type: "recurring", unit_amount: 499, recurring: { interval: "month", interval_count: 1 } };
  const yearly: TariffPrice = { ...monthly, unit_amount: 4990, recurring: { interval: "year", interval_count: 1 } };

  it("is the Tariff's", () => {
    expect(priceFault(monthly, "monthly")).toBeUndefined();
    expect(priceFault(yearly, "yearly")).toBeUndefined();
  });

  it.each<[string, Partial<TariffPrice>]>([
    ["is not active", { active: false }],
    ["is not in EUR", { currency: "usd" }],
    ["is not billed every month", { recurring: { interval: "year", interval_count: 1 } }],
    ["is not billed every month", { recurring: { interval: "month", interval_count: 3 } }],
    ["is not billed every month", { recurring: null }],
    ["is not billed every month", { type: "one_time" }],
    ["does not include the tax", { tax_behavior: "exclusive" }],
    ["does not include the tax", { tax_behavior: "unspecified" }],
    ["is not 499 cents", { unit_amount: 498 }],
    ["is not 499 cents", { unit_amount: null }],
  ])("%s: %j", (fault, change) => {
    expect(priceFault({ ...monthly, ...change }, "monthly")).toBe(fault);
  });
});
