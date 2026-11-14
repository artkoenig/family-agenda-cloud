# #33 Compare payment providers

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-07T16:29:12Z
- Closed: 2026-11-07T16:33:03Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/33

## Question

Which providers fit an Einzelunternehmer (no Kleinunternehmer) selling a B2C Subscription across the EU? Compare Merchant of Record options with Stripe Billing on: fees, EU VAT handling, invoices, trial without payment method, dunning (retries, reminder mails), Customer portal, webhooks, cancellation button support, payout and accounting effort.

---

**Comment by artkoenig, 2026-11-07T16:33:02Z**

Resolved. Findings: `docs/research/payment-providers.md` (untracked for now; the repo has no commits yet). Comparison only, no decision.

- **Stripe Billing + Tax**: cheapest (about 3.2% on an illustrative €50 yearly charge, 7.7% on €5 monthly). Only provider with full trial without payment method (GA). Maintainer stays merchant: OSS and VAT returns, disputes and support remain. Stripe does not file for a German seller.
- **MoR** (Paddle, Stripe Managed Payments, Lemon Squeezy, Polar): VAT and most accounting go away, at about 6-7.5% on €50 and 11-17% on €5.
- **Trial without payment method**: Paddle has early access only (API only, no reminders, no portal support). Polar's built-in trial collects payment info. Lemon Squeezy's guide tracks it in the app. Managed Payments documents no such flow. An app-side trial with checkout at conversion works with all of them.
- **§ 312k BGB**: no provider covers it out of the box. Own button and confirmation page needed in every case.
- **Glossary conflict**: under an MoR the sale is with the MoR, while `GLOSSARY.md` makes the Customer the Operator's contract partner. Needs legal review.
- **Portal**: Stripe and Paddle cover payment details, invoices and cancellation, which informs the Customer area.

Open: Managed Payments cardless trial (sandbox test), MoR product acceptance, German tax and legal points marked in the file. Lemon Squeezy and Polar details partly unverified.
