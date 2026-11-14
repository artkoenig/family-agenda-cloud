# #38 Decide Subscription lifecycle

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T16:29:25Z
- Closed: 2026-11-07T20:27:45Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/38

## Question

What are the states of a Subscription and their effect on the Family: trial, trial end, active, payment failure, lock, cancellation, deletion? How do they map to the existing closing and grace period?

---

**Comment by artkoenig, 2026-11-07T20:18:07Z**

Input from [Decide registration flow](https://github.com/artkoenig/family-agenda-cloud/issues/37): trial is 2 weeks with payment method at the start and converts automatically; no pilot. Withdrawal and cancellation during the trial belong here.

---

**Comment by artkoenig, 2026-11-07T20:27:44Z**

**Decision: Subscription lifecycle**

- **Trial:** Stripe's native trial, 2 weeks. One paid contract from the order, first 2 weeks free, so one withdrawal period from the order. The order page states first charge date and amount. No reminder mail before the first charge.
- **Cancel:** the Family keeps running until the trial or billing period ends, then closing. No charge when cancelled in the trial.
- **Yearly after year one:** keeps charging yearly, cancellable any time with one month's notice, unused part refunded (§ 309 Nr. 9).
- **Payment failure (including first charge):** days 0-7 past due, with retries, mails and full use. Days 7-14 Payment lock. Day 14 Subscription cancelled, closing starts.
- **Payment lock:** all members see an overdue page, workers pause, Customer can update payment, Admins can download a Backup. Payment unlocks at once.
- **Closing:** one path for every end: lock at once, 7-day grace, deletion (day 21 for non-payment). The decision in #20 stands: grace is for Operator undo on request only, no self-service return. The closing mail names contact and deletion date.
- **Backup before automatic closing:** possible during normal use until period end and during Payment lock, with reminder mails. Grace stays closed.
- **Withdrawal:** closing at once, Backup offered in the withdraw flow. Refund the amount paid minus pro-rata Wertersatz for paid days only.
- **Chargeback:** straight to Payment lock, then as day 7 of payment failure; unlock if won.
- **Operator termination:** cancels the Subscription and starts closing; mail states the reason.
- **Tariff switch:** takes effect at end of the billing period, no proration; at once during the trial.

Lawyer review: contract and order wording, yearly renewal, Wertersatz, termination clause.
Consequences: Payment lock and Backup access during it are new requirements on the app. A Customer who is not an Admin cannot download a Backup: goes to Decide Customer succession. `GLOSSARY.md` gained Payment lock.

