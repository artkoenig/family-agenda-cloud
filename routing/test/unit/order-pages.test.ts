import { describe, expect, it } from "vitest";
import { noAccessPage, noFounderPage, notOfferedPage, onlyFounderOrdersPage, orderDonePage, orderedPage, orderPage, noSubscriptionPage, subscriptionHolderPage, type OrderForm } from "../../src/order-pages";
import { legalFooterHtml } from "../../src/legal-footer";

const form: OrderForm = { firstPaymentAt: new Date("2026-12-08T10:00:00Z"), askName: false, billing: "monthly", invalid: false };

/** What a reader sees of the card, as one line without odd spaces. */
const textOf = (html: string) =>
  /<main class="card">([\s\S]*)<\/main>/
    .exec(html)![1]!
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const checked = (html: string) => /value="(\w+)" required checked/.exec(html)?.[1];

describe("the order page", () => {
  it("shows both prices, the yearly one's per month, and the first payment before the button, in German", () => {
    const html = orderPage("de", form);
    expect(textOf(html)).toBe(
      "Tarif bestellen Zahlungsweise 4,99 € im Monat inkl. USt. 49,90 € jährlich (entspricht 4,16 € im Monat) inkl. USt. Erste Zahlung am 08.12.2026 Weiter zur Kasse",
    );
    expect(html).toContain('<html lang="de"');
    expect(html).toContain(legalFooterHtml("de"));
    expect(html).toContain('<form method="post"');
    expect(html).not.toContain('name="name"');
    expect(checked(html)).toBe("monthly");
  });

  it("does so in English", () => {
    const text = textOf(orderPage("en", form));
    expect(text).toContain("per month VAT included");
    expect(text).toMatch(/49\.90.* per year \(equals .*4\.16.* per month\) VAT included First payment on .*2026 Continue to checkout$/);
  });

  it("asks for the name, as a required field", () => {
    const html = orderPage("de", { ...form, askName: true });
    expect(textOf(html)).toContain("Ihr Name, als Vertragsinhaber");
    expect(html).toContain('<input id="name" name="name" autocomplete="name" maxlength="128" required>');
  });

  it("says what is missing and keeps the choice", () => {
    const html = orderPage("de", { ...form, billing: "yearly", invalid: true });
    expect(html).toContain('<p role="alert">Bitte wählen');
    expect(checked(html)).toBe("yearly");
    expect(orderPage("de", form)).not.toContain("alert");
  });
});

describe("the pages without an order", () => {
  it("names the holder of a running Subscription, escaped", () => {
    const html = orderedPage("de", "f-1", "<Anna>");
    expect(html).toContain("Tarif bereits bestellt");
    expect(html).toContain("&lt;Anna&gt;");
    expect(html).toContain('href="/f-1/"');
    expect(html).not.toContain("<button");
    expect(textOf(orderedPage("de", "f-1", null))).toBe("Tarif bestellen Tarif bereits bestellt Zur Familie");
    expect(textOf(orderedPage("en", "f-1", null))).toBe("Order the tariff Tariff already ordered To the family");
  });

  it("names who alone may order", () => {
    expect(textOf(onlyFounderOrdersPage("de", "f-1", "Anna"))).toBe("Tarif bestellen Bestellen kann nur: Anna Zur Familie");
    expect(textOf(onlyFounderOrdersPage("en", "f-1", "Anna"))).toBe("Order the tariff Only Anna can order To the family");
  });

  it.each([noFounderPage("de", "f-1"), notOfferedPage("de", "f-1"), noAccessPage("de"), noFounderPage("en", "f-1"), notOfferedPage("en", "f-1"), noAccessPage("en")])(
    "gives the support's address and no button",
    (html) => {
      expect(html).toContain("support@family-agenda.cloud");
      expect(html).not.toContain("<button");
    },
  );

  it("thanks for the order and leads back into the Family", () => {
    const html = orderDonePage("de", "f-1");
    expect(textOf(html)).toBe("Danke für Ihre Bestellung. Die Vertragsbestätigung kommt per E-Mail. Zur Familie");
    expect(html).toContain('href="/f-1/"');
    expect(textOf(orderDonePage("en", "f-1"))).toContain("Thank you for your order.");
  });

  it("names who alone may change the payment method, or the support when Logto no longer knows them", () => {
    for (const [language, words] of [["de", "Vertragsinhaber"], ["en", "contract holder"]] as const) {
      const html = subscriptionHolderPage(language, "f-1", "<Anna>");
      expect(textOf(html).toLowerCase()).toContain(words.toLowerCase());
      expect(html).toContain("&lt;Anna&gt;");
      expect(html).not.toContain("support@");
      const unknown = subscriptionHolderPage(language, "f-1", null);
      expect(unknown).toContain("support@family-agenda.cloud");
      for (const either of [html, unknown]) expect(either).toContain('href="/f-1/"');
    }
  });

  it("says that there is no Subscription", () => {
    expect(noSubscriptionPage("de", "f-1")).toContain('href="/f-1/"');
    expect(textOf(noSubscriptionPage("de", "f-1"))).not.toBe(textOf(noSubscriptionPage("en", "f-1")));
  });
});
