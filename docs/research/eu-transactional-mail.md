# EU transactional mail senders

Research for issue #66 (map #46; context: `ionos-platform-services.md` § Mail sending). Sources read 2026-11-13. Facts only; this note decides nothing. Not legal advice. Items marked **[UNVERIFIED]** could not be traced to a primary source.

## Situation

The hosted SaaS runs on one IONOS Cube (de/fra, Docker Compose). It sends three kinds of mail: sign-in codes from the self-hosted Authentik (SMTP), confirmations from `api` (HTTP API or SMTP), and Operator alerts. The mail contains codes and confirmations only, no Family content. Volume: ~2.5k mails per month at ~100 Families, ~20–21k at ~1,000 Families (20 per Family plus a few hundred alerts). DNS for `family-agenda.cloud` is kept by hand at IONOS SE. IONOS Cloud has no mail product (`ionos-platform-services.md`).

## Summary

- **Fits:** Every hosted candidate offers SMTP submission (fits Authentik), an HTTP API, a DPA, and SPF/DKIM/DMARC by DNS records that can be set by hand. Scaleway TEM (FR) and Lettermint (NL) keep everything in the EU, keep message content for a short time, and have no US parent. Scaleway is the cheapest at both volumes (~€0.55 and ~€5 per month).
- **Must be cleared:** Every sender sees the full message (recipient, subject, code) and stores it for a while: from 36 h (Scaleway) up to "unlimited log retention" by default (Brevo). Mailgun and Postmark have US parent companies; Postmark processes in the US. Scaleway's default cap is 10k per month and must be raised through support before ~1,000 Families. Brevo and Mailjet list US sub-processors (Cloudflare; GCP under DPF/SCC).
- **IONOS Mail (Mail Basic/Business):** usable for SMTP, but it is a mailbox, not a sender service. It has no API, no bounce or event webhooks, and a cap of 50–500 mails per hour depending on mailbox age. The AVV is part of the IONOS AGB. Whether the AGB allow application mail for a hosted service is **[UNVERIFIED]**. At this volume it works technically and is the weakest option on deliverability tooling. It is not a dead end, but it is a fallback.
- **Self-run MTA:** possible, with a PTR record, port 25 opened on request, and Gmail's sender rules met. All deliverability and blocklist work lands on the one Operator, and the one VM is a single point of failure for sign-in.
- **Open points:** see "Not verified" at the end.

| | Seat / parent | Data location | SMTP | API | DPA | Content retention | Free tier | ~2.5k/mo | ~20k/mo |
|---|---|---|---|---|---|---|---|---|---|
| Scaleway TEM | Scaleway SAS, FR (Iliad group) | France (fr-par only) | 465/587/2465 | Yes | Contracts page | Content deleted on accept, hard bounce or 36 h; metadata while domain active | 300/mo | ~€0.55 | ~€5 (cap 10k default, raise via support) |
| Lettermint | Lettermint B.V., NL (founded 2025) | NL (UpCloud), DE backups (OVH) | 587/465/25/2525… | Yes | Automatic, EU-only | 28 d content+metadata; Pro 7/14 d, or 0–3 d on approval | 300/mo | €10 (Starter) | ~€25 |
| Brevo | Brevo SAS, FR; DE customers contract with Brevo GmbH, Berlin | EU (OVH FR, GCP BE); Cloudflare US | 587/465/2525 | Yes | Appendix 3 of terms | Logs "unlimited" by default, configurable [UNVERIFIED] | 300/day | €0 (free) | ~€21–35 [UNVERIFIED stairstep math] |
| Mailjet | Mailjet SAS, FR; Sinch group | GCP Frankfurt + Belgium | Yes | Yes | Online DPA | [UNVERIFIED] | 6,000/mo, 200/day | €0 (free) | ≤ €37 (Essential 50k tier) |
| Mailgun EU | Mailgun Technologies Inc, US; Sinch group | Message data in EU region (DE); account data global | smtp.eu.mailgun.org | api.eu.mailgun.net | Yes | Foundation: 1 d message, 5 d logs | 100/day | €0 or €14 | ~€31 |
| rapidmail | Positive Group Deutschland GmbH, Freiburg | Germany only | Yes (only SMTP) | No (transactional) | AV-Vertrag online | [UNVERIFIED] | ≤1,000/mo | from €59 | €59 (≤50k) |
| Postmark (control) | AC PM LLC, US (ActiveCampaign) | US (Chicago + AWS) | Yes | Yes | DPF + SCC | 45 d (Pro up to 365 d) | 100/mo | $15 | ~$29.50–33 |
| IONOS Mail | IONOS SE, DE | [UNVERIFIED] DE | 587/465 | No | Part of AGB since 2022-07-19 | Mailbox (Sent folder, if the client stores it) | n/a | mailbox price [UNVERIFIED] | same |
| Self-run MTA | the Operator | the Cube | own | own | none needed | own | n/a | €0 | €0 + time |

