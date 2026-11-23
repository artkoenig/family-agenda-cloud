# Stripe integration plan (planner output)

Research for the ticket "Stripe account in test mode" (map "Publish the landing page: billing and legal texts"). Feeds the ticket "Order flow and subscription lifecycle on Stripe"; this doc does **not** decide it. Produced 2026-11-23 with Stripe's `stripe_implementation_planner` on the Operator's sandbox (test mode). Not legal advice.

## Input given to the planner

Hosted SaaS, German sole Operator selling directly to German consumers (B2C), no Merchant of Record: Stripe Billing + Stripe Tax, Operator is the seller. Monthly and yearly plan, EUR prices including VAT. 14-day trial, ideally without a card. § 312j BGB button "zahlungspflichtig bestellen" with key terms next to it. § 312k BGB login-free cancel page on own site, no retention offers on its confirmation. Web only, own auth (Logto), webhooks provision and deprovision family workspaces.

## Decision-tree path chosen

| Tree | Planner default | Path taken | Why |
|---|---|---|---|
| Integration path | Stripe-hosted Checkout | **Custom Payment Form: Payment Element with Checkout Sessions `ui_mode: elements`** | § 312j needs our own button label and terms beside it. Hosted Checkout only offers `submit_type` presets (`auto`, `pay`, `book`, `donate`, `subscribe`) plus custom text above/below the button. |
| Pricing model | Flat rate | Flat rate, monthly and yearly | One tariff. |
| Billing model | Pay up front; "trial = card on file, freemium = no card" | "No card at signup" leaf | See conflict 2. |
| Lifecycle | Customer Portal | **Custom management via Subscriptions API** | § 312k own cancel page. Portal optional for payment method and invoices. |
| Revenue recovery | Smart Retries + automated emails | Default | — |
| Tax | Stripe Tax with collection | Default | Operator is not a Kleinunternehmer (see `payment-providers.md`). |
| Managed Payments (Stripe as MoR) | offered in two branches | Not chosen | Settled: no MoR. |

## Blueprint returned (summary)

"Create a subscription with Checkout Elements" (Accounts v2):

