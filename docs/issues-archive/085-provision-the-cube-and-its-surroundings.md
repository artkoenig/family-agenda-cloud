# #85 Provision the Cube and its surroundings

- State: CLOSED (COMPLETED)
- Labels: wayfinder:task
- Created: 2026-11-14T14:13:23Z
- Closed: 2026-11-14T16:11:12Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/85

## Question

Task (HITL). By hand following [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58): Basic Cube M in `de/fra`, static IPv4, firewall (80/443, allow-listed SSH), DNS records for apex, `app.` and `auth.` at IONOS SE, buckets in Frankfurt and Berlin, mailbox `no-reply@family-agenda.cloud`, a new AI Model Hub token (the old one expired 2026-11-13). Answer records IP, bucket names, where secrets are kept, and the runbook written while doing it.

---

**Comment by artkoenig, 2026-11-14T16:11:11Z**

## Resolution

Provisioned by hand on 2026-11-14, following `docs/runbook/setup.md` (in the working tree, not committed yet).

| Thing | Fact |
|---|---|
| Virtual data center | `family-agenda`, Frankfurt (`de/fra`), no default network security group |
| Cube | `cube-1`, Basic Cube M: 4 vCPU, 8 GB RAM, 237 GB disk, Debian 13 (trixie) |
| Reserved IPv4 | `85.215.67.239` (`family-agenda-cube`), on the NIC with **DHCP on** |
| IPv6 | none; no AAAA records |
| SSH | `ssh -i ~/.ssh/id_ed25519_family_agenda_cloud root@85.215.67.239`, key only, password login off |
| NIC firewall (ingress, IPv4) | TCP 80 and 443 from anywhere, TCP 22 from the Operator's home IP only |
| DNS (IONOS SE) | A records `@`, `app`, `auth` → `85.215.67.239`; parking records removed; no `www`; MX, SPF, DMARC untouched |
| Blob bucket | `family-agenda-cloud-blobs`, Frankfurt `eu-central-4`, contract-owned |
| Backup bucket | `family-agenda-cloud-backup`, Berlin `eu-central-3`, contract-owned |
| Object Storage access key | one key, in the password manager |
| AI Model Hub token | `~/.config/ionos/ai-model-hub.token`, mode 600, expires 2027-11-14 |

Checked from the Operator's laptop: SSH login works, the three names resolve at the authoritative name server, port 80 answers "refused" (firewall open, nothing listening yet), both buckets answer 403 to anonymous requests, the token gets 200 from `/v1/models`.

Not checked:
- Versioning and the lifecycle rules on `family-agenda-cloud-blobs` (needs the access key).
- That SSH from other source addresses is refused.

Not done:
- **Mailbox `no-reply@family-agenda.cloud`.** The domain contract (300566589) offers only Mail Business, Exchange or a forwarding; no Mail Basic mailbox is included. A second mail contract (300571918) without a domain exists; what it is was not examined. Left out for the trial; the map carries it as fog.

Learned:
- With DHCP off on the NIC the Debian image gets no address and the Cube is unreachable, although the reserved IP shows on the NIC.
- An image cannot be set after provisioning; the Cube has to be deleted and created again.

