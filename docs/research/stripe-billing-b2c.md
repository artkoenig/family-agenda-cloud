# Stripe Billing for a German B2C subscription without a Merchant of Record

Research for issue #180 (map #179). Checked 2026-11-23. Not legal or tax advice.

Scope: what Stripe Billing offers, and what it lacks, for a German Einzelunternehmer (not Kleinunternehmer) selling a subscription B2C across the EU in de/en, with a 14-day trial and no payment method up front. It extends `payment-providers.md` (fees, Stripe Tax filing gap, trial basics, Smart Retries, portal basics) and `legal-duties-b2c-eu.md` (§ 312j, § 312k, § 309 Nr. 9, PAngV, OSS), and does not repeat them.

Markers: [UNVERIFIED] = not confirmed in a primary source. [LAWYER] / [TAX] = needs a lawyer or tax advisor.

## Gist

- **Button label (§ 312j Abs. 3 BGB).** Hosted and embedded Checkout only allow `submit_type` from a fixed enum (`auto`, `book`, `donate`, `pay`, `subscribe`), with no free text. An own button text such as "zahlungspflichtig bestellen" is only possible with `ui_mode: elements` (own button, `checkout.confirm()`) or the Payment Element (F1).
- **Trial without a card.** This works with legacy free trials in Checkout: `payment_method_collection=if_required` plus `trial_settings.end_behavior.missing_payment_method` set to `cancel`, `pause` or `create_invoice`. The newer "Trial Offers" are not supported in Checkout Sessions, pricing tables or Payment Links (F2, F3).
- **Fixed first year (§ 309 Nr. 9).** Possible with a Subscription Schedule: a yearly phase, then `end_behavior=release`. Stripe can't refund for a future `cancel_at` date. A `cancel_at` beyond the current period always creates a proration invoice (F4, F5).
- **Cancel button (§ 312k).** A portal deep link (`flow_data.type=subscription_cancel`) gives a one-step cancel flow. The "lost benefits" list and the retention coupon are optional add-ons, and how they fit § 312k is [LAWYER] (F6, F7).
- **Prices.** `tax_behavior=inclusive` is the default for EUR. It can't be changed once set. The customer pays the same gross amount, and the net amount varies with the EU VAT rate (F9).
- **VAT.** Stripe tracks the €10,000 EU threshold. The OSS return isn't filed for a DE seller (F10).
- **Invoices.** § 14 UStG gives no invoice duty for B2C, only a right. Stripe's sequential numbering, account tax ID and locale cover the § 14 Abs. 4 / § 33 UStDV fields, but legal compliance stays with the seller (F11, F12).

## Findings

### F1. Checkout button text and legal text

- `submit_type` enum: `auto`, `book`, `donate`, `pay`, `subscribe`. There is no free-text label, and it can't be set in elements mode. Source: https://docs.stripe.com/api/checkout/sessions/create (API 2026-11-18.endive).
- `custom_text` slots:
  - `submit`: shown above the button;
  - `after_submit`: shown below the button;
  - `terms_of_service_acceptance`;
  - `shipping_address`.

  Each slot allows up to 1200 characters and Markdown links. Stripe: the text must not contradict Stripe's own text or applicable law. Same source.
- `consent_collection.terms_of_service=required` shows a mandatory checkbox. It needs a ToS URL in the public business details, and the result appears as `consent.terms_of_service=accepted` on the session. `consent_collection.promotions` is US only. `payment_method_reuse_agreement.position`: `auto` or `hidden`. Same source.
- `ui_mode: elements`: the merchant renders their own pay button and calls `checkout.confirm()`. Subscription mode is supported. Source: https://docs.stripe.com/checkout/custom/quickstart.
- Consequence (fact, not a decision): the exact label "zahlungspflichtig bestellen" can't be shown on the hosted or embedded Checkout button. Whether `submit_type=subscribe`, rendered in German, satisfies § 312j Abs. 3 is [LAWYER]. Its exact German string is [UNVERIFIED].
- Checkout `locale` supports `de` and `en`. Source: Checkout Session API.

### F2. Legacy free trial without a payment method

