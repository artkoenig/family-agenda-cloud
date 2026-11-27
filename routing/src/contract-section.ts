/**
 * The Contract section of the Admin area (#267): HTML for inside the core's main part, of the
 * classes a section may use, and never a whole page. The founder reads the Tariff, its term and the
 * Trial, with links to the pages that order, cancel and withdraw; a browser without a session, the
 * way to sign in. Dates are the Family's time zone's. No I/O.
 */
import { escape } from "./contract-pages";
import { CONTRACT_LINKS, CONTRACT_PATHS, dateAfterIn, dateIn, daysBetween, DELETED_AFTER_DAYS, type Billing, type Language } from "./contract-wording";
import type { LockReason } from "./directory";
import { CONTRACT_SECTION_PATH, ORDER_PATHS, signInPathFor } from "./routing-pages";
import { isWithinWithdrawalPeriod } from "./withdrawal-period";

/** The running Subscription, as the Directory keeps it. */
export type SectionSubscription = { billing: Billing | null; status: string; orderedAt: Date | null; currentPeriodEnd: Date | null; cancelAt: Date | null };

/** What the founder reads of. */
export type SectionContract = {
  /** The Family's time zone. */
  timeZone: string;
  /** When the Family's one Trial ends or ended; null without one. */
  trialEndsAt: Date | null;
  /** Null while the Family is not Locked. */
  lock: { since: Date; reason: LockReason | null } | null;
  /** Null while none runs. */
  subscription: SectionSubscription | null;
  /** The Contract holder's name if that is not the founder, else null. */
  otherHolder: string | null;
  now: Date;
};

type Words = {
  title: string;
  rows: { tariff: string; status: string; holder: string; renews: string; ends: string; firstCharge: string; deletion: string };
  tariff: Record<Billing, string>;
  trial: string;
  trialUntil: (date: string) => string;
  active: string;
  unpaid: string;
  none: string;
  lockedSince: (date: string) => string;
  lockReason: Record<LockReason, string>;
  daysLeft: (days: number) => string;
  order: string;
  signIn: { line: string; link: string };
};

