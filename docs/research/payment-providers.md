# Payment providers: Merchant of Record vs Stripe Billing

Research for issue #33 (map #32, feeds #36). Checked 2026-11-07. Comparison only, no decision. Not legal or tax advice. Items marked **[LAWYER]** or **[TAX]** need professional review. Provider prices and early-access features change; recheck before committing.

## Situation

Seller: German Einzelunternehmer, not a Kleinunternehmer. B2C Subscription across the EU, one tariff, monthly and yearly, price not set. Trial without a payment method.

## Gist

- **Stripe Billing + Stripe Tax** is cheapest and has the most complete trial, dunning and portal support. The seller stays the merchant: VAT returns, OSS, disputes and buyer support remain with the maintainer.
- **A Merchant of Record (MoR)** removes VAT filing and most buyer-side accounting, at roughly double the cost on a yearly price and more on a small monthly price, because of fixed per-transaction fees.
- **Trial without a payment method is the sharpest differentiator.** Only Stripe Billing supports it fully. Paddle has it in public early access with gaps. Polar's built-in trial collects payment details. Lemon Squeezy's own guide tracks the trial in the app. Stripe Managed Payments documents no such flow.
- **An app-side trial removes that differentiator.** The app tracks the trial and sends the Customer to checkout at conversion. This works with every provider, but the app then owns trial state and reminder mails.
- **No provider supplies § 312k BGB compliance out of the box.** Plan an own button and confirmation page in every case (F7).
- **An MoR conflicts with the current glossary**: the buyer's sale is with the MoR, while `GLOSSARY.md` makes the Customer the Operator's contract partner (F8).

## Comparison

| | Stripe Billing + Tax | Paddle | Stripe Managed Payments | Lemon Squeezy | Polar |
|---|---|---|---|---|---|
| Role | Seller is merchant | MoR | MoR (shown as Link) | MoR | MoR |
| Fees | 1.5% + €0.25 (standard EEA card), 2.8% + €0.25 premium EEA; + 0.7% Billing; + 0.5% Tax | 5% + 50¢ | 3.5% + Stripe processing + Billing | 5% + 50¢, extras possible | Starter 5% + 50¢; +1.5% non-US cards; paid plans lower |
| EU VAT | Calculates; seller registers and files | Handled | Handled | Handled | Handled (not read in detail) |
| Buyer invoice | Stripe invoice from seller; German content to check **[TAX]** | Issued by Paddle | Issued by Stripe/Link | Not verified | Portal lists invoices (search snippet only) |
| Trial without payment method | Yes, GA | Early access, API only | Not documented; app-side trial possible | App-side only | Built-in trial collects payment info; app-side trial possible |
| Dunning | Smart Retries, default up to 8 in 2 weeks; mails; end state configurable | Up to 7 attempts in 30 days by default; Retain adds mails | Stripe retries assumed; mails configurable (F4) | Retries, then `unpaid`; details not read | Not verified |
| Customer portal | Full, hosted, 40 languages incl. de/en | Hosted: payment details, invoices, cancel | Link site, plus Stripe portal optional | Not verified | Yes (search snippet only) |
| Webhooks | Full lifecycle | Full lifecycle | Stripe events | Subscription status events | Not verified |
| Cancellation button | Own page required; API or portal deep link | Own page required; cancel API | Own page required; update via API | Own page required | Own page required; cancel API unverified |
| Payout | Standard payouts free | Monthly, 2nd-15th, €100 minimum, SEPA free | Stripe payouts | Twice monthly | Stripe fees: $2/month active + 0.25% + $0.25 per payout |
| Accounting effort | High | Low | Low | Low | Low |

## Illustrative cost per charge

Assumptions, not a price proposal: gross €5 monthly and €50 yearly, standard EEA card, percentages on the gross amount, cent fees read as euro cents although Paddle, Lemon Squeezy and Polar quote USD. Whether Paddle's percentage applies to the gross amount was not confirmed. Excludes disputes and currency conversion.

| | €5 | €50 |
|---|---|---|
| Stripe Billing + Tax (2.7% + €0.25) | €0.385 (7.7%) | €1.60 (3.2%) |
| Stripe Managed Payments (5.7% + €0.25) | €0.535 (10.7%) | €3.10 (6.2%) |
| Paddle, Lemon Squeezy (5% + 50¢) | €0.75 (15%) | €3.00 (6%) |
| Polar Starter, non-US card (6.5% + 50¢) | €0.825 (16.5%) | €3.75 (7.5%) |

Fixed fees dominate at low prices, so the yearly share and the final price matter more than the percentage. Paddle says products under $10 may need bespoke pricing, which could affect a low monthly price.

Stripe rows exclude the cost of doing VAT work: tax adviser time, or a filing partner such as Marosa or Taxually.

## Findings

### F1. Fees

