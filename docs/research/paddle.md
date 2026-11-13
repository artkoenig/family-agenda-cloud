# Paddle as Merchant of Record

Research for issue #42 (map #32, feeds #36). Deepens and corrects `payment-providers.md` and `legal-duties-b2c-eu.md`. Checked 2026-11-07. Comparison only, no decision. Not legal or tax advice. Items marked **[LAWYER]** or **[TAX]** need professional review; **Unverified** marks what no primary source settled. Pages were read through a summarising fetch tool, so check exact clause wording before relying on it. Sources: [MSA](https://www.paddle.com/legal/terms) (updated 6 Oct 2026), [Buyer Terms](https://www.paddle.com/legal/buyer-terms) (31 Mar 2026), [Refund Policy](https://www.paddle.com/legal/refund-policy) (31 Mar 2026), [AUP](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) (13 Apr 2026).

## Situation

Seller: German Einzelunternehmer, not a Kleinunternehmer. B2C Subscription, EU, de/en. One tariff, monthly and yearly; about €5 and €50 assumed for illustration only. Trial without payment method, likely app-side.

## Gist

- **No hard disqualifier found.** The AUP does not exclude this product, and sole traders are accepted. Acceptance itself is only known after review.
- **Three items could still block, and none can be settled from documents:**
  1. **Yearly renewal.** Buyer Terms renew for the same term; § 309 Nr. 9 BGB does not allow that in German AGB (F4). **[LAWYER]**
  2. **Order button.** Paddle's German label is unknown and no setting for it was found. A wrong label means no contract under § 312j Abs. 3, 4 (F4). Test in sandbox.
  3. **Bespoke pricing.** €5 is under Paddle's $10 line, so standard pricing does not cover it (F2). Ask Paddle in writing.
- **Real cost:** €5 monthly loses about €0.75, or 18% of net revenue in Germany, because the fee is charged on the tax-inclusive price. €50 yearly loses about €3.00 (7%). A chargeback costs €20 even if won.
- **Contract:** Paddle sells; the Operator supplies under its own agreement. The Buyer Terms expect that second agreement, so the fit is better than #33 suggested, but the glossary's "paid contract" needs rewording.
- **App-side trial fits best.** It avoids every gap in Paddle's cardless trial, which is still early access.
- **No SEPA direct debit** found. Cards, PayPal, Apple Pay and Google Pay work for subscriptions.
- **Remaining seller work is substantial:** own § 312k page, trial, legal texts, product support, and bookkeeping. Paddle removes VAT filing, buyer invoices, payment handling and billing support.

## Corrections to earlier research

