# #36 Decide payment provider

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T16:29:20Z
- Closed: 2026-11-07T19:19:09Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/36

## Question

Which payment provider does the service use, and is it a Merchant of Record?

---

**Comment by artkoenig, 2026-11-07T19:19:08Z**

**Decision: Stripe Billing + Stripe Tax. No Merchant of Record. The Operator is the merchant.**

Why: an MoR was first preferred for least work, but deeper research ([Paddle](https://github.com/artkoenig/family-agenda-cloud/issues/42), [German providers](https://github.com/artkoenig/family-agenda-cloud/issues/43)) showed unresolved blockers before the first sale: yearly renewal vs § 309 Nr. 9 BGB, the § 312j order button, prices under $10, plus contract rework. As own merchant, terms and order path are under our control, fees are about half, and `GLOSSARY.md` stays valid.

Accepted cost: VAT returns, OSS once above EUR 10,000 cross-border B2C, disputes, buyer support, bookkeeping. Small at low revenue.

Consequences:
- Customer and Subscription definitions unchanged.
- Candidate set closed; Mollie and others not compared.
- Trial placement (app-side or Stripe) goes to Decide Subscription lifecycle.
- Stripe's hosted Checkout button label is unverified for § 312j; assume an own order page with Stripe's payment element unless proven otherwise.
- Own § 312k and withdrawal paths needed.
- Who handles VAT work (tax adviser recommended) was not confirmed by the maintainer. [TAX] points in `docs/research/payment-providers.md` stay open.
- An MoR can be reassessed if OSS work grows; migration is not free.
