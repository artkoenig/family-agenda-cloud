# #73 Decide order page

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T21:33:18Z
- Closed: 2026-11-14T12:37:41Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/73

## Question

Is the order step Stripe Checkout or an own page in `site` with Stripe's Payment Element, and what exactly does it show and record?

---

**Comment by artkoenig, 2026-11-14T12:37:40Z**

**Decision: order page**

**Technique**
- Own page in `site` under `/register`, Checkout Session with `ui_mode: elements`, `mode: subscription`, 14-day trial, `automatic_tax` (as found in #72).
- Payment methods come from the Stripe dashboard, not from our code: card, wallets and SEPA debit on, PayPal off.
- One gross price for the whole EU (`tax_behavior: inclusive`). No coupon field.
- Market is the EU only: the country dropdown lists the 27 Member States. Opening another country later is one more entry, once its tax duty is clear (first candidate Switzerland, not the UK).

**Layout, one page**
1. Tariff switch monthly/yearly, preselected from the landing page.
2. Name (one field, prefilled from the sign-in claim if present, required); mail address shown, not editable.
3. Country dropdown, prefilled. It gives Stripe Tax its location and the VAT evidence; no further address.
4. Payment Element.
5. Two required checkboxes, unticked.
6. Highlighted summary.
7. Order button; below it only the footer with the legal links.

Reduced header: logo, language, sign out.

**Trial rules**
- Verified mail address already used: the page shows the order without trial from the start, first charge today.
- Card or IBAN fingerprint already used: only known after the click (Checkout Sessions expose no fingerprint before confirm, and a session's trial cannot be changed). Check right after the order, cancel the Subscription at once (nothing charged, no provisioning) and show a page offering the order without trial. Wallets can bypass this; accepted.

**Errors and repeats**
- Declined or 3-D Secure aborted: stay on the page with Stripe's message, checkboxes stay ticked, no contract.
- Button locks after the click; one open session per registration, never a second Subscription.
- Already a Customer: redirect to `/account`.

**Recorded in the `site` DB**
- Terms version, withdrawal notice version, timestamp, both checkboxes, language, and a copy of the summary as shown (tariff, amount, date of first charge). No IP address.

**Wording** (no lawyer review; written to the maintainer's best knowledge, conservative, close to the statute)

Checkbox 1:
> Ich bin mindestens 18 Jahre alt, bestelle als Verbraucher und akzeptiere die [AGB]. Die [Widerrufsbelehrung] und die [Datenschutzerklärung] habe ich zur Kenntnis genommen.

Checkbox 2:
> Ich verlange ausdrücklich, dass Family Agenda sofort mit der Leistung beginnt, also vor Ablauf der Widerrufsfrist. Mir ist bekannt, dass ich bei einem Widerruf für die bis dahin erbrachte bezahlte Leistung anteilig Wertersatz schulde.

Summary (monthly, with trial):
> **Family Agenda, gehostet für eine Familie.** Monatstarif, **X,XX € pro Monat inkl. MwSt.**
> 2 Wochen kostenlos. **Erste Abbuchung am TT.MM.JJJJ: X,XX €**, danach monatlich.
> Läuft auf unbestimmte Zeit. Jederzeit kündbar zum Ende des Abrechnungszeitraums; bei Kündigung in der Testphase wird nichts abgebucht.

Yearly ends instead with: "…danach jährlich. Nach dem ersten Jahr jederzeit mit einer Frist von einem Monat kündbar, zu viel Gezahltes wird erstattet."

Button: **Zahlungspflichtig bestellen** / English: **Order with obligation to pay**. The English page is a translation; the German text governs.

**Consequences**
- [Decide transactional mails](https://github.com/artkoenig/family-agenda-cloud/issues/75): the confirmation mail must carry the full terms and withdrawal notice (durable medium).
- The landing page does not yet say that the offer is EU only.
- To verify when building: the fingerprint check after confirm, and SEPA mandate text shown by the Payment Element.

