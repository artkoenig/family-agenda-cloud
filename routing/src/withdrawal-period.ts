/**
 * The withdrawal period of a Subscription (#230): 14 days from the day after the order, counted in
 * Berlin's calendar. A Withdrawal is within it if it comes in by the end of the 14th day after the
 * day of the order, Berlin time. No I/O.
 */
import { berlinDayOf, daysAfter } from "./contract-wording";

/** How many days after the day of the order the period's last day is. */
export const WITHDRAWAL_DAYS = 14;

/** The period's last day, as noon UTC of it: an instant that names the same date in Berlin. */
export function withdrawalPeriodEnd(orderedOn: Date): Date {
  return daysAfter(orderedOn, WITHDRAWAL_DAYS);
}

/** Whether what came in at `receivedAt` came in within the period of a Subscription ordered at `orderedOn`. */
export function isWithinWithdrawalPeriod(orderedOn: Date, receivedAt: Date): boolean {
  return berlinDayOf(receivedAt) <= berlinDayOf(withdrawalPeriodEnd(orderedOn));
}
