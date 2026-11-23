# A ladungsfähige Anschrift without the home address

Research for issue #185 (map #179, feeds #194). Checked 2026-11-23. Comparison only, no decision. Not legal or tax advice. Items marked **[unverified]** come from secondary sources or snippets and were not checked against the primary text.

## Situation

German Einzelunternehmer runs a hosted B2C web service and bills through Stripe. `legal-duties-b2c-eu.md` F5: § 5 DDG requires the full name and an address, so the home address becomes public unless there is a business address. Question: which non-home addresses work for the Impressum, and can the same address be used for Stripe and the Gewerbe?

## Gist

- § 5 DDG says "Anschrift, unter der sie niedergelassen sind". The word "ladungsfähig" comes from case law and commentary, not the statute.
- Postfach: not enough (BGH I ZR 306/99 **[unverified]**, LG Traunstein **[unverified]**).
- A pure mail-forwarding address is not ladungsfähig for a natural person in civil procedure. BGH V ZR 210/22 decided this for a Klageschrift, not for the Impressum, but courts and commentators carry it over.
- What works per BGH: an address where the person is actually reachable (Wohnung or a Geschäftsraum they actually use), or one where a **Zustellungsbevollmächtigter** (§ 171 ZPO) has a Vollmacht to receive service. Mere forwarding is not enough.
- Lower courts are split on virtual addresses. OLG Frankfurt 6 U 150/19 accepted a Briefkasten address. OLG München 29 U 8/17 rejected one where service failed. Both **[unverified]**, secondary sources only.
- Gewerbe: § 14 GewO notification needs the betriebliche Anschrift, which may be published. BMWK says Gewerbeamt and Finanzamt need the real place of business.
- Stripe: KYC needs the home address (non-public, proof may be requested). Invoices and receipts can show a separate public support address.
- Prices from providers' own pages: Postflex 3,99 to 50,40 €/Monat netto (Vollmacht for förmliche Zustellungen). firma.de 199 to 249 €/Monat netto. clevver and Regus prices not obtained.

## Options

| Option | Impressum (§ 5 DDG) | Case law signal | Gewerbe / Finanzamt | Stripe public address | Cost |
|---|---|---|---|---|---|
| Home address | Yes | Standard | Yes | Yes | 0 |
| Postfach | No | BGH I ZR 306/99, LG Traunstein **[unverified]** | No | Not checked for DE | low |
| c/o (e.g. a lawyer or tax adviser) | Contested; OK if post actually reaches you there and the c/o doesn't conceal delivery (eRecht24) | OLG Hamm 27 W 51/15 accepted it for a GmbH i.L. **[unverified]** | Real site still required | Likely possible as support address | varies |
| Virtual office or address service, forwarding only | Risky for a natural person | BGH V ZR 210/22 Leitsatz (ZPO); OLG München 29 U 8/17 | Real site still required | Support address yes | from 3,99 €/Monat |
| Address service with Zustellungsvollmacht (§ 171 ZPO) | Likely yes per BGH Rn. 12, 14 logic; not decided for natural persons in the Impressum | BGH left this open for natural persons (Rn. 12) | Real site still required | Support address yes | Postflex from 3,99 €/Monat |
| Coworking desk actually used | Likely yes as a Geschäftsraum (BGH Rn. 10, 13) | No specific decision found | Possible if it is the real Betriebsstätte | Yes | not researched |

## Findings

### F1 Statute

