# German Merchant of Record providers

Research for issue #43 (map #32, feeds #36). Checked 2026-11-07. Comparison only, no decision. Not legal or tax advice. Items marked **[LAWYER]** or **[TAX]** need professional review. Provider prices and terms change; recheck before committing. "Snippet" means only a search excerpt was seen, because the page refused fetching. Paddle figures come from [paddle.md](paddle.md); legal background from [legal-duties-b2c-eu.md](legal-duties-b2c-eu.md).

## Situation

Seller: German Einzelunternehmer, not a Kleinunternehmer. Hosted B2C SaaS across the EU, de/en. One tariff, monthly and yearly, price not set (illustrated at €5 and €50). Trial without a payment method, likely app-side. Criterion: least work for the maintainer. Paddle's open blockers set the bar: yearly renewal vs § 309 Nr. 9 BGB, § 312j order button, prices under $10.

## Gist

- **Five real German-law resellers found**: Digistore24, ablefy (reseller mode only), CopeCart, affilicon, Cleverbridge. All sell in their own name. Confirmed from their terms.
- **No candidate clearly beats Paddle on least work.** They clear some legal blockers on paper, but add integration, cost and reputation work.
- **§ 309 Nr. 9 is the clearest win.** Digistore24 (§ 6 Abs. 12) and affilicon (§ 9) turn a consumer contract into an open-ended one with monthly cancellation after the first term. How a yearly payer is billed or refunded after that is unverified at both.
- **§ 312j is not solved by going German.** LG Hildesheim held Digistore24's own label `Jetzt kaufen und weiter zur Zahlung` unlawful (F2). Whether the checkout has changed since is unverified; the seller cannot change it. Other labels are unverified. Paddle's German label is unknown too.
- **§ 312k is better, not finished.** Digistore24, affilicon, ablefy and CopeCart buyers can cancel by button or portal at the provider. A German court still held a platform responsible for the seller's site, and CopeCart pushes the button onto the vendor (F3).
- **Small prices get worse.** The €1 to €1.50 fixed fee costs about €1.35 to €1.78 on €5, against €0.75 at Paddle. At €50 the gap is about €1.30 to €1.95. Paddle's under-$10 "bespoke pricing" is the only reason this could narrow.
- **Integration is thinner.** Webhooks exist, but none has a Paddle-grade sandbox or a documented API for subscription lifecycle, as far as found. Checkouts are built for info products and upsells.
- **Closest challenger: Digistore24.** No monthly fee, SaaS named as a product type, SEPA direct debit, service-rule withdrawal text, built-in cancel button. Against it: court-rejected button, 7.9% + €1, 10% reserve, unclear EU selling entity (F1), "Abofalle" search results.
- **Cleverbridge** is the only one with a SaaS-grade platform, but it is quote-based and its own blog points early-stage B2C SMBs to Paddle.

## Comparison

