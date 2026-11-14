# #56 Decide where OpenBao and Authentik run

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:16Z
- Closed: 2026-11-12T20:23:20Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/56

## Question

The key service holds the Operator key; losing it loses every Family. Where do OpenBao and Authentik run, how is OpenBao unsealed after a restart with nobody on call, and where do their own data live? Covers [Object storage, key management and identity providers](https://github.com/artkoenig/family-agenda-cloud/issues/27).

---

**Comment by artkoenig, 2026-11-12T20:23:18Z**

## Resolution

**No OpenBao. Authentik stays, on the same Cube.**

### Operator key: file, not OpenBao
- On one Cube, OpenBao (with the static seal it would need, since nobody is on call for an unseal) adds almost no protection. Root on the Cube gets the seal key plus the database. A compromised `api` can unwrap every Family key, and Family keys cannot be rotated, so the damage equals a stolen Operator key. What it would add is an audit log and convenience on rotation. Against that stand one more stateful service, a seal key, token renewal and a longer recovery chain.
- **The Operator key is a root-only file on the Cube**, handed only to `api`/`worker`/`cleanup` as a Compose secret. It is never in Postgres, Object Storage backups, Terraform state or the repo.
- The file holds **key versions**. Rotation adds a version, rewraps every wrapped Family key, then drops the old one.
- **Offline copies:** the password manager, plus paper at a second place. Recovery after losing the Cube: restore from backup, put the file back from an offline copy. Losing every copy means losing every Family. That is accepted.
- **Public code:** `KeyWrapper` port with a file adapter, tracked in [Wrap Family master keys with a versioned Operator key file](https://github.com/artkoenig/family-agenda/issues/357). An external key service (OpenBao, KMS, HSM) can come later behind the same port, for example once there is a separate host or an audit log is needed.
- This partly changes [Decide protection of Family keys and data at rest](https://github.com/artkoenig/family-agenda-cloud/issues/23): the `KeyWrapper` port stays, OpenBao/Vault transit goes. The rule in [Decide Recovery Kit in hosted operation](https://github.com/artkoenig/family-agenda-cloud/issues/17) ("Operator key never in databases or backups") holds as written.

### Authentik
- It runs as server + worker containers in the same Compose project on the Basic Cube M. It is a single instance, best effort: if it fails, only mail sign-in fails, and Google keeps working. Measure RAM once it runs (it needs about 2 GB). If RAM is tight, move to a Memory Cube M.
- It moves in only after [Test Authentik for mail sign-in](https://github.com/artkoenig/family-agenda-cloud/issues/45) passes.
- **Data:** its own `authentik` database in the same Postgres container, covered by WAL archiving and the base backup. Its media volume goes into the Operator backup. It needs about 50 % more Postgres connections since 2025.10 (no Redis any more). Count them in [Decide Postgres hosting and cluster capacity](https://github.com/artkoenig/family-agenda-cloud/issues/55).
- **Exposure:** public behind Caddy on its own subdomain (for example `login.<domain>`). Caddy blocks the admin paths (`/if/admin`, admin API). Admin work goes through an SSH tunnel. For emergencies use `ak create_recovery_key` through `docker exec`.
- **Mail sender** for the mail code: still open, together with transactional mail.

### Facts
- OpenBao docs: built-in static seal (key from `file://`/`env://`). PostgreSQL storage is recommended over Raft for newcomers.
- Authentik 2025.10 release notes: Redis removed. Docker Compose install docs: 2 vCPU / 2 GB.

