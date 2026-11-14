# #50 Research IONOS platform services around the workloads

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-12T08:54:59Z
- Closed: 2026-11-12T09:04:29Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/50

## Question

What does IONOS offer around compute and data, and how good is it: Terraform / OpenTofu provider coverage for the products above, DNS and its API, TLS certificates, monitoring and logging services, mail sending, a secrets or key management service (or none, so OpenBao is self-run), data processing agreement and certifications, support and status history relevant to a one-person Operator?

---

**Comment by artkoenig, 2026-11-12T09:04:28Z**

Resolution (sources read 2026-11-12):

- **Managed and as code:** compute, Managed Kubernetes, DBaaS PostgreSQL (v1 + v2), Object Storage, Cloud DNS (API, DNSSEC), ACME certificates via Certificate Manager (zone must be in Cloud DNS), Grafana-based Logging / Monitoring / Tracing in Berlin and Frankfurt. Provider `ionos-cloud/ionoscloud` v6.7.41, release about every 2 weeks, also in the OpenTofu registry.
- **Not offered:** managed KMS / secrets (no wrap/unwrap, no SSE-KMS, no auto-unseal anchor) so OpenBao is self-run; transactional mail so mail codes need an external EU sender or a self-run MTA.
- **Provider gaps:** no resources for AI Model Hub, API tokens (max TTL 90 days), Tracing, PostgreSQL v2 databases/users. State in an IONOS bucket works; lockfile locking unverified.
- **Paperwork:** Art. 28 agreement is part of the terms (v7.4, sub-processors under general authorisation, 14-day objection). C5:2020 Type 1 only (2026-05). BSI ISO 27001 / IT-Grundschutz scope names Compute, Object Storage, Managed Kubernetes, not DBaaS, DNS, AI Model Hub.
- **Operations:** 24/7 support included (< 1 h on malfunctions), but about eight incidents in six weeks (Managed Kubernetes, compute network, DNS resolution, AI Model Hub API) and phone support degraded for weeks.
- **No hard blocker.** To clear: AI terms treat automated use as misuse unless the service description provides for it; AI Model Hub data location in Germany not confirmed in the terms.

Details and open points: `docs/research/ionos-platform-services.md`

