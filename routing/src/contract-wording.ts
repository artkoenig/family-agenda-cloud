/**
 * The words the contract pages (contract-pages.ts) and their mails (contract-mails.ts) share
 * (#214): how they name a contract, its dates, times and amounts, and the links and lines the
 * Admin area and the Locked page show. Dates and times are Berlin's, whatever the Family's time
 * zone: `TT.MM.JJJJ` and `HH:MM Uhr` in German, `D Month YYYY` and `HH:MM (Berlin time)` in English.
 * Only the dates of the Contract section (`…In`) are of a time zone given. No I/O.
 */
import type { Language } from "./sign-in-pages";

export type { Language } from "./sign-in-pages";

/** How the Tariff is billed. */
export type Billing = "monthly" | "yearly";

/** What the Tariff costs per billing period, in cents, VAT included (#187). */
export const PRICE_CENTS: Record<Billing, number> = { monthly: 499, yearly: 4990 };

/** What a month of the yearly Tariff comes to (Art. 246a EGBGB). */
export const YEARLY_PER_MONTH_CENTS = Math.round(PRICE_CENTS.yearly / 12);

/** The Subscription as the pages and mails name it. */
export type Contract = { billing: Billing; familyName: string; orderedOn: Date };

/** A person the pages and mails address: the Subscription's holder, or an Admin. */
export type Person = { name: string; email: string };

/**
 * What the earliest end of a Subscription costs or pays back (#190): nothing more for a monthly
 * one or a yearly one in its first year; the unused part of the yearly fee, in cents, for a yearly
 * one after its first year; and nothing at all for one ordered during the Trial.
 */
export type Settlement = { case: "plain" } | { case: "yearly-after-year-one"; refundCents: number } | { case: "ordered-during-trial" };

/** Where the Routing module serves the contract pages; the English ones under `/en`. */
export const CONTRACT_PATHS: Record<"cancel" | "withdraw" | "delete", Record<Language, string>> = {
  cancel: { de: "/cancel", en: "/en/cancel" },
  withdraw: { de: "/withdraw", en: "/en/withdraw" },
  delete: { de: "/delete", en: "/en/delete" },
};

/** Where the Routing module serves the fragment of the Contract section (#267). */
export const CONTRACT_FRAGMENT_PATHS: Record<Language, string> = { de: "/contract", en: "/en/contract" };

/** How many days after it was Locked a Family is deleted (#228). */
export const DELETED_AFTER_DAYS = 30;

/**
 * The language of a mail for the recipient's Logto locale (#192): German for any German locale,
 * English for any other. German for none, until people have a locale at Logto (#243).
 */
export function mailLanguageOf(locale: string | null | undefined): Language {
  if (!locale) return "de";
  return locale.toLowerCase().split(/[-_]/)[0] === "de" ? "de" : "en";
}

const BERLIN = "Europe/Berlin";

const dateFormatsIn = (timeZone: string): Record<Language, Intl.DateTimeFormat> => ({
  de: new Intl.DateTimeFormat("de-DE", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "long", year: "numeric" }),
});

const DATE_FORMATS = dateFormatsIn(BERLIN);

const TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Year, month and day as a time zone counts them, e.g. `2026-03-05`. */
const dayFormatIn = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

const DAY_MS = 24 * 60 * 60_000;

const BERLIN_DAY = dayFormatIn(BERLIN);

/** The Berlin date of an instant, e.g. `05.03.2026` or `5 March 2026`. */
export function dateOf(instant: Date, language: Language): string {
  return DATE_FORMATS[language].format(instant);
}

/** The date of an instant in the time zone, as `dateOf` formats Berlin's. */
export function dateIn(timeZone: string, instant: Date, language: Language): string {
  return dateFormatsIn(timeZone)[language].format(instant);
}

/** How many calendar days of the time zone `to` is after `from`. */
export function daysBetween(timeZone: string, from: Date, to: Date): number {
  const format = dayFormatIn(timeZone);
  return (Date.parse(format.format(to)) - Date.parse(format.format(from))) / DAY_MS;
}