| | Paddle (baseline) | Digistore24 | ablefy (reseller) | CopeCart | affilicon | Cleverbridge |
|---|---|---|---|---|---|---|
| Seller to buyer | Paddle.com Market Ltd | Digistore24 GmbH, maybe Irish MSLW Ltd (F1) | namotto Universal Brands or academies & friends GmbH & Co. KG | CopeCart GmbH; SaaS use contract with maker | affilicon GmbH | Cleverbridge GmbH |
| Law | English (seller side) | German | German | German | German | German for non-US clients |
| Yearly renewal, consumer | Same term: § 309 Nr. 9 problem | Open-ended, monthly cancellation | Not stated | No minimum term per help page; yearly not addressed | Open-ended, one month's notice | Cancel to end of current term; renewal length not stated |
| § 312j label | Unknown | `Jetzt kaufen und weiter zur Zahlung`, held unlawful | `Place Order` in English; German unverified | Unverified | Unverified | Unverified |
| Price floor at €5 | "Bespoke" under $10 | None found | None found | None found | None found | Quote |
| § 312k | Passed to seller | Button at Digistore24 and on order pages | Separate button; "Abo kündigen" on payment page | Vendor must embed | Button at affilicon | "As indicated on website" |
| Withdrawal | Button claimed in portal; digital-content rule | Button; service rule, pro-rata value | Two-step button; digital-content rule | Digital-content rule; unwinds to vendor | Own 60-day right on vendor side (scope unclear) | Digital-content waiver text (2021), email or letter; no button in terms |
| Fee | 5% + $0.50 | 7.9% + €1 (conflict, F4) | 5.6% + €1.50, + €27/month | 6.9% + €1 from 2027 (now 4.9% + €1, cards 6.9%) | 7% + €1 | Quote |
| Chargeback | Up to €20 | €50 card, €12 to €15 ELV, €35 PayPal | €25; reversed debit €8 | No clause found | €10.66 + tax | Limit 0.5%; prevention fee |
| SEPA direct debit | No | Yes | Yes | Not verified | Yes (ELV) | Not verified |
| PayPal | Yes | Yes | Yes | Yes | Yes | Not verified |
| Webhooks | Full | IPN incl. rebill cancel, missed payment | API and webhooks in plan; not read | IPN; PDF not read | ITNS: SALE, BILL, RFND, CGBK, CANCEL-REBILL | Not read in detail |
| Sandbox | Yes | Test purchases, `api_mode`, no separate sandbox found | Unverified | Test order, no sandbox found | Not found | Not read |
| Hosted SaaS accepted | Yes | Yes, named | Unverified | Yes, split contract | Not named; services accepted | Software focus; yes in principle |
| Checkout languages | de/en | de/en and 6 more | de/en | Contract language German | Multilingual form | Not read |
| Contract language | Not an issue found | German only (Irish entity: English only) | German | German | Not read | Not read |
| Payout | Monthly, €100 min | From 14 days, up to 4 monthly; 10% held 60 days; €50 min | 1 to 2 monthly, buffer 15 to 30 days (snippet) | 80% after 14 days, rest +40; PayPal slower; €150 min | Weekly to monthly; €100 min; reserve up to 100%, 8 weeks | Retention up to six months of refunds and chargebacks |
| After termination | 6-month retention | Hold 3 + 3 months | Unverified | Unverified | Block up to 2 years during investigations | Up to 6 months after last renewal |
| Exit | Subscriptions at provider | Vendor terminable 4 weeks; product removable without reasons | Reseller switch only when subs ended (snippet) | Registration terminable anytime | Four weeks to month-end | Contract |

## Cost per sale

Consumer price gross, 19% German VAT for illustration. Fee assumed on gross: confirmed by Paddle and Cleverbridge terms, implied by CopeCart, **unverified** for Digistore24, ablefy, affilicon. On net, Digistore24 falls by about €0.07 on €5 and €0.63 on €50. Refund, chargeback and monthly costs excluded unless shown.

| | €5: fee | €5: seller keeps (share of net €4.20 lost) | €50: fee | €50: seller keeps (share of net €42.02 lost) |
|---|---|---|---|---|
| Paddle | €0.75 | €3.45 (17.9%) | €3.00 | €39.02 (7.1%) |
| Digistore24 | €1.40 | €2.80 (33%) | €4.95 | €37.07 (11.8%) |
| CopeCart (2027) | €1.35 | €2.85 (32%) | €4.45 | €37.57 (10.6%) |
| affilicon | €1.35 | €2.85 (32%) | €4.50 | €37.52 (10.7%) |
| ablefy reseller | €1.78, + €27/month | €2.42 (42%) | €4.30, + €27/month | €37.72 (10.2%) |
| Cleverbridge | Quote | | Quote | |

Paddle's €5 row assumes standard pricing; "bespoke" terms may differ.

## Findings

### F1. Role and contract