- Docs page labelled "Legacy". Source: https://docs.stripe.com/billing/subscriptions/trials/free-trials.
- Checkout setup: `mode=subscription`, `payment_method_collection=if_required`, `subscription_data.trial_period_days=14`, `subscription_data.trial_settings.end_behavior.missing_payment_method`. Same source.
- Trials can last up to 730 days. A €0 invoice is created at the start.
- At the end of the trial `invoice.created` fires, and the payment attempt follows about 1 h later. Same source.
- `missing_payment_method` options:

  | Value | Result | Event |
  |---|---|---|
  | `cancel` | subscription canceled | `customer.subscription.deleted` |
  | `pause` | status `paused` indefinitely, no invoices; resume later | `customer.subscription.paused` |
  | `create_invoice` | status `past_due` | — |

  On resume, the invoice must be paid first. A resume invoice without a payment method is voided after 23 h. Same source.
- `customer.subscription.trial_will_end` fires 3 days before the end, or immediately if the trial is shorter than 3 days. Source: https://docs.stripe.com/billing/subscriptions/webhooks.
- Stripe recommends trial-abuse protection. Card networks have their own trial rules: https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance. That page wasn't read in detail [UNVERIFIED].

### F3. Trial Offers (new model)

Source for all bullets: https://docs.stripe.com/billing/subscriptions/trials.

- Requirements: API version `2026-09-30.endive` or later and `billing_mode=flexible`.
- Not supported in:
  - Checkout Sessions (outside a private preview);
  - pricing tables;
  - Payment Links;
  - Elements with Checkout Sessions.

  Supported in the Dashboard and the Subscriptions API.
- Can't be combined with the legacy `trial_end` / `trial_period_days`. Using them with schedules is a public preview.
- Each offer needs 2 recurring prices: a €0 trial price and a transition price. The trial length can't be changed after creation.
- `trial_settings.end_behavior.billing_cycle_anchor`: `now` (default) or `unchanged`. `missing_payment_method` options: `create_invoice` (default), `cancel` or `pause`. Prebilling overrides `missing_payment_method`.
- Stripe-hosted trial reminder emails go out 7 days before the end. The `trial_will_end` Dashboard setting defaults to 3 days.
- Customer portal: trial-offer subscriptions can be shown, canceled and reactivated, but not updated, paused or resumed.

### F4. Minimum term via Subscription Schedules (§ 309 Nr. 9 context)

Source for all bullets: https://docs.stripe.com/billing/subscriptions/subscription-schedules.

- A schedule holds up to 10 current or future phases. A phase's `duration` is set in `week`, `month` or `year`. The Dashboard also offers "Für immer".
- `end_behavior`:
  - `release` (default): the subscription continues on its own after the last phase;
  - `cancel`: sets `cancel_at` once the last phase starts.
- Per-phase `proration_behavior`: `create_prorations`, `none` or `always_invoice`.
- `phases.trial_end` allows a trial inside a schedule.
- While a schedule is attached, changes must go through the Schedule API, not the Subscriptions API. Customers can't update the subscription in the portal while a schedule update is pending.
- Webhooks: `subscription_schedule.*` events, including `expiring` (7 days before the end), `released`, `completed` and `aborted`. Source: https://docs.stripe.com/billing/subscriptions/webhooks.
- How the § 309 Nr. 9 rules map onto a yearly-phase-then-release setup (a monthly notice period after the first year, an implied indefinite term) is [LAWYER].

### F5. Cancellation mechanics and refunds

Source for all bullets: https://docs.stripe.com/billing/subscriptions/cancel.

- An API cancel takes effect immediately by default.
  - `prorate=true` puts a credit on the customer balance; it does not pay money back.
  - `invoice_now=true` creates a final invoice.
  - A cash refund needs a separate Refund API call.
- With a custom future cancel date, Stripe can't refund.
- `cancel_at` (future timestamp):
  - inside the current period: shortens the period and creates prorations (this can be switched off);
  - beyond the current period: prorations can't be switched off. For example, a yearly subscription gets a final invoice for the partial period.
- Other options: `cancel_at_period_end`. In `billing_mode=flexible`, `cancel_at` also accepts `min_period_end` / `max_period_end`.
- Dashboard cancel offers three refund choices: prorated, the full last payment, or none.
- Dunning end state (Dashboard setting): cancel, mark `unpaid`, leave `past_due`, or pause (eligible subscriptions only). Card retries: up to 8 in 2 weeks by default, window configurable from 1 week to 2 months. SEPA retries are configured separately: at most 2 within 30 days, insufficient funds only. Source: https://docs.stripe.com/billing/revenue-recovery/smart-retries.