const WORDS: Record<Language, Words> = {
  de: {
    title: "Vertrag",
    rows: {
      tariff: "Tarif",
      status: "Status",
      holder: "Bestellt von",
      renews: "Verlängert sich am",
      ends: "Endet am",
      firstCharge: "Erste Abbuchung am",
      deletion: "Löschung am",
    },
    tariff: { monthly: "Monatsabo", yearly: "Jahresabo" },
    trial: "Testzeitraum",
    trialUntil: (date) => `Testzeitraum bis ${date}`,
    active: "aktiv",
    unpaid: "Zahlung offen",
    none: "kein Vertrag",
    lockedSince: (date) => `gesperrt seit ${date}`,
    lockReason: { trial_ended: "der Testzeitraum ist abgelaufen", subscription_ended: "das Abo ist beendet", unpaid: "die Zahlung ist offen" },
    daysLeft: (days) => (days === 0 ? "heute" : `noch ${days} ${days === 1 ? "Tag" : "Tage"}`),
    order: "Abo bestellen",
    signIn: { line: "Bitte melde dich an, um den Vertrag zu sehen.", link: "Anmelden" },
  },
  en: {
    title: "Contract",
    rows: {
      tariff: "Tariff",
      status: "Status",
      holder: "Ordered by",
      renews: "Renews on",
      ends: "Ends on",
      firstCharge: "First charge on",
      deletion: "Deletion on",
    },
    tariff: { monthly: "Monthly subscription", yearly: "Yearly subscription" },
    trial: "Trial",
    trialUntil: (date) => `Trial until ${date}`,
    active: "active",
    unpaid: "payment outstanding",
    none: "no contract",
    lockedSince: (date) => `locked since ${date}`,
    lockReason: { trial_ended: "the trial has ended", subscription_ended: "the subscription has ended", unpaid: "the payment is outstanding" },
    daysLeft: (days) => (days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} left`),
    order: "Order subscription",
    signIn: { line: "Please sign in to see the contract.", link: "Sign in" },
  },
};

/** A row of the description list, its value as plain text; null for one that is left out. */
type Row = [name: string, value: string | null];

type Reading = { language: Language; words: Words; contract: SectionContract; date: (instant: Date) => string };

/** What the founder reads. */
export function contractSectionHtml(language: Language, contract: SectionContract): string {
  const reading: Reading = { language, words: WORDS[language], contract, date: (instant) => dateIn(contract.timeZone, instant, language) };
  return fragment(language, `${list(rowsOf(reading))}${actions(linksOf(reading))}`);
}

/** What a browser without a session reads: the way to the sign-in that comes back to the section. */
export function signInSectionHtml(language: Language): string {
  const { line, link } = WORDS[language].signIn;
  return fragment(language, `<p>${escape(line)}</p>${actions([button(signInPathFor(CONTRACT_SECTION_PATH), link, "primary")])}`);
}

function rowsOf(reading: Reading): Row[] {
  const { contract } = reading;
  if (contract.lock) return lockedRows(reading, contract.lock);
  if (contract.subscription) return subscriptionRows(reading, contract.subscription);
  return trialRows(reading);
}

function lockedRows({ language, words, contract, date }: Reading, { since, reason }: NonNullable<SectionContract["lock"]>): Row[] {
  const why = reason ? ` (${words.lockReason[reason]})` : "";
  return [
    [words.rows.status, `${words.lockedSince(date(since))}${why}`],
    [words.rows.deletion, dateAfterIn(contract.timeZone, since, DELETED_AFTER_DAYS, language)],
  ];
}

function subscriptionRows(reading: Reading, subscription: SectionSubscription): Row[] {
  const { words, contract } = reading;
  return [
    [words.rows.tariff, subscription.billing && words.tariff[subscription.billing]],
    [words.rows.status, statusOf(reading, subscription)],
    [words.rows.holder, contract.otherHolder],
    ...termRows(reading, subscription),
  ];
}

function statusOf({ words, contract, date }: Reading, { status }: SectionSubscription): string {
  if (status === "past_due" || status === "unpaid") return words.unpaid;
  const trialEnd = runningTrialEnd(contract);
  return trialEnd ? words.trialUntil(date(trialEnd)) : words.active;
}

/** When the Subscription is first paid, renews or ends. */
function termRows({ words, contract, date }: Reading, { currentPeriodEnd, cancelAt }: SectionSubscription): Row[] {
  const trialEnd = runningTrialEnd(contract);
  const charged = trialEnd && !endsWithTrial(cancelAt, trialEnd) ? trialEnd : null;
  const renewal = trialEnd || cancelAt ? null : currentPeriodEnd;
  return [
    [words.rows.firstCharge, charged && date(charged)],
    [words.rows.renews, renewal && date(renewal)],
    [words.rows.ends, cancelAt && date(cancelAt)],
  ];
}

/** Whether a Cancellation is to the Trial's end, which Stripe keeps rounded up to whole seconds. */
const endsWithTrial = (cancelAt: Date | null, trialEnd: Date): boolean => cancelAt !== null && cancelAt.getTime() <= Math.ceil(trialEnd.getTime() / 1000) * 1000;

function trialRows({ words, contract, date }: Reading): Row[] {
  const trialEnd = runningTrialEnd(contract);
  if (!trialEnd) return [[words.rows.status, words.none]];
  const left = words.daysLeft(daysBetween(contract.timeZone, contract.now, trialEnd));
  return [
    [words.rows.status, words.trial],
    [words.rows.ends, `${date(trialEnd)} (${left})`],
  ];
}

/** When the Trial ends if it still runs, else null. */
const runningTrialEnd = ({ trialEndsAt, now }: SectionContract): Date | null => (trialEndsAt !== null && now < trialEndsAt ? trialEndsAt : null);

/** The way to order, or to cancel and, within its period, to withdraw: a running Subscription cannot be ordered again. */
function linksOf({ language, words, contract }: Reading): string[] {
  const { subscription, lock, now } = contract;
  if (!subscription) return lock || runningTrialEnd(contract) ? [button(ORDER_PATHS.order[language], words.order, "primary")] : [];
  const { orderedAt } = subscription;
  const pages: ("cancel" | "withdraw")[] = orderedAt && isWithinWithdrawalPeriod(orderedAt, now) ? ["cancel", "withdraw"] : ["cancel"];
  return pages.map((page) => button(CONTRACT_PATHS[page][language], CONTRACT_LINKS[language][page], "secondary"));
}

const button = (href: string, label: string, kind: "primary" | "secondary"): string => `<a class="fam-button fam-button--${kind}" href="${escape(href)}">${escape(label)}</a>`;

const actions = (links: string[]): string => (links.length === 0 ? "" : `<div class="fam-group__actions">${links.join("")}</div>`);

const list = (rows: Row[]): string => `<dl>${rows.map(([name, value]) => (value === null ? "" : `<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`)).join("")}</dl>`;

const fragment = (language: Language, content: string): string =>
  `<div class="fam-sheet"><section class="fam-group"><h2 class="fam-group__title">${escape(WORDS[language].title)}</h2>${content}</section></div>`;
