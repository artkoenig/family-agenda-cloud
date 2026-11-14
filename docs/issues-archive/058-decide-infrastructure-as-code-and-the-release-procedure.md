# #58 Decide infrastructure as code and the release procedure

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:21Z
- Closed: 2026-11-13T09:20:37Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/58

## Question

How is the infrastructure described and applied (tool, state, secrets), from where do releases roll out, and what is the rollback, for one person without on-call?

---

**Comment by artkoenig, 2026-11-13T08:50:48Z**

Input from [Choose and register the domain](https://github.com/artkoenig/family-agenda-cloud/issues/52): `family-agenda.cloud` is registered at IONOS SE (IONOS default name servers for now). The IaC here should cover the IONOS Cloud DNS zone and records (apex, `app.`, `auth.`, SPF/DKIM/DMARC), delegating the name servers and turning on DNSSEC, and the rotation of the Cloud DNS token (90 days at most).

---

**Comment by artkoenig, 2026-11-13T09:20:36Z**

## Resolution

**Simplest start, little work for the Operator, no rollback.** Expanded later only when needed.

- **Infrastructure:** no infrastructure as code for now. The Cube, reserved IPv4, firewall (80/443 open, SSH from an allow-listed IP) and Object Storage buckets are set up by hand in the DCD once, following a short runbook in this repo (`docs/runbook/setup.md`). The same runbook is the way to recreate everything after a host loss.
- **DNS:** the zone stays at IONOS SE, where `family-agenda.cloud` is registered, on its default name servers. Records (A for apex, `app.`, `auth.`; mail records once the sender is decided) are entered there by hand. No Cloud DNS, no delegation, no DNSSEC for now. This replaces the plan in the input comment from [Choose and register the domain](https://github.com/artkoenig/family-agenda-cloud/issues/52).
- **Host:** a one-time `bootstrap.sh` over SSH installs Docker (Docker's apt repo), `unattended-upgrades` with an automatic reboot at about 04:00, SSH with keys only, and the directory for the Compose project.
- **Secrets:** a root-only `.env` on the Cube, with the master copy in the Operator's password manager. No SOPS. The Operator key file is copied by hand once per Cube, as in [Decide where OpenBao and Authentik run](https://github.com/artkoenig/family-agenda-cloud/issues/56).
- **Release:** `compose.yaml` in this repo pins the image version (`ghcr.io/artkoenig/family-agenda:X.Y.Z`). `deploy.sh`, run from the Operator's laptop, copies the Compose project to the Cube with `rsync` and runs `docker compose pull && docker compose up -d`. `api` migrates on start. No CI, no automatic rollout.
- **Rollback:** none. Errors are fixed forward. An older image refuses an already migrated database anyway ([Decide migrations as stable API (1.5)](https://github.com/artkoenig/family-agenda-cloud/issues/12)). Damaged data or a host loss is restored from backup: [Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59).
- **Tokens:** the AI Model Hub token (90 days at most) is rotated by hand every 80 days with a calendar reminder. No dedicated IONOS user for now.

### Later, when needed
OpenTofu (`ionoscloud` provider, state in a versioned bucket), Cloud DNS with delegation and DNSSEC, SOPS + age for secrets, deploying from CI, a restore point marked before each release, a dedicated IONOS user owning the token. Kept in the map's Not yet specified.
