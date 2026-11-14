# #34 Research legal duties for selling a B2C subscription in the EU

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-07T16:29:15Z
- Closed: 2026-11-07T16:34:03Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/34

## Question

What must a German Einzelunternehmer provide when selling a B2C Subscription in the EU? Cover Widerruf, Kündigungsbutton, Impressum, AGB, privacy notice, processing of family and children's data, AVV relevance, trial-to-paid rules, and which duties a Merchant of Record takes over. Not legal advice; flag points for review.

---

**Comment by artkoenig, 2026-11-07T16:34:02Z**

Resolved. Findings: `docs/research/legal-duties-b2c-eu.md` (untracked in repo; not legal advice, review list included).

Gist:
- Service is most likely a digitale Dienstleistung: withdrawal survives use and ends only on full performance; early start gives pro-rata Wertersatz.
- Three buttons: `zahlungspflichtig bestellen` (§ 312j; otherwise no contract), `Verträge hier kündigen` (§ 312k), `Vertrag widerrufen` (§ 356a, since 19 June 2026).
- Yearly tariff: renewal for another fixed year is invalid in AGB (§ 309 Nr. 9); after year one only indefinite, cancellable any time with max one month's notice.
- Trial: paid contract as a new active order step avoids the C-565/22 question.
- Children/family: Operator bound by GDPR despite the household exemption; Art. 14 info, Art. 9 data in entries, DPIA likely.
- AVV: none with household Customer (to confirm); needed with hosting, LLM, OCR, mail vendors; Paddle-type MoR is an independent controller.
- MoR (Paddle checked only) takes sale, VAT, invoices, payment, refunds, checkout-side withdrawal. Impressum, privacy, conformity, change notices, support stay with seller.
- Extra: Data Act switching and AI Act Art. 50 may apply; BFSG exempt as microenterprise.

Flagged for lawyer: classification, yearly renewal, trial, controller role, MoR withdrawal mismatch, Data/AI Act. Not verified: current Muster-Widerrufsbelehrung.
