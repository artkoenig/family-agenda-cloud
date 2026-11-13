# IONOS platform services around the workloads

Research for issue #50 (map #46; context #27, #30). Sources read 2026-11-12. Facts only; this note decides nothing. Items marked **[UNVERIFIED]** could not be confirmed from a primary source and need a check before anything depends on them.

## Question

What does IONOS Cloud offer around compute and data, and how good is it: Terraform / OpenTofu provider coverage, DNS and its API, TLS certificates, monitoring and logging services, mail sending, a secrets or key management service (or none, so OpenBao is self-run), data processing agreement and certifications, support and status history relevant to a one-person Operator?

## Short answer

- **Covered by IONOS, managed, as code:** compute, Managed Kubernetes, DBaaS PostgreSQL (v1 and v2), Object Storage, Cloud DNS (API, DNSSEC), ACME certificates through Certificate Manager, and Grafana-based Logging and Monitoring Services in Berlin and Frankfurt. The Terraform provider is released about every two weeks and is also in the OpenTofu registry.
- **Not offered:** a managed KMS or secrets manager (no wrap/unwrap service, no SSE-KMS, no cloud auto-unseal) so OpenBao is self-run; a transactional mail service so mail codes need an external sender or a self-run MTA.
- **Gaps in the provider:** no resources for AI Model Hub, API tokens, the Tracing Service, or v2 PostgreSQL databases and users. API tokens live at most 90 days.
- **Paperwork:** the Art. 28 processing agreement is part of the terms, sub-processors under general authorisation with a 14-day objection right. C5:2020 is Type 1 only (2026-05). The BSI ISO 27001 / IT-Grundschutz certificate names Compute Engine, Object Storage and Managed Kubernetes, not DBaaS, DNS or AI Model Hub.
- **Operations:** 24/7 support with < 1 h response on malfunctions is included, but the status page shows frequent incidents in October and November 2026 (Managed Kubernetes, compute network, DNS resolution, AI Model Hub API) and weeks of degraded phone support.
- **No hard blocker found** for the platform services. One point to clear before relying on AI Model Hub from a worker: the AI terms define scripted or automated use as misuse unless the service description provides for it (see Open points).

## Terraform / OpenTofu provider coverage

Provider `ionos-cloud/ionoscloud`.

| Fact | Value | Source |
| --- | --- | --- |
| Latest version | v6.7.41, released 2026-11-10; previous releases 10-28, 10-13, 09-28, 09-09, 08-26 | https://github.com/ionos-cloud/terraform-provider-ionoscloud/releases |
| Terraform registry | 6.7.41, tier `partner-premier`, about 6.5 M downloads | https://registry.terraform.io/providers/ionos-cloud/ionoscloud |
| OpenTofu registry | lists 170 versions including 6.7.41 | https://registry.opentofu.org/v1/providers/ionos-cloud/ionoscloud/versions |
| Open issues | 8, among them #695 (destroy of a `dbaas_pgsql` cluster returns internal server error, open since 2024-10), #885 (no resource for token management), #772 (no bucket replication), #836 (`container_registry_token` 502/504) | https://github.com/ionos-cloud/terraform-provider-ionoscloud/issues |
| Authentication | `IONOS_TOKEN` recommended; Object Storage through `IONOS_S3_ACCESS_KEY` / `IONOS_S3_SECRET_KEY`; DNS, logging and monitoring resources accept tokens only | https://docs.ionos.com/cloud/tools-terraform/docs/index |

