/**
 * The dates a Subscription can be cancelled to (#229), and what each of them settles (#190). All of
 * them are ends of its monthly cycles, counted from its billing anchor as Stripe counts them: the
 * same day and time a month on, or the month's last day if it has no such day. No I/O.
 *
 * - Ordered during the Trial and not paid yet: the earliest is the Trial's end, and nothing is charged.
 * - Monthly: the end of every billing period from the current one on.
 * - Yearly: the end of year one first, and no day before it. From then on the end of every monthly
 *   cycle; the months of the paid year left after it are paid back, and the Subscription stays yearly.
 */
import { PRICE_CENTS, type Billing, type Settlement } from "./contract-wording";

/** The Subscription as far as its end dates follow from it: `anchor` is when it is, or was, first paid. */
export type Cancellable = { billing: Billing; anchor: Date };

/** A date to cancel to, and what cancelling to it settles. */
export type EndDate = { end: Date; settlement: Settlement };

/** How many dates are offered. */
export const END_DATES = 12;

const MONTHS_OF_YEAR = 12;

/** The dates to choose from at `now`, the earliest first. */
export function endDatesOf({ billing, anchor }: Cancellable, now: Date): [EndDate, ...EndDate[]] {
  const endOf = (cycle: number): EndDate => ({ end: monthsAfter(anchor, cycle), settlement: settlementOf(billing, cycle) });
  const first = firstCycle(billing, anchor, now);
  const later = (from: number): EndDate[] => Array.from({ length: END_DATES - 1 }, (_, index) => endOf(from + index));
  if (now < anchor) return [{ end: anchor, settlement: { case: "ordered-during-trial" } }, ...later(first)];
  return [endOf(first), ...later(first + 1)];
}

/** The first monthly cycle whose end is offered: the one running at `now`, but none before the end of a yearly one's year one. */
function firstCycle(billing: Billing, anchor: Date, now: Date): number {
  let cycle = 1;
  while (monthsAfter(anchor, cycle) <= now) cycle++;
  return billing === "yearly" ? Math.max(cycle, MONTHS_OF_YEAR) : cycle;
}

/** Nothing more for a monthly Subscription, or at the end of a paid year; else the months left of that year. */
function settlementOf(billing: Billing, cycle: number): Settlement {
  const monthsLeft = (MONTHS_OF_YEAR - (cycle % MONTHS_OF_YEAR)) % MONTHS_OF_YEAR;
  if (billing === "monthly" || monthsLeft === 0) return { case: "plain" };
  return { case: "yearly-after-year-one", refundCents: Math.floor((monthsLeft * PRICE_CENTS.yearly) / MONTHS_OF_YEAR) };
}

/** The instant so many months after another, in UTC; the month's last day if it has no such day. */
export function monthsAfter(instant: Date, months: number): Date {
  const first = new Date(instant);
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(instant.getUTCDate(), lastDay));
  return first;
}
