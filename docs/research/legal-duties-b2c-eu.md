# Legal duties for selling a B2C Subscription in the EU

Research for issue #34 (map #32; feeds #38). As of 2026-11-07. Not legal advice. Items marked **[LAWYER]** need professional review.

Seller: German Einzelunternehmer, not a Kleinunternehmer. Product: hosted family service, EU, German and English. Model: trial without payment method, then Subscription, monthly and yearly.

## Gist

- The service is most likely a **digitale Dienstleistung** (§ 327 Abs. 2 BGB), so the withdrawal right does not vanish when use starts. It ends only on full performance. With the customer's express request, a withdrawal inside 14 days costs a pro-rata Wertersatz, not the whole price.
- Three separate buttons are needed: order (`zahlungspflichtig bestellen`), cancel (`Verträge hier kündigen`), withdraw (`Vertrag widerrufen`, in force since 19 June 2026).
- **Yearly plan trap:** a clause renewing for another fixed year is invalid in German AGB. After the first year the contract may only continue indefinitely, cancellable at any time with at most one month's notice.
- **Trial without payment method fits well:** making the paid contract a new active step gives one clean order flow and one withdrawal period. No silent conversion.
- **Merchant of Record** (checked: Paddle only) takes over sale, VAT, invoices, payment, refunds and the checkout-side withdrawal. Impressum, privacy, product conformity, change notices, accessibility and the user-facing terms stay with the seller.
- **AVV:** none with the Customer if the use is household use and the Operator is controller (to be confirmed). AVVs are needed with hosting, LLM, OCR and mail vendors. A Paddle-type MoR is an independent controller, not a processor.

## Findings

