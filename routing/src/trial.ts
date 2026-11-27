/**
 * A Family's Trial: it starts once, when the Family is created or when the Operator starts it, and
 * ends exactly 14 days of 24 hours later, whatever the Family's time zone does in between (#188).
 * No I/O.
 */

/** How many days a Trial lasts. */
export const TRIAL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a Trial that started at `start` ends. */
export function trialEndsAt(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

/** Whether a Family whose Trial ends at `trialEndsAt`, if it has one, is in it at `now`. */
export function isInTrial({ trialEndsAt }: { trialEndsAt: Date | null }, now: Date): boolean {
  return trialEndsAt !== null && now < trialEndsAt;
}
