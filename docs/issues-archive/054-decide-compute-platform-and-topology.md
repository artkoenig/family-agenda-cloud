# #54 Decide compute platform and topology

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:10Z
- Closed: 2026-11-12T19:28:12Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/54

## Question

On which IONOS compute product do `api`, `worker` and `cleanup` run, in what sizes and counts at 100 Families, and how does that grow to 1000? Covers the build issue [Deploy api, worker and cleanup in multi-Family mode](https://github.com/artkoenig/family-agenda-cloud/issues/25).

---

**Comment by artkoenig, 2026-11-12T19:28:11Z**

## Resolution

**Cheapest setup for now: one IONOS Cube with Docker Compose in Frankfurt, Postgres included as a container.**

- **Platform:** Cubes + Docker Compose, not Managed Kubernetes. For one Operator, best effort and ~100 Families, Kubernetes is overhead. The workloads are stateless apart from Postgres, so moving later stays cheap.
- **Region:** `de/fra`. Berlin (`de/txl`) stays free as a separate site for Operator backups.
- **Availability:** best effort. Accepted: a short gap on each release, hours of outage after a host failure until the Operator recreates the Cube, and IONOS maintenance windows. One instance, no load balancer.
- **Shape at the start:** one **Basic Cube M** (4 vCPU / 8 GB / 240 GB NVMe, 17.52 EUR) plus a reserved IPv4 (5 EUR), **about 22.50 EUR/month** net. One Compose project runs:
  - `api` ×1, `worker` ×1, `cleanup` ×1 (long-running, on its own interval, no host cron)
  - Caddy
  - **Postgres** (control database + one database per Family)
- **Postgres data lives on the Cube's NVMe**, with no extra block volume. The NVMe is on the same physical host as the Cube, so a host loss is recovered only from backup. **Mandatory before registration opens:** continuous WAL archiving + a daily base backup to Object Storage (WAL-G or pgBackRest), with a restore that has been tested. Details go to the backup ticket.
- **Ingress / TLS:** Caddy with Let's Encrypt (HTTP-01) on the one IPv4. The IONOS firewall opens only 80/443 to the world. SSH is key-only, from an allow-listed IP. No ALB, no Certificate Manager.
- **OS:** Debian (newest IONOS image), Docker from Docker's apt repo, `unattended-upgrades` with an automatic reboot at about 04:00, containers on `restart: unless-stopped`.
- **Helpers:** OpenBao and Authentik are not decided here (see the OpenBao/Authentik ticket). The Cube M leaves only modest room. If they move in, step 1 below comes earlier.

### Move to IONOS managed PostgreSQL
Postgres moves to the IONOS managed service at the first of these triggers:
- about **100 paying Families**
- a **second Cube** is needed (growth step 2)
- the Cube's RAM or CPU runs tight

The move is a dump/restore per Family database with a short downtime.

### Growth path to ~1000 Families
1. **Vertical:** recreate on a Memory Cube M/L or a Basic Cube L. Cubes cannot be resized in place.
2. **Workers out:** a second Cube with only `worker`. `FOR UPDATE SKIP LOCKED` + the lease make this safe without a load balancer. Postgres must be managed (or reachable over the network) by then.
3. **`api` on two hosts:** needs an ALB (about 15 EUR + IP). Managed Kubernetes is reconsidered only here.

Triggers to watch:
- sustained CPU or RAM above about 70 %
- oldest overdue Family in the due index older than about 15 minutes
- `api` p95 latency degrading

### Facts behind it
- [IONOS compute research](https://github.com/artkoenig/family-agenda-cloud/blob/main/docs/research/ionos-compute.md), [VPS research](https://github.com/artkoenig/family-agenda-cloud/blob/main/docs/research/ionos-vps.md)
- From the Cubes docs (checked 2026-11-12): the NVMe sits on the Cube's host. Up to 23 extra block volumes can be attached (replicated 4×). Host failure behaviour is not documented. Snapshots cost 0.04 EUR/GB per 30 days.

