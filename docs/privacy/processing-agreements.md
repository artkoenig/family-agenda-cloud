# Processing agreements

The index of the Operator's agreements under Art. 28 GDPR, and of the parties that have none. It belongs to the
[record of processing activities](records-of-processing.md); the decision behind it is
[#182](https://github.com/artkoenig/family-agenda-cloud/issues/182).

This file is the frame. The Operator fills in "Checked on" when the agreement was read in the version named and found
in force for the Operator's contract ([#237](https://github.com/artkoenig/family-agenda-cloud/issues/237)). The
downloaded PDFs are kept outside the repository (#237).

## Agreements

| Party | Agreement | Version and date | How concluded | Source | Sub-processor list | Checked on |
| --- | --- | --- | --- | --- | --- | --- |
| IONOS Cloud GmbH, Berlin (Cube, Object Storage, AI Model Hub) | "Vereinbarung zur Auftragsverarbeitung für IONOS Cloud"; for the AI Model Hub also the "Nutzungsbedingungen für KI-Dienste" | AVV v7.4, Stand 06/2023 | Part of the terms of contract 39683376; no signature | <https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/enterprise-datenschutzpaket/>, <https://cloud.ionos.de/terms-gtc/ki-dienste/> | Stand 11/2026: IONOS SE, IONOS Cloud Romania S.R.L., IONOS Cloud Solutions Spain S.L.U., Arsys Internet S.L.U.; all in the EU | |
| IONOS SE, Montabaur (mailbox `support@family-agenda.cloud`, Mail Basic) | "Vereinbarung zur Auftragsverarbeitung" (AVV) | v1.4, Stand 10/2026 | Part of IONOS's AGB since 2022-07-19; no signature | <https://www.ionos.de/terms-gtc/avv/> | Annex 2 v4.5, Stand 04/2026, read 2026-11-25. For Mail Basic: 1&1 Mail & Media GmbH, Montabaur (sending and receiving mail, managing addresses) and Open-Xchange GmbH, Olpe (webmailer); both in Germany. The other entries are for products not in use | |
| Stripe Payments Europe, Limited, Dublin (payment processing) | Data Processing Agreement with the Data Transfers Addendum | Last updated 2026-09-28 | Part of the Stripe Services Agreement (§ 4.1); no signature | <https://stripe.com/legal/dpa>, <https://stripe.com/legal/dta> | <https://stripe.com/legal/service-providers>, last updated 2026-09-27, read 2026-11-25. Sub-processors and Stripe affiliates in the US and in other third countries (among them India, the UK, Canada, Japan, Malaysia, the Philippines, Colombia, Australia); transfers run under the DPA and its Data Transfers Addendum. Stripe gives 30 days' notice of changes by mail to those who subscribe | |

IONOS SE's agreement links its measures as "DE_AVV_TOM_v1.0" (version 1.0) and says they describe and are not part
of the agreement. Its Annex 2 names the "Mail Basic" product by name.

Stripe is a processor only for payment processing. For fraud prevention and identity checks it is an independent
controller, and the agreement does not cover that part.

## Parties with no agreement

| Party | Why none |
| --- | --- |
| Google Ireland Limited (sign-in with Google) | Independent controller. Google signs the person in under its own terms and passes on name, email address, the address of the profile picture and an identifier; it processes nothing on the Operator's behalf. |
| Google Ireland Limited (Gmail, the Operator's mailbox for the alert mails) | A consumer Gmail mailbox runs under Google's own terms; Google offers a processing agreement only with Google Workspace. Recorded as independent controller, to be confirmed by the Operator (record, open items). |
| The Sources' hosts (a Family's mail provider, a calendar's host, the school and Untis) | Not engaged by the Operator. The service fetches from them, on the Family's behalf, what the Family released. |
| Let's Encrypt | Issues the certificates. Sees the Cube's IP address and the domain names, no personal data of users. |
| GitHub (ghcr.io, tessdata) | The Cube pulls images and files from it. Sees the Cube's IP address only. |
| Docker Hub | As GitHub: the Cube pulls images. |
| healthchecks.io | The heartbeat ping carries no personal data. |
| Scaleway (Transactional Email) | Not in use ([#192](https://github.com/artkoenig/family-agenda-cloud/issues/192)). Before a switch: conclude its DPA, update the privacy policy and the record, add the row above. |

## When this file changes

- A processor publishes a new version of its agreement or of its sub-processor list: note version and date, and
  check again.
- A new processor is engaged: agreement first, then the row here, the record and the privacy policy, before any
  personal data go to it.
