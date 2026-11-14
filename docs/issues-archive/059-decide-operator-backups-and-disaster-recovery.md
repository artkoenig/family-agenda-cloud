# #59 Decide Operator backups and disaster recovery

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:24Z
- Closed: 2026-11-13T09:23:34Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/59

## Question

What does the Operator back up (Family databases, control database, blobs, Authentik media; the Operator key file only as offline copies), where to, how long kept, and what loss and downtime are accepted? What is the tested way back after losing the Postgres cluster, the bucket, the Cube or the Operator key file?


---

**Comment by artkoenig, 2026-11-13T09:23:32Z**

## Resolution

Simple setup on top of [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54) (WAL archiving mandatory before registration opens, Berlin reserved for backups) and [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58) (runbooks, no rollback).

### What and where
1. **Postgres** (control, Family and Authentik databases in one instance):
   - **WAL-G**, built into our own Postgres image (`FROM postgres:17` plus the `wal-g` binary).
   - Continuous WAL archiving with `archive_timeout` 5 min, plus a daily base backup at 03:00 from a small cron container.
   - **Target:** a contract-owned bucket in **Berlin** (`eu-central-3`), a different site from the Cube in Frankfurt.
   - WAL-G encryption (libsodium) on top; its key is kept in the Operator's password manager next to the Operator key.
2. **Blobs:** no copy; they stay in IONOS Object Storage (Frankfurt). Versioning on, old versions deleted after 14 days, against app bugs and accidental deletes.
3. **Authentik:** only its database (covered by item 1). No media volume; brand assets live in the repo.
4. **Config:** `compose.yaml` and the scripts are in the repo. `.env` and the Operator key file are in the password manager, and the key file is also on paper ([Decide where OpenBao and Authentik run](https://github.com/artkoenig/family-agenda-cloud/issues/56)). Nothing else to back up.

### Retention
14 days of base backups and WAL. For the privacy text: a deleted Family's data stays in backups for up to 14 days after its final deletion.

### Accepted loss and downtime
At most about 5 minutes of data loss. Downtime best effort, a few hours after losing the Cube.

### Way back (one runbook, `docs/runbook/restore.md`)
- **Cube lost:** new Cube from the setup runbook, `bootstrap.sh`, `deploy.sh`, `wal-g backup-fetch` plus WAL replay, then start.
- **Bad data or bad release:** point-in-time restore of the whole instance to a chosen time.
- **One Family only:** point-in-time restore into a temporary container, `pg_dump` that one database, restore it into the live instance.
- **Blob bucket lost:** accepted risk; attachments are gone, the database stays intact.
- **Operator key file lost:** restore from the password manager or paper; without both, every Family is lost, hence two offline copies.

### Testing
One restore drill before registration opens (launch readiness in the map), then after every change to the backup setup. An alert on a stale base backup or WAL archive belongs to [Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64).
