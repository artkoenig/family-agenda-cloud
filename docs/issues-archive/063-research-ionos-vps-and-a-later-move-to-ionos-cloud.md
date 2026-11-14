# #63 Research IONOS VPS and a later move to IONOS Cloud

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-12T10:01:33Z
- Closed: 2026-11-12T10:10:44Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/63

## Question

Can the hosted service start on one IONOS VPS (ionos.de hosting, Cloud Panel) running everything self-run (`api`, `worker`, `cleanup`, PostgreSQL with one database per Family, OpenBao, Authentik, reverse proxy), and how does it move to IONOS Cloud (DCD) later? Find: regular prices after promo and the sizes that fit; whether a German data center can be chosen; contract and DPA (which IONOS entity, AVV, sub-processors); snapshots/backups offered; API or Terraform support; private network; whether a VPS can reach the AI Model Hub and IONOS Object Storage; any documented migration path from VPS to IONOS Cloud (image export/import, IP keeping, same contract or not), and otherwise what a move by hand looks like. Compare against one Cube from [Research IONOS compute for the three workloads](https://github.com/artkoenig/family-agenda-cloud/issues/47).

---

**Comment by artkoenig, 2026-11-12T10:10:43Z**

## Resolution

Technically possible, but not worth it (details: `docs/research/ionos-vps.md`).

- VPS L+ (4 vCPU / 8 GB / 240 GB NVMe): 18.49 EUR/month net after a 3-month promo, plus 10 EUR setup; likely 12-month term per IONOS SE AGB (not verified for VPS). Only about 4 EUR/month cheaper than one Basic Cube M (22.52 EUR net incl. IP), which has no setup fee, no term and per-minute billing.
- Different company and contract: VPS is IONOS SE (AVV v1.4, EU/EEA only); Cubes, Object Storage and AI Model Hub are IONOS CLOUD GmbH. The AI Model Hub needs the IONOS Cloud contract anyway, so a VPS start means two contracts, two AVVs, two consoles.
- Germany only partly confirmed (product page says "EU, USA und Großbritannien"); platform operation and support by Arsys (Spain).
- AGB commit to 99 % per year, no credits; one physical host; backups are the customer's duty. No VPS API or Terraform coverage found.
- No documented migration to IONOS Cloud (DCD): no image export, IPs bound to the data centre. Move by hand: new Cube via Terraform, restore from own backups (kept in IONOS Cloud Object Storage), switch DNS.
- Recommendation for the compute decision: skip the VPS; the cheapest start is one Cube in DCD (Basic Cube M or Memory Cube M) with Docker Compose. VPS only if no IONOS Cloud contract is possible.