### F6. Cancel button via portal deep link (§ 312k context)

- `flow_data.type` values: `payment_method_update`, `subscription_cancel`, `subscription_pause`, `subscription_update`, `subscription_update_confirm`, `customer_update`. Source: https://docs.stripe.com/customer-management/portal-deep-links.
- A deep link hides the portal's navigation.
  - `after_completion` choices: redirect, hosted confirmation, or the portal homepage.
  - Cancel mode (immediate or at period end) follows `features.subscription_cancel.mode`.

  Same source.
- Portal sessions are created server-side for a known `customer`, so the app must identify the customer before the link exists. Same source. § 312k Abs. 2 requires the button to be reachable without login. Bridging that (for example an own form that identifies the customer first) is outside Stripe. The legal detail is in `legal-duties-b2c-eu.md` [LAWYER].
- Session lifetime: a session expires 5 min after creation if unused, otherwise 1 h after the last activity. It can't be embedded in an iframe. Source: https://docs.stripe.com/customer-management.

### F7. Portal cancellation page extras

Source for all bullets: https://docs.stripe.com/customer-management/cancellation-page.

- Cancellation is enabled by default.
- Optional extras:
  - cancellation reasons, asked after cancelling: a fixed list plus free text for "Anderer Grund". The reasons appear in the `customer.subscription.updated` payload;
  - "verlorene Vorteile" list: built from the product's marketing features (up to 80 characters each, not auto-translated, redesigned portal only);
  - retention coupon ("Kundenbindungsgutschein").
- Whether the lost-benefits list can be switched off, other than by having no marketing features, is [UNVERIFIED].
- Whether extra screens (benefits, coupon) clash with § 312k's "unmittelbar und leicht zugänglich" requirement is [LAWYER].

### F8. Portal limitations

Source for all bullets: https://docs.stripe.com/customer-management.

- Languages include `de`, `en` and `en-GB`.
- Cancel-only (no plan update) for:
  - multiple products;
  - usage-based prices;
  - Trial Offers;
  - `send_invoice` collection;
  - unsupported payment methods.
- Plan switching offers at most 10 products.
- Updating a `trialing` subscription in the portal ends the trial and invoices immediately, unless `features.subscription_update.trial_update_behavior=continue_trial`.
- Payment methods in the portal include cards, SEPA Direct Debit, Klarna, Revolut Pay and pay_by_bank (DE).
  - PayPal recurring is enabled automatically for most accounts. Some must request it in the Dashboard, and access takes up to 5 business days. Source: https://docs.stripe.com/payments/paypal/set-up-future-payments.
  - A customer can revoke the PayPal billing agreement in PayPal. Stripe then sends `mandate.updated`, and later charges fail. Same source.

### F9. Tax behavior of prices

Source for all bullets: https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior.

- Default "Automatisch" behavior: exclusive for USD/CAD, inclusive for other currencies, including EUR. It can't be set per customer location.
- `tax_behavior` can't be changed once it is set to `inclusive` or `exclusive`. A change needs a new Price.
- Inclusive pricing: the customer pays a constant gross amount, and the seller's net amount varies with the destination VAT rate. This matches PAngV gross display (see `legal-duties-b2c-eu.md`).
- Product tax codes must be exact strings from Stripe's tax-code list. The right code for this SaaS is [UNVERIFIED] [TAX].

### F10. Stripe Tax in the EU

Source for all bullets: https://docs.stripe.com/tax/supported-countries/european-union.

- "Kleines Handelsunternehmen" setting: while cross-border EU B2C sales stay under €10,000 per calendar year, home-country (DE) VAT applies. Stripe tracks the threshold and notifies the seller.
- After crossing the threshold: register in each country or via OSS in the home country, and add the registrations under Dashboard > Standorte.
- Digital services are taxed where the customer is. Stripe uses one address to decide the location but stores all location evidence. Whether that meets the two-pieces-of-evidence rule (Art. 24b VO 282/2011) is [UNVERIFIED] [TAX].
- Reverse charge applies with a valid EU VAT ID (B2B edge case).
- Exports per country, including OSS countries, are available.
- Automated filing exists only for non-EU OSS registered in Ireland, plus partners (Taxually, Marosa, HOST). So a DE seller files the EU OSS return themselves or through a partner [TAX].
- `invoice.finalization_failed` with `automatic_tax[status]=requires_location_inputs` blocks payment collection. The app must collect the customer's location. Source: https://docs.stripe.com/billing/subscriptions/webhooks.