### F1. Classification
§ 327 Abs. 2 BGB defines digital services as services enabling creation, processing, storage of or access to data, or sharing of data uploaded by users ([§ 327](https://www.gesetze-im-internet.de/bgb/__327.html)). A shared family agenda matches. Consequences: §§ 327 ff. apply; withdrawal follows the service rule (§ 356 Abs. 5), not the digital-content rule (§ 356 Abs. 6). **[LAWYER]** confirm.

### F2. Widerruf
- 14 days from contract conclusion ([§ 355 Abs. 2](https://www.gesetze-im-internet.de/bgb/__355.html)).
- Period does not start before proper instruction; outer limit 12 months and 14 days ([§ 356 Abs. 3, 4](https://www.gesetze-im-internet.de/bgb/__356.html)). A faulty notice therefore gives a yearly customer about a full year to withdraw.
- Paid service: right ends only on **full performance**, if the consumer expressly agreed to an early start and confirmed knowledge of the loss (§ 356 Abs. 5 Nr. 2). For a running Subscription this is in practice not reached inside 14 days.
- The digital-content shortcut (right lost at start of performance, § 356 Abs. 6) should not be relied on.
- Wertersatz for services already provided needs an express request to start early plus proper information; it is based on the agreed total price ([§ 357a Abs. 2](https://www.gesetze-im-internet.de/bgb/__357a.html)). Without these, the customer owes nothing.
- **Widerrufsbutton:** for distance contracts concluded through an online interface. Label `Vertrag widerrufen` or equivalent; continuously available during the period, prominent, easy to reach; captures name, contract, channel for acknowledgement; second step `Widerruf bestätigen`; acknowledgement with content, date and time on a durable medium, without delay ([§ 356a](https://www.gesetze-im-internet.de/bgb/__356a.html); [Dir. (EU) 2023/2673, new Art. 11a, applies from 19 June 2026](https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng)).
- **Not verified:** current wording of the Muster-Widerrufsbelehrung (Anlage 1 EGBGB) and the BGBl citation of the amending act. Secondary sources disagree on the citation. Take the model text from the official version when drafting.

### F3. Kündigungsbutton
For websites allowing electronic conclusion of paid continuing contracts ([§ 312k](https://www.gesetze-im-internet.de/bgb/__312k.html)):
- Button `Verträge hier kündigen` leads directly to a confirmation page, then `jetzt kündigen`. All permanently available and easy to reach.
- Page asks for: type of cancellation (reason if extraordinary), identification of consumer and contract, desired end date, address for the confirmation.
- Consumer can save the declaration with date and time. Trader confirms at once in text form: content, receipt time, end date.
- No end date given: earliest possible date.
- Missing or faulty button: consumer may cancel at any time without notice (Abs. 6).
- **[LAWYER]** The text does not address login. Keeping it reachable without sign-in is the safe design, and matters here since a closed or locked Customer may have no working sign-in.

### F4. Order flow and pre-contract information
- Order button only `zahlungspflichtig bestellen` or equally clear wording; **otherwise no contract** ([§ 312j Abs. 3, 4](https://www.gesetze-im-internet.de/bgb/__312j.html)).
- Immediately before ordering, highlighted: core features, total price, term, cancellation terms, minimum duration (§ 312j Abs. 2).
- At the latest at start of ordering: delivery restrictions, accepted payment methods (§ 312j Abs. 1).
- [Art. 246a § 1 EGBGB](https://www.gesetze-im-internet.de/bgbeg/art_246a__1.html) list includes identity, address, phone **and** e-mail, total price with taxes, for subscriptions cost per billing period and **monthly total**, complaint handling, note on statutory warranty for digital services (Nr. 11b), term and cancellation terms. So the yearly tariff also shows a monthly amount.
- Gross prices to consumers ([§ 3 PAngV](https://www.gesetze-im-internet.de/pangv_2022/__3.html)).
- E-commerce: error correction, order acknowledgement, terms retrievable and storable ([§ 312i](https://www.gesetze-im-internet.de/bgb/__312i.html)).
- Contract confirmation on a durable medium before service starts ([§ 312f Abs. 2](https://www.gesetze-im-internet.de/bgb/__312f.html)). A mail with the terms and withdrawal notice covers this.

### F5. Impressum
[§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html): name and **ladungsfähige** address of establishment, e-mail plus a fast direct contact route, USt-IdNr if held; register only if registered. Easily recognisable, directly reachable, permanently available. The Einzelunternehmer's full name is required, so a home address becomes public unless a business address exists.

Consumer dispute notice: [§ 36 VSBG](https://www.gesetze-im-internet.de/vsbg/__36.html) statement on willingness to join arbitration; not required with ten or fewer employees on 31 December of the previous year. The [EU ODR platform is gone](https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng) (Regulation repealed 20 July 2025); do not link it.

### F6. AGB
Not mandatory as such, but needed in practice.
- **Term:** at most two years; tacit renewal only into an indefinite contract cancellable any time with at most one month's notice; notice before the first term ends at most one month ([§ 309 Nr. 9](https://www.gesetze-im-internet.de/bgb/__309.html)).
  - Monthly: unproblematic.
  - Yearly: after year one, the contract becomes indefinite, with a refund of the unused part of any prepaid period; or it ends without renewal and needs a new order. **This shapes the billing design and must be checked against the provider's renewal behaviour.**
- **Changes to the product:** only with a contract clause and valid reason, no extra cost, clear information. Significant impairment: notice on a durable medium, and a free termination right for 30 days ([§ 327r](https://www.gesetze-im-internet.de/bgb/__327r.html)).
- **Updates**, including security updates, owed for the whole provision period ([§ 327f](https://www.gesetze-im-internet.de/bgb/__327f.html)).
- **Applicable law:** choosing German law does not remove the mandatory consumer protection of the customer's home country where the seller directs activities there ([Rome I Art. 6](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32008R0593)). Selling EU-wide means 27 consumer laws in the background, largely harmonised for withdrawal, less so for AGB control. **[LAWYER]** Price change clause and the 7-day grace period after closing also need review.

### F7. Trial to paid
- CJEU C-565/22 (Sofatutor): a contract with a free start that becomes paid gives **one** withdrawal right, if the consumer was told clearly at conclusion that payment follows. Otherwise a new right may arise after the trial ([judgment, paras. 47-50](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62022CJ0565)).
- Planned model has no payment method in the trial, so automatic conversion is impractical anyway. Recommended reading: trial ends, service locks, paid contract arises only by the order flow of F4. Withdrawal then runs from that order, and the Sofatutor question does not arise.
- § 312k covers paid contracts, so no cancel button is required for the trial itself; offering account closing is still needed for privacy reasons. § 312j Abs. 3 applies at the paid step.
- Never word it as "free" where a charge can follow silently.
- **[LAWYER]** Whether the free trial is itself a contract with withdrawal right, as data can count as consideration ([§ 327 Abs. 3](https://www.gesetze-im-internet.de/bgb/__327.html)), and how the invitation-only pilot is treated. Pilot without payment still needs Impressum, privacy notice and terms of use.

### F8. Privacy notice and cookies
- Art. 13 information for data collected from the data subject; **Art. 14** for data not obtained from them. The latter is the normal case here: the Customer enters spouse and children ([GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)). **[LAWYER]** how to reach them in practice; a notice passed on through the Customer is the obvious route.
- Clear and plain language, particularly if addressed to a child (Art. 12(1)).
- Device access needs consent unless strictly necessary for the requested service ([§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html)). No analytics cookies on the landing page means no banner.
- No DPO under the 20-person threshold ([§ 38 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__38.html)), but the same section requires one if a DPIA is needed. Check this together with F9.

### F9. Family and children's data
- Household exemption covers the natural person only; recital 18 keeps **providers of the means** under the GDPR. So the Operator is fully bound, the Customer probably is not.
- Art. 8: for consent-based offers of information society services directly to a child, under 16 needs parental consent (Member States may go down to 13), with reasonable verification efforts. Relevant only if children get own access and consent is the legal basis. **[LAWYER]** confirm Germany's age and each target country's age, if child logins are planned.
- Art. 9: agenda entries can reveal health or religion (doctor appointments, church). Free text and OCR make this hard to exclude. **[LAWYER]** legal basis, and whether a DPIA (Art. 35) is needed given children's data, Art. 9 data and LLM processing. Treat as likely until reviewed.
- LLM and OCR vendors: check training use, retention and third-country transfer (GDPR Chapter V).

### F10. AVV
- **Operator and Customer:** a household Customer is not a controller, so no AVV. If the Operator decides purposes and means of the hosted service, it is controller. **[LAWYER]** Confirm role, particularly if a Customer uses it non-privately. Consumer-only sale in the AGB narrows this.
- **Operator and vendors:** Art. 28 contracts with hosting, LLM, OCR, mail and any support tooling. Records of processing (Art. 30) in any case.
- **Operator and MoR:** Paddle's terms make each party an "independent Controller" ([MSA 14.2](https://www.paddle.com/legal/terms)), so no AVV; name it as a recipient in the privacy notice.

GDPR Arts. 26, 28, 30, 35 and Chapter V are cited from the Regulation without being re-read in this session.

### F11. Merchant of Record
Checked Paddle only ([buyer terms](https://www.paddle.com/legal/invoiced-consumer-terms), [MSA](https://www.paddle.com/legal/terms), [refund policy](https://www.paddle.com/legal/refund-policy)). Terms change; re-check for the provider chosen.

| Duty | Paddle | Stays with seller |
|---|---|---|
| Contract of sale | Reseller, contract party (Paddle.com Market Ltd outside US/Canada) | Must show Paddle as reseller (9.2) |
| VAT, OSS, invoices to buyers | Yes (4.1); seller may not invoice buyers (10.1) | Own income tax and bookkeeping; own VAT on payouts **[tax adviser]** |
| Checkout, payment, order step | Yes | Accurate product information (9.5) |
| Withdrawal, refunds | Refund policy; online withdrawal button in portal (3.1.1) | Refund cost (10.4) |
| Cancellation | Buyer portal, end of billing period | Must provide a cancellation link where law requires (11.1) |
| First-tier billing support | Yes (6.1) | Technical support (6.4) |
| Product conformity, updates, changes | No, warranties excluded | Yes (11.1) |
| Compliance where sold | No | Yes (9.2) |
| Impressum, privacy for the service, cookies, accessibility, AI | No | Yes |

Review points **[LAWYER]**:
- Paddle's terms say the right is lost when use starts after consent. That is the digital-content rule; F2 suggests the service rule. Its policy gives a new 14 days after a free trial. Check what happens on the two-contract structure (Paddle sale, plus the seller's terms of use).
- § 312k on the seller's own site: is a link to the portal sufficient?
- Yearly renewal in the MoR's billing vs. § 309 Nr. 9. Paddle buyer terms: cancellation with effect at the end of the current period.
- Does a seller remain "Unternehmer" toward the consumer for §§ 327 ff. when an MoR resells? Consumer law gives claims against the contract partner, and the seller's own direct terms may create a second relation.

Without an MoR: B2C e-services are taxed where the consumer lives, once cross-border sales exceed EUR 10,000 per year ([§ 3a Abs. 5 UStG](https://www.gesetze-im-internet.de/ustg_1980/__3a.html); [BZSt OSS](https://online.portal.bzst.de/SharedDocs/Leistungsbeschreibung/EN/besteuerungsverfahren_one-stop-shop_fuer_EU_unternehmen.html); [Commission OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en)), declared through the OSS.

### F12. Adjacent duties the ticket did not list
- **Accessibility:** BFSG covers e-commerce services to consumers after 28 June 2025 ([§ 1 Abs. 3](https://www.gesetze-im-internet.de/bfsg/__1.html)). Service microenterprises (fewer than ten people, at most EUR 2m turnover or balance sheet) are exempt ([§ 2](https://www.gesetze-im-internet.de/bfsg/__2.html), [§ 3 Abs. 3](https://www.gesetze-im-internet.de/bfsg/__3.html)). Seller is exempt for now.
- **Data Act switching:** Chapter VI addresses "data processing services" including SaaS; "customer" is any natural or legal person; contract must cover switching, 30-day transition, at most two months' notice (Art. 25); applies since 12 September 2025; switching charges end 12 January 2027; no SME carve-out found in Chapter VI ([Regulation 2023/2854](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2854); [Commission](https://digital-strategy.ec.europa.eu/en/factpages/data-act-explained)). **[LAWYER]** Does a family agenda fall within it? If so, data export becomes a contract duty. Digital Omnibus changes not checked.
- **AI Act Art. 50:** applies from 2 August 2026; a product integrating an LLM under its own name may be a provider: disclose AI interaction unless obvious, mark generated output ([Commission FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)). **[LAWYER]** role and any omnibus grace period; final status not confirmed from an official source.

## Review list for a lawyer
1. Digital service vs. digital content; withdrawal wording and Wertersatz with pro-rata calculation.
2. Yearly tariff renewal under § 309 Nr. 9, including refund of prepaid time.
3. Trial as a contract; pilot terms.
4. Controller role, household exemption, Art. 14 route for family members, Art. 9 basis, DPIA, children's access.
5. MoR contract structure, the withdrawal mismatch, § 312k link, seller's direct liability.
6. Data Act and AI Act applicability.
7. Current Muster-Widerrufsbelehrung; AGB enforceability in other Member States.
8. Tax adviser: MoR payouts, bookkeeping.

## Limits of this research
Statutes read from gesetze-im-internet.de and EUR-Lex on 2026-11-07. Case law limited to C-565/22; no German court decisions or authority guidance reviewed on §§ 312k, 356a. MoR comparison covers Paddle only.