- Stripe Germany: 1.5% + €0.25 standard EEA cards, 2.8% + €0.25 premium EEA cards, 2.5% + €0.25 UK, 3.15% + €0.25 other foreign cards, +2% on currency conversion, SEPA debit €0.35 ([pricing](https://stripe.com/de/pricing)). Billing pay-as-you-go 0.7% ([Billing pricing](https://stripe.com/de/billing/pricing)). Tax Basic 0.5% per transaction through Billing or Checkout, or €0.45 through the API ([Tax pricing](https://stripe.com/de/tax/pricing)). That page does not say explicitly that each renewal counts as a transaction; the table assumes it does.
- Stripe disputes in Germany: €20 received, €20 for a manual response, refunded if won ([pricing](https://stripe.com/de/pricing)).
- Paddle: 5% + 50¢ per checkout transaction, no monthly fee; products under $10 may need bespoke pricing ([pricing](https://www.paddle.com/pricing)).
- Managed Payments: 3.5% per successful transaction on the full amount including tax, on top of standard processing and Billing fees ([Stripe support](https://support.stripe.com/questions/managed-payments-pricing)). A dispute fee still applies ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)).
- Lemon Squeezy: 5% + 50¢, edge cases and non-US transactions may cost extra ([pricing](https://www.lemonsqueezy.com/pricing)).
- Polar: Starter free at 5% + 50¢, Pro $20/month at 3.8% + 40¢, Growth $100/month at 3.6% + 35¢, Scale $400/month at 3.4% + 30¢; +1.5% non-US cards; $15 per dispute; fees not returned on refund ([fees](https://polar.sh/docs/merchant-of-record/fees)).

### F2. EU VAT

- B2C electronic services are generally taxed where the customer is. Under EUR 10,000 per year of cross-border B2C supplies, home-state rules can apply; once exceeded, the general rules apply. OSS returns are quarterly and come on top of the domestic return ([EU OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en)).
- Stripe Tax calculates VAT, stores location evidence and monitors thresholds, including the EUR 10,000 limit. The seller registers and files ([Stripe Tax EU](https://docs.stripe.com/tax/supported-countries/european-union)). Stripe's own automated filing covers the US, plus selected registrations in Ireland (non-EU OSS) and Canada. That does not fit a German seller, so filing means partners or Stripe reports ([filing](https://docs.stripe.com/tax/filing)).
- With an MoR the provider collects, files and remits ([Paddle](https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf), [Managed Payments](https://docs.stripe.com/payments/managed-payments/how-it-works), [Lemon Squeezy](https://www.lemonsqueezy.com/pricing)). The seller's German VAT treatment of MoR payouts is **[TAX]**.

### F3. Trial without a payment method

- **Stripe Billing**: supported through Dashboard, API and Checkout (`payment_method_collection=if_required`). `trial_settings.end_behavior.missing_payment_method` can be `cancel`, `pause` or `create_invoice`. Paused subscriptions resume once a payment method is added. `customer.subscription.trial_will_end` fires a few days before the end; reminder mails are configurable. Stripe recommends abuse protection on sign-up ([free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials)). This page is marked legacy in favour of "trial offers"; subscriptions using trial offers can be cancelled but not updated in the portal ([portal limits](https://docs.stripe.com/customer-management)).
- **Paddle**: public early access, may change. API only, no Paddle Checkout start; payment details only through one-page checkout; no Paddle trial reminders; portal cannot add payment details; cannot be paused or scheduled to cancel; cancellation is the only outcome at trial end ([cardless trials](https://developer.paddle.com/build/trials/cardless-trials/)).
- **Managed Payments**: subscriptions cannot be created outside Checkout or Payment Links ([overview](https://docs.stripe.com/payments/managed-payments)). The docs mention trial mails ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)), but the docs read do not say whether a trial can run without a payment method. Open question.
- **Lemon Squeezy**: the guide's "no payment required" trial is tracked in the app, then the user goes to checkout. The built-in trial captures a payment method ([guide](https://docs.lemonsqueezy.com/guides/tutorials/saas-free-trials)).
- **Polar**: "We'll still collect their payment information at checkout" ([trials](https://polar.sh/docs/features/trials)).
- **App-side trial, any provider**: no provider object exists until conversion. Consequence for the trial: no provider mails, no provider events, no Customer record at the provider. This fits the existing plan where the first milestone has no payment.

### F4. Dunning

- Stripe: Smart Retries, default up to 8 retries within 2 weeks on new accounts, windows from 1 week to 2 months. Afterwards the subscription can be cancelled, marked unpaid, left past due or paused. SEPA debit: 2 retries in 30 days, insufficient funds only ([retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)). Reminder mails included ([Billing pricing](https://stripe.com/de/billing/pricing)).
- Paddle: failed renewals go `past_due`, up to seven attempts over 30 days by default, even without Retain ([changelog](https://developer.paddle.com/changelog/2025/default-dunning-payment-recovery/)). Retain adds timed retries and recovery mails or SMS; afterwards the subscription pauses or cancels ([docs](https://developer.paddle.com/build/retain/configure-payment-recovery-dunning/)). Paddle's pages disagree on mail cadence, so check the dashboard. Retain pricing not checked.
- Managed Payments: failed payment mails configurable ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)); that Smart Retries apply is an assumption from Billing being the subscription layer.
- Lemon Squeezy: `past_due` during retries, `unpaid` afterwards, dunning depends on store settings; customers should keep access until `expired` ([subscriptions](https://docs.lemonsqueezy.com/help/products/subscriptions)).

The grace behaviour in map #1 (closing locks at once, 7-day grace) must be mapped onto these states in any case.

### F5. Customer portal and webhooks

- Stripe portal: billing details, tax ID, payment methods, plan changes, cancel now or at period end, invoices; German and English included; sessions are short-lived; no iframe; deep links available ([portal](https://docs.stripe.com/customer-management)). Custom domain $10/month ([Billing pricing](https://stripe.com/de/billing/pricing)).
- Paddle portal: update payment details, view invoices, cancel. Webhooks are signed, may arrive twice or out of order, need a 2xx within five seconds. Live checkout needs approved domains and public terms, privacy and refund pages ([go-live](https://developer.paddle.com/build/onboarding/go-live-checklist)).
- Managed Payments: customers manage orders at Link, guests are prompted to create a Link account; the Stripe portal can be offered too. Statement shows `LINK.COM*`. Custom checkout domains unsupported. Stripe may refund without consent if the seller does not answer within 48 hours, and in some cases within 60 days ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)).

The answer to the map's open point on Customer area contents: Stripe's and Paddle's portals cover payment details, invoices and cancellation, so the Customer area can link out for those, except the § 312k path.

### F6. Payout and accounting

- Stripe: standard payouts free ([pricing](https://stripe.com/de/pricing)). Every sale is the seller's revenue, with VAT per country. Reports exist; returns remain manual or via partner ([filing](https://docs.stripe.com/tax/filing)).
- Paddle: monthly, initiated on the 1st, usually done by the 15th, €100 minimum, balance carries over, SEPA free for EUR ([payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid), [fees](https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts)). No invoice to Paddle needed: Paddle issues a reverse invoice per payout ([help](https://www.paddle.com/help/manage/get-paid/do-i-need-to-invoice-paddle-for-my-payout)). Whether it suits German requirements is **[TAX]**.
- Managed Payments: reports split `withheld_tax` from fees ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)).
- Lemon Squeezy: twice monthly to bank or PayPal ([pricing](https://www.lemonsqueezy.com/pricing)).

### F7. Cancellation button (§ 312k BGB)

Applies to paid continuing contracts consumers can conclude on a website. Requires a button labelled "Verträge hier kündigen" or equivalent, leading directly to a confirmation page, with a "jetzt kündigen" button; both permanently available and easily accessible. Also: storable declaration and immediate confirmation in text form. Missing buttons let the consumer terminate at any time without notice ([§ 312k BGB](https://www.gesetze-im-internet.de/bgb/__312k.html)).

No provider doc read claims compliance. Stripe's cancellation page does not mention it ([cancellation](https://docs.stripe.com/customer-management/cancellation-page)). A login-gated portal is unlikely to meet "unmittelbar und leicht zugänglich" on its own (own reading, **[LAWYER]**). Stripe's retention coupon and Paddle's Retain cancellation flows add steps before cancelling, which should be reviewed against the direct path **[LAWYER]**.

Who owes the duty when an MoR sells is open **[LAWYER]**. The transactional confirmation mail links this to the mail ticket.

### F8. Contract partner under an MoR

Paddle's terms state that Paddle is the reseller and seller to the buyer; the default entity for a non-UK supplier appears to be Paddle.com Market Limited (own reading of the definitions) ([terms](https://www.paddle.com/legal/terms)). Managed Payments shows Link as merchant ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)).

`GLOSSARY.md` defines the Customer as the Operator's contract partner and the Subscription as the contract between them, as does map #32. An MoR would require revisiting those definitions and the legal texts, or separating a service contract from the sale **[LAWYER]**. Refunds, withdrawal right wording and privacy roles follow from this.

## Open questions

- Does Managed Payments allow a trial with no payment method? Test in a sandbox.
- Does Paddle's cardless trial reach general availability, and with portal and mail support?
- Does any MoR accept the product under its acceptable use terms? Paddle's policy and Stripe's review were not checked against this product; Stripe's eligibility review is per account ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)).
- Lemon Squeezy's and Polar's portal, invoice and dunning details were not verified from primary pages. Lemon Squeezy's future relative to Managed Payments was not established.
- **[TAX]** Required content of Stripe invoices for German B2C, GoBD handling of exports, booking of MoR payouts and reverse invoices.
- **[LAWYER]** § 312k duty and contract structure under an MoR; withdrawal right handling at trial conversion.
- Other MoRs (FastSpring, Dodo Payments, Creem) and other PSPs (Mollie) were not compared.