/** The date `days` calendar days of the time zone after that of an instant, whatever daylight saving does in between. */
export function dateAfterIn(timeZone: string, instant: Date, days: number, language: Language): string {
  return dateIn("UTC", new Date(Date.parse(dayFormatIn(timeZone).format(instant)) + days * DAY_MS), language);
}

/** The Berlin day of an instant as `YYYY-MM-DD`, which sorts as the days do. */
export function berlinDayOf(instant: Date): string {
  return BERLIN_DAY.format(instant);
}

/** Noon UTC of the Berlin day `days` calendar days after that of an instant, whatever daylight saving does in between. */
export function daysAfter(instant: Date, days: number): Date {
  const [year, month, day] = berlinDayOf(instant).split("-").map(Number) as [number, number, number];
  // Noon UTC falls on the same date in Berlin, at UTC+1 or UTC+2.
  return new Date(Date.UTC(year, month - 1, day + days, 12));
}

/** The Berlin date `days` calendar days after that of an instant, whatever daylight saving does in between. */
export function dateAfter(instant: Date, days: number, language: Language): string {
  return dateOf(daysAfter(instant, days), language);
}

/** The Berlin time of an instant, e.g. `09:05 Uhr` or `09:05 (Berlin time)`. */
export function timeOf(instant: Date, language: Language): string {
  const time = TIME_FORMAT.format(instant);
  return language === "de" ? `${time} Uhr` : `${time} (Berlin time)`;
}

const AMOUNT_FORMATS: Record<Language, Intl.NumberFormat> = {
  de: new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** An amount in euros from cents, e.g. `12,34 €` or `€12.34`. */
export function amountOf(cents: number, language: Language): string {
  const amount = AMOUNT_FORMATS[language].format(cents / 100);
  return language === "de" ? `${amount} €` : `€${amount}`;
}

/** How the pages and mails name a billing. */
export const BILLING: Record<Language, Record<Billing, string>> = {
  de: { monthly: "monatlich", yearly: "jährlich" },
  en: { monthly: "monthly", yearly: "yearly" },
};

/** The contract, e.g. `Family Agenda, monatlich, Familie Muster`. */
export function contractOf({ billing, familyName }: Contract, language: Language): string {
  return `Family Agenda, ${BILLING[language][billing]}, ${language === "de" ? "Familie" : "family"} ${familyName}`;
}

/** The contract with its order date, e.g. `Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026`. */
export function orderedContractOf(contract: Contract, language: Language): string {
  return `${contractOf(contract, language)}, ${language === "de" ? "bestellt am" : "ordered on"} ${dateOf(contract.orderedOn, language)}`;
}

/**
 * The links of the Admin area and the Locked page to the contract pages, in the page's language:
 * § 312k and § 356a BGB name the German labels "or an equally unambiguous wording".
 */
export const CONTRACT_LINKS: Record<Language, Record<keyof typeof CONTRACT_PATHS, string>> = {
  de: { cancel: "Verträge hier kündigen", withdraw: "Vertrag widerrufen", delete: "Familie löschen" },
  en: { cancel: "Cancel contracts here", withdraw: "Withdraw from contract", delete: "Delete family" },
};

/** What other Admins see instead of the links to cancel and withdraw. */
export function holderLine(holderName: string, language: Language): string {
  return language === "de" ? `Vertragsinhaber: ${holderName}` : `Contract holder: ${holderName}`;
}

/** What other Admins see instead of the link to delete: the one Admin who may. */
export function deleterLine(deleterName: string, language: Language): string {
  return language === "de" ? `Löschen kann nur: ${deleterName}` : `Only ${deleterName} can delete the family`;
}

/** What other Admins see instead of the button to order: the one Admin who may. */
export function ordererLine(ordererName: string, language: Language): string {
  return language === "de" ? `Bestellen kann nur: ${ordererName}` : `Only ${ordererName} can order`;
}

/** What the holder sees after a Cancellation: its status, and the label of the button that takes it back. */
export type CancelledLine = { status: string; undo: string };

export function cancelledLine(endsOn: Date, language: Language): CancelledLine {
  return language === "de"
    ? { status: `Gekündigt zum ${dateOf(endsOn, language)}`, undo: "Kündigung zurücknehmen" }
    : { status: `Cancelled with effect from ${dateOf(endsOn, language)}`, undo: "Undo cancellation" };
}
