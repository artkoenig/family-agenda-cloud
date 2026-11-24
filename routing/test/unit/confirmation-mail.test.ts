import { describe, expect, it } from "vitest";
import { confirmationMail, type ConfirmationMailValues, type LegalImprint } from "../../src/confirmation-mail";
import type { Billing, Language } from "../../src/contract-wording";
import { confirmationLegalTexts } from "../../src/legal-site";

const imprint: LegalImprint = { name: "Erika Betreiberin", postalAddress: "Postfach 12, 10115 Berlin", stand: "1. Dezember 2026" };

/** Ordered at 23:30 Berlin time on 5 March, the last day of the withdrawal period the 19th. */
const values = (billing: Billing): ConfirmationMailValues => ({
  holder: { name: "Erika Muster", email: "erika@example.org" },
  contract: { billing, familyName: "Muster", orderedOn: new Date("2026-03-05T22:30:00Z") },
  firstPaymentAt: new Date("2026-03-07T22:30:00Z"),
});

/** Stand-ins for the legal texts, to show where and how they are embedded. */
const legal = {
  agb: "# Allgemeine Geschäftsbedingungen\n\nStand: {{STAND}}\n\n## § 1 Anbieter\n\n**{{NAME}}**, {{POSTFLEX_ADDRESS}}\n",
  withdrawal: "# Widerrufsbelehrung\n\n## Muster-Widerrufsformular\n\n– An {{NAME}}, {{POSTFLEX_ADDRESS}}\n\n(\\*) Unzutreffendes streichen.\n",
};

const EMBEDDED = `==== Allgemeine Geschäftsbedingungen ====
Allgemeine Geschäftsbedingungen

Stand: 1. Dezember 2026

§ 1 Anbieter

Erika Betreiberin, Postfach 12, 10115 Berlin

==== Widerrufsbelehrung ====
Widerrufsbelehrung

Muster-Widerrufsformular

– An Erika Betreiberin, Postfach 12, 10115 Berlin

(*) Unzutreffendes streichen.`;

/** The signature separator mail programs know, with its trailing space. */
const SEPARATOR = "-- ";

const FOOTER: Record<Language, string> = {
  de: `${SEPARATOR}
Family Agenda · Erika Betreiberin · Postfach 12, 10115 Berlin
Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie an support@family-agenda.cloud.
Impressum: https://family-agenda.cloud/impressum
`,
  en: `${SEPARATOR}
Family Agenda · Erika Betreiberin · Postfach 12, 10115 Berlin
Questions? Just reply to this email or write to support@family-agenda.cloud.
Imprint: https://family-agenda.cloud/en/imprint
`,
};