| Earlier statement | Now |
|---|---|
| Fee base unconfirmed (`payment-providers.md`) | Tax-inclusive price, on own reading of MSA (F2) |
| Retain pricing not checked | Included in Paddle Billing at no extra cost ([Retain](https://www.paddle.com/retain-standalone)) |
| Paddle's mail cadence unclear | Up to four mails, typically days 1, 3, 5, 7 ([dunning](https://developer.paddle.com/build/retain/configure-payment-recovery-dunning/)) |
| Paddle sends no trial reminders | True for cardless trials only; card-based trials over 7 days get one ([mails](https://www.paddle.com/help/manage/your-customers/which-emails-will-customers-receive-on-paddle-billing)) |
| Portal: payment details, invoices, cancel | Correct, but cancelling runs a survey and retention offer ([portal](https://developer.paddle.com/concepts/sell/customer-portal/)), relevant to § 312k |
| Entity "appears to be" Paddle.com Market Ltd | Confirmed for EU buyers and for a German supplier (F3) |
| MoR "conflicts" with glossary | Narrower: wording must change, the structure is provided for (F3) |

## Illustrative cost per charge

Assumptions: German buyer, 19% VAT, EUR price and EUR balance, card payment, standard 5% + $0.50 applied although €5 may be bespoke, $0.50 taken as €0.50 (real conversion unverified, likely slightly less).

| | €5 monthly | €50 yearly |
|---|---|---|
| Net of VAT | €4.20 | €42.02 |
| Paddle fee (5% of gross + 0.50) | €0.75 | €3.00 |
| Seller receives | €3.45 | €39.02 |
| Fee as share of net | 17.9% | 7.1% |
| Per year, one Customer | fee €9.00, seller €41.40 | fee €3.00, seller €39.02 |

The monthly tariff costs three times as much in fees per year. One €20 chargeback fee equals nearly six monthly payouts.

## Findings

### F1. Acceptance

- **Product type:** Paddle serves software companies, including consumer software ([AUP](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle)). MSA "Product" covers software products and digital content.
- **Family data:** no rule on family or children's data. But businesses failing EU GDPR consent requirements are restricted (AUP), so the open points in `legal-duties-b2c-eu.md` F8 and F9 also touch acceptance.
- **LLM/OCR:** no general AI rule. Prohibited under "Content generation": deepfakes, voice impersonation, likeness without consent, and "automated decision-making or categorization of people". Agenda extraction does not obviously match; own reading. Avoid describing features as classifying people. Generated human-like faces are a restricted category, so generated avatars would invite extra checks.
- **Medical advice** is prohibited; storing doctor appointments is not advice (own reading).
- **AGPL hosted service:** open source is not mentioned. Sales need a "bona fide software or service", and donations are excluded, so keep any donation link out of Paddle. Selling a hosted service for code that is also free is not addressed. **Unverified**: ask Paddle.
- **Discretion:** lists are not exhaustive, and Paddle may reject products outside its "risk tolerance" (MSA 9.6).
- **Sole trader:** business verification "is not required for individuals or sole traders" ([business](https://www.paddle.com/help/start/account-verification/what-is-business-verification)). Domain review and identity verification remain ([verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification)). Germany is not on the unsupported list ([countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)).
- **Duration:** domain review is mostly automatic, manual ones an estimated 5-7 business days ([domain](https://www.paddle.com/help/start/account-verification/what-is-domain-approval)). Manual business checks are 2-4 business days, which does not apply here. Identity check duration **unverified**.
- **Website needs before review:** live HTTPS site, product description, pricing, Terms, Refund Policy and Privacy Policy reachable from navigation, legal name preferred in the Terms (domain page). Partner docs name login walls and missing public pricing as common failure causes ([partner docs](https://developer.paddle.com/partners/embed-billing/seller-go-live/prepare-for-go-live)). The site must also show Paddle's reseller role (MSA 9.2). So the public landing page and legal texts must exist before going live. Sandbox needs no approval.

### F2. Real cost

- **Rate:** 5% of SRP plus $0.50 (MSA 3.2). The bank-transfer rate of 3.5% covers Paddle Invoicing, not checkout.
- **Under $10:** "If you're selling product with under 10$ value you can contact us for bespoke pricing" ([pricing](https://www.paddle.com/pricing)). The page says such products are not covered by standard pricing. Whether that means higher, lower, or refused is **unverified**. Alternative pricing is at Paddle's discretion and revocable (MSA 3.5). €50 yearly is above the line.
- **Fee base:** SRP is "the price paid by the Buyer", and tax is deducted as a separate item (MSA 1.1, 3.1). So the fee falls on the tax-inclusive price (own reading). A Paddle docs search snippet says the same ("calculated from the transaction total"), but it was not found on the page read.
- **EUR vs USD fixed fee:** MSA states only $0.50. No EUR amount found. **Unverified**: check a sandbox transaction's `fee` field or ask.
- **Conversion:** mid-market plus 2% for USD/EUR/GBP, 2.5% for CZK, DKK, NOK, THB, 3% others (MSA 7.1). Applies only when converting; a EUR balance with EUR prices should avoid it (own reading). Prices in PLN or SEK would incur it. Non-SEPA payouts cost 15 in currency (MSA 7.5); SEPA EUR is free per #33.
- **Chargebacks:** up to €20 per chargeback or pre-chargeback alert (MSA 10.4). Not refunded on a won dispute; the alert refunds the buyer and still costs the fee. Paddle defends disputes itself and takes no seller evidence. Acceptable rate below 0.65% of volume, monthly by value; won disputes count ([chargebacks](https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle)).
- **Refunds:** seller repays the full refund plus related fees and expenses (MSA 10.4). Paddle retains some fee "to cover gateway costs" ([reconciliation](https://developer.paddle.com/build/reports/payout-reconciliation/), [changelog](https://developer.paddle.com/changelog/2025/retained-fees-payout-totals/)). Amount **unverified**; assume the fee is lost until a real adjustment shows otherwise. A pending refund needs Paddle approval unless the account is verified, the amount is at most $400 and below balance ([refunds](https://developer.paddle.com/build/transactions/create-transaction-adjustments/)).
- **Retain:** no extra cost. Checkout Recovery costs 10% of recovered checkouts (MSA 3.3). Whether it can be left off is **unverified**.
- **Payout floor:** payment once the balance exceeds €100 (MSA 7.2). That is about 29 monthly Customers per month; below it the balance carries over.
- **Minimum charge:** docs list €0.65, old page ([currencies](https://developer.paddle.com/concepts/sell/supported-currencies/)). Irrelevant at these prices.

### F3. Contract

- **Seller:** Paddle, as non-exclusive reseller (MSA 2.1, 4.1, 10.1). It may set the price at which the Product is sold (MSA 3.4). **[LAWYER]** check this against the seller's published price.
- **Entity:** EU buyers buy from Paddle.com Market Limited, England and Wales ([Buyer Terms](https://www.paddle.com/legal/buyer-terms)). A German supplier also contracts with that entity; Paddle.com Inc. covers US transactions, Paddle Payments Limited (Ireland) only UK/Isle of Man suppliers (MSA 1.1).
- **Buyer terms:** English law by default; consumers may also sue at home. Warranties for the product are excluded by Paddle.
- **Service contract:** Buyer Terms say the Product is supplied under a separate "Supplier Agreement" that the buyer accepts by purchasing and must follow. MSA 6.4 refers to "your agreements with each Buyer". No clause bars such an agreement. Limits: seller must not invoice or demand payment from Buyers (MSA 10.1), and sales run only through approved URLs (MSA 11.1(v)).
- **Resulting structure:** Customer buys from Paddle; Customer and Operator hold a service contract with no payment term of its own. `GLOSSARY.md` calls the Subscription "the paid contract between the Customer and the Operator", which would need rewording. The glossary was not changed here; that belongs to the decision in #36. **[LAWYER]** whether the Operator stays "Unternehmer" under §§ 327 ff., and how withdrawal or termination of one contract ends the other.
- **Termination:** either party on 30 days' notice (MSA 16.1). Paddle immediately if a payment provider asks, on MATCH listing, false warranties, suspected fraud, excessive chargebacks, or products outside the AUP (MSA 16.3). On termination, APIs are disabled (MSA 17.3), so billing for all Customers stops.
- **Suspension:** product sale may be rejected or suspended on risk grounds (MSA 9.6), or sales stopped for excessive refunds or chargebacks (MSA 10.3).
- **Payout holds:** set-off at any time (MSA 8.1-8.2), duty to top up shortfalls (8.3), retention on suspension or termination, released at the later of six months after termination or the end of the last subscription (MSA 17.2, 17.4). With yearly plans, that can be about a year. No standing reserve clause found.
- **Terms changes:** effective for existing suppliers 30 days after publication; only remedy is termination. Courts: English, exclusive (MSA 19).
- **Exit:** Paddle says data can be migrated ([pricing](https://www.paddle.com/pricing)). Payment token portability to another provider **unverified**.

### F4. Consumer law

- **Withdrawal:** 14 days, full refund (Refund Policy 2.2.1). Covers one-off purchases and the first Subscription payment, not renewals (2.2.2-2.2.3). New 14 days after a free trial (2.2.2). Paddle's own trial only; an app-side trial is invisible to it, so the period runs from the first payment.
- **Loss of right:** ends once digital content use starts with express waiver (2.2.4; Buyer Terms 15). That is the digital-content rule; `legal-duties-b2c-eu.md` F2 expects the service rule, under which the right survives. **[LAWYER]** A checkout notice with the wrong rule could keep the period open, up to 12 months and 14 days.
- **Wertersatz:** Paddle's policy offers a full refund, with no pro-rata deduction found. So Wertersatz is in practice waived, and the seller repays everything (MSA 10.4). At these prices that is a small cost.
- **Who decides:** Paddle may refund within 14 days of purchase or last renewal, on suspected error or fraud, likely chargeback, or legal duty (MSA 10.2). Discretionary refunds are at Paddle's choice (Refund Policy 7). Seller has no veto. Default otherwise: non-refundable (1.1). After refund, access stops (1.6), so a webhook must lock the Family.
- **Withdrawal button:** Refund Policy 3.1.1 places an online button in the customer portal, refund within 14 days. The portal doc does not mention it, and portal login is by emailed link. Whether this meets § 356a **[LAWYER]**; confirm in sandbox that it exists and has the required two steps.
- **§ 312k:** Seller warrants a direct cancellation link where law requires (MSA 11.1(iii)), so **the duty is passed to the seller by contract**. The portal cancel path has a survey and a retention offer, login by mail, and Retain flows may add steps. Use an own page calling the [cancel API](https://developer.paddle.com/build/subscriptions/cancel-subscriptions/) with `next_billing_period`. Pitfalls: cancelling fails within 30 minutes of the next billing date; the page must still accept the declaration then. Cancelled subscriptions cannot be reinstated. Own text-form confirmation is safest even though Paddle mails "Cancel Request". `cancel_subscription` portal deep links need an authenticated session, so they do not serve a page reachable without login.
- **Order button:** no Paddle source states the German label. Docs show styling options, no label setting ([branding](https://developer.paddle.com/build/checkout/brand-customize-inline-checkout/)). **Unverified.** Open checkout with `locale=de` in sandbox, record the label, and have it reviewed. § 312j Abs. 2 information in the checkout (term, cancellation, monthly total) is equally unchecked. The seller can place that information on its own page before checkout, but "immediately before ordering" may not be met. **[LAWYER]**
- **Yearly renewal:** "Subscriptions automatically renew for further periods equal to your initial Subscription term" (Buyer Terms 3). § 309 Nr. 9 BGB bars this for a yearly term (`legal-duties-b2c-eu.md` F6), and Rome I Art. 6 may keep that protection despite English law. Cancellation only at period end (Buyer Terms 6). Seller cannot edit these terms. Possible workaround, not tested: schedule cancellation at the end of year one, so each year is a new order. **[LAWYER]** Monthly is unaffected. Auto-renewal reminders exist only where Paddle deems them legally required, for terms of 180+ days ([mails](https://www.paddle.com/help/manage/your-customers/which-emails-will-customers-receive-on-paddle-billing)).

| Duty | Paddle | Stays with seller |
|---|---|---|
| Withdrawal handling, refund | Yes | Pays; locks access; own wording in legal texts |
| § 312k | Portal cancel only | Button, page, confirmation |
| § 356a | Claimed in portal | Check; link to it |
| § 312j button and summary | Runs checkout | Verify; pre-checkout page |
| § 309 Nr. 9 | Terms unsuited | Find structure with lawyer |
| Conformity, updates, changes (§§ 327 ff.) | No | Yes |

### F5. German tax

All **[TAX]**; own reading of statutes, to confirm with an adviser.

- **Buyer invoice:** Paddle issues it; every receipt mail has a PDF invoice ([mails](https://www.paddle.com/help/manage/your-customers/which-emails-will-customers-receive-on-paddle-billing)). Seller must not invoice buyers (MSA 10.1).
- **Reverse invoice:** one per payout, sent to Admins, no action needed ([help](https://www.paddle.com/help/manage/get-paid/do-i-need-to-invoice-paddle-for-my-payout)). Sales outside the US are billed by the UK or Irish entity, US sales separately; a remittance advice totals them ([statements](https://www.paddle.com/help/manage/get-paid/what-statements-will-i-receive)). So expect two reverse invoices and one remittance advice per payout. MSA 7.3 calls this self-billing; seller stays responsible for own invoicing and reporting, and must report VAT status changes (MSA 7.4). Contents for EU sellers are **unverified**; get a sample.
- **VAT on the payout:** Paddle says no VAT is charged to it; reverse charge applies in its country ([help](https://www.paddle.com/help/manage/get-paid/should-i-charge-paddle-vattax-for-payouts)). This matches German rules: acting in own name for another's account deems the service supplied to and by the intermediary ([§ 3 Abs. 11, 11a UStG](https://www.gesetze-im-internet.de/ustg_1980/__3.html)), and B2B services are performed where the recipient runs its business ([§ 3a Abs. 2](https://www.gesetze-im-internet.de/ustg_1980/__3a.html)). Result: supply to a UK business, not taxable in Germany. US sales: same logic.
- **To confirm with the adviser:**
  - UStVA line for these non-taxable supplies; no ZM if the recipient is outside the EU (ZM rule not read).
  - Whether the reverse invoice must say "Gutschrift". [§ 14 Abs. 2, 4 Nr. 10](https://www.gesetze-im-internet.de/ustg_1980/__14.html) requires it for German-law invoices; whether German invoice law applies to a supply located in the UK is unclear. [§ 14a](https://www.gesetze-im-internet.de/ustg_1980/__14a.html) covers supplies in other EU states only.
  - Is the Paddle Discount a price reduction, as the MSA's margin wording implies, or a service to the seller? The latter could trigger [§ 13b](https://www.gesetze-im-internet.de/ustg_1980/__13b.html) on the fee.
  - Input VAT on own costs stays deductible despite non-taxable sales (§ 15 Abs. 2 UStG, not read).
- **Booking:** income is the Supplier Fee, SRP less tax, discount and charges (MSA 3.1). Book per payout, without VAT, against the reverse invoice; keep [reconciliation exports](https://developer.paddle.com/build/reports/payout-reconciliation/) (`remittance_reference`, balance-currency fields) as support. Booking net or gross of the Paddle fee, timing, and GoBD archiving are open.
- **German VAT for domestic buyers** is Paddle's, since Paddle is seller. The seller no longer has OSS or country-by-country filing, but keeps VAT returns for its business.

### F6. Trial and conversion

- **App-side trial:** no Paddle object until the order. At conversion, the app opens checkout for the price with `customData` linking the Family, and activates on `transaction.completed` or `subscription.created`. Matches `legal-duties-b2c-eu.md` F7: paid start as an active order step, one withdrawal period. App owns trial state, abuse limits, reminders and lock. A custom-data link is standard but was not read in detail here.
- **Cardless trial, current state:** still public early access ([docs](https://developer.paddle.com/build/trials/cardless-trials)), though available to everyone. API-only prices and start, no Paddle.js start, one-page checkout only, no pause or scheduled cancel, cancellation is the only expiry, no reminders, portal cannot add payment details. A [changelog](https://developer.paddle.com/changelog/2025/cardless-trials-developer-preview) dates it to 2025.
- **Comparison:** cardless creates a Paddle customer at sign-up, sharing data before any purchase, and adds Paddle's withdrawal text after trial. App-side has neither. Cardless offers little beyond what the app must build anyway.

### F7. Customer experience

- **Checkout languages:** `de`, `en` among 19 locales; `locale` overrides browser default ([hosted checkout](https://developer.paddle.com/paddle-js/about/hosted-checkout/)). Pass the app's language.
- **Mails:** receipts, subscription, refund and payment-failure mails are in the language used at checkout; 16 languages incl. de and en ([mails](https://www.paddle.com/help/manage/your-customers/which-emails-will-customers-receive-on-paddle-billing)). Customer `locale` steers it ([customers](https://developer.paddle.com/build/customers/create-update-customers/)). Can the seller disable or edit them: **unverified**.
- **Portal:** "more than 17 languages"; German not named individually, near-certain but **unverified**. Hosted, login by emailed link, authenticated links possible ([sessions](https://developer.paddle.com/build/customers/integrate-customer-portal/)).
- **Payment methods:** [overview](https://developer.paddle.com/concepts/payment-methods/overview). Cards always on. Subscriptions: cards, Apple Pay, Google Pay, [PayPal](https://developer.paddle.com/concepts/payment-methods/paypal/) confirmed. iDEAL | Wero and Bancontact listed; subscription use not checked.
- **SEPA direct debit:** not on Paddle's list. Old help page: SEPA wire only, one-time, at least $100 ([help](https://www.paddle.com/help/start/intro-to-paddle/which-payment-methods-do-you-support)). So no SEPA for this product, a gap for German families who prefer it.
- **Dunning:** `past_due`, up to seven retries in 30 days, then cancel by default; with Retain, up to four mails, and an end state of pause or cancel with chosen days ([dunning](https://developer.paddle.com/build/retain/configure-payment-recovery-dunning/)). Retain needs Paddle.js on a public page and runs on live data only, no sandbox. In-app prompts optional. Map to the 7-day grace in the map. Cancelled subscriptions need a new checkout, a new withdrawal period and possibly a new order step; pause avoids this.

### F8. Integration effort

**App must build:**
- Catalog: one product, two prices, in sandbox and again in live; IDs differ ([go-live](https://developer.paddle.com/build/onboarding/go-live-checklist)).
- Paddle.js on an own-domain default payment link page; client token; server API key.
- Webhook endpoint: verify `Paddle-Signature` on raw body, 2xx within 5 seconds, idempotent, tolerate duplicates and reordering. Subscribe to `transaction.completed`, `subscription.created/updated/canceled`, `customer.created/updated`, plus past-due, paused and adjustment events (exact names not read).
- State mapping: `active`, `past_due`, `paused`, `canceled` and refunds to Family access.
- Own § 312k page, own confirmation mail, link to withdrawal in portal.
- Portal link via session API; no stored links.
- Trial logic and mails in the app.
- Monthly export for bookkeeping.

Sandbox is a separate, unverified account with auto-approved domains and test cards. Rough effort, own estimate: small to medium, less than Stripe Billing + own VAT work, and most of the work (trial, state, § 312k) is the same with any provider.

### Remaining seller work

Not removed by Paddle:

- **Legal:** Impressum; service contract/Supplier Agreement; privacy notice naming Paddle as independent Controller (MSA 14.2); withdrawal wording aligned with Paddle's; own Refund Policy page; reseller notice on site; order and cancel flows; AVVs with vendors.
- **Product:** conformity, updates, change notices (§§ 327 ff.), product support (MSA 6.4), data export, account deletion.
- **Accounts:** income tax, bookkeeping of payouts, German VAT return, tax adviser check of reverse invoices.
- **Risk:** keep chargebacks below 0.65%, accurate Product Information with 30 days' notice of material changes (MSA 9.5), watch terms changes, answer KYC requests (MSA 9.1), exit plan for abrupt termination.
- **Billing edge cases:** price changes, yearly renewal design, refunds locking access, failed payment grace.

Paddle does take: sale, VAT calculation and filing worldwide, buyer invoices, payment processing, fraud screening, dispute defence, first-tier billing support (MSA 6.1), dunning.

## Open questions

Ask Paddle (sellers@paddle.com) before committing:
- Pricing for €5 monthly: standard, bespoke, or refused?
- Is the $0.50 fixed in USD, or €0.50 on EUR sales?
- Pre-check of the product: AGPL hosted service, LLM/OCR features, family data.
- Can the German order button read `zahlungspflichtig bestellen`, and what does it read now?
- Can yearly subscriptions end without renewal, and do Buyer Terms allow indefinite continuation?
- How much fee is retained on a refund?

Test in sandbox: German checkout wording, portal withdrawal button, German portal, `fee` values on a €5 transaction, adjustment after refund.

**[LAWYER]** Two-contract structure; Paddle's withdrawal rule vs service rule; § 356a via portal; § 312j in third-party checkout; § 309 Nr. 9 workaround; MSA 3.4 price right.

**[TAX]** All of F5; a sample reverse invoice is needed.

Stripe Managed Payments was not re-checked on these points, so this file does not establish whether it does better on them.