Prices are per month, net, from the pages read; each recipient counts as one mail.

## What every sender sees

The sender receives the full message: From, To, Subject, body (the code or confirmation), and the sending IP. None of the hosted options can work without that. The data are the recipient's address, a one-time code and a short confirmation text. No Family content, so the placement rule of map #46 allows an EU sender (`ionos-platform-services.md`). Retention of that data differs (table above).

## Findings per option

### Scaleway Transactional Email (TEM)
- Pricing: Essential is pay as you go: 300 free per month, then €0.25 per 1k, 5 domains, no SLA. Scale costs €80 per month for 100k, then €0.20 per 1k, with a dedicated IP and a 99.9 % SLA ([pricing](https://www.scaleway.com/en/pricing/)).
- Limits: 10k mails per month by default, raised through support after a review. Region fr-par only. Transactional mail only. SPF may not use a recursive include ([capabilities and limits](https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/)).
- Privacy (page dated 2026-10-19): content is encrypted and deleted once accepted, after a hard bounce, or after 36 h. Backups are kept 7 days. Metadata (from, to, subject, IP, status) is kept while the domain is active; Scaleway plans to shorten this in 2027. Webhook data is kept 15 days. Everything is processed in France, with no subprocessor specific to TEM and no tracking. Scaleway states it is not subject to the CLOUD Act ([data privacy](https://www.scaleway.com/en/docs/transactional-email/reference-content/data-privacy/)).
- SMTP on 465, 2465 and 587 with IAM API keys. An MX record is recommended, and a blackhole MX is available. DPA at [contracts](https://www.scaleway.com/en/contracts/).

### Lettermint
- Company: Lettermint B.V., KvK 99337711, Zwolle, NL. Founded 2025, small team. MTA: KumoMTA.
- DPA: concluded automatically, EU-only processing. Content and metadata kept 28 days, analytics 90 days, backups at most 14 days. 30 days' notice before a sub-processor change. Mistral is used for support and abuse handling ([DPA](https://lettermint.co/dpa)). Sub-processors: UpCloud (NL), OVH (DE, backups), Postmastery (NL) ([subprocessors](https://lettermint.co/subprocessors)).
- Retention: Pro can set 7, 14 or 28 days, or 0, 1 or 3 days with approval ([data retention](https://lettermint.co/docs/platform/emails/data-retention)).
- SMTP: `smtp.lettermint.co`, user `lettermint`, password is the project token; ports 25, 587, 465, 2525, 2465, 2587 ([SMTP guide](https://lettermint.co/docs/guides/send-email-with-smtp)).
- DNS: DKIM CNAMEs `lm1`/`lm2` (rotated by Lettermint), a Return-Path CNAME for SPF, and DMARC with `aspf=r`. A subdomain is recommended ([domains](https://lettermint.co/docs/platform/domains/introduction)).
- Pricing: Free 300 per month. Starter €10 for 10k, then €1.50 per 1k. Growth €13 (+€1.15 per 1k). Pro €15 ([pricing](https://lettermint.co/pricing)).

### Brevo
- Company: Brevo SAS, Paris (RCS 498 019 298). Customers in DE/AT/CH contract with Brevo GmbH, Berlin (HRB 133191). The DPA is Appendix 3 of the [terms of use](https://www.brevo.com/legal/termsofuse/).
- Infrastructure: OVH (France), GCP (Belgium, under DPF and SCC), Cloudflare (US, under DPF and SCC). ISO 27001:2022 ([security](https://www.brevo.com/security/)).
- Pricing ([pricing](https://www.brevo.com/pricing/)): Free 300 per day after account approval. All plans include API, SMTP, webhooks and "unlimited log retention". Starter costs €7 for 5k; credits for 15,001–20,000 cost €21 and 20,001–30,000 cost €28. **[UNVERIFIED]** whether the credits come on top of the base price. Removing the logo costs €9 on Starter. A dedicated IP is Enterprise only.
- **[UNVERIFIED]** (help.brevo.com refused automated fetches): transactional logs and previews are kept indefinitely by default, and this can be configured. SMTP host is `smtp-relay.brevo.com` (587, 465, 2525) with an SMTP key. Domain setup uses a `brevo-code` TXT record, DKIM CNAMEs `brevo1._domainkey` and `brevo2._domainkey`, and DMARC.

### Mailjet
- Mailjet SAS (France), part of Sinch Email, which also includes Mailgun. Data in GCP Frankfurt and Saint-Ghislain, Belgium ([security & privacy](https://www.mailjet.com/security-privacy/)). DPA: data deleted 90 days after termination ([DPA](https://www.mailjet.com/legal/dpa/)).
- Pricing ([pricing](https://www.mailjet.com/pricing/)): Free 6,000 per month and 200 per day, with API and SMTP. Starter €8 for 8k. Essential €18 for 15k, €37 for 50k; the Mailjet logo is removed from Essential up. Premium from €27 (15k).
- **[UNVERIFIED]** content retention, and the price step between 15k and 50k.

### Mailgun (EU region)
- Mailgun Technologies Inc (US), Sinch group. EU endpoints are `api.eu.mailgun.net` and `smtp.eu.mailgun.org`. Message data stays in the region; account data, users, billing and API keys are replicated globally ([API overview](https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview)). Data center in Germany ([GDPR page](https://www.mailgun.com/resources/learning-center/gdpr/)).
- Pricing ([pricing](https://www.mailgun.com/pricing/)): Free 100 per day with 1-day logs. Basic €14 for 10k, then €1.70 per 1k. Foundation €32 for 50k, with 5-day logs and 1-day message retention. Scale €82.

### rapidmail (German provider)
- Positive Group Deutschland GmbH, Freiburg (HRB 706983). Servers only in Germany, in an ISO 27001 data center. AV-Vertrag online. DKIM and SPF ([rapidmail](https://www.rapidmail.de/)).
- Transactional mail through SMTP only: free up to 1,000 per month, then from €59 per month net for up to 50k, on quote; support enables it. No transactional HTTP API found.
- **[UNVERIFIED]** whether Positive Group has a non-German parent; content retention.

### Postmark (non-EU control)
- AC PM LLC (ActiveCampaign), Chicago; transfers under DPF and SCC. Hosted at Deft near Chicago plus AWS; no EU hosting planned. Content and metadata kept 45 days ([EU privacy](https://postmarkapp.com/eu-privacy), [DPA](https://postmarkapp.com/dpa)).
- Pricing in USD ([pricing](https://postmarkapp.com/pricing)): Free 100 per month. Basic $15 for 10k (~$33 at 20k). Pro $16.50 (~$29.50 at 20k; retention up to 365 days). Platform $18.

### IONOS Mail (Mail Basic / Mail Business at ionos.de)
- SMTP submission: yes. The mailbox works with any SMTP client on 587 (STARTTLS, recommended) or 465 (SSL) ([IONOS SMTP](https://www.ionos.com/help/email/glossary-email-terms-explained/smtp/)). Authentik can log in with the mailbox address and password. Host `smtp.ionos.de` for German contracts **[UNVERIFIED]**: it comes from forum posts, and the IONOS page names `smtp.ionos.com`.
- Limits: the cap is per hour and depends on the mailbox age: 50 per hour for days 0–7, 100 for days 8–14, 400 for days 15–30, and 500 after 30 days. Above the cap the server answers `450 Mail send limit exceeded` ([sending limits](https://www.ionos.de/hilfe/e-mail/allgemeine-themen/welche-beschraenkungen-gibt-es-beim-versand-von-massenmails/)). No daily cap is documented for Basic or Business. ~700 mails per day at 1,000 Families stays well below the cap, unless they come in bursts.
- Processing agreement: "Seit dem 19.07.2022 ist die Vereinbarung zur Auftragsverarbeitung Bestandteil der IONOS AGB" ([AVV](https://www.ionos.de/hilfe/datenschutz/allgemeine-informationen-zur-datenschutz-grundverordnung-dsgvo/vereinbarung-zur-auftragsverarbeitung-avv-mit-ionos-abschliessen/)). IONOS SE is German with no US parent; it is the same contract partner as the domain.
- Terms: the limits exist "um Missbrauch zu unterbinden". The postmaster policy covers mail into IONOS and requires consent only for mass or commercial mail ([email policy](https://www.ionos.com/help/email/postmaster/email-policy/)). **[UNVERIFIED]** whether the AGB or the Mail product description forbid automated mail sent for a hosted service. The AGB were not read.
- Missing, compared with the sender services: no HTTP API, no bounce or complaint webhooks, no suppression list, no delivery log beyond the mailbox. DKIM signing on a customer domain with IONOS DNS **[UNVERIFIED]**.
- Verdict: workable as a small-scale or fallback sender for Authentik codes. It is not built for an `api` that needs bounce handling.

### Self-run MTA on the Cube
- Port 25: IONOS blocks it by default and opens it on request by phone. Conditions: a valid FQDN, a PTR record that matches it, and an SPF record ([unblocking port 25](https://www.ionos.com/help/server-cloud-infrastructure/firewall-policies/unblocking-port-25-for-sending-emails/)). That page covers Cloud Panel servers; **[UNVERIFIED]** whether it covers Cubes in the DCD. PTR records are set in Cloud DNS ([reverse DNS tutorial](https://docs.ionos.com/cloud/tutorials/network-services/cloud-dns/reversedns)).
- Gmail requires the following from all senders: SPF or DKIM; forward and reverse DNS (PTR) that match; TLS; a spam rate below 0.3 %; RFC 5322 format. Above 5,000 mails per day it also requires SPF and DKIM and DMARC, with From aligned to SPF or DKIM ([Gmail sender guidelines](https://support.google.com/a/answer/81126)).
- Blocklists: the Spamhaus PBL lists IP ranges that by policy should not send directly to MX servers. Ranges can be removed from it if the network's policy allows that ([PBL](https://www.spamhaus.org/blocklists/policy-blocklist/)). **[UNVERIFIED]** whether IONOS Cloud ranges are listed in the PBL, and the reputation of a fresh IONOS IP at Microsoft (SNDS) and Gmail.
- Workload for one person (from general practice, **[UNVERIFIED]** as an estimate):
  - Run Postfix with OpenDKIM, or Stalwart or Maddy, in Compose.
  - Keep TLS certificates current.
  - Handle the queue, retries and bounces.
  - Watch blocklists, DMARC aggregate reports, and Postmaster Tools / SNDS.
  - Warm up the IP.
- If the VM goes down, sign-in codes stop, and queued mail is lost with the VM.

## DNS at IONOS SE for `family-agenda.cloud`

All hosted options need records that can be set by hand:
- **SPF:** TXT, or a CNAME on a Return-Path or bounce subdomain (Lettermint, Mailgun), so that SPF aligns on the subdomain under relaxed DMARC. Only one SPF TXT record is allowed per name, with at most 10 DNS lookups ([RFC 7208 §3.2, §4.6.4](https://www.rfc-editor.org/rfc/rfc7208)). Scaleway does not support a recursive include.
- **DKIM:** CNAMEs (Lettermint `lm1`/`lm2`, Brevo `brevo1`/`brevo2`), which let the provider rotate keys, or TXT keys (Scaleway, self-run).
- **DMARC:** TXT at `_dmarc`; a policy of `p=none` meets Gmail's minimum.
- **Ownership:** a TXT record at some providers (for example `brevo-code`).
- Using a sending subdomain (for example `mail.family-agenda.cloud`) keeps provider records apart from the root domain. Lettermint recommends it.

## Not verified

- Brevo help-centre facts (SMTP host, DNS records, log retention), because help.brevo.com refused automated fetches. Also how Brevo's Starter credits add up at 20k.
- Mailjet: content retention, and the price between 15k and 50k.
- rapidmail: parent company, and content retention.
- IONOS Mail: whether the AGB allow application or transactional use; the German SMTP host name; DKIM on a customer domain; the mailbox price; the data location.
- Port 25 policy for DCD Cubes; PBL listing of IONOS Cloud ranges.
- The workload estimate for the self-run MTA.

## IONOS Mail: open points resolved (2026-11-13)

Sources read 2026-11-13, all IONOS's own pages (ionos.de where it exists, otherwise ionos.com/.co.uk). Still not legal advice.

### 1. Do the terms allow application / transactional mail?

There is **no Mail-specific Leistungsbeschreibung**. The product-terms index lists only Server, Domains, Online Marketing, Website Design, Microsoft, Google Workspace, Logo/Firmennamen-Generator, Abmahnschutz, KI Telefonassistent, KI-Dienste, WebAnalytics, Data Act, Preisliste, Partnerprogramme — nothing for Mail, E-Mail or Webhosting ([Produktbedingungen](https://www.ionos.de/terms-gtc/terms/)). Mail rules live in the general AGB ([AGB](https://www.ionos.de/terms-gtc/)).

The relevant clauses:
- **Ziffer 10.3** — mailboxes may be used "ausschließlich für die Abwicklung von E-Mail-Verkehr"; using them as storage for other files and data is strictly forbidden. Sending application mail *is* E-Mail-Verkehr, so this clause does not forbid it.
- **Ziffer 10.5** — advertising mail needs the recipient's explicit consent ("ohne ausdrückliches Einverständnis des jeweiligen Empfängers"), in particular mail distributed in bulk with identical content ("mit jeweils gleichem Inhalt massenhaft verbreitet"). IONOS may block the plan immediately. Sign-in codes and confirmations are not Werbung, so this clause does not cover them; bulk mail with identical content without consent is what is banned.
- **Ziffer 10.2** — a mailbox must be read at least every four weeks, and IONOS may deactivate a mailbox with no sending or retrieval for two months. A send-only mailbox therefore needs to be read, not just written to.
- **Ziffer 9.2 / 10.11** — no unlawful use, no infringement of third-party rights; EUR 5.050 contractual penalty per violation. **Ziffer 10.6** limits *Webspace* (not mailboxes) to conventional website operation. **Ziffer 4.4** forbids renting/sublicensing the software, not the service.

**Nothing in the AGB addresses automated sending from an application either way, and nothing forbids sending to one's own end customers or providing a service to third parties.** No acceptable-use document separate from the AGB exists. The postmaster pages are rules for mail *into* IONOS, not for sending from an IONOS mailbox ([E-Mail-Policy](https://www.ionos.com/help/email/postmaster/email-policy/), [Empfehlung zum Versand an IONOS-Postfächer](https://www.ionos.de/hilfe/e-mail/postmaster/empfehlung-zum-versand-von-e-mails-an-ionos-postfaecher/)). So: permitted by omission, within the per-hour cap and the no-unsolicited-advertising rule. (The AGB clauses are only summarised and briefly quoted here; read the clause text before relying on it.)

### 2. SMTP submission host and ports (German contract)

From the German help page for Mail Basic: outgoing **`smtp.ionos.de`**, port **465**, SSL/TLS; incoming `imap.ionos.de` 993 SSL/TLS (`pop.ionos.de` 995) ([Einstellungen für Ihr E-Mail-Programm](https://www.ionos.de/hilfe/e-mail/mail-basic-verwalten/einstellungen-fuer-ihr-e-mail-programm-imap-pop3/)). This settles the earlier **[UNVERIFIED]** host name: `smtp.ionos.de` is IONOS-documented for .de contracts; `smtp.ionos.com` is the .com variant ([mail server details](https://www.ionos.com/help/email/general-topics/ionos-mail-server-details-for-imap-pop3-and-smtp/)). Port **587 with STARTTLS** is documented as the alternative when 465 is blocked, on the .com page, not on the .de page. Login is the full mailbox address plus that mailbox's own password.

### 3. DKIM and SPF for the own domain

- **DKIM: yes, and automatic.** "DKIM ist standardmäßig aktiviert": for domains on IONOS name servers IONOS states it has set up the required DNS records itself ("dann haben wir die für die DKIM-Signierung notwendigen DNS-Records für Ihre Domains automatisch eingerichtet"). Since `family-agenda.cloud` keeps its DNS at IONOS, nothing has to be done by hand. To re-create them, three **CNAME** records, TTL 1 h: `s1-ionos._domainkey` → `s1.dkim.ionos.com`, `s2-ionos._domainkey` → `s2.dkim.ionos.com`, `s42582890._domainkey` → `s42582890.dkim.ionos.com`; for a subdomain the subdomain name is appended to each host name ([E-Mail-Authentifizierung mit DKIM](https://www.ionos.co.uk/help/domains/configuring-mail-servers-and-other-related-records/email-authentication-with-dkim/), German path 404s). The keys are IONOS's, so IONOS rotates them.
- **SPF:** the documented value for a zone hosted elsewhere is **`v=spf1 include:_spf-eu.ionos.com ~all`**. In the IONOS DNS panel one adds the predefined record type "IONOS SPF (TXT)" rather than a generic SPF record; an existing SPF record for another mail service is extended automatically; propagation up to 48 h ([Spam-Versand vermeiden mit SPF-Record](https://www.ionos.de/hilfe/domains/mailserver-und-verwandte-records-konfigurieren/spam-versand-vermeiden-mit-spf-record/)).
- Consequence: with IONOS DNS, SPF and DKIM alignment on the root domain come for free; only DMARC at `_dmarc` stays manual.

### 4. Price per mailbox, and inclusion with a domain

From [ionos.de/mail](https://www.ionos.de/mail), "Dauerhaft nur", monthly cancellable, net:
- **Mail Basic 1** — 1,50 €/month, 2 GB.
- **Mail Basic 1+** — 5 €/month, 12 GB.
- **Mail Business** — 6 €/month for 1 user, 18 € for 5, 30 € for 10; 50 GB per user.

So the sender for Authentik costs 1,50 €/month. **No mailbox is included with a domain contract**: the domain pages list SSL, Domain Lock and Domain Connect as included, not a mailbox ([Domains](https://www.ionos.de/domains), [neue Domain-Endungen](https://www.ionos.de/domains/cloud-domain)). IONOS advertises the reverse (a free domain with a mail package). **[UNVERIFIED]** whether an older/running `.cloud` contract carries a legacy free mailbox — no IONOS page states a `.cloud` price or its inclusions; check the contract in the control panel.

### 5. Where mail data is stored

**[UNVERIFIED] for the mailbox itself.** No IONOS page found states a data-centre location for Mail Basic/Mail Business. What IONOS does state:
- The AVV, § 4.3: processing takes place "in einem Mitgliedstaat der Europäischen Union" or another EEA state, unless a transfer to a third country is needed to provide the service ([AVV](https://www.ionos.de/terms-gtc/avv/)). This is the binding statement, and it says EU/EEA, not Germany.
- The mail product page claims only "Aus Deutschland – DSGVO-konform & sicher" and "DSGVO-Hosting" ([ionos.de/mail](https://www.ionos.de/mail)) — marketing wording, no location.
- The **archiving** add-on, included in Mail Basic and Mail Business packages, is documented as German: "Ihre Daten werden sicher und DSGVO-konform in deutschen Rechenzentren gespeichert" ([E-Mail-Archivierung](https://www.ionos.de/office-loesungen/email-archivierung)). That covers the archive, not the live mailbox.
- The privacy help section has no article for mail products and none on server location ([Datenschutz-Hilfe](https://www.ionos.de/hilfe/datenschutz/)).

### 6. Daily cap

**No daily cap is documented for Mail Basic or Mail Business, and the hourly caps are identical for both** — one shared table, by mailbox age: 50/h (0–7 days), 100/h (8–14), 400/h (15–30), 500/h (over 30), with `450 Mail send limit exceeded` above it. Daily limits are documented only for Google Workspace (2,000 mails/day) and, as recipients per day, for Microsoft Exchange (1,500–16,000) — different products ([Beschränkungen beim Versand von Massenmails](https://www.ionos.de/hilfe/e-mail/allgemeine-themen/welche-beschraenkungen-gibt-es-beim-versand-von-massenmails/)). The stated reason remains "um Missbrauch zu unterbinden". So the only cap that binds is 500/h after 30 days, i.e. 12,000/day in theory, with bursts the real risk.

### 7. Bounces, delivery reports, logs

- **Bounces: yes, by mail only.** If a mail sent via IONOS cannot be delivered, the sender receives a mail containing a status code that states the reason, and the notification may carry a link with further detail; IONOS lists the codes with cause and remedy ([Fehlermeldungen bei unzustellbaren E-Mails](https://www.ionos.com/help/email/troubleshooting-mail-basic-mail-business/error-messages-for-undeliverable-emails/)), plus a code list for its own servers ([SMTP-Fehlermeldungen](https://www.ionos.de/hilfe/e-mail/postmaster/smtp-fehlermeldungen-der-ionos-mailserver/)).
- **No delivery report, event log or dashboard** is documented anywhere for the mailbox owner — not on the error-code pages, not in the postmaster section. Bounce handling means parsing DSN mails arriving in the mailbox (which Ziffer 10.2 requires be read anyway). This confirms the earlier verdict: usable for Authentik codes, not for an `api` that wants bounce events.