Resources per product (list in `docs/resources` of the repository, https://github.com/ionos-cloud/terraform-provider-ionoscloud/tree/master/docs/resources):

| Product | Resources | Note |
| --- | --- | --- |
| Compute and network | `server`, `vcpu_server`, `cube_server`, `volume`, `nic`, `lan`, `datacenter`, `ipblock`, `firewall`, `nsg`, `natgateway`, `networkloadbalancer`, `application_loadbalancer`, `target_group`, `autoscaling_group`, VPN gateways | complete |
| Managed Kubernetes | `k8s_cluster`, `k8s_node_pool` | complete |
| Container registry | `container_registry`, `container_registry_token` | issue #836 |
| DBaaS PostgreSQL v1 | `dbaas_pgsql_cluster`, `dbaas_pgsql_database`, `dbaas_pgsql_user` | issue #695 |
| DBaaS PostgreSQL v2 | `pg_cluster_v2` (backup location and retention, connection pooler, `logs_enabled`, `metrics_enabled`), data sources for versions and backups, a v1 to v2 migration guide | no v2 database or user resource in the list: with one database per Family these are created another way (SQL, API) |
| Object Storage | `s3_bucket`, `_policy`, `_lifecycle_configuration`, `_versioning`, `_server_side_encryption_configuration`, `_public_access_block`, `_object_lock_configuration`, `_cors_configuration`, `s3_object`, `s3_key`, `object_storage_accesskey` | no replication resource (#772); several regions need provider aliases |
| Cloud DNS | `dns_zone`, `dns_record`, `dns_reverse_record`, `dns_zone_dnssec` | complete |
| Certificate Manager | `certificate_manager_certificate`, `auto_certificate_provider`, `auto_certificate` | complete |
| Observability | `logging_pipeline`, `monitoring_pipeline` | no Tracing Service resource |
| AI Model Hub | none | used with an API token only; nothing to provision besides the token |
| API tokens | none (#885) | tokens are created in the DCD or through the Auth API; TTL choices are 1 hour to 90 days, so any long-running token needs rotation at least every 90 days (https://docs.ionos.com/cloud/set-up-ionos-cloud/management/identity-access-management/token-manager) |
| KMS / secrets | none | no such product, see below |

State backend:

- IONOS has no Terraform state service. Its docs show the S3 tooling pointed at IONOS Object Storage endpoints with `skip_region_validation`, `skip_credentials_validation` and similar flags (https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/s3-tools/awsterraform/awsterraform-configure). The same flags apply to the `s3` state backend.
- Bucket versioning and object lock are supported (https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/s3-api-compatibility).
- **[UNVERIFIED]** State locking with `use_lockfile` needs S3 conditional writes (`If-None-Match`). The compatibility page does not mention them. Needs a test against a bucket. With a single Operator, an unlocked state is a small risk.

Other IaC tooling documented by IONOS: `ionosctl`, Ansible module, Crossplane provider, SDKs (https://docs.ionos.com/cloud/llms.txt).

## DNS and API

Sources: https://docs.ionos.com/cloud/network-services/cloud-dns/overview, https://docs.ionos.com/cloud/network-services/cloud-dns/overview/features-benefits, https://docs.ionos.com/cloud/support/general-information/service-catalog.

- Cloud DNS hosts primary and secondary zones with the usual record types (A, AAAA, CNAME, MX, TXT, ...), zone import and export, and reverse DNS (PTR) for IPv4 and IPv6 addresses of the contract.
- DNSSEC is supported (API and `dns_zone_dnssec`).
- REST API: https://docs.ionos.com/cloud/api-reference/network-services/cloud-dns. Token authentication only.
- Name servers are served from 14 points of presence in Europe and the USA. SLA for the name servers: 99.995 % per month (https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/service-level-agreement/, Stand 08/2026).
- Domain registration is not part of IONOS Cloud. The domain is registered at any registrar and delegated to the four name servers a zone gets (https://docs.ionos.com/cloud/network-services/cloud-dns/api-how-tos/connect-domain-name-to-cloud-dns).
- **[UNVERIFIED]** cert-manager or external-dns webhooks for IONOS Cloud DNS: not checked. Certificate Manager covers the DNS-01 case without them (next section).

## TLS certificates

Sources: https://docs.ionos.com/cloud/security/certificate-manager/overview, https://docs.ionos.com/cloud/security/certificate-manager/api-how-tos/create-auto-certificate.

- Certificate Manager stores uploaded certificates and issues **Auto Certificates** over ACME. The ACME server is configurable (Let's Encrypt in the examples, optional external account binding).
- Validation is DNS-01: the service sets the TXT records itself, so it works only for domains whose zone is in IONOS Cloud DNS. Wildcards are supported.
- Limits: 50 Auto Certificates, 10 SANs each. Renewal starts 30 days before expiry.
- Certificates attach to the Application Load Balancer, CDN and API Gateway (service catalog). A Kubernetes ingress controller inside the cluster does not read from Certificate Manager; there the usual route is cert-manager, which IONOS lists as a common add-on but does not manage (https://docs.ionos.com/cloud/containers/managed-kubernetes/kubernetes-faq).

## Monitoring and logging services

Sources: https://docs.ionos.com/cloud/observability/ (Logging Service, Monitoring Service, Tracing Service pages), service catalog, SLA.

| Service | What it is | Ingest | Limits and billing | Terraform |
| --- | --- | --- | --- | --- |
| Logging Service | Fluent Bit to Loki with a managed Grafana | Kubernetes, Docker, systemd, HTTP JSON, generic TCP, OTLP logs | 50 HTTP requests/s and about 10,000 records/s per pipeline; retention configurable; billed per pipeline-hour plus Object Storage GB | `logging_pipeline` |
| Monitoring Service | Mimir with a managed Grafana per contract and region | Prometheus remote-write, OTLP metrics | billed per million ingested samples plus storage GB; 10 pipelines per contract | `monitoring_pipeline` |
| Tracing Service | OTLP-native traces, viewed in Grafana | OTLP over HTTP or gRPC | managed by API | none |
| Activity Log | audit trail of IaaS API actions | n/a | API only, 35 days retention | none |
| Monitoring as a Service (old) | CPU, network, storage alarms for VMs | n/a | limited support since 2024-09-01 | n/a |

- Regions include Berlin (`de/txl`) and Frankfurt (`de/fra`); endpoints `logging.de-txl.ionos.com`, `monitoring.de-txl.ionos.com` and the `de-fra` equivalents.
- Alerting is configured in the managed Grafana (alert rules and contact points). IONOS has no separate paging or on-call product.
- "Central Logging" and "Central Monitoring" forward logs and metrics of IONOS products (for example DBaaS) into the same Grafana, activated per region. There are predefined DBaaS dashboards and a tutorial for PostgreSQL v2 clusters.
- SLA: 99.5 % per month for Logging, Monitoring and Tracing (SLA §11a to §11c).
- The docs disagree on the number of logging pipelines per contract (5 in the service catalog, 10 on the billing page). One or two are needed here.
- **[UNVERIFIED]** Prices: on https://cloud.ionos.com/prices, not read.
- The managed Grafana runs on the platform it watches. An alert that IONOS itself is down has to come from outside (status page subscription, an external uptime check).

## Mail sending

- The IONOS Cloud documentation index (https://docs.ionos.com/cloud/llms.txt, 7225 pages) has no transactional mail or SMTP relay product. The only mail-related page is a tutorial on reverse DNS, SPF and DKIM records for a self-run mail server (https://docs.ionos.com/cloud/tutorials/network-services/cloud-dns/reversedns).
- IONOS blocks outbound port 25 by default and opens it on request through support, according to a help article written for Cloud Panel servers (https://www.ionos.com/help/server-cloud-infrastructure/firewall-policies/unblocking-port-25-for-sending-emails/). **[UNVERIFIED]** whether this applies to Compute Engine and Managed Kubernetes nodes.
- Consequence: Authentik's mail codes and any transactional mail go through an external mail service over submission port 587 / 465, or through a self-run MTA with PTR, SPF and DKIM set in Cloud DNS. Mail codes carry no Family content, so the placement rule of map #46 allows an EU mail service. Mail that would carry Family content (digests, reminders with Task titles) falls under the rule that Family content stays at IONOS and would need the self-run route or a decision.

## Secrets and key management

- **No managed KMS, secrets manager or Vault-like service.** The documentation index has no such product. Entries that sound similar are something else: Object Storage "Key Management" is access keys, "SSH Key Manager" stores public SSH keys, "KMS for Windows guests" is Microsoft licence activation.
- Object Storage server-side encryption is SSE-S3 (keys managed by IONOS, AES-256) or SSE-C (key supplied with each request). There is no SSE-KMS (https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/overview/features-benefits).
- The Terraform provider has no KMS or secrets resource.
- Consequence for #27: the transit-style wrap/unwrap of Family master keys needs a self-run OpenBao (or Vault). Its auto-unseal cannot use an IONOS service; the options are Shamir key shares entered by hand, a second OpenBao as transit unseal, or a KMS outside IONOS. An external KMS would hold only the unseal key, no Family content.
- IONOS offers Confidential VMs (own SLA section, no live migration, reboot on every maintenance). Not researched further.

## Data processing agreement and certifications

Processing agreement (https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/enterprise-datenschutzpaket/, "Vereinbarung zur Auftragsverarbeitung für IONOS Cloud", Version 7.4, Stand 06/2023):

| Point | Content |
| --- | --- |
| Conclusion | part of the terms for the booked products (§12; AGB §10.6, https://cloud.ionos.de/terms-gtc/). No separate signature described. |
| Location | EU / EEA, "unless a transfer to third countries is required to provide the service" (§4.3); the customer picks the data centre location |
| Sub-processors | general authorisation; list in a linked PDF (**[UNVERIFIED]**, not read); information on changes, objection only for good cause within 14 days (§10) |
| TOMs | annex PDF `IO-SE_DE_AVV_Anlage2_TOM_v6.1.2`; descriptive, may change while keeping the Art. 32 level (§8) |
| Breach notice | "without undue delay", no hour figure (§5.5) |
| Audits | ISO 27001 certificate "as a rule sufficient"; on-site inspection on reasonable doubt or incident (§9) |
| End of contract | deletion or return at the customer's choice; deletion is the default (§5.7) |

The agreement speaks of IaaS and PaaS in general; it names no single product. AI services have extra terms (https://cloud.ionos.de/terms-gtc/ki-dienste/): input and output are used only to provide the service, for technical security and troubleshooting; use for training or further development of models is prohibited (§2.3). These terms state no processing location; the service catalog lists AI Model Hub availability as "Global". **[UNVERIFIED]** that inference runs in Germany only; this is the reason IONOS was picked in map #46 and needs the AI Model Hub product page or a written statement.

Certifications (https://cloud.ionos.de/zertifikate, service catalog):

| Certificate | Status | Scope |
| --- | --- | --- |
| BSI C5:2020 | Type 1 attestation, received 2026-05-28, auditor PwC | 33 services in 10 clusters; list not public, report on request. Type 1 covers design at a point in time, not operating effectiveness over a period. |
| ISO/IEC 27001 on the basis of IT-Grundschutz | BSI-IGZ-0730-2025, valid to 2028-09-13 | Compute Engine, Object Storage, Managed Kubernetes in Germany (own and co-location data centres in Berlin and Frankfurt). DBaaS, Cloud DNS, AI Model Hub are not named. |
| ISO/IEC 27001 (group) | TÜV NORD | IONOS group |
| SOC 2 | none on the IONOS page | only the co-location operator of Frankfurt (Equinix) holds SOC 1/2 |

- Data centres: Berlin `de/txl` is operated by IONOS; Frankfurt `de/fra` sites are co-locations (Equinix, Digital Realty) (service catalog).
- Object Storage region `eu-central-3` (Berlin): "BSI IT Grundschutz certification ... is currently pending" (https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/overview/endpoints).

SLA (https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/service-level-agreement/, Stand 08/2026), monthly availability:

| Product | Target |
| --- | --- |
| Compute Engine, Block Storage; DBaaS PostgreSQL and container registry follow the Compute Engine terms | 99.95 % |
| Managed Kubernetes control plane API | 99.95 % |
| Object Storage | 99.5 % |
| Cloud DNS name servers | 99.995 % |
| Logging, Monitoring, Tracing | 99.5 % |
| AI Model Hub | 99.9 % |
| DCD and Cloud API | 99.5 %, target only, no credits |

Remedy is a credit against future invoices, claimed within two weeks after the billing month. Planned maintenance with downtime is capped at four hours per quarter with two working days notice.

## Support and incident history

Support (https://docs.ionos.com/cloud/support/ionos-cloud-support-agreement/ionos-cloud, SLA §17):

- 24/7/365 phone and e-mail support is included at no charge. Response time: malfunction < 1 hour, service or information request < 72 hours.
- Support staff cannot log in to customer resources. IONOS maintains the status page and provides "Reason for Outage" documents.
- **[UNVERIFIED]** paid support tiers: none found, not searched exhaustively.

Status page (https://status.ionos.cloud/, history feed read back to 2026-09-29; subscription by e-mail, SMS, webhook, Atom/RSS):

| Date (2026) | Incident |
| --- | --- |
| 10-28 to ongoing on 11-12 | network connectivity issues for some newly created, restarted or migrated servers; Compute shown as degraded in 11 locations including Frankfurt and Berlin |
| 10-30 | DNS resolution issue causing intermittent access problems across several cloud services; fixed within about 10 minutes |
| 10-27 | provisioning limited for about 2 hours |
| 10-16 | Managed Kubernetes performance degradation, about 6 hours |
| 10-14 | Managed Kubernetes volume attachment and node provisioning degraded |
| 10-07 / 10-08 | packet loss in Berlin (TXL) |
| 10-02 | DCD unavailable for about 1 h 12 min |
| 09-29 | Kubernetes control-plane connectivity degraded about 4.5 hours; AI Model Hub API unavailable about 2.5 hours |
| 10-02 to 11-12, repeatedly | phone support degraded (10-02 to 10-07, 10-14 to 10-15, 10-22 to 11-03, 11-07 to 11-09, from 11-10), reason given: staff shortage due to sickness |

- Scheduled maintenance of Cloud API, DCD, Managed Kubernetes and provisioning appears several times a month.
- Product lifecycle is pushed on customers: new PostgreSQL 14 clusters disabled on 2026-10-19; MongoDB v1 to v2 migration forced 2026-11-16 to 11-20. PostgreSQL has a v1 and a v2 API with a migration guide, so a forced PostgreSQL migration at some point is plausible. New clusters should start on v2.
- The platform is actively developed (https://docs.ionos.com/cloud/release-notes/november-2026).

Reading for a one-person, best-effort Operator: six weeks of history contain about eight customer-visible incidents, most of them partial and short, two touching Managed Kubernetes for hours. Nothing in the history shows data loss. The free 24/7 support is real on paper but the phone line was degraded for roughly half of the period.

## Open points

1. **AI terms, automated use.** The AI terms say the services are "intended for interactive use by a natural person, unless the service description expressly provides otherwise" (§2.5) and list scripted, automated or repetitive use as misuse (§2.6), with an exception for use the service description provides for (§2.8). AI Model Hub is an API product, so the exception very likely applies, but the service description was not read. Check before the `worker` depends on it; also check rate limits.
2. **AI Model Hub data location.** Confirm in writing that inference and any logging stay in Germany.
3. **Sub-processor list and TOM annex.** Read the two PDFs linked from the processing agreement; the list feeds the service's own privacy notice.
4. **C5 report.** Ask whether DBaaS PostgreSQL, Object Storage in `eu-central-3`, Cloud DNS and AI Model Hub are among the 33 attested services; ask when Type 2 is due.
5. **State locking.** Test `use_lockfile` against an IONOS bucket.
6. **Mail.** Pick an EU mail service or a self-run MTA; if self-run, confirm the port 25 policy for Compute Engine.
7. **OpenBao unseal.** Decide between manual Shamir unseal (downtime after every node restart until the Operator acts, which matters with best-effort operations and frequent host maintenance) and an auto-unseal anchor outside IONOS.
8. **PostgreSQL v2 databases and users.** Decide how the database per Family is created, since the provider has no v2 resource for it.
9. **Token rotation.** API tokens expire after at most 90 days; CI and any in-cluster component using the Cloud API (DNS-01, autoscaling) need a rotation routine.
10. **Prices** for Logging and Monitoring were not read.
11. **External alerting path** for the case that IONOS itself is degraded.
