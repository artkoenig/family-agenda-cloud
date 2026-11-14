# #32 Map: Public entry point of the hosted service (landing page, registration, billing)

- State: CLOSED (NOT_PLANNED)
- Labels: wayfinder:map
- Created: 2026-11-07T16:28:58Z
- Closed: 2026-11-14T19:25:31Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/32

## Destination

Every decision for the public entry point of the hosted service is made (landing page, registration, billing, Customer area, legal texts, transactional mail), so the work can be handed off as implementable issues in this repo. This map plans only; it builds nothing.

## Notes

- Fresh effort announced as out of scope in map #1; its decisions stand. In particular: hosted sign-in only through Operator-configured Identity Providers (no passwords), one Family per person, provisioning per [Provision and remove a database per Family](https://github.com/artkoenig/family-agenda-cloud/issues/26), closing locks at once with a 7-day grace period, Onboarding runs in the app after first sign-in.
- Operation of the service stays in [Run the hosted multi-Family service](https://github.com/artkoenig/family-agenda-cloud/issues/24).
- Seller: the maintainer as Einzelunternehmer, not a Kleinunternehmer (§ 19 UStG does not apply). Market: EU, German and English.
- Model: 2-week trial with payment method taken at the start, converting to the Subscription. One tariff, monthly and yearly; price set after usage measurements.
- No pilot: registration opens at launch, with billing and legal texts live.
- Contract partner is the **Customer**, the person who registers (see `GLOSSARY.md`).
- No lawyer review: the maintainer writes legal wording to best knowledge, conservative and close to the statute; "lawyer review" in earlier decisions means this.
- Language: English in tickets; domain terms untranslated. Skills: `grilling` + `domain-modeling` for decisions.

## Decisions so far

- [Compare payment providers](https://github.com/artkoenig/family-agenda-cloud/issues/33): Stripe Billing + Tax is cheapest with full cardless trial but leaves VAT filing with the maintainer; MoRs remove VAT work at about double cost or more and conflict with the Customer contract definition; own § 312k button needed either way.
- [Research Identity Providers for hosted sign-in](https://github.com/artkoenig/family-agenda-cloud/issues/35): only iss+sub is a stable key; email_verified is not comparable across Google, Apple, Microsoft; no-account options are netID or an Operator-run passkey OIDC provider (see docs/research/identity-providers.md).
- [Research legal duties for selling a B2C subscription in the EU](https://github.com/artkoenig/family-agenda-cloud/issues/34): Three buttons required (order, cancel, withdraw); withdrawal survives use with pro-rata Wertersatz; yearly tariff cannot renew for a fixed year (§ 309 Nr. 9); paid start as active order step; MoR takes sale, VAT, refunds but not Impressum, privacy, conformity; lawyer review list in `docs/research/legal-duties-b2c-eu.md`.
- [Research Paddle as Merchant of Record in depth](https://github.com/artkoenig/family-agenda-cloud/issues/42): No hard disqualifier; open blockers are yearly renewal vs § 309 Nr. 9, German order button label, bespoke pricing under $10; about 18% of net on €5, 7% on €50; Paddle sells, Operator supplies under separate agreement; no SEPA debit; app-side trial fits (see docs/research/paddle.md).
- [Research German Merchant of Record providers](https://github.com/artkoenig/family-agenda-cloud/issues/43): Digistore24, ablefy, CopeCart, affilicon, Cleverbridge are real German-law resellers, but none clearly beats Paddle on least work: Digistore24 and affilicon ease § 309 Nr. 9 on paper, yet Digistore24's order button was held unlawful (LG Hildesheim 11 O 5/25), fees on €5 are about double, integration thinner; see docs/research/german-mor-providers.md.
- [Decide payment provider](https://github.com/artkoenig/family-agenda-cloud/issues/36): Stripe Billing + Tax, no Merchant of Record; Operator is merchant, glossary stays, VAT work accepted.
- [Research Operator-run OIDC provider without forced passkeys](https://github.com/artkoenig/family-agenda-cloud/issues/44): Pocket ID out; with mail code and no passwords only Authentik and self-hosted Ory Kratos + Hydra qualify on docs, untested (see docs/research/operator-oidc-provider.md).
- [Decide registration flow](https://github.com/artkoenig/family-agenda-cloud/issues/37): No pilot; tariff, sign-in (Google or Authentik with mail code, passkey optional), mail check, order with card, then provisioning by Stripe webhook; one trial per card and mail.
- [Decide Subscription lifecycle](https://github.com/artkoenig/family-agenda-cloud/issues/38): Stripe trial inside one contract from the order; failure: 7 days full use, 7 days Payment lock, then closing; every end uses closing with Operator-only grace; yearly continues cancellable with refund; no pre-charge reminder.
- [Decide Customer succession](https://github.com/artkoenig/family-agenda-cloud/issues/39): Customer is always an Admin, protected from demotion and removal, so can always take a Backup.
- [Prototype landing page](https://github.com/artkoenig/family-agenda-cloud/issues/41): Design accepted: scrollytelling page built from the family-agenda landing page with its design system, static in `site/` (German at the root, English under `en/`, on branch `claude/cloud-product-scrollytelling-1ce8b7`); six steps from scattered Sources to one Agenda, then Sources (no Messengers), data with Operator access stated openly, one tariff with trial conversion and payment method at the start, legal footer; still placeholders: price, targets of `/register` and the legal links, hosting and LLM claims pending [#62](https://github.com/artkoenig/family-agenda-cloud/issues/62).
- [Test Authentik for mail sign-in](https://github.com/artkoenig/family-agenda-cloud/issues/45): Authentik 2026.8.5 passes all checks (API users, repeated mail code and link without passwords, optional passkey, two unlicensed replicas, scanner-safe links via Continue step); before production remove the stock password flow, check signups off, test OIDC claims (see spikes/authentik-mail-signin/README.md).
- [Decide architecture of the private site](https://github.com/artkoenig/family-agenda-cloud/issues/40): private `site` service (Hono + htmx) on the apex with `/register`, `/account`, `/stripe/webhook`, own `site` DB; internal `billing-worker` alone holds key file and CREATEDB, processes webhook inbox, provisioning, lifecycle and daily reconcile; Customer stays on landing with App + Account links, others go to the app; cancel/withdraw public and in Account.
- [Research Stripe Checkout and Customer Portal against the German button and cancellation duties](https://github.com/artkoenig/family-agenda-cloud/issues/72): hosted Checkout button fixed to "Subscribe/Buy", so `site` builds own order page with Checkout Sessions `ui_mode: elements` (Payment Element, own "zahlungspflichtig bestellen" button, Stripe Tax); Portal only for payment method, invoices, tariff switch, its cancel disabled in favour of own § 312k page; refunds via API (see docs/research/stripe-hosted-pages.md on branch research/stripe-hosted-pages).
- [Decide order page](https://github.com/artkoenig/family-agenda-cloud/issues/73): one own page under `/register` (tariff switch, name, EU country dropdown, Payment Element, two checkboxes, highlighted summary, button "Zahlungspflichtig bestellen"); one gross price EU-wide, EU only, payment methods set in the Stripe dashboard; used mail shows no trial up front, used card is checked after the click and the order cancelled uncharged; wording fixed in the issue.

## Not yet specified

- VAT and invoice handling: who files, German invoice content (tax adviser).
- Price and usage quotas (LLM, OCR): needs usage measurements.
- Legal text package: how the texts get written and maintained.

## Out of scope

- Marketing and SEO beyond the landing page.
- Operating the service (infrastructure, monitoring): tracked in [Run the hosted multi-Family service](https://github.com/artkoenig/family-agenda-cloud/issues/24).
- Customer succession ([Decide Customer succession](https://github.com/artkoenig/family-agenda-cloud/issues/39)): hand-over, Customer leaving, death or unreachability, notices to other Admins; not needed for launch.









---

**Comment by artkoenig, 2026-11-13T15:21:49Z**

Cost input from [Decide the cost model per Family](https://github.com/artkoenig/family-agenda-cloud/issues/60), for the price decision on this map:

- Cost per Family: **~1.25 EUR a month**, flat across scale (~1.00 of inference, ~0.20 of infrastructure). Fixed cost ~26 EUR a month at 100 Families, ~178 at 1000.
- Checked against **4.99 EUR gross**: 4.19 net at 19 % VAT, minus ~0.35 of payment fees, leaves ~2.58 EUR contribution per Family (62 %); ~3.38 under the small-business rule. Fixed cost met at **~10 paying Families**.
- Constraint the price has to clear: the model assumes **300 messages per Family and month**, and the price must cover about **3×** that. 4.99 covers 3.6× — a Family turns cost-negative above ~1100 messages a month.
- Open on this map, not on #46: payment fees and VAT treatment, and per-Family usage accounting with a real quota (the tail is uncapped at launch; trigger for building it is one Family above 10 EUR of inference in a month).