- [§ 5 Abs. 1 Nr. 1 DDG](https://www.gesetze-im-internet.de/ddg/__5.html): "den Namen und die Anschrift, unter der sie niedergelassen sind". Nr. 2: details for fast electronic contact, including an e-mail address.
- "Ladungsfähig" does not appear in the statute. It is a ZPO concept (§ 253 Abs. 2 Nr. 1, § 130 Nr. 1) that courts and commentators read into the Impressum duty.

### F2 Case law

- **BGH V ZR 210/22, 7.7.2023** ([PDF](https://www.bundesgerichtshof.de/SharedDocs/Entscheidungen/DE/Zivilsenate/V_ZS/2022/V_ZR_210-22.pdf?__blob=publicationFile&v=1), read in full). Context: the plaintiff's address in a Klageschrift.
  - Leitsatz: the address of a Postdienstleister that only forwards mail is not a ladungsfähige Anschrift.
  - Rn. 9: the address must be one where the addressee is actually reachable and handover in person is seriously possible (§ 177 ZPO).
  - Rn. 12: an address where service is effective can suffice. Accepted for juristische Personen (I ZR 257/16; VIII ZR 262/20). Left open for natural persons.
  - Rn. 13: Ersatzzustellung (§§ 178-181 ZPO) needs a Wohnung or Geschäftsraum that is actually used.
  - Rn. 14: service on a representative under § 171 ZPO needs a Vollmacht covering zuzustellende Schriftstücke. Forwarding, a Postannahmestelle or an Empfangsbote is not enough (II ZB 25/20).
  - Rn. 6: secrecy interests can justify withholding the address in the ZPO context.
- **BGH I ZR 306/99, 11.4.2002**: Anschrift means a Hausanschrift; a Postfach is not enough. **[unverified]**, snippet only.
- **OLG Frankfurt 6 U 150/19, 18.2.2021**: a Briefkasten address of a US LLC satisfied § 5 TMG. Reasoning: no physical business premises required; the duty serves contact. **[unverified]**, via [it-recht-kanzlei](https://www.it-recht-kanzlei.de/olg-frankfurt-briefkastenadresse-impressum.html).
- **OLG München 29 U 8/17, 19.10.2017 (MMR 2018, 243)**: a virtual address was insufficient because service there failed. it-recht-kanzlei says the case is often misread as a general ban. **[unverified]**.
- **LG Traunstein 1 HK O 168/16**: Postfach not sufficient. Reported date 21.01.2016 doesn't fit the 2016 Aktenzeichen. **[unverified]**.
- **OLG Hamm 27 W 51/15, 7.5.2015**: c/o (a lawyer) accepted for a GmbH i.L. in the Handelsregister. **[unverified]**, via eRecht24.
- Anecdote: a commenter on it-recht-kanzlei reported that a gelber Brief (förmliche Zustellung) could not be delivered to a clevver address. Not evidence.

### F3 Gewerbe and Finanzamt

- § 14 GewO: notify the competent authority. Abs. 5: name, Geschäftsbezeichnung, betriebliche Anschrift and angezeigte Tätigkeit may be made allgemein zugänglich. The Gewerbe address can therefore become public.
- Existenzgründungsportal (BMWK, 2021): a business needs a tatsächlicher Geschäftssitz. Gewerbeamt and Finanzamt must be told the real location as well as the virtual address. Clarify with both authorities beforehand.
- gruenderplattform.de: a virtual office is not a classic Betriebsstätte; the tax treatment depends on the case. § 12 AO defines Betriebsstätte as a feste Geschäftseinrichtung (cited by secondary sources, not re-read).
- GewA 1 form fields: **[unverified]** (gesetze-im-internet Anlage URL returned 404).

### F4 Stripe

- The requirements for DE / individual / card_payments + transfers include `individual.address.line1/postal_code/city`, `business_profile.url` and `business_profile.support_phone` (Stripe docs requirements endpoint).
- [Acceptable verification documents](https://docs.stripe.com/acceptable-verification-documents): the address document must show a personal address matching the personal address in the settings, so KYC uses the home address.
- [Proof of home address](https://support.stripe.com/questions/documents-for-identity-and-home-address-verification): document dated within 6 months. The page does not explicitly reject a PO box or c/o for DE. The 2026 Europe update says representatives may be asked for proof of home address.
- "No PO Boxes / Private Mailboxes" applies to the US only ([source](https://support.stripe.com/questions/update-your-business-address)).
- [Invoicing customize](https://docs.stripe.com/invoicing/customize): invoices show the public business details (Dashboard > Settings > Public details). A support address can be set; without one, Stripe uses the business address.
- Net: the home address stays non-public at Stripe. The public address on invoices and receipts can be the same business address as in the Impressum.

### F5 Providers (prices from their own pages, checked 2026-11-23)

- **[Postflex](https://www.postflex.de/tarife-preise/)**, prices read from the page source:
  - LITE 3,99 €/Monat, SMART 14,99, PREMIUM 50,40.
  - Add-ons: AdressSchutz Flatrate 4,99 (extends LITE to billing address, letterheads and multiple projects), ImpressumsBriefe Profi 6,99, PaketPost Starter 3,99, LandingPage 2,99. BusinessBriefe Starter costs 12,90 in LITE and 8,90 in SMART, and is included in PREMIUM.
  - All prices are net plus MwSt, for businesses only, plus a setup fee that depends on tariff and term.
  - "Förmliche Zustellungen werden tarifunabhängig stets angenommen, geöffnet und digitalisiert."
  - The ladungsfähige-Anschrift page says the customer grants a Vollmacht to accept official post, citing BGH V ZR 210/22 and § 171 ZPO.
  - Whether Gewerbeanmeldung at the address is allowed: not stated. A Postflex legal opinion PDF (Feb 2026) exists but was not read.
- **[firma.de](https://www.firma.de/geschaeftsadresse-mieten/)**: 249 € netto/Monat, cancellable monthly, or 199 € netto/Monat on a 12-month term. 8 cities. Marketed for Handelsregister, Gewerbeamt, Finanzamt and Impressum. Scan service included.
- **[clevver](https://clevver.io)**: no setup fee, business address from a 3-month term, Impressum service listed. Prices are rendered by JS and were not obtained.
- **Regus**: "ab 79 €/Monat" **[unverified]**, secondary snippet only.
- Coworking: no specific provider researched.

## Unverified / open

- Full texts of OLG Frankfurt 6 U 150/19, OLG München 29 U 8/17, OLG Hamm 27 W 51/15, LG Traunstein and BGH I ZR 306/99 (rewis.io returned 403).
- No decision found that applies BGH V ZR 210/22 to a natural person's Impressum with a Zustellungsvollmacht address.
- GewA 1 fields, and whether each provider allows Gewerbeanmeldung at its address.
- clevver and Regus prices. The BMJ Impressum guide PDF was unreadable.
