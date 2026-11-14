# #72 Research Stripe Checkout and Customer Portal against the German button and cancellation duties

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-13T21:33:15Z
- Closed: 2026-11-13T21:36:29Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/72

## Question

Can Stripe-hosted pages carry what [Decide registration flow](https://github.com/artkoenig/family-agenda-cloud/issues/37) and [Decide Subscription lifecycle](https://github.com/artkoenig/family-agenda-cloud/issues/38) require, or must `site` build its own pages?

- **Checkout (subscription mode, trial):** can the submit button read "zahlungspflichtig bestellen" or equivalent (§ 312j BGB), can mandatory information, first charge date and amount, terms checkbox, 18+ and consumer confirmation be shown and recorded; German and English; Stripe Tax; card fingerprint available for the one-trial-per-card rule; versus Payment Element on an own page.
- **Customer Portal:** what it covers (payment method update, invoices, cancel, tariff switch at period end, refunds for yearly cancellation), whether its cancel flow can satisfy § 312k or conflicts with our own button, and whether features can be switched off.

Sources: Stripe docs only, see `docs/research/legal-duties-b2c-eu.md` for the duties. Findings into `docs/research/stripe-hosted-pages.md`.

---

**Comment by artkoenig, 2026-11-13T21:36:28Z**

**Answer:** Stripe-hosted pages cannot be the § 312j order step. `site` builds its own order page and its own § 312k cancel page.

- Hosted and embedded Checkout fix the button text through an enum ("Subscribe"/"Abonnieren", "Buy"). "zahlungspflichtig bestellen" is impossible.
- Use Checkout Sessions with `ui_mode: elements` (Payment Element) on our own page. It has our own button, mandatory info, first charge date and amount, terms, 18+ and consumer checkboxes (recorded by us), de and en, and Stripe Tax via `automatic_tax`.
- `card.fingerprint` works for one trial per card. Apple Pay and Google Pay may yield a token-based fingerprint.
- Customer Portal: good for payment method update, invoices and a tariff switch at period end. Every feature can be toggled off.
- The portal's cancel flow cannot be set to the § 312k wording or fields (end date, saveable declaration) and needs a server-created session. Build our own § 312k page that cancels via the API, and disable portal cancel.
- The portal never refunds. The yearly prorated refund (§ 309 Nr. 9) needs the API: cancel, then issue a Refund.

Details and sources: https://github.com/artkoenig/family-agenda-cloud/blob/research/stripe-hosted-pages/docs/research/stripe-hosted-pages.md

