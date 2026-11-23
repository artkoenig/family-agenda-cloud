# Sub-processors: what each service does with Family data

Research for issue [#182](https://github.com/artkoenig/family-agenda-cloud/issues/182) (map [#179](https://github.com/artkoenig/family-agenda-cloud/issues/179); feeds the privacy policy and launch-checklist gate 12). Sources read 2026-11-23. Facts only; this note decides nothing. Not legal advice. **[UNVERIFIED]** marks what no primary source confirmed; **[LAWYER]** marks a legal reading.

Extends, does not repeat: `ionos-platform-services.md` (IONOS Cloud AVV, certificates), `ionos-ai-model-hub.md` (§8, §9), `ionos-postgres-object-storage.md`, `eu-transactional-mail.md` (all mail candidates, IONOS Mail), `identity-providers.md` (Google), `legal-duties-b2c-eu.md` (F8–F10), `payment-providers.md` (Stripe). Details already there are only referenced.

## Question

For every service that touches personal data of the hosted service: role (processor / independent controller), AVV/DPA and where concluded, data location, third-country transfer and its basis, retention, training use.

## What actually runs (from `cube/compose.yaml`, `cube/Caddyfile`, `docs/runbook/setup.md`)

- One Basic Cube M in IONOS Cloud `de/fra` (setup step 2). On it, self-run: Caddy, Router/Scheduler/Receiver, the pool of cores, **Postgres 17** (container, volume on the Cube: Directory, one database per Family, `registration`, `logto`), **Logto 1.46** (self-hosted, DB on that Postgres), the plugins `ics`, `imap`, `webuntis` behind their Egress Proxies, `blob-mount` (rclone).
- **No IONOS DBaaS** is used. Postgres runs on the Cube; the managed-DB facts in `ionos-postgres-object-storage.md` do not apply.
- **OCR is local**: poppler + Tesseract in the core image (`Dockerfile` of the public core). Models: `deu`, `eng`, `osd` ship in the image; others are downloaded from `raw.githubusercontent.com/tesseract-ocr/tessdata_fast` (`packages/adapters/src/tessdata-fast-catalog.ts`). The download sends no document content. **No OCR vendor.**
- **LLM**: IONOS AI Model Hub, `https://openai.inference.de-txl.ionos.com/v1`, one Operator token (`LLM_*`). Receives mail text and PDF text of the Families' Sources.
- **Blobs**: IONOS Object Storage, bucket in `eu-central-4` (Frankfurt), versioning, noncurrent versions deleted after 14 days (setup step 4).
- **Backups**: WAL-G to a second bucket in `eu-central-3` (Berlin), retention 14 days (setup step 4; `families.md`: "Copies in the Operator's backups go when the backups do, 14 days later at the latest").
- **Mail**: Logto's SMTP connector via **IONOS Mail Basic 1**, `no-reply@family-agenda.cloud`, `smtp.ionos.de:465` (setup steps 5 and "Setting up Logto"). Carries recipient address and codes; no Family content.
- **DNS / domain**: IONOS SE (ionos.de contract), records by hand (setup step 3). **TLS**: Caddy's own ACME, no email in the Caddyfile; the IONOS SSL certificate is not used.
- **Images**: pulled from `ghcr.io` (core, plugins, Logto) and Docker Hub (`caddy`, `postgres`, `rclone/rclone`).
- **Google**: optional social connector in Logto (`GOOGLE_CLIENT_*`), scopes `openid`, `userinfo.email`, `userinfo.profile` (setup "Google sign-in").
- **Stripe**: settled on map #179 (Stripe Billing + Tax, no MoR); **not yet in the code**.
- **Logs**: Docker's, on the Cube; Caddy writes no access log; the Router logs Family id, method, status, never the path (`families.md`).

## Summary

- **All Family content** (Agenda, Items, Sources' credentials, mail and PDF text, blobs, backups) stays with **IONOS Cloud GmbH** in Germany: Cube `de/fra`, buckets Frankfurt and Berlin, LLM Berlin. One AVV (IONOS Cloud, v7.4, part of the terms) covers them; its sub-processor list (Stand 11/2026) has only EU entities.
- **Processors outside IONOS Cloud** that see personal data: **IONOS SE** (mailbox, domain; AVV in the IONOS AGB) and **Stripe** (mixed: processor for payments, **independent controller** for fraud, KYC/AML, product improvement; transfers to Stripe, LLC in the US under DPF/SCC).
- **Independent controllers, no AVV**: **Google** (sign-in, Google Ireland Ltd), the Families' own **IMAP/ICS hosts**, the **school / Untis** for WebUntis. Let's Encrypt, GitHub (ghcr.io, tessdata) and Docker Hub see the Cube's IP and the domain names, no Family data.
- **Open**: IONOS's reply to the AI Model Hub request (`docs/correspondence/2026-11-ionos-ai-model-hub-request.md`) has **not arrived** (reply section empty as of 2026-11-23); AI metadata retention and the mailbox location are unpublished; Stripe's sub-processor list and Google/Stripe DPF entries were not read.

## Per service

### 1. IONOS Cube (compute, Postgres, Logto, logs on it)

| | |
|---|---|
| Data | Everything on the Cube: Directory, every Family's database (Agenda, Items, Sources incl. IMAP/WebUntis credentials, encrypted under family keys), `logto` (Admins' email, password hash, passkeys, Google `sub`/email/name if linked), `registration`, Docker logs (Family ids, paths in core logs) |
| Role | IONOS Cloud GmbH: processor (AVV §1) |
| AVV | "Vereinbarung zur Auftragsverarbeitung für IONOS Cloud", v7.4, Stand 06/2023, part of the terms for booked products; no separate signature (`ionos-platform-services.md` § DPA; [AVV](https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/enterprise-datenschutzpaket/)). Contract 39683376. |
| Location | `de/fra` (setup step 2). Frankfurt sites are co-locations (Equinix, Digital Realty) (`ionos-platform-services.md`). AVV §4.3: EU/EEA "unless a transfer to third countries is required to provide the service". |
| Sub-processors | [List, Stand 11/2026](https://cloud.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/cloud/avv/IONOS_Cloud_GmbH_Unterauftragnehmer.pdf), read 2026-11-23: IONOS SE (DE; support and operation of Public Cloud, AI Model Hub, Managed Backup; colocation and data centres), IONOS Cloud Romania S.R.L. (RO) and IONOS Cloud Solutions Spain S.L.U. (ES) (3rd-level support Public Cloud and AI Model Hub; administrative remote access), Arsys Internet S.L.U. (ES; VPS, Cloud Server, Private Cloud, Dedicated Server). All EU. General authorisation, 14 days to object for good cause (AVV §10). |
| Third country | None in the list. |
| Retention | The Operator's: Family data until `routing delete` (`families.md`); Docker logs until rotated (no log-rotation setting in `compose.yaml`: Docker default, **[UNVERIFIED]** daemon config on the Cube). End of contract: deletion default (AVV §5.7). |
| Training | n/a |
| Self-run software | Logto OSS: whether it sends telemetry or update checks **[UNVERIFIED]** (no primary source found). Caddy: telemetry not mentioned in [its docs](https://caddyserver.com/docs/automatic-https) **[UNVERIFIED]**. |

### 2. IONOS Object Storage (blobs, backups)

| | |
|---|---|
| Data | Blobs: attachments, PDFs of every Family (bucket `eu-central-4`). Backups: base backups + WAL of the whole Postgres, i.e. all databases incl. `logto` (bucket `eu-central-3`). |
| Role / AVV / sub-processors | As §1 (same IONOS Cloud contract and AVV). |
| Location | Frankfurt `eu-central-4`, Berlin `eu-central-3`. Berlin's BSI IT-Grundschutz certificate "currently pending" (`ionos-platform-services.md`). |
| Third country | None. |
| Retention | Blob bucket: deleted objects kept as noncurrent versions 14 days (setup step 4; `families.md`). Backups: 14 days by WAL-G (setup step 4). Encryption at rest: SSE-S3 or SSE-C available; whether the buckets use it **[UNVERIFIED]** (setup does not say). |
| Training | n/a |

### 3. Postgres as in use

Self-run container on the Cube (`postgres:17`), not IONOS DBaaS. No vendor of its own: falls under §1 (data on the Cube's disk) and §2 (backups). No further processor.

### 4. IONOS AI Model Hub (Extraction)

| | |
|---|---|
| Data | Mail text and PDF/OCR text from Sources, prompts and structured outputs (Items): may include children's names, health or religion (`legal-duties-b2c-eu.md` F9) |
| Role | IONOS Cloud GmbH: processor (`ionos-ai-model-hub.md` §9) |
| AVV | Same IONOS Cloud AVV (§1) plus "Nutzungsbedingungen für KI-Dienste" ([AI terms](https://cloud.ionos.de/terms-gtc/ki-dienste/)). That the AVV v7.4 covers the Hub: the sub-processor list 11/2026 names it; confirmation asked of IONOS, **no reply yet**. |
| Location | Docs: inference only in IONOS data centres in Germany; endpoint `de-txl` Berlin ([data handling](https://docs.ionos.com/cloud/ai/ai-model-hub/governance-and-compliance/data-handling)). Contractually only AVV §4.3 (EU/EEA); service catalog says "Global". Written confirmation asked (request Q2), **open**. |
| Sub-processors | IONOS SE, IONOS Cloud Romania, IONOS Cloud Solutions Spain (list 11/2026). Model developers get no content (`ionos-ai-model-hub.md` §8). |
| Third country | None stated. |
| Retention | Prompts/outputs: not logged, not stored (docs). Metadata (timestamp, model, token counts): "only for the period necessary", **no period published**; asked (request Q3), **open**. |
| Training | Contractually prohibited: AI terms §2.3 ("insbesondere für das Training" ... "ausdrücklich untersagt"). |
| Other open | Intended use from a multi-tenant SaaS backend (AI terms §2.5/2.6/2.8), request Q1: **open**. Gate 12 keeps this blocking for stage (c) (`docs/launch-checklist.md`). |

### 5. OCR

Local Tesseract in the core (see "What actually runs"). No third party sees document content. The tessdata download from GitHub ([tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)) reveals the Cube's IP and requested language only.

### 6. Transactional mail

**In use: IONOS Mail Basic 1** (setup step 5).

| | |
|---|---|
| Data | Recipient email, sender, subject, body with the verification / sign-in / password-reset code (Logto templates, `routing/src/mail-templates.ts`), sending IP. Bounces land in the mailbox, read by hand. Alias `support@` forwards to the Operator's mailbox. |
| Role | IONOS SE: processor |
| AVV | "Seit dem 19.07.2022 ist die Vereinbarung zur Auftragsverarbeitung Bestandteil der IONOS AGB" ([AVV help](https://www.ionos.de/hilfe/datenschutz/allgemeine-informationen-zur-datenschutz-grundverordnung-dsgvo/vereinbarung-zur-auftragsverarbeitung-avv-mit-ionos-abschliessen/), [AVV](https://www.ionos.de/terms-gtc/avv/)). Separate contract from IONOS Cloud GmbH. IONOS SE's own sub-processor list **[UNVERIFIED]** (not read). |
| Location | AVV §4.3: EU/EEA unless needed otherwise. Mailbox data centre **[UNVERIFIED]** (no IONOS page states it; `eu-transactional-mail.md` § 5). |
| Third country | None stated. |
| Retention | SMTP submission alone stores no copy in "Sent" unless the client saves one; Logto's connector is SMTP only (**[UNVERIFIED]** server-side log retention at IONOS). Bounce mails and the `support@` mails stay until the Operator deletes them. |
| Training | n/a |

**Candidates not in use** (facts in `eu-transactional-mail.md`): Scaleway TEM (FR only, content deleted after 36 h), Lettermint (NL, 28 d, DPA automatic), Brevo (FR/DE contract partner; Cloudflare US under DPF/SCC; logs "unlimited" by default), Mailjet (GCP Frankfurt/Belgium), Mailgun EU (US parent; account data replicated globally), rapidmail (DE), Postmark (US, DPF/SCC, 45 d). Each would be a processor with its own DPA; none is needed while IONOS Mail is used.

### 7. Stripe (billing, decided, not built)

| | |
|---|---|
| Data (expected) | Customer's name, email, billing address, tax location evidence (Stripe Tax), payment method data, IP/device data in Checkout/portal, subscription and invoice history. No Family content. |
| Contract partner | Stripe Payments Europe, Limited (Ireland) for Germany/EEA ([SSA](https://stripe.com/legal/ssa) §12, last modified 2026-09-28). |
| Role | **Mixed.** Processor "im Auftrag des Nutzers" for payment processing; **independent controller** for choosing banks/payment providers, fraud monitoring and prevention, loss and security risk, own billing, legal compliance incl. AML/KYC, and "analyzing, improving, and developing products" ([DPA](https://stripe.com/legal/dpa), last updated 2026-09-28). [Privacy policy](https://stripe.com/privacy) (2026-01-16): processor for end customers' payment data, controller for its own purposes. |
| DPA | Incorporated by reference into the SSA: "Each party will comply with the DPA, including the Data Transfers Addendum, which is incorporated into this Agreement by this reference" (SSA §4.1). Concluded with the Stripe account; no signature. |
| Location | Transfers "an Stripe, LLC in den USA" and worldwide to affiliates and sub-processors (DPA); service providers mostly in EU, USA, India (privacy policy). |
| Third country + basis | US, India, others. Data Transfer Addendum ([DTA](https://stripe.com/legal/dta)): EU-US DPF, EU SCCs (Modules 1, 2, 3, Decision 2021/914), UK IDTA. Which mechanism per transfer: not stated. Stripe's DPF listing **[UNVERIFIED]** (privacy policy says it complies "soweit anwendbar"; the [DPF list](https://www.dataprivacyframework.gov/list) not read). |
| Sub-processors | [stripe.com/legal/service-providers](https://stripe.com/legal/service-providers); **not read** **[UNVERIFIED]**. New ones by email at least 30 days ahead; objection for good cause within 30 days (DPA). |
| Retention | DPA: return or deletion at the end at the user's choice, except where law requires or permits longer. Privacy policy: no fixed periods; kept for legal, regulatory, fraud, tax, accounting duties. |
| Training | Privacy policy §2.b: Stripe trains "Modellen des maschinellen Lernens" to provide the services and protect against fraud; whether on end-customer data beyond that general statement not said. |

### 8. Google as a sign-in method

| | |
|---|---|
| Data | Browser goes to Google; Logto gets ID token and userinfo for scopes `openid email profile`: `sub`, email, `email_verified`, name, picture (setup "Google sign-in"; [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)). Stored in the `logto` database on the Cube. Google learns that and when the person signs in to Family Agenda. |
| Role | Google: **independent controller** for its account holders; Google Ireland Limited for EEA users ([privacy policy](https://policies.google.com/privacy?hl=en&gl=de), effective 2026-10-16; `identity-providers.md`). No processing on the Operator's behalf: **no AVV** (own reading **[LAWYER]**). |
| Terms | Google Cloud project / OAuth client under Google's [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) (2024-02-15): a privacy policy that "fully documents how your application interacts with user data", linked in the OAuth client. Limited-use rules apply to Sensitive/Restricted scopes; the three scopes used need brand verification only (setup). |
| Location / transfer | Google's own matter as controller; the privacy policy names "certain legal frameworks" without listing them on the page read. Google's DPF listing **[UNVERIFIED]**. |
| Retention | Google: per its retention page (not read). Operator side: Logto user deleted with the Family (`families.md`). |
| Training | Google's processing as controller; nothing in the policies read about data from Sign in with Google. Operator sends Google nothing but the OAuth request. |

### 9. DNS, domain, certificates

| | |
|---|---|
| IONOS SE (domain, DNS) | Holds the Operator's registrant data and the zone (A, MX, SPF, DKIM, DMARC). No Family data. AVV as §6 for any processing; the Operator's own contract data is IONOS's as controller **[LAWYER]**. |
| Let's Encrypt (ISRG, San Francisco) | Caddy's ACME default. Sees requested domain names, the Cube's IP, validation logs; account email optional, none set in the Caddyfile. Kept "a minimum of two years"; may be processed in the US; providers bound by SCCs ([privacy](https://letsencrypt.org/privacy/), 2026-07-06). Certificates go to CT logs (public). **No Family data**; not a processor of Family data. |
| ZeroSSL | Caddy's documented fallback CA ([automatic HTTPS](https://caddyserver.com/docs/automatic-https)). Since Caddy 2.8 the fallback needs an email or API key; a community report on 2.11 says without email only Let's Encrypt is used **[UNVERIFIED]**, not in official docs. Would see the same: domain names and IP. |

### 10. GitHub Container Registry, Docker Hub

Pulls of public images (core, plugins, Logto from `ghcr.io`; Caddy, Postgres, rclone from Docker Hub) and the tessdata download. GitHub logs "Service Usage Information" incl. IP and request time ([privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), 2026-04-27); controller GitHub, Inc. or GitHub B.V.; transfers under SCCs / DPF. They see the Cube's IP only, **no Family data and no personal data of Families**. Docker Hub's privacy terms not read **[UNVERIFIED]**; same data (IP, image name).

### 11. The Sources' third parties

The plugins connect, through the Egress Proxy, only to the hosts a Family entered in its Source (`compose.yaml`, x-egress-proxy).

| Source | Who is at the other end | Role towards the Operator |
|---|---|---|
| IMAP | The Family's own mail provider (e.g. GMX, Gmail) | The Family's own contract; the provider is controller (or the Family's processor) for the mailbox. It is not engaged by the Operator: **not a sub-processor**. It sees logins from the Cube's IP with the Family's credentials. **[LAWYER]** confirm. |
| ICS | The calendar's host (school site, club, the Family's own cloud) | Same: the publisher's own processing; the Operator only fetches a URL the Family gave. Not a sub-processor. |
| WebUntis | Untis GmbH (Austria) and its regional companies; the **school** is controller, Untis its processor (school notices, e.g. [Nürnberg](https://www.nuernberg.de/imperia/md/berufsschule_12/dokumente/b_12/datenschutzinfowebuntis.pdf); Untis: "Verantwortlicher oder Auftragsverarbeiter" depending on function, [privacy WU apps](https://www.untis.at/en/privacy-policy-wu-apps)). Parents' access is through the school's account (school notices). | The Operator logs in with the parent's credentials as the parent's tool. Not a sub-processor of the Operator. Whether the school's terms of use allow access through a third-party service **[UNVERIFIED]**/**[LAWYER]**. |

## Overview table

| Service | Role | AVV/DPA, where | Data location | Third country + basis | Retention | Training |
|---|---|---|---|---|---|---|
| IONOS Cube (IONOS Cloud GmbH) | Processor | IONOS Cloud AVV v7.4, in terms | DE, `de/fra` | None (sub-processors EU) | Operator's; deletion at contract end | n/a |
| Postgres (self-run on Cube) | — (part of Cube) | — | Cube | — | Until `routing delete`; backups 14 d | n/a |
| Logto (self-run on Cube) | — (part of Cube) | — | Cube | — | User deleted with the Family | n/a; telemetry **[UNVERIFIED]** |
| IONOS Object Storage | Processor | IONOS Cloud AVV | Frankfurt (blobs), Berlin (backups) | None | Noncurrent 14 d; backups 14 d | n/a |
| IONOS AI Model Hub | Processor | IONOS Cloud AVV + AI terms; coverage confirmation **open** | DE, Berlin (docs; written confirmation **open**) | None stated | Content none; metadata period **unpublished** | Prohibited (AI terms §2.3) |
| OCR (Tesseract) | — (in the core) | — | Cube | — | — | — |
| IONOS Mail Basic (IONOS SE) | Processor | AVV in IONOS AGB since 2022-07-19 | EU/EEA (AVV); mailbox site **[UNVERIFIED]** | None stated | Mailbox until deleted | n/a |
| Stripe (Stripe Payments Europe Ltd) | Processor + independent controller | DPA + DTA in SSA §4.1 | US (Stripe, LLC) and worldwide | DPF / SCC / UK IDTA | Per law; return/delete at end | ML for fraud/services (privacy §2.b) |
| Google sign-in (Google Ireland Ltd) | Independent controller | None | Google's | Google's own | Google's | Not stated for sign-in |
| IONOS SE domain/DNS | Processor/controller for contract data | AVV in AGB | EU/EEA | — | — | — |
| Let's Encrypt (ISRG) | Own controller; no Family data | — | US possible | SCC with its providers | ≥ 2 years | — |
| GitHub ghcr.io / tessdata, Docker Hub | Own controller; Cube IP only | — | US | SCC / DPF (GitHub) | GitHub: not stated for anonymous pulls | — |
| IMAP/ICS hosts | Family's own provider, controller | — (not engaged by Operator) | Provider's | Provider's | Provider's | — |
| WebUntis (school + Untis) | School controller, Untis its processor | School–Untis | Untis' | Untis' | School/Untis | — |

## Open points

1. **IONOS reply** to `docs/correspondence/2026-11-ionos-ai-model-hub-request.md`: none filed as of 2026-11-23 (intended use, location incl. failover, metadata retention, AVV coverage).
2. **Stripe sub-processor list** and its DPF listing: not read.
3. **Google's DPF listing**, retention page: not read. Status of CJEU appeal C-703/25 P against the DPF: filed 2025-10-31, notice OJ 2025-12-22 ([EUR-Lex](https://eur-lex.europa.eu/eli/C/2025/6610/oj/eng)); no hearing or judgment found.
4. **IONOS SE** sub-processor list (mail, domain) and the mailbox's data centre: not read / not published.
5. **Logto OSS telemetry**, Caddy telemetry, Docker log rotation on the Cube, bucket encryption at rest: unchecked.
6. **ZeroSSL fallback** in Caddy 2.11 without email: only a community report.
7. **[LAWYER]** Roles: Operator as controller (household exemption, `legal-duties-b2c-eu.md` F9/F10); Google, IMAP/ICS hosts and Untis as not being sub-processors; Stripe's split role in the privacy policy.

## Sources

Repo: `cube/compose.yaml`, `cube/Caddyfile`, `cube/.env.example`, `docs/runbook/setup.md`, `docs/runbook/families.md`, `docs/launch-checklist.md`, the research docs named at the top; public core repo `Dockerfile`, `packages/adapters/src/tessdata-fast-catalog.ts`.

External (read 2026-11-23): IONOS Cloud [sub-processor list 11/2026](https://cloud.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/cloud/avv/IONOS_Cloud_GmbH_Unterauftragnehmer.pdf); Stripe [DPA](https://stripe.com/legal/dpa), [SSA](https://stripe.com/legal/ssa), [privacy](https://stripe.com/privacy); Google [privacy policy](https://policies.google.com/privacy?hl=en&gl=de), [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy); [Let's Encrypt privacy](https://letsencrypt.org/privacy/); [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https); [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement); [Untis privacy WU apps](https://www.untis.at/en/privacy-policy-wu-apps); [EUR-Lex C-703/25 P notice](https://eur-lex.europa.eu/eli/C/2025/6610/oj/eng). Earlier IONOS sources as cited in the linked research docs. Page facts were read through a summarising fetch tool; the IONOS list as raw PDF text.
