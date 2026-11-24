/**
 * The words the contract pages (contract-pages.ts) and their mails (contract-mails.ts) share
 * (#214): how they name a contract, its dates, times and amounts, and the links and lines the
 * Admin area and the Locked page show. Dates and times are Berlin's, whatever the Family's time
 * zone: `TT.MM.JJJJ` and `HH:MM Uhr` in German, `D Month YYYY` and `HH:MM (Berlin time)` in English.
 * No I/O.
 */
import type { Language } from "./sign-in-pages";

export type { Language } from "./sign-in-pages";

/** How the Tariff is billed. */
export type Billing = "monthly" | "yearly";

/** What the Tariff costs per billing period, in cents, VAT included (#187). */
export const PRICE_CENTS: Record<Billing, number> = { monthly: 499, yearly: 4990 };

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

/**
 * The language of a mail for the recipient's Logto locale (#192): German for any German locale,
 * English for any other. German for none, until people have a locale at Logto (#243).
 */
export function mailLanguageOf(locale: string | null | undefined): Language {
  if (!locale) return "de";
  return locale.toLowerCase().split(/[-_]/)[0] === "de" ? "de" : "en";
}

const BERLIN = "Europe/Berlin";

const DATE_FORMATS: Record<Language, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, day: "2-digit", month: "2-digit", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: BERLIN, day: "numeric", month: "long", year: "numeric" }),
};

const TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Year, month and day as Berlin counts them, e.g. `2026-03-05`. */
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Berlin date of an instant, e.g. `05.03.2026` or `5 March 2026`. */
export function dateOf(instant: Date, language: Language): string {
  return DATE_FORMATS[language].format(instant);
}

/** The Berlin date `days` calendar days after that of an instant, whatever daylight saving does in between. */
export function dateAfter(instant: Date, days: number, language: Language): string {
  const [year, month, day] = BERLIN_DAY.format(instant).split("-").map(Number) as [number, number, number];
  // Noon UTC falls on the same date in Berlin, at UTC+1 or UTC+2.
  return dateOf(new Date(Date.UTC(year, month - 1, day + days, 12)), language);
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

const BILLING: Record<Language, Record<Billing, string>> = {
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

/** The links of the Admin area and the Locked page to the contract pages; their labels stay German but for deleting. */
export const CONTRACT_LINKS: Record<Language, Record<keyof typeof CONTRACT_PATHS, string>> = {
  de: { cancel: "Verträge hier kündigen", withdraw: "Vertrag widerrufen", delete: "Familie löschen" },
  en: { cancel: "Verträge hier kündigen", withdraw: "Vertrag widerrufen", delete: "Delete family" },
};

/** What other Admins see instead of the links to cancel and withdraw. */
export function holderLine(holderName: string, language: Language): string {
  return language === "de" ? `Vertragsinhaber: ${holderName}` : `Contract holder: ${holderName}`;
}

/** What other Admins see instead of the link to delete: the one Admin who may. */
export function deleterLine(deleterName: string, language: Language): string {
  return language === "de" ? `Löschen kann nur: ${deleterName}` : `Only ${deleterName} can delete the family`;
}

/**
 * What the holder sees after a Cancellation, shown as `<status> · <undo> <undoNote>`: the link to
 * take it back keeps its German label, which English explains in `undoNote`.
 */
export type CancelledLine = { status: string; undo: string; undoNote: string | null };

export function cancelledLine(endsOn: Date, language: Language): CancelledLine {
  const undo = "Kündigung zurücknehmen";
  return language === "de"
    ? { status: `Gekündigt zum ${dateOf(endsOn, language)}`, undo, undoNote: null }
    : { status: `Cancelled with effect from ${dateOf(endsOn, language)}`, undo, undoNote: "(undo cancellation)" };
}