### F11. Invoices: German law

- § 14 Abs. 2 UStG: for B2C "sonstige Leistungen" the seller is entitled, but not obliged, to issue an invoice. The duty applies to B2B, to legal persons, and to property-related work. Source: https://www.gesetze-im-internet.de/ustg_1980/__14.html.
- § 14 Abs. 4 UStG lists the mandatory contents of an invoice that is issued:
  - names and addresses;
  - Steuernummer or USt-IdNr.;
  - date and a sequential number;
  - quantity and type, and time of supply;
  - net amount by rate, the rate and the tax amount.

  Same source.
- § 14 Abs. 1 UStG: an e-invoice is a structured format. Outside the B2B e-invoice duty, electronic transmission needs the recipient's consent. Same source. Whether a Stripe PDF sent by email to a consumer needs any consent is [TAX].
- § 33 UStDV, Kleinbetragsrechnung (gross amount up to €250):
  - the supplier's full name and address;
  - date;
  - quantity and type;
  - gross amount and tax rate.

  It is not applicable to §§ 3c, 6a, 13b UStG. Source: https://www.gesetze-im-internet.de/ustdv_1980/__33.html. Whether § 33 applies to OSS sales to other EU countries (where the customer country's rules may govern) is [TAX].

### F12. Invoices: what Stripe provides

Source for all bullets: https://docs.stripe.com/invoicing/customize.

- Numbering:
  - account-level sequential numbering is the default for EU accounts; customer-level numbering also exists;
  - prefix of 1-12 characters; the next number is settable.
- Content and display:
  - footer, memo, and up to 4 custom fields;
  - account tax IDs (Steuernummer/USt-IdNr.) shown on invoice PDFs and receipts;
  - public business name and address printed on invoices;
  - option to show line-item prices excluding tax on the PDF.
- The customer's `preferred_locales` localize PDFs and emails; `de` and `en` are supported.
- Stripe states that the seller is responsible for compliant invoices ("Sie tragen die Verantwortung").

### F13. Webhooks the integration must handle

Source for all bullets: https://docs.stripe.com/billing/subscriptions/webhooks.

- Access control:
  - grant access on `invoice.paid` once the subscription is `active`;
  - revoke access on `canceled` or `unpaid`;
  - `trialing` may be provisioned.
- `entitlements.active_entitlement_summary.updated` is an alternative signal for feature access.
- Lifecycle events:
  - `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`;
  - `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalization_failed`, `invoice.upcoming`.
- Risk events: `charge.refunded`, `charge.dispute.created`, `radar.early_fraud_warning.created`.
- Do not rely on the `success_url` redirect for provisioning. Source: https://docs.stripe.com/payments/paypal/set-up-future-payments.
- If `invoice.created` gets no 2xx response, finalization is delayed up to 72 h. Stripe retries a webhook in live mode for up to 3 days.
- Status `incomplete` means the first payment must succeed within 23 h, otherwise the status becomes `incomplete_expired`.

## Open questions

1. Does `submit_type=subscribe` (German rendering), plus `custom_text.submit`, satisfy § 312j Abs. 3, or is elements mode with an own button required? [LAWYER]
2. Do the portal cancel flow's optional screens (lost benefits, retention coupon, reasons) comply with § 312k? Can the lost-benefits list be disabled? [LAWYER] [UNVERIFIED]
3. How should a login-free § 312k button identify the customer before a server-side portal session exists? (Outside Stripe.) [LAWYER]
4. Which § 309 Nr. 9 model (monthly only, or yearly then monthly) should map onto Schedules, and how do refunds work on early termination given F5's limits? [LAWYER]
5. Which Stripe tax code fits a family-organizer SaaS? Does Stripe's location evidence meet Art. 24b VO 282/2011? [TAX] [UNVERIFIED]
6. Does § 33 UStDV apply to OSS sales, or do the destination country's invoice rules govern? [TAX]
7. Trial Offers in Checkout are private preview only. Stay on legacy trials, or use the Subscriptions API with elements? [UNVERIFIED: timeline for general availability]
8. Card-network trial compliance rules (manage-trial-compliance page) were not read in detail. [UNVERIFIED]
9. Stripe's role under the GDPR (processor vs controller) was not checked here. [UNVERIFIED]