1. Create Product and a recurring monthly Price.
2. Create a customer-configured Account (`POST /v2/core/accounts`, `configuration.customer`).
3. Create a Checkout Session: `mode=subscription`, `ui_mode=elements`, `return_url`, `customer_account`, `line_items`.
4. Client: `stripe.initCheckoutElementsSdk({clientSecret})`, `checkout.createPaymentElement().mount(...)`, our own submit button calls `checkout.confirm()`.
5. Webhook endpoint, signature verified: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`.
6. Provision access from `customer.subscription.created` / `.updated`; store product, subscription id/status and customer account id.
7. Cancel: `DELETE /v1/subscriptions/{id}`; revoke access on `customer.subscription.deleted`.

## Additions the blueprint lacks (from Stripe docs)

- **Yearly Price** with `recurring.interval=year`.
- **`tax_behavior: inclusive`** on both Prices, `automatic_tax.enabled=true` on the session, product tax code for SaaS.
- **Trial without card**: `subscription_data.trial_period_days=14`, `subscription_data.trial_settings.end_behavior.missing_payment_method=cancel|pause`, `payment_method_collection=if_required`. Supported in hosted, embedded and Elements Checkout. Events: `customer.subscription.trial_will_end`, `.paused` or `.deleted`.
- Payment details before trial end: Stripe reminder email or Portal session (`customer.subscription.trial_will_end`).

## Conflicts with settled decisions

1. **Hosted Checkout is the planner's default**, but its button text cannot be "zahlungspflichtig bestellen" (only `submit_type` presets). Planner path adjusted to Elements; consistent with the settled direction. Verified in test mode, see the ticket.
2. **Planner principle "trial = card on file"** conflicts with "trial without a card". Stripe supports it anyway (`payment_method_collection=if_required`); the planner just models it as "freemium". The blueprint has no trial at all.
3. **Blueprint cancels immediately (`DELETE`)**. For a § 312k ordentliche Kündigung, end of the paid period (`cancel_at_period_end=true`) is the likely fit, with an immediate path only for Widerruf/fristlose Kündigung **[LAWYER]**. Decide in "Order flow and subscription lifecycle on Stripe".
4. **Customer Portal as lifecycle default**: Portal cancellation can show retention offers (coupon, reasons survey). § 312k confirmation must show none, and the page must be our own, login-free. Use the Portal at most for payment method and invoices, with cancellation disabled or retention off.
5. **Managed Payments** (Stripe as MoR) offered twice; conflicts with "no MoR". Not chosen.
6. **Blueprint Prices lack `tax_behavior`**; default exclusive would add VAT on top. Must be `inclusive`.
7. **Blueprint uses Accounts v2 (`customer_account`)**, newer than the Customers v1 used in older research. Pick one in the order-flow ticket.

## Open for "Order flow and subscription lifecycle on Stripe"

- Elements vs. embedded form: whether the embedded form (single iframe) lets us own the button label.
- Trial end behavior: `cancel` vs `pause`.
- Cancel timing (conflict 3) and Widerruf refund handling.
- Accounts v2 vs Customers v1.

## Observed in test mode (2026-11-23)

Sandbox, throwaway objects: product "Family Agenda (Test)", 4,99 €/month and 49,90 €/year (placeholders), both `tax_behavior: inclusive`. Screenshots in `stripe-test-mode/`.

**Hosted Checkout, `locale=de`, monthly, card required** ([01](stripe-test-mode/01-checkout-monthly-card.jpg)):
- Submit button: **"Kostenpflichtig abonnieren"** (`submit_type` unset; for subscriptions only `auto`/`subscribe` apply). Not "zahlungspflichtig bestellen"; no free label. Whether it is "entsprechend eindeutig" under § 312j Abs. 3 **[LAWYER]**.
- Near the button: only the card mandate text "Indem Sie ein Abo abschließen, autorisieren Sie <Firma>, Ihre Zahlungen gemäß den Konditionen abzuwickeln, bis Sie das Abo kündigen." Footer "Powered by stripe | Bedingungen | Datenschutz" links to Stripe's own pages. No Operator AGB/Widerruf link unless set via `custom_text` / `consent_collection` (the latter needs a ToS URL in the Dashboard; failed without it).
- Methods shown: Karte, Klarna, Amazon Pay, Satispay (Dashboard defaults).

**Hosted Checkout, yearly, trial without card** ([02](stripe-test-mode/02-checkout-trial-no-card.jpg)): `payment_method_collection=if_required`, `trial_period_days=14`, `missing_payment_method=cancel`.
- Page: "Testen Sie Family Agenda (Test) / 14 Tage kostenlos / Dann 49,90 € pro Jahr ab 7. Dezember 2026". Only an e-mail field. Button **"Testzeitraum starten"**.
- Submitted with e-mail only → session `complete`, subscription `trialing`, no payment method, 0,00 € invoice. **Trial without card works.**

**Customer Portal**, config: cancel `at_period_end`, reasons on, no retention coupons:
1. Overview ([03](stripe-test-mode/03-portal-overview.jpg)): "Kostenloser Testzeitraum endet am 07.12", buttons "Zahlungsmethode hinzufügen", "Abonnement kündigen". Requires a Portal session, i.e. our login first.
2. Modal "Ihr Abo kündigen" ([04](stripe-test-mode/04-portal-cancel-reason.jpg)): "Können Sie uns sagen, warum Sie gehen?" dropdown, **optional**; "Weiter zur Kündigung".
3. "Ihre Änderungen überprüfen" ([05](stripe-test-mode/05-portal-cancel-review.jpg)): available until end of period 7. Dezember 2026; button "Abonnement kündigen".
4. After click ([06](stripe-test-mode/06-portal-after-cancel.jpg)): back on overview, badge "Läuft ab am 07.12", button "Abonnement nicht kündigen". **No dedicated confirmation page**, no retention offer (none configured).

**Consequences for "Order flow and subscription lifecycle on Stripe":**
- Hosted Checkout cannot carry "zahlungspflichtig bestellen" → own button via Elements (confirms the settled direction) unless a lawyer accepts "Kostenpflichtig abonnieren".
- Portal cancel is behind our login, has a survey step and no § 312k-style confirmation page → § 312k needs our own login-free cancel page calling `cancel_at_period_end` via API; Portal at most for payment method/invoices, with cancel disabled.
