/**
 * The contract confirmation mail of § 312f BGB (#215), which the `checkout.session.completed`
 * webhook sends to the Contract holder once per Subscription: the contract's terms, the links to
 * cancel and withdraw, and the German AGB and Widerrufsbelehrung with the Muster-Widerrufsformular
 * as plain text, binding in either language. The legal texts come in as Markdown, read at send
 * time (`confirmationLegalTexts` in legal-site.ts), so the mail embeds the current ones. No I/O.
 */
import { contractMail, type ContractMail, type Imprint, type Paragraph } from "./contract-mails";
import { amountOf, CONTRACT_PATHS, dateAfter, dateOf, PRICE_CENTS, timeOf, type Billing, type Contract, type Language, type Person } from "./contract-wording";
import { legalText } from "./legal-texts";
import { APP_URL } from "./legal-pages";

/** The Markdown of `site/legal/agb.de.md` and `site/legal/widerrufsbelehrung.de.md`. */
export type ConfirmationLegalTexts = { agb: string; withdrawal: string };

/** The Operator's imprint and the AGB's date (`Stand`), for the placeholders of the legal texts and the footer. */
export type LegalImprint = Imprint & { stand: string };

/** A Subscription ordered at `contract.orderedOn` by `holder`, first paid at `firstPaymentAt`. */
export type ConfirmationMailValues = { holder: Person; contract: Contract; firstPaymentAt: Date };

/** The facts of the contract, formatted. */
type Facts = { holder: Person; familyName: string; billing: Billing; price: string; ordered: { date: string; time: string }; firstPayment: string; withdrawUntil: string };

type Words = {
  subject: string;
  thanks: string;
  facts: (facts: Facts) => Paragraph;
  links: Paragraph;
  below: string;
};

const BILLING: Record<Language, Record<Billing, { name: string; price: (price: string) => string; term: string }>> = {
  de: {
    monthly: { name: "monatlich", price: (price) => `${price} pro Monat`, term: "ein Monat, verlängert sich jeweils um einen Monat, jederzeit zum Monatsende kündbar." },
    yearly: {
      name: "jährlich",
      price: (price) => `${price} pro Jahr`,
      term: "ein Jahr, verlängert sich jeweils um ein Jahr; kündbar zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung.",
    },
  },
  en: {
    monthly: { name: "monthly", price: (price) => `${price} per month`, term: "one month, renewing for one month at a time, cancellable any time to the end of the month." },
    yearly: {
      name: "yearly",
      price: (price) => `${price} per year`,
      term: "one year, renewing for one year at a time; cancellable to the end of the first year, after that any time to the end of the month with a pro-rata refund.",
    },
  },
};

const WORDS: Record<Language, Words> = {
  de: {
    subject: "Vertragsbestätigung: Ihr Abonnement bei Family Agenda",
    thanks: "vielen Dank für Ihre Bestellung. Hiermit bestätigen wir den Vertrag.",
    facts: ({ holder, familyName, billing, price, ordered, firstPayment, withdrawUntil }) => [
      `Vertragsinhaber: ${holder.name}, ${holder.email}`,
      `Familie: ${familyName}`,
      `Tarif: Family Agenda Cloud, ${BILLING.de[billing].name}`,
      `Preis: ${BILLING.de[billing].price(price)} inkl. USt.`,
      `Bestellt am: ${ordered.date} um ${ordered.time}`,
      `Erste Zahlung am: ${firstPayment}`,
      `Laufzeit und Kündigung: ${BILLING.de[billing].term}`,
      `Widerrufsfrist: bis einschließlich ${withdrawUntil}`,
    ],
    links: [
      `Kündigen: ${APP_URL}${CONTRACT_PATHS.cancel.de} (Schaltfläche „Verträge hier kündigen“)`,
      `Widerrufen: ${APP_URL}${CONTRACT_PATHS.withdraw.de} (Schaltfläche „Vertrag widerrufen“)`,
      "Zahlungsart und Rechnungen: im Admin-Bereich unter „Abonnement“",
    ],
    below: "Unten finden Sie unsere AGB, die Widerrufsbelehrung und das Muster-Widerrufsformular. Bitte bewahren Sie diese E-Mail auf.",
  },
  en: {
    subject: "Contract confirmation: your Family Agenda subscription",
    thanks: "thank you for your order. This mail confirms the contract.",
    facts: ({ holder, familyName, billing, price, ordered, firstPayment, withdrawUntil }) => [
      `Contract holder: ${holder.name}, ${holder.email}`,
      `Family: ${familyName}`,
      `Plan: Family Agenda Cloud, ${BILLING.en[billing].name}`,
      `Price: ${BILLING.en[billing].price(price)}, VAT included`,
      `Ordered on: ${ordered.date} at ${ordered.time}`,
      `First payment on: ${firstPayment}`,
      `Term and cancellation: ${BILLING.en[billing].term}`,
      `Withdrawal period: until and including ${withdrawUntil}`,
    ],
    links: [
      `Cancel: ${APP_URL}${CONTRACT_PATHS.cancel.en} (button "Verträge hier kündigen")`,
      `Withdraw: ${APP_URL}${CONTRACT_PATHS.withdraw.en} (button "Vertrag widerrufen")`,
      'Payment method and invoices: in the Admin area under "Subscription"',
    ],
    below:
      "Below are our terms, the withdrawal policy and the model withdrawal form. The contract language is German, so these are the binding German texts; English translations are at https://family-agenda.cloud/en/terms and https://family-agenda.cloud/en/withdrawal. Please keep this mail.",
  },
};

/** An embedded legal text under its banner, e.g. `==== Widerrufsbelehrung ====`. */
function embedded(title: string, markdown: string, imprint: LegalImprint): Paragraph {
  const values = { NAME: imprint.name, POSTFLEX_ADDRESS: imprint.postalAddress, STAND: imprint.stand };
  return [`==== ${title} ====`, legalText(markdown, values).trimEnd()];
}

/** The confirmation mail to the Contract holder, in `language`, embedding the German legal texts with their placeholders filled from `imprint`. */
export function confirmationMail(language: Language, values: ConfirmationMailValues, legal: ConfirmationLegalTexts, imprint: LegalImprint): ContractMail {
  const words = WORDS[language];
  const { holder, contract, firstPaymentAt } = values;
  const { orderedOn, billing } = contract;
  const facts: Facts = {
    holder,
    familyName: contract.familyName,
    billing,
    price: amountOf(PRICE_CENTS[billing], language),
    ordered: { date: dateOf(orderedOn, language), time: timeOf(orderedOn, language) },
    firstPayment: dateOf(firstPaymentAt, language),
    withdrawUntil: dateAfter(orderedOn, 14, language),
  };
  const paragraphs = [
    [words.thanks],
    words.facts(facts),
    words.links,
    [words.below],
    embedded("Allgemeine Geschäftsbedingungen", legal.agb, imprint),
    embedded("Widerrufsbelehrung", legal.withdrawal, imprint),
  ];
  return contractMail(language, holder, words.subject, paragraphs, imprint);
}
