# Stripe: open points for Family Agenda (B2C, EU, Billing + Tax, no MoR)

Researched 2026-11-23 against API version `2026-11-18.endive`. Builds on
`stripe-integration-plan.md` (branch `research/stripe-integration-plan`) and
`stripe-billing-b2c.md` (branch `research/stripe-billing-b2c`, F1–F13); this
doc does not repeat them.

Tags: **[UNVERIFIED]** = not confirmed in a primary source. **[LAWYER]** = needs a legal judgment.

Method note: the `stripe` CLI (needed by the `stripe:stripe-docs` skill) was
not installed, so pages were read via docs.stripe.com directly (public
Markdown). Gated docs were **not** read.

## Answers

1. **Button text — partially.** No free-text label. Only the `submit_type` enum (`auto|book|donate|pay|subscribe`); not allowed with `ui_mode=elements`; `branding_settings` has no text field. Hosted German = "Kostenpflichtig abonnieren" (observed earlier, not in docs); trial without card = "Testzeitraum starten". Stripe docs have no § 312j guidance; Stripe's German resource page says „Zahlungspflichtig bestellen“ or equivalent. Compliance of Stripe's strings [LAWYER]. [Checkout create](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-submit_type)
2. **§ 312j summary near button — yes.** `custom_text.submit` and `custom_text.terms_of_service_acceptance` take 1200 chars each, bold + Markdown links. Real ToS checkbox via `consent_collection.terms_of_service=required`. Term, cancellation terms and first payment date can be written there (static text, we compute it). Sufficiency [LAWYER]. [Custom components](https://docs.stripe.com/payments/checkout/custom-components)
3. **Portal — mostly yes.** Reasons survey off (`cancellation_reason.enabled=false`); `subscription_cancel` deep link + `hosted_confirmation.custom_message` (500 chars); lost benefits only show when products have `marketing_features` (new `loss_message`); retention coupons off unless configured; no-code login link exists; server can create a session for any customer ID (auth is ours). No § 312k feature (only US-FTC wording) [LAWYER]. [Portal session create](https://docs.stripe.com/api/customer_portal/sessions/create)
4. **Emails — partially.** Automatic: receipts, finalized/paid invoice, failed payment, 3DS, expiring card, trial ending, renewal reminder, credit note, refund, cancellation. Branding + invoice template only; no free-text body or extra attachments. German via `preferred_locales` (else Dashboard default language). Invoice PDF: footer, memo, 4 custom fields, prefix. [Send email](https://docs.stripe.com/invoicing/send-email), [Receipts](https://docs.stripe.com/receipts)
   **4b. Stripe email as § 312f confirmation — [LAWYER].** Facts: email carries amount, period, invoice/receipt PDFs, business name/address/support email/privacy URL; it cannot carry AGB, Widerrufsbelehrung or Muster-Widerrufsformular as text or attachment.
5. **Auto refund of unused prepaid year — partially.** Dashboard cancel offers "prorated refund". API `cancel` with `prorate` only creates **customer balance credit**; cash refund is a separate Refund / credit note `refund_amount` (our code). Portal: credit only. [Cancel](https://docs.stripe.com/billing/subscriptions/cancel), [Balance](https://docs.stripe.com/billing/customer/balance)
6. **Yearly → indefinite monthly after year one (§ 309 Nr. 9) — yes, native.** Subscription Schedule: phase 1 = yearly price, 1 iteration; phase 2 = monthly price; `end_behavior=release`. Needs one webhook-driven call (`from_subscription` + update) after Checkout. [Schedules use cases](https://docs.stripe.com/billing/subscriptions/subscription-schedules/use-cases)
7. **Dunning — yes.** Smart Retries (default 8 in 2 weeks) or custom (≤3); end state cancel / unpaid / past_due / pause. Failed-payment emails link to a Stripe-hosted payment-method update page; Portal deep link `payment_method_update`. SEPA: only insufficient-funds failures, max 2 retries in 30 days, separate toggle. [Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries), [Customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)
8. **Widerrufsbutton (§ 356a, from 19 June 2026) — no.** Nothing in docs or changelog (searched titles up to 2026-01 + 2026 releases). [UNVERIFIED for older changelog pages / gated docs]. [Changelog](https://docs.stripe.com/changelog)
9. **Other replacements — partially.** Trial reminders only for Stripe-side trials (fixed 7 days) → not usable with our own trial; renewal reminders configurable; invoice prefix yes; Stripe Tax address collection in Checkout yes; Customers v1 still fine, Accounts v2 is preview for non-Connect users but "recommended for most use cases". [Accounts v2 changelog](https://docs.stripe.com/changelog/dahlia/2026-04-22/accounts-v2-expanded-availability.md)

## Details

### 1. Button text

- `submit_type` values (API ref): `auto` (subscription mode → "subscribe"), `book`, `donate`, `pay` ("Buy"), `subscribe` ("Subscribe"). Docs: customizes the button "für einmalige Käufe"; example "5,00 USD spenden". `submit_type` is **not allowed** with `ui_mode=elements`. [API](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-submit_type), [custom components](https://docs.stripe.com/payments/checkout/custom-components?ui=full-page)
- `branding_settings`: colors, font, logo, shapes, display name; **no button text**. [API](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-branding_settings)
- `locale=de` picks Stripe's translation. Exact German strings are **not documented**; earlier doc observed "Kostenpflichtig abonnieren" (card) and "Testzeitraum starten" (trial, no card) [UNVERIFIED in docs]. With our setup (card collected, `trial_end` in future) which label appears is [UNVERIFIED] — test in test mode.
- Payment Links: same Checkout, same limits; `locale` URL param; no free button label. [Payment Links customize](https://docs.stripe.com/payment-links/customize)
- Elements (our planned UI): we render our own button → we fully control the label (e.g. „Zahlungspflichtig abonnieren“). This is the cleanest § 312j path.
- Stripe § 312j guidance: none in docs. Stripe resource page (updated 11 Dec 2024, not docs, no-legal-advice disclaimer) says button must read „Zahlungspflichtig bestellen“ or equivalent; „Kaufen“, „Bestellen“, „Weiter“ insufficient; for auto-renewing contracts term + cancellation conditions near the button. Does not claim Checkout is compliant. [Stripe resource](https://stripe.com/de/resources/more/legal-compliance-online-shops-germany)
- Whether "Kostenpflichtig abonnieren" satisfies § 312j Abs. 3 [LAWYER] (wording close to statutory example, but not identical).

### 2. Summary near the button

- `custom_text.submit.message`, `custom_text.terms_of_service_acceptance.message`, `custom_text.after_submit.message`, `custom_text.shipping_address.message`: 1200 chars each; bold and Markdown links. `terms_of_service_acceptance` requires `consent_collection.terms_of_service=required`; replaces Stripe's checkbox text, e.g. `I agree to the [Terms of Service](https://example.com/terms)`. Result: `consent.terms_of_service=accepted` on session + webhook. [Custom components](https://docs.stripe.com/payments/checkout/custom-components?ui=full-page)
- ToS checkbox needs ToS URL in Dashboard public details; privacy URL optional and auto-linked.
- Stripe itself suggests subscription custom text may hold links to terms/portal and "Stornomechanismen und -richtlinien"; warns to consult counsel.
- Dashboard Checkout settings: "Rechtliche Hinweise" (AGB/Datenschutz links), "Zustimmung zu rechtlichen Bedingungen anzeigen", return/refund policy display, support contact.
- Term, Kündigungsbedingungen, first payment date: not structured fields; we put them in `custom_text.submit` (date computed server-side from `trial_end`). Checkout's own summary shows the trial and following charge (earlier doc).
- `payment_method_reuse_agreement.position=hidden` removes Stripe's mandate text (then we must show our own).
- Constraint: `subscription_data.trial_end` must be ≥ 48 h in the future → order within the last 2 days of our trial can't carry `trial_end`; fallback: no trial, charge now, or shift billing via `billing_cycle_anchor` [UNVERIFIED best fallback].
- Placement/sufficiency [LAWYER].

### 3. Customer Portal

- Reasons survey: `features.subscription_cancel.cancellation_reason.enabled=false`. [Portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create)
- Cancel mode `at_period_end` | `immediately`; `proration_behavior` `none` | `create_prorations` (credit, not refund).
- Deep link: `flow_data.type=subscription_cancel` + `subscription_cancel.subscription`; `after_completion.type=hosted_confirmation`, `custom_message` ≤ 500 chars (or `redirect`). [Session create](https://docs.stripe.com/api/customer_portal/sessions/create)
- Lost benefits: shown from product `marketing_features`; new `loss_message` (≤ 80 chars) since 2026-11-18. No features → nothing shown. Dashboard toggle "Entgangene Vorteile" on by default. [Changelog](https://docs.stripe.com/changelog/endive/2026-11-18/product-loss-messages-customer-portal-cancellation.md)
- Retention: coupon offer only if configured (`subscription_cancel.retention` / Dashboard) → off by default [UNVERIFIED default in API ref]. New 2026-10-28: subscription **pausing** in portal — keep disabled. [Changelog](https://docs.stripe.com/changelog/endive/2026-10-28/customer-portal-subscription-pausing.md)
- No-code login link: `login_page.enabled=true` gives a public URL; customer enters email, gets one-time link; duplicates → most recent customer with active subscription. [Portal docs](https://docs.stripe.com/customer-management/activate-no-code-customer-portal)
- New `after_expiration.type=customer_login` (2026-10-28): expired session URL lets customer verify email and get a replacement session. [Changelog](https://docs.stripe.com/changelog/endive/2026-10-28/session-recovery-for-expired-customer-portal-sessions.md)
- Server session by email only: Stripe performs **no** auth on session create; any server with the secret key can create a session for a customer ID. Identifying by email is our responsibility (look up `Customer` by email via Search/List; duplicates possible) → security risk if we don't verify email ownership first (Logto). Sessions expire 5 min unused / 1 h after last activity.
- § 312k Kündigungsbutton: no feature. Portal is behind a login and multi-step; Stripe's "near one-step" wording refers to US FTC rules. Whether portal deep link from our own „Verträge hier kündigen“ page satisfies § 312k [LAWYER]; building our own button page + API `cancel` is the low-risk path.

### 4. Emails

- Automatic list: failed payment, finalized invoice, paid invoice receipt, 3DS confirmation (+ reminders), expiring card (1 month before), unpaid one-off invoice, credit note, refund, trial ending (7 days before, fixed), renewal reminder (`charge_automatically` only, days configurable), subscription cancellation. [Send email](https://docs.stripe.com/invoicing/send-email), [Customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)
- Customisation: branding (logo, colors), invoice email template, custom email domain, "Abonnementverwaltung" link (portal or custom URL; custom URL gets `stripe_source=free_trial_ending|upcoming_invoice|invoice_receipt|failed_payment`). No free-text body, no extra attachments, no extra recipients via API.
- Language: email uses customer `preferred_locales`, else Dashboard default language; Checkout locale does **not** apply to emails when a customer exists. [Receipts → Lokalisierung](https://docs.stripe.com/receipts#localization) → set `preferred_locales=['de']` at customer creation.
- Receipts require public business details: legal name, support address, support email, privacy URL. Live mode only.
- Invoice PDF auto-attached; receipt email includes invoice + receipt PDFs (can be disabled). Invoice: `footer`, `description` (memo), up to 4 `custom_fields`, prefix 1–12 chars (earlier doc F-items).
- Email log kept 60 days.

**4b. § 312f confirmation [LAWYER].** Facts for the lawyer:
- Stripe sends receipt/invoice emails only after successful payment; with our trial the first charge is at `trial_end` (≤ 14 days later) → no paid-invoice email at order time. A `checkout.session.completed` email from Stripe for a trial subscription is [UNVERIFIED] (likely none; first invoice is a 0 € invoice — whether it is emailed is [UNVERIFIED]).
- Content cannot include AGB, Widerrufsbelehrung, Muster-Widerrufsformular, or our § 312f items.
- Conclusion for design: send our own confirmation email (we already have transactional mail) with AGB + Widerrufsbelehrung as PDF.

### 5. Refunds / Widerruf

- Dashboard cancel: "refund prorated", "refund last payment in full", "no refund". [Cancel](https://docs.stripe.com/billing/subscriptions/cancel)
- API: `DELETE /v1/subscriptions/:id` with `prorate=true` → negative proration credited to **customer balance**; balance only offsets future invoices, no automatic cash refund. To pay out: Refund on the charge, or Credit Note with `refund_amount`, then reset balance. With a custom cancel date refunds are not possible from Dashboard. [Balance](https://docs.stripe.com/billing/customer/balance)
- Widerruf within 14 days: our code calls cancel (`invoice_now=false`, `prorate=false`) + Refund for the full or pro-rata amount (§ 357a Abs. 2 Wertersatz amount [LAWYER]).
- Ordentliche Kündigung of yearly plan: no refund needed (runs to period end).

### 6. Yearly → monthly after year one

- Schedule phases: `[{items:[yearly], iterations:1}, {items:[monthly]}]`, `end_behavior=release` → after release a normal monthly subscription, cancellable monthly. Create via `subscription_schedules.create({from_subscription})` (one phase, no prorations), then `update` with both phases (must pass all phases). [Use cases](https://docs.stripe.com/billing/subscriptions/subscription-schedules/use-cases)
- Code: one webhook handler on `checkout.session.completed` / `customer.subscription.created` for yearly price. Monthly price must be 4,99 € (§ 309 Nr. 9 doesn't force a price; [LAWYER] whether switching price is OK vs. keeping yearly price pro rata).
- Dashboard alternative: schedule editor with last phase "Forever" (manual, not scalable).
- Portal: plan switching must not let customers bypass the schedule; disable `subscription_update` or test interaction [UNVERIFIED].

### 7. Dunning

- Smart Retries: default 8 attempts in 2 weeks; window 1 w / 2 w / 3 w / 1 month / 2 months; custom schedule max 3 retries. [Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- End state after last retry: cancel subscription, mark `unpaid` (invoices stay draft), leave `past_due`, or **pause** (new).
- Emails: failed card payment, 3DS reminders; link to Stripe-hosted update page (or custom URL). Link invalid after cancel/unpaid/incomplete_expired, period end, or 30 days after trial email. [Customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)
- Portal deep link `payment_method_update` for our own dunning UI.
- SEPA: retried only for insufficient funds, max 2 retries within 30 days, configured separately ("Lokale Zahlungsmethoden"), off unless enabled. Failed-payment emails for SEPA [UNVERIFIED].

### 8. Widerrufsbutton (§ 356a BGB, from 19 June 2026)

- No Stripe docs page, portal feature or changelog entry mentions withdrawal / Widerruf / withdrawal button. Changelog titles checked: 2026 releases (dahlia, endive, previews); older pages beyond first 100k chars not read [UNVERIFIED].
- Build ourselves: buttons „Vertrag widerrufen“ / „Widerruf bestätigen“ (see `legal-duties-b2c-eu.md`), then API cancel + Refund (point 5), confirmation email (ours).

### 9. Other code replacements

| Need | Stripe native? | Note |
|---|---|---|
| Trial reminder | Only for Stripe trials, fixed 7 days | Our trial lives in our system → keep ours |
| Renewal reminder (yearly) | Yes, days configurable | `charge_automatically` only |
| Hosted management | Portal + hosted invoice page + payment-method update page | § 312k not covered |
| Invoice prefix / numbering | Yes, 1–12 chars, account or customer sequence | earlier doc |
| Tax address collection | Checkout `billing_address_collection=auto` + `automatic_tax` collects what Stripe Tax needs (country/postal for EU) | [Tax in Checkout](https://docs.stripe.com/tax/checkout) [UNVERIFIED exact EU fields] |
| Customer model | Customers v1 GA; Accounts v2 public preview for non-Connect, Stripe recommends it "für die meisten Anwendungsfälle" | v2 → locale via `defaults.locales` |
| Trial Offers (new GA 2026-09-30) | Per-item free/paid trials, flexible billing mode only | Subscriptions API, not Checkout [UNVERIFIED Checkout support]; not needed since trial is ours. [Changelog](https://docs.stripe.com/changelog/endive/2026-09-30/trial-offer-ga.md) |