describe("confirmationMail", () => {
  it("confirms a monthly Subscription to the Contract holder, from support with Reply-To support, in German", () => {
    expect(confirmationMail("de", values("monthly"), legal, imprint)).toEqual({
      from: "Family Agenda <support@family-agenda.cloud>",
      replyTo: "support@family-agenda.cloud",
      to: "erika@example.org",
      subject: "Vertragsbestätigung: Ihr Abonnement bei Family Agenda",
      text: `Guten Tag Erika Muster,

vielen Dank für Ihre Bestellung. Hiermit bestätigen wir den Vertrag.

Vertragsinhaber: Erika Muster, erika@example.org
Familie: Muster
Tarif: Family Agenda Cloud, monatlich
Preis: 4,99 € pro Monat inkl. USt.
Bestellt am: 05.03.2026 um 23:30 Uhr
Erste Zahlung am: 07.03.2026
Laufzeit und Kündigung: ein Monat, verlängert sich jeweils um einen Monat, jederzeit zum Monatsende kündbar.
Widerrufsfrist: bis einschließlich 19.03.2026

Kündigen: https://app.family-agenda.cloud/cancel (Schaltfläche „Verträge hier kündigen“)
Widerrufen: https://app.family-agenda.cloud/withdraw (Schaltfläche „Vertrag widerrufen“)
Zahlungsart und Rechnungen: im Admin-Bereich unter „Abonnement“

Unten finden Sie unsere AGB, die Widerrufsbelehrung und das Muster-Widerrufsformular. Bitte bewahren Sie diese E-Mail auf.

${EMBEDDED}

${FOOTER.de}`,
    });
  });

  it("words a yearly Subscription's tariff, price and term in German", () => {
    const { text } = confirmationMail("de", values("yearly"), legal, imprint);

    expect(text).toContain(`Tarif: Family Agenda Cloud, jährlich
Preis: 49,90 € pro Jahr inkl. USt.
Bestellt am: 05.03.2026 um 23:30 Uhr
Erste Zahlung am: 07.03.2026
Laufzeit und Kündigung: ein Jahr, verlängert sich jeweils um ein Jahr; kündbar zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung.
Widerrufsfrist: bis einschließlich 19.03.2026
`);
  });

  it("confirms a monthly Subscription in English, embedding the German texts", () => {
    expect(confirmationMail("en", values("monthly"), legal, imprint)).toEqual({
      from: "Family Agenda <support@family-agenda.cloud>",
      replyTo: "support@family-agenda.cloud",
      to: "erika@example.org",
      subject: "Contract confirmation: your Family Agenda subscription",
      text: `Hello Erika Muster,

thank you for your order. This email confirms the contract.

Contract holder: Erika Muster, erika@example.org
Family: Muster
Plan: Family Agenda Cloud, monthly
Price: €4.99 per month, VAT included
Ordered on: 5 March 2026 at 23:30 (Berlin time)
First payment on: 7 March 2026
Term and cancellation: one month, renewing for one month at a time, cancellable any time with effect from the end of the month.
Withdrawal period: until and including 19 March 2026

Cancel: https://app.family-agenda.cloud/en/cancel (button "Verträge hier kündigen")
Withdraw: https://app.family-agenda.cloud/en/withdraw (button "Vertrag widerrufen")
Payment method and invoices: in the Admin area under "Subscription"

Below are our terms, the withdrawal policy and the model withdrawal form. The contract language is German, so these are the binding German texts; English translations are at https://family-agenda.cloud/en/terms and https://family-agenda.cloud/en/withdrawal. Please keep this email.

${EMBEDDED}

${FOOTER.en}`,
    });
  });

  it("words a yearly Subscription's plan, price and term in English", () => {
    const { text } = confirmationMail("en", values("yearly"), legal, imprint);

    expect(text).toContain(`Plan: Family Agenda Cloud, yearly
Price: €49.90 per year, VAT included
Ordered on: 5 March 2026 at 23:30 (Berlin time)
First payment on: 7 March 2026
Term and cancellation: one year, renewing for one year at a time; cancellable with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund.
Withdrawal period: until and including 19 March 2026
`);
  });

  it("refuses a legal text whose placeholder the imprint has no value for", () => {
    expect(() => confirmationMail("de", values("monthly"), { ...legal, agb: "# AGB\n\n{{GERICHTSSTAND}}\n" }, imprint)).toThrow("GERICHTSSTAND");
  });
});

describe("confirmationMail with the legal texts of site/legal/", () => {
  const texts = confirmationLegalTexts();

  it.each(["de", "en"] as const)("embeds the whole AGB and Widerrufsbelehrung as plain text, filled, in the %s mail", (language) => {
    const { text } = confirmationMail(language, values("monthly"), texts, imprint);
    const agb = text.slice(text.indexOf("==== Allgemeine Geschäftsbedingungen ====\n"), text.indexOf("==== Widerrufsbelehrung ====\n"));
    const withdrawal = text.slice(text.indexOf("==== Widerrufsbelehrung ====\n"), text.lastIndexOf("\n\n-- \n"));

    expect(agb).toContain("Stand: 1. Dezember 2026");
    expect(agb).toContain("zwischen Erika Betreiberin, Family Agenda, Postfach 12, 10115 Berlin („wir“)");
    expect(withdrawal).toContain("\nWiderrufsrecht\n");
    expect(withdrawal).toContain("\nMuster-Widerrufsformular\n");
    expect(withdrawal).toContain("– An Erika Betreiberin, Family Agenda, Postfach 12, 10115 Berlin, E-Mail: support@family-agenda.cloud:");
    expect(withdrawal).toContain("(*) Unzutreffendes streichen.");
    for (const markdown of ["{{", "#", "**", "\\*", "]("]) expect(text).not.toContain(markdown);
    expect(text.endsWith(FOOTER[language])).toBe(true);
  });
});
