# #67 Decide the transactional mail sender

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T10:13:25Z
- Closed: 2026-11-13T14:09:13Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/67

## Question

Which sender sends the hosted service's transactional mail, how Authentik and `api` reach it, and which DNS records `family-agenda.cloud` needs? Which mails exist stays with [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32).

---

**Comment by artkoenig, 2026-11-13T14:09:11Z**

## Answer

**IONOS Mail Basic 1** (1.50 EUR/month net, 2 GB), one mailbox `no-reply@family-agenda.cloud`, sending over SMTP submission `smtp.ionos.de` port 465. Both Authentik's sign-in codes and `api`'s confirmations use that one mailbox; no second path. Operator alerts stay at Healthchecks.io per [Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64). Which mails `api` sends at all stays with [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32).

**Why, and why not the alternatives.** Scaleway TEM would cost about 1 EUR less per month, but IONOS is a contract the Operator already holds, its processing agreement is part of the AGB, and because the domain's DNS is at IONOS, DKIM is enabled by default with records IONOS created itself (SPF `v=spf1 include:_spf-eu.ionos.com ~all`). Scaleway needs a second contract with its own agreement and sub-processor list, plus three DNS records by hand. The placement rule is **not** an argument either way: the AVV only promises the EU/EEA, no IONOS page names a data centre for Mail Basic, so IONOS Mail is no closer to "Family content in Germany" than a French sender is.

**Terms.** There is no Leistungsbeschreibung for Mail. The AGB forbid using a mailbox as file storage (10.3) and advertising mail without consent, in particular bulk mail of identical content (10.5), but say **nothing about automated sending from an application, in either direction**. Sign-in codes are not advertising. So this use is permitted by omission, not by a written assurance; unlike the AI Model Hub ([Get IONOS's written word on serving Families through the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/62)) no confirmation is being sought, because no clause has to be read against its wording.

**Credentials.** The mailbox password lives in the root-only `.env` of [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58), with the master copy in the password manager.

**Failed sends and bounces.** No delivery report, event log or dashboard exists for a mailbox. Two mechanisms replace it:
- Authentik and `api` report an error when the handover to `smtp.ionos.de` fails; those failures are counted, and the existing `health` check of [Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64) alerts when more than a few fail within an hour. Hourly caps answer `450 Mail send limit exceeded` (50/h in a mailbox's first week, rising to 500/h after 30 days; no daily cap documented).
- Later rejections arrive as DSN mail in the mailbox. The mailbox is added to the maintainer's own mail client and read by hand; no IMAP parsing. This also satisfies AGB 10.2, which deactivates a mailbox that is not read for four weeks. No bounce handling in code, no suppression list.

**When to move, and where.** Scaleway TEM (France, about 0.55 EUR at 2.5k and 5 EUR at 20k mails/month, content deleted after 36 h, default cap 10k/month) is the named successor, recorded with its trigger in the growth CSV on the Cube: repeated `450 Mail send limit exceeded`, or more than 300 mails in one hour. Mail carrying Family content is out of this decision; neither sender is covered for it.

Facts and their sources in `docs/research/eu-transactional-mail.md`. Still unverified there: the data centre location of a live mailbox, and whether an existing `.cloud` contract includes a mailbox.

