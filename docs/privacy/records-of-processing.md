# Record of processing activities

The Operator's record as controller under Art. 30(1) GDPR for the hosted service Family Agenda Cloud. The exemption of
Art. 30(5) does not apply: the processing is not occasional, and it includes special categories of data
([#196](https://github.com/artkoenig/family-agenda-cloud/issues/196), item 3).

The record states what the privacy policy (`site/legal/datenschutz.de.md`) and the decisions behind it say. It decides
nothing. Where the two differ, the privacy policy is corrected or a decision issue is opened; the record is not
changed alone. A fact that neither the policy nor a decision gives is marked `OPEN:` and is the Operator's to fill in
([#237](https://github.com/artkoenig/family-agenda-cloud/issues/237)).

## Controller (Art. 30(1)(a))

- **Controller:** Artjom König, Family Agenda, Ludwigsweg 7, 53773 Hennef, Germany
- **Contact:** support@family-agenda.cloud
- **Joint controller:** none. The Operator is the sole controller, Family content included. A household Customer is
  outside the GDPR, so there is no processing agreement and no joint controllership with an Admin (#196, item 1).
- **Representative (Art. 27):** none; the controller is established in the EU.
- **Data protection officer:** none appointed. Why: the Schwellwertanalyse
  ([#239](https://github.com/artkoenig/family-agenda-cloud/issues/239), `docs/privacy/threshold-analysis.md`; decided in
  [#198](https://github.com/artkoenig/family-agenda-cloud/issues/198), item 1).

**Version:** 2026-11-25, written against the privacy policy of 25 November 2026.

| Date | Change |
| --- | --- |
| 2026-11-25 | First version ([#238](https://github.com/artkoenig/family-agenda-cloud/issues/238)). Not yet accepted by the Operator (#237). |

## How to read it

Each activity gives the items of Art. 30(1)(b) to (f). The legal basis is not required by Art. 30; it stands next to
the purpose so that the record and the policy can be compared. "Policy § n" is a section of
`site/legal/datenschutz.de.md`.

Every recipient is marked as a **processor** (Art. 28, agreement indexed in
[processing-agreements.md](processing-agreements.md)) or an **independent controller** (no agreement), as in #196,
item 4.

Data subjects, in the words of the glossaries:

- **Website visitors:** anyone who opens family-agenda.cloud.
- **Admins:** the persons with an account, who manage a Family. The **Contract holder** is the Admin who holds the
  Trial or the Subscription.
- **Family Members:** the persons a Family enters, children included. Children have no accounts; their parents enter
  their data.
- **Third persons in Sources:** persons who are no member of a Family but whose data are in a Family's Sources, such
  as teachers, clubs, senders of mails and guests in calendars.

## 1. Website delivery and operation

Policy § 2, § 8.

- **Purposes:** delivering the website and the service's pages; detecting attacks and keeping operation secure;
  backups, to restore the service after a loss; error alerts, so that the Operator learns of a fault.
- **Legal basis:** Art. 6(1)(f); the interest is secure operation.
- **Data subjects:** website visitors, Admins. The backups hold the data of every activity below, and so of every
  data subject of this record.
- **Categories of data:**
  - Server and container logs in the Cube's journal: IP address, time, address requested, browser identifier,
    referrer; per request to the service the Family id, method and status.
  - Backups: copies of all databases of the Cube (the Directory, every Family's database, the sign-in service's
    database).
  - Error alert mails to the Operator: per error a count and one example line of a log, cut to 300 characters, with IP
    addresses and every id but a Family's masked
    ([#208](https://github.com/artkoenig/family-agenda-cloud/issues/208)).
- **Recipients:**
  - IONOS Cloud GmbH, Berlin: the Cube (Frankfurt) and the backup bucket (Berlin). Processor.
  - IONOS SE, Montabaur: sends the alert mails through the service's mailbox. Processor.
  - Google Ireland Limited, Dublin: the alert mails arrive in the Operator's own mailbox at Gmail
    (`OPERATOR_ALERT_ADDRESS` in the Cube's `.env`, read 2026-11-25). Policy § 2 ("Fehlermeldungen"), § 9.
    Recorded as an **independent controller**: a consumer Gmail mailbox runs under Google's own terms, and Google
    offers no processing agreement for it ([processing-agreements.md](processing-agreements.md)). This is the
    record's reading, not a decision; a mailbox with an agreement (IONOS, or Google Workspace) would end the question.
  - No recipient: healthchecks.io. The heartbeat ping carries no personal data
    ([#192](https://github.com/artkoenig/family-agenda-cloud/issues/192), amendment).
  - The website loads nothing from third parties and uses no analytics or tracking, so there is no further recipient.
- **Third-country transfers:** none by the service. The alert mails in the Gmail mailbox can go to Google LLC in
  the US, under the adequacy decision for the EU-US Data Privacy Framework.
- **Erasure:**
  - Server and container logs: 14 days.
  - Backups: 14 days; a deleted Family's last copy is gone 14 days after its deletion at the latest.
  - `OPEN:` how long alert mails stay in the Operator's mailbox.

## 2. Registration and sign-in

Policy § 3, § 11 (cookies).

- **Purposes:** creating an Admin's account and signing the Admin in; inviting further Admins; protecting
  registration and the mailbox against abuse.
- **Legal basis:** Art. 6(1)(b) for the account and sign-in. Art. 6(1)(f) for the sign-in log, the CAPTCHA and the
  mail limit (protection against abuse).
- **Data subjects:** Admins, and persons who register or are invited.
- **Categories of data:**
  - Email address, name, a password if one is set (as a hash only), the one-time codes sent by mail.
  - Sign-in log: IP address and time of each sign-in and registration.
    The log also holds the browser's user agent (`docs/runbook/setup.md`, "Logto's sign-in log"); policy § 3
    names it as "Browser-Kennung".
  - CAPTCHA ("Cap"): a small proof-of-work task the browser solves at registration. Self-hosted, no third party.
  - Mail limit: how many sign-in mails went to an address in the last hour (three at most).
  - Strictly necessary cookies for sign-in and the session (§ 25(2) no. 2 TDDDG). No consent is asked.
- **Recipients:**
  - IONOS Cloud GmbH: the Cube, on which the sign-in service (Logto) runs self-hosted. Processor.
  - IONOS SE: sends the mails with codes and invitations. Processor.
- **Third-country transfers:** none.
- **Erasure:**
  - Account: until the Family is deleted; then at once, with the Family (activity 4).
  - Sign-in log: 30 days.

## 3. Sign in with Google

Policy § 3 ("Anmeldung mit Google"), § 9.

- **Purposes:** signing in with a Google account, if the person chooses it. Sign-in by mail code stays available.
- **Legal basis:** Art. 6(1)(b); chosen by the user.
- **Data subjects:** Admins who choose "Mit Google anmelden".
- **Categories of data:** name, email address, the address of the profile picture and a Google identifier, which
  Google passes to the sign-in service.
  Google learns that and when the person signs in to Family Agenda.
  The scope `profile` also carries the address of the profile picture (research note of
  [#182](https://github.com/artkoenig/family-agenda-cloud/issues/182), § 8), and the sign-in service keeps it: a
  social sign-in syncs name, avatar, email and phone (Logto 1.46.0, as noted in `routing/src/logto-management.ts`).
  Not checked on the Cube. Policy § 3 names the picture address.
- **Recipients:**
  - Google Ireland Limited, Dublin. **Independent controller**; no agreement.
  - IONOS Cloud GmbH: the Cube, where what Google passed on is stored. Processor.
- **Third-country transfers:** data can go to Google LLC in the US. This is Google's own transfer as controller,
  under the adequacy decision for the EU-US Data Privacy Framework.
- **Erasure:** the link ends when the account is deleted, which happens with the Family (activity 4).

## 4. The service: Family, Sources and Agendas

Policy § 4, § 5, § 8.

- **Purposes:** giving a Family its Agendas. For that the service keeps the Family Members, fetches the Sources the
  Family connected, on the Family's behalf and without changing them, recognises dates and tasks in mails and
  documents with an AI language model (Extraction), shows the resulting Items to the Family, and lets an Agenda be
  subscribed to through an Agenda Link.
- **Legal basis:**
  - The Admin's own data: Art. 6(1)(b).
  - Data of other persons (partner, children, teachers, senders): Art. 6(1)(f); the interest is that the Family
    organises its everyday life.
  - Special categories (Art. 9): they arrive incidentally and are processed only to show them to the Family. There is
    no consent checkbox and no clean Art. 9 basis. This is an accepted risk (#196, item 3).
  - Art. 8 does not apply: children have no accounts.
- **Data subjects:**
  - Admins.
  - Family Members, **children included**.
  - Third persons in Sources. They are informed through policy § 5 (Art. 14); telling each person would be
    disproportionate (Art. 14(5)(b)). Their rights go through support@family-agenda.cloud.
- **Categories of data:**
  - Names of the Family Members and their roles.
  - Source credentials (such as calendar addresses, mailbox or school portal logins), encrypted under the Family key.
  - Source content: mails with attachments, calendar events, timetables.
  - Items of the Agendas, made from that content.
  - Agenda Links: a secret address per Agenda. Whoever knows it can read the Agenda; Admins can revoke it.
  - Of third persons: name, email address and what the message or event says. Source: the Family's mailbox, calendar
    or school portal.
  - **Special categories, incidental:** health data (such as a doctor's appointment) and data on religion (such as
    religious education) that mails and calendars happen to hold.
- **What is not done:** Items and content are shown only to the Family. The Operator does not evaluate them, builds
  no profiles and trains no AI models with them, and views content only to fix a fault with an Admin's consent or
  where the law requires it (policy § 4, "Keine eigene Nutzung"; #198, item 3). No automated decisions in the sense
  of Art. 22; Extraction decides nothing about persons.
- **Recipients:**
  - IONOS Cloud GmbH: the Cube with one database per Family (Frankfurt), Object Storage for stored files (Frankfurt)
    and backups (Berlin), and the AI Model Hub (Berlin), which receives the text of mails and documents for
    Extraction. All in Germany. Processor. The model does not store the content and is not trained with it.
  - **No recipients:** the Sources' hosts (a Family's mail provider, a calendar's host, the school and Untis). The
    service fetches from them on the Family's behalf what the Family released; the Operator does not engage them.
- **Third-country transfers:** none.
- **Erasure:**
  - Until the Family is deleted. Admins can delete single Items at any time, and the whole Family themselves.
  - A Family in its Trial without an order, or after its Subscription ended: Locked, and deleted in full 30 days
    later.
  - On deletion: the Family's database, its key and its Admins' accounts at once; stored files at once, their older
    versions after 14 days; backups 14 days after the deletion at the latest.
  - The Directory keeps one entry without name or email address (id, time zone, dates).
  - `OPEN:` how long IONOS keeps the AI Model Hub's metadata per request (time, model, token counts). IONOS
    publishes no period; asked in `docs/correspondence/2026-11-ionos-ai-model-hub-request.md`, no reply filed.

## 5. Trial, Subscription and payment

Policy § 6, § 8.

- **Purposes:** running the Trial and the Subscription; taking payment; issuing invoices and keeping the billing
  records the tax law requires.
- **Legal basis:** Art. 6(1)(b); for invoices and billing records Art. 6(1)(c) with § 147 AO and § 14b UStG.
- **Data subjects:** Contract holders.
- **Categories of data:**
  - Name and email address of the Contract holder, Tariff, term, and the times of order, Cancellation and Withdrawal.
  - At Stripe: payment data (card or account), billing address and country; invoices and accounting records.
- **Recipients:**
  - Stripe Payments Europe, Limited, Dublin. **Split role:** **processor** for payment processing; **independent
    controller** for fraud prevention and identity checks (KYC). Stripe sets its own cookies on its payment page,
    under its own privacy policy.
  - IONOS Cloud GmbH: the Cube, where the Directory holds the Trial and the Subscription. Processor.
- **Third-country transfers:** data can go to **Stripe, LLC** in the US, the entity Stripe's DPA names (#182). Basis:
  EU-US Data Privacy Framework, in addition standard contractual clauses (Stripe's Data Transfers Addendum).
- **Erasure:**
  - Invoices and accounting records: 8 years from the end of the calendar year (§ 147(3) AO, § 14b UStG); then the
    customer is deleted at Stripe.
  - The Trial's and Subscription's data in the Directory go with the Family (activity 4); the entry that stays holds
    no name and no email address.

## 6. Contract mails and support

Policy § 7, § 8.

- **Purposes:** sending the mails that belong to the contract (sign-in codes, invitations, reminders before the
  Trial ends, confirmations of order, Cancellation, Withdrawal and deletion); answering support requests. No
  newsletter and no advertising.
- **Legal basis:** Art. 6(1)(b).
- **Data subjects:** Admins, Contract holders, and anyone who writes to support@family-agenda.cloud.
- **Categories of data:**
  - The outbox of the Routing module: per mail its recipient address, subject and text, and when it was sent.
  - Logs of the sender: the mail's type and the Family, not the address.
  - Bounces (delivery status notifications) that come back to the mailbox.
  - Support requests: the sender's address and the message.
- **Recipients:**
  - IONOS SE, Montabaur: the mailbox that sends every mail and receives answers, support requests and bounces.
    Processor. Its sub-processors for the mailbox, both in Germany: 1&1 Mail & Media GmbH and Open-Xchange GmbH
    ([processing-agreements.md](processing-agreements.md)).
  - IONOS Cloud GmbH: the Cube, where the outbox is kept. Processor.
- **Third-country transfers:** none.
- **Erasure:**
  - No copies of sent mails are kept.
  - Outbox entries: 30 days after delivery.
  - Bounces: after reading, after 30 days at the latest.
  - Support requests: when the matter is done, with the Family at the latest.
  - IONOS's own logs: period not known to the Operator; IONOS's privacy policy applies (stated as such in policy § 7).

## Recipients in one table (Art. 30(1)(d), (e))

| Recipient | Role | Activities | Third country |
| --- | --- | --- | --- |
| IONOS Cloud GmbH, Greifswalder Str. 207, 10405 Berlin | Processor | 1 to 6 | None |
| IONOS SE, Elgendorfer Str. 57, 56410 Montabaur | Processor | 1, 2, 6 | None |
| Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Dublin 2, Ireland | Processor for payment processing; independent controller for fraud prevention and identity checks | 5 | US: Stripe, LLC (DPF, in addition SCC) |
| Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland | Independent controller | 1, the mailbox for the alert mails; 3, only with Google sign-in | US: Google LLC, Google's own transfer (DPF) |

There are no other transfers to countries outside the EU. The Sources' hosts are not recipients.

## Technical and organisational measures (Art. 30(1)(g), Art. 32)

Only measures that are in place or decided. "Decided" means a launch gate still waits for it.

| Measure | State |
| --- | --- |
| **Separation:** one database and one database role per Family. | In place |
| **Encryption of credentials:** Source credentials are encrypted under the Family key, one per Family; the Operator key wraps every Family key and database password in the Directory. A leaked Family key opens only that Family's credentials. | In place |
| **Outbound allowlist:** each plugin reaches the internet only through its Egress Proxy, which allows only the hosts of the Source it fetches. | In place |
| **Control by the Family:** an Agenda Link can be revoked; Admins can delete single Items and the whole Family; the Export serves Art. 20. | In place |
| **AI model:** Extraction runs on an open model at the IONOS AI Model Hub in Germany; content is not stored. Use for training is prohibited by IONOS's terms for AI services (§ 2.3). Location and non-storage are IONOS's documented statements; the written confirmation is asked and blocks stage (c) (launch gate 12). | In place; confirmation open |
| **Transport encryption:** TLS for every address of the service, by Caddy. | In place |
| **Backups:** continuous, kept 14 days, in a bucket in Berlin apart from the Cube in Frankfurt; noncurrent versions of stored files are deleted after 14 days. Public access to both buckets is blocked. | In place |
| **Abuse protection at registration:** the Cap CAPTCHA and the limit of three sign-in mails per address and hour ([#195](https://github.com/artkoenig/family-agenda-cloud/issues/195)). | Decided; live before registration opens (gate 13b) |
| **Logs:** kept on the Cube only, 14 days; the sign-in log 30 days. The logs of the mail sender hold no address. In alert mails, IP addresses and every id but a Family's are masked (#208). | In place |
| **Content Security Policy:** a strict policy on every page below `app.family-agenda.cloud`, so that script from one Family's content cannot reach another Family's pages. Until then the Operator signs in to one Family per browser only. | Decided (gate 14) |
| **Deletion:** a Locked Family is deleted after 30 days; the periods of each activity above. | Decided ([#191](https://github.com/artkoenig/family-agenda-cloud/issues/191)); the automatic deletion is not yet built |
| **Processors' measures:** IONOS Cloud's TOM annex to its processing agreement (`IO-SE_DE_AVV_Anlage2_TOM_v6.1.2`), its ISO/IEC 27001 certificate on the basis of IT-Grundschutz (BSI-IGZ-0730-2025: Compute Engine and Object Storage in Germany) and its BSI C5:2020 Type 1 attestation; IONOS SE's TOM annex to its agreement. IONOS's documentation calls the certification of the Berlin Object Storage region (`eu-central-3`, the backup bucket) pending. | In place; versions in [processing-agreements.md](processing-agreements.md) |

Not stated here, because `docs/research/` marks it unverified: encryption of the buckets at rest, and whether the
self-run sign-in service and Caddy send telemetry.

## Open items

Each is the Operator's to fill in (#237); none is decided here.

1. Activity 1: how long alert mails stay in the Operator's mailbox at Gmail.
2. Activity 1: Google is recorded as independent controller for that mailbox, with no agreement. To confirm, or to
   move the alert mails to a mailbox under an agreement.
3. Activity 4: the retention of the AI Model Hub's request metadata at IONOS.
