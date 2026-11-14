# #66 Research EU transactional mail senders

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-13T10:13:21Z
- Closed: 2026-11-13T10:28:43Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/66

## Question

Which EU senders fit the hosted service's transactional mail (sign-in codes from Authentik, confirmations, Operator alerts), compared with a self-run MTA on the Cube? Per option: SMTP for Authentik, HTTP API for `api`, processing agreement and location, deliverability setup (SPF, DKIM, DMARC for `family-agenda.cloud`, DNS at IONOS SE), price at 100 and 1000 Families, and what the sender sees (no Family content). IONOS has no sender per [Research IONOS platform services around the workloads](https://github.com/artkoenig/family-agenda-cloud/issues/50). Findings in `docs/research/`.

---

**Comment by artkoenig, 2026-11-13T10:28:18Z**

Research done. Options:

- **EU-only, no US parent:** Scaleway TEM (FR; ~€0.55 at 2.5k/mo, ~€5 at 20k; 36 h content retention; 10k/mo default cap, raise via support) and Lettermint (NL; €10 / ~€25; 28 d retention, shorter on Pro).
- **EU, larger, US sub-processors:** Brevo (FR/DE contract; free 300/day; long default log retention) and Mailjet (FR, Sinch; free 6k/mo; ≤€37 at 20k).
- **US parent:** Mailgun EU region (message data in DE, account data global; ~€31 at 20k); Postmark (control) processes in the US.
- **German:** rapidmail, SMTP only, from €59/mo.
- **IONOS Mail (Mail Basic/Business):** SMTP works and the AVV is part of the AGB. It is capped at 50–500 mails per hour by mailbox age and has no API or bounce webhooks. Whether the terms allow this use is unverified. Fallback only.
- **Self-run MTA on the Cube:** port 25 opens on request (FQDN + PTR + SPF), and Gmail's sender rules must be met. All deliverability and blocklist work stays with the Operator.

Findings: docs/research/eu-transactional-mail.md

---

**Comment by artkoenig, 2026-11-13T10:28:42Z**

Resolved. Findings in `docs/research/eu-transactional-mail.md`; unverified points are listed there and carry into [Decide the transactional mail sender](https://github.com/artkoenig/family-agenda-cloud/issues/67).
