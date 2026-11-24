/**
 * The words on Stripe's hosted Checkout (#215): the § 312j summary above the submit button and
 * the consent to the AGB, in the Checkout's locale, which follows the Admin's Logto locale
 * (`mailLanguageOf`). The Checkout Session's creation spreads `checkoutTexts` into its create
 * params, and takes its `billing_cycle_anchor` from `firstPayment`. No I/O.
 */
import { amountOf, dateOf, PRICE_CENTS, type Billing, type Language } from "./contract-wording";

/** The part of Stripe's Checkout Session create params these texts fill. */
export type CheckoutTexts = {
  locale: Language;
  consent_collection: { terms_of_service: "required" };
  custom_text: { submit: { message: string }; terms_of_service_acceptance: { message: string } };
};

/** Stripe's limit on each `custom_text` message. */
export const CUSTOM_TEXT_LIMIT = 1200;

/** The Family the Admin orders for: in its Trial, which ends at `trialEndsAt`, or Locked. */
export type OrderingFamily = { case: "trial"; trialEndsAt: Date } | { case: "locked" };

/** The Session's `billing_cycle_anchor`, null for none, and when the first payment falls due. */
export type FirstPayment = { billingCycleAnchor: Date | null; dueAt: Date };

/** Stripe takes a `billing_cycle_anchor` only in the future, as of when the Session reaches it. */
const ANCHOR_LEEWAY_MS = 60_000;

/**
 * When an order made `now` is first paid: at the end of the Trial; at once, with no
 * `billing_cycle_anchor`, for a Locked Family or one whose Trial is as good as over.
 */
export function firstPayment(family: OrderingFamily, now: Date): FirstPayment {
  if (family.case === "locked" || family.trialEndsAt.getTime() - now.getTime() < ANCHOR_LEEWAY_MS) return { billingCycleAnchor: null, dueAt: now };
  return { billingCycleAnchor: family.trialEndsAt, dueAt: family.trialEndsAt };
}

/** The lines of the summary both billings share: first the AI sentence, then the offer, and last the right of withdrawal. */
const SHARED: Record<Language, { ai: string; offer: string; withdrawal: string }> = {
  de: {
    ai: "Wichtig: Termine in E-Mails und Dokumenten erkennt ein KI-Modell. Die Erkennung kann unvollständig oder fehlerhaft sein.",
    offer: "Family Agenda Cloud für Ihre Familie: jedes Mitglied mit eigener Agenda, Stundenplan, Kalender, E-Mails und Dokumente als Quellen, Betrieb in Deutschland.",
    withdrawal: "14 Tage Widerrufsrecht; bei Widerruf erstatten wir alles Gezahlte.",
  },
  en: {
    ai: "Important: an AI model detects dates in emails and documents. Detection may be incomplete or wrong.",
    offer: "Family Agenda Cloud for your family: every member with their own agenda, timetable, calendars, emails and documents as sources, run in Germany.",
    withdrawal: "14-day right of withdrawal; on withdrawal we refund everything you paid.",
  },
};

/** The lines of the summary on price, first payment, term and cancellation, from the price and the date formatted. */
const TERMS: Record<Language, Record<Billing, (price: string, date: string) => string>> = {
  de: {
    monthly: (price, date) => `Preis: ${price} pro Monat inkl. USt.
Erste Zahlung am ${date}, danach monatlich.
Laufzeit: ein Monat, verlängert sich jeweils um einen Monat.
Kündigung: jederzeit zum Monatsende, online im Admin-Bereich.`,
    yearly: (price, date) => `Preis: ${price} pro Jahr inkl. USt.
Erste Zahlung am ${date}, danach jährlich.
Laufzeit: ein Jahr, verlängert sich jeweils um ein Jahr.
Kündigung: zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung, online im Admin-Bereich.`,
  },
  en: {
    monthly: (price, date) => `Price: ${price} per month, VAT included.
First payment on ${date}, then monthly.
Term: one month, renewing for one month at a time.
Cancellation: any time with effect from the end of the month, online in the Admin area.`,
    yearly: (price, date) => `Price: ${price} per year, VAT included.
First payment on ${date}, then yearly.
Term: one year, renewing for one year at a time.
Cancellation: with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund, online in the Admin area.`,
  },
};

const TERMS_ACCEPTANCE: Record<Language, string> = {
  de: "Ich stimme den [AGB](https://family-agenda.cloud/agb) zu. Die [Widerrufsbelehrung](https://family-agenda.cloud/widerrufsbelehrung) und die [Datenschutzerklärung](https://family-agenda.cloud/datenschutz) habe ich zur Kenntnis genommen.",
  en: "I agree to the [terms](https://family-agenda.cloud/agb) (German, binding; [English translation](https://family-agenda.cloud/en/terms)). I have read the [withdrawal policy](https://family-agenda.cloud/en/withdrawal) and the [privacy policy](https://family-agenda.cloud/en/privacy).",
};

/** The § 312j summary: the AI sentence first, so it is the most prominent line. */
export function checkoutSummary(language: Language, billing: Billing, firstPaymentAt: Date): string {
  const { ai, offer, withdrawal } = SHARED[language];
  const terms = TERMS[language][billing](amountOf(PRICE_CENTS[billing], language), dateOf(firstPaymentAt, language));
  return `${ai}\n\n${offer}\n${terms}\n${withdrawal}`;
}

/** The texts of a Checkout Session in `language` for the Tariff billed `billing`, first paid at `firstPaymentAt`. */
export function checkoutTexts(language: Language, billing: Billing, firstPaymentAt: Date): CheckoutTexts {
  return {
    locale: language,
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      submit: { message: checkoutSummary(language, billing, firstPaymentAt) },
      terms_of_service_acceptance: { message: TERMS_ACCEPTANCE[language] },
    },
  };
}