- **Digistore24.** Buys "im eigenen Namen und für eigene Rechnung" and resells; "Eine vertragliche Beziehung zwischen Vendor und Endkunde besteht nicht"; vendor is Erfüllungsgehilfe ([vendor terms](https://www.digistore24.com/info/merchant_contract/1/de), Präambel, § 3, § 16). Yet [buyer terms](https://www.digistore24.com/info/terms/1?lang=de) § 2 Abs. 3 let vendors add product terms that apply "zwischen dem Kunden und unserem Erfüllungsgehilfen", and § 4 allows own software licences. That is the hook for a service contract with the Operator; the tension is **[LAWYER]**.
- **Which Digistore24 entity sells to EU buyers is unverified.** [Digistore24 MSLW Ltd](https://www.digistore24.com/info/terms/4?lang=de) (Dublin) has Irish law, English-only contract language and renewal for the agreed term, with no monthly conversion seen. If EU sales land there, the § 309 Nr. 9 advantage goes. [Its fee page](https://help.digistore24.com/hc/en-us/articles/29007028838033-Costs-on-Digistore24-MSLW-Limited-Ireland) (snippet) adds 9.9% + €1 above 1% chargebacks.
- **German-only contract language** (buyer § 3 Abs. 9) sits badly with en buyers, though forms can be English. **[LAWYER]**
- **ablefy.** [Terms](https://ablefy.io/en/namotto-ub/) and [second entity](https://ablefy.io/en/namotto-af/): reseller of the "product provider". Seller-side terms not found. Normal-seller mode is not an MoR.
- **CopeCart.** [Vendor terms](https://copecart.com/agb_vendors_and_affiliate) Teil I 2.1: CopeCart is Anbieter. But [buyer terms](https://www.copecart.com/agb/) § 4: for SaaS, CopeCart "nicht Vertragspartner" of the use; the maker is. This is the cleanest fit for a separate Operator contract, and also leaves the seller directly liable for it.
- **affilicon.** [Terms](https://www.affilicon.net/agb/) (March 2025): legal contract partner, providers are Erfüllungsgehilfen.
- **Cleverbridge.** [MoR terms](https://grow.cleverbridge.com/hubfs/Cleverbridge%20Solution%20Specific%20Terms%20%E2%80%93%20Merchant%20of%20Record.pdf) (Nov 2025): reseller rights, seller for VAT, sole discretion on Resale Price, Customer Agreement between client and buyer contemplated (8.2(c), 10.4). [MSA](https://grow.cleverbridge.com/hubfs/2025%20Cleverbridge%20MSA.pdf) § 8: German law, Cologne venue for non-US clients. [Legal index](https://grow.cleverbridge.com/legal-info); customer terms read are dated June 2021.
- All cases need the `GLOSSARY.md` rewording that Paddle needs: the paid sale is not with the Operator. Change belongs to #36.

### F2. § 312j order button

[LG Hildesheim, 11 O 5/25](https://www.verbraucherzentrale-bawue.de/sites/default/files/2026-02/lg-hildesheim_urteil_233012026_az.-11-o-5-25.pdf) (Verbraucherzentrale BW v Digistore24, online seminar at €29.95, hearing 23.02.2026 per judgment) ordered Digistore24 to stop three things:

- Label `Jetzt kaufen und weiter zur Zahlung`: unclear whether the click or the payment binds.
- Essential properties missing next to the button (§ 312j Abs. 2).
- One combined withdrawal notice for goods, digital content and services, linked at the page foot.

Finality and any checkout change are unverified. The order concerns trading seminars but the reasoning is general. Digistore24 is the defendant, but the seller depends on its fix and may not alter order forms (vendor § 6 Nr. 1). **[LAWYER]** Other providers: wording not verified; a test order is needed.

### F3. § 312k and withdrawal

- **Digistore24.** Button on order confirmation pages since July 2022 for private buyers, per [help](https://help.digistore24.com/hc/en-us/articles/23637257040145-Cancelling-subscriptions-legal-requirements-for-private-customers) (snippet). IPN gives `rebilling_stop_url`; [member-area guide](https://help.digistore24.com/hc/en-us/articles/24292970675729-Set-up-cancel-button-for-member-areas) (snippet).
- **Seller's site.** [LG Hildesheim, 3 O 109/23](https://www.vzbv.de/urteile/kuendigungsbutton-auch-bei-verkauf-von-online-abos-auf-webseiten-dritter): a subscription offered through a third party's site needs the button on that site; Digistore24 could not disclaim it. Not final when reported (OLG Celle 13 U 7/24; outcome unverified). So an own button in the app is the safe plan, using `rebilling_stop_url`. **[LAWYER]**
- **CopeCart** § 13.2 puts the button on the vendor (citing § 312g, sic). [Help](https://help-eu.copecart.com/en/articles/9071349-how-to-cancel-your-subscription): effective only after an email link is confirmed, a weak spot for § 312k. **[LAWYER]**
- **Withdrawal.** Digistore24 § 7 has the service rule with pro-rata value, the correct fit for a hosted service (§ 356 Abs. 4, § 357a), though the court faulted its presentation. ablefy, CopeCart and Cleverbridge use digital-content waivers, the same mismatch as Paddle. **[LAWYER]** The § 356a button (`Vertrag widerrufen`) is present at Digistore24 and ablefy per terms; Cleverbridge's terms predate it.
- **Refunds.** Provider refunds the buyer; the seller's share is reversed or offset everywhere. Return of the provider's fee on refund is not stated; Digistore24 lists a refund fee of €0.60 to €1 ([features page](https://www.digistore24.com/en-de/features/)). Vendors bear refunds by offset at [affilicon](https://www.affilicon.net/agb/) (§ 9(3)).

### F4. Fees

- **Digistore24.** [Features page](https://www.digistore24.com/en-de/features/): 7.9% + €1 up to €400, no monthly fee. [Pricing page](https://www.digistore24.com/pricing/) markets "starting at 2.9% + $1"; that rate likely applies to the part above €400 or to bank transfer, not confirmed. Ask.
- **ablefy.** [Pricing](https://ablefy.io/en/pricing/): Sell €27/month; 2.7% + €0.50, 0.4% invoicing, reseller 2.5% + €1. Page is inconsistent on plan prices.
- **CopeCart.** Vendor terms 5.5: 4.9% + €1, 6.9% + €1 from 1 Jan 2027; cards 6.9% + €1 from 1 Nov 2026.
- **affilicon.** [Merchant page](https://www.affilicon.net/haendlersupport-2/): 7% + €1.
- **Cleverbridge.** [Quote only](https://grow.cleverbridge.com/pricing). [Own blog](https://grow.cleverbridge.com/blog/top-merchant-of-record-providers-2026): enterprise and B2B; Paddle better for early-stage B2C SMB.

### F5. SaaS fit and checkout

- **App-side trial then checkout works with all**: link the Customer to a hosted order form and match the webhook. Passing an own account id through checkout is unverified everywhere. Provider-side trials not needed.
- **Digistore24.** [SaaS product type](https://help.digistore24.com/hc/en-us/articles/23347486723985-Product-types-at-Digistore24), [software setup](https://help.digistore24.com/hc/en-us/articles/23635480376849-Set-up-a-software-product) (snippets). [IPN events](https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events), [IPN PDF, 2018](https://www.digistore24.com/download/ipn/examples/ipn/digistore_ipn.pdf): `on_rebill_cancelled`, `on_payment_missed`, `last_paid_day`, `api_mode`. [Test connection](https://help.digistore24.com/hc/en-us/articles/23714450053137-Test-IPN-connection). Retry schedule and buyer payment-method change unverified; "Manage Orders" portal handles invoices. Upsells and order bumps are optional per the features page.
- **Reputation.** Affiliate marketplace and info-product image. [Law-firm "Abofalle" page](https://www.advocado.de/ratgeber/vertragsrecht/abofalle/digistore24-abo-falle.html); [own blog on unrecognised debits](https://www.digistore24.com/de/blog/abbuchung-von-digistore24-das-steckt-dahinter/) shows the seller's name is not what the buyer sees on the statement. Expect support questions. Trustpilot 4.5 (snippet).
- **ablefy.** Coaches and creators focus ([comparison](https://ablefy.io/en/vergleiche/digistore24/), own marketing). [Dunning for subscriptions](https://growth-academy.ablefy.io/news-und-updates/post/mahnwesen-inkasso-jetzt-auch-fur-abos-und-limittierte-abos-2aL33wJD6Mm5WqM) costs 10% of collected amount. [Minimum term](https://growth-academy.ablefy.io/news-und-updates/post/neu-mindestlaufzeit-fur-limitierte-abos-0XoG8N3mwN531io) exists; renewal after it undescribed.
- **CopeCart.** [IPN overview](http://help-eu.copecart.com/en/articles/9070889-ipn-important-information-at-a-glance); [PDF reference linked here](https://intercom.help/copehelp/en/articles/6956162-ipn-documentations) not read.
- **affilicon.** [ITNS](https://www.affilicon.net/2021/08/02/itns-instant-transaction-notification-service/): signing optional, retry undocumented. [Subscriptions](https://www.affilicon.net/2021/08/02/abonnements/): no trial or dunning described; API by request. Site still mentions MOSS and the ODR platform: stale.
- **Cleverbridge.** [Docs](https://docs.cleverbridge.com/docs/about-cleverbridge/) not read in depth, since pricing access decides first.

### F6. Tax and booking

- All handle EU VAT to the buyer and issue the buyer invoice (Digistore24 § 3 Abs. 4; ablefy invoices in reseller's name, [snippet](https://support.ablefy.io/seller/s/article/SteuerberechnungAuszahlungimResellerModell64a7f18e02ed9?language=de)).
- **German reseller differs from Paddle.** The seller's sale to Digistore24 GmbH looks like a domestic supply: 19% on the payout invoice or Gutschrift, filed in the ordinary return. Vendor § 7 Nr. 3, Nr. 17 point this way. Reverse charge as with Paddle would not apply. Cash effect neutral or not, booking per payout remains. **[TAX]** Same question for ablefy (monthly Gutschrift), CopeCart, affilicon, Cleverbridge.

### F7. Risk

- Digistore24 can reject at discretion and remove a product without reasons (vendor § 3 Nr. 2 c, d). Support replies by next business day are a vendor duty (§ 3 Nr. 2 g). Price increases need notice 3 months before period end (§ 3 Nr. 2 f). Art. 246a product information is on the vendor (§ 3 Nr. 2).
- affilicon's first-sale reserve of 100% and three-customer payout condition slow a start.
- CopeCart: KYC within one week; either side can end registration anytime.
- Moving subscriptions away from any provider means re-entry of payment by buyers, as with Paddle. Not verified per provider.
- [Digital River's collapse](https://freemius.com/blog/digital-river-mycommerce-shutdown-guide/) (MyCommerce, share-it; stopped January 2025, secondary source) shows MoR insolvency risk to held payouts.

### F8. Seller work left

Every candidate:

- Own cancel entry in the app; own withdrawal link; service contract and privacy texts adapted to the two-contract set-up.
- Webhook integration; app-side trial state and reminder mails.
- Product review and Art. 246a product text; first-line support.
- Bookkeeping of payouts; `GLOSSARY.md` change (#36).

Extra against Paddle: test order to read real button and withdrawal text; lawyer on button and contract fit; handling of reserves; reconciling thinner lifecycle events; possibly VAT on payouts. Saved against Paddle: maybe the § 309 Nr. 9 question (Digistore24, affilicon); SEPA for buyers.

## Dropped

- **Not MoRs, terms checked:** [Tentary](https://tentary.com/en/) ("not a merchant of record"); [CopeCart Pro Ltd](https://copecart.com/pro/terms_vendors_and_affiliate/) (Dublin, service provider only); ablefy normal-seller mode.
- **Plain PSPs, general knowledge, terms not fully checked:** Mollie (NL), Unzer, Payone, Novalnet, secupay, Computop, Adyen, Klarna. The merchant stays the seller.
- **Billing software, not verified:** Billwerk, FastBill, Monsum. Not sellers.
- **Other:** MyCommerce/share-it gone; [IDEAL GROUP](https://www.ideal-group.de/en/services/merchant-of-record/) physical e-commerce; Payhip UK, not German law (not verified). Steady, Alfima not verified.

## Open questions

1. Digistore24: which entity sells to DE and EU consumers? Was the checkout changed after 11 O 5/25, and is that judgment final?
2. Digistore24, affilicon: after a yearly first term, what is billed, and is prepaid money refunded on monthly cancellation? **[LAWYER]**
3. Digistore24: is 7.9% + €1 the rate for a €5 subscription, on gross or net?
4. ablefy, CopeCart, affilicon: actual German button label; ablefy: SaaS accepted?
5. Can a separate Operator service contract coexist with "no contractual relationship" at Digistore24? **[LAWYER]**
6. VAT treatment of payouts from German resellers. **[TAX]**
7. Would Paddle's "bespoke pricing" under $10 change the €5 comparison? And can Cleverbridge quote at this size at all?
