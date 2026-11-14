# #55 Decide Postgres hosting and cluster capacity

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:13Z
- Closed: 2026-11-13T09:01:03Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/55

## Question

[Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54) puts Postgres as a container on the one Basic Cube M (8 GB, data on the NVMe) at the start, and moves it to IONOS managed PostgreSQL at the first trigger (about 100 paying Families, a second Cube, or a tight Cube). Two things remain to decide here:

1. **Start:** how the Postgres container is set up. Version, memory settings within 8 GB shared with the app, `max_connections` and the connection budget (Instance pools of 1–2 connections), and how many Family databases one instance can carry.
2. **After the move:** managed cluster size, how many Family databases per cluster and when a second cluster is added, where the control database lives, the connection budget against the 989-connection ceiling, and the procedure and downtime of the move (dump/restore per Family).

Covers [Provision and remove a database per Family](https://github.com/artkoenig/family-agenda-cloud/issues/26).


---

**Comment by artkoenig, 2026-11-13T07:43:29Z**

No longer blocked by [Try a Family database lifecycle on IONOS managed PostgreSQL](https://github.com/artkoenig/family-agenda-cloud/issues/61) (deferred until the move). Decide part 2 on the documented facts; record the unverified points (SQL role/database rights, role name length, pooler with SQL roles, storage classes, real retention, single-Family restore) as checks to pass before the move.

---

**Comment by artkoenig, 2026-11-13T09:01:01Z**

## Resolution

Decided only for the start: **Postgres runs as a container on the Cube**. Everything about the managed service is deferred to the move.

### Start (container on the Basic Cube M, 8 GB)
- **Version:** Postgres 17 (official image, major version and digest pinned in Compose). Same as the app's CI and the managed offer, so the move has no version jump.
- **Memory:** container limit 3 GB; `shared_buffers` 768 MB, `effective_cache_size` 2 GB, `work_mem` 4 MB, `maintenance_work_mem` 128 MB. The rest (~5 GB) for `api`/`worker`/`cleanup`, Caddy, Authentik (~1 GB) and the OS. RAM running tight is the "tight Cube" trigger for the move.
- **Connections:** `max_connections` 300.
  - `api` and `worker` each: at most 60 open Instances × 2 connections = 120 to Family databases, plus 5 to the control database
  - `cleanup`: 10
  - Authentik: 20
  - the rest as a reserve for admin and backup

  An active Family can hold up to 4 (2 in `api`, 2 in `worker`), so at least 60 Families can be active at the same moment; beyond that the least recently used Instance closes. This is the existing LRU with a configurable maximum from [Decide multi-family Instances in the public image](https://github.com/artkoenig/family-agenda-cloud/issues/20); no new public requirement, only its configuration.
- **Family databases per instance:** no hard limit on the count. An empty database is about 8 MB, so 1000 are about 8 GB of 240 GB NVMe. Connections and RAM are the limits, covered by the move triggers of [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54).
- **One instance holds:** the control database, every Family database and Authentik's database, each with its own role; Authentik's role has no access to the others.

### Deferred to the move to IONOS managed PostgreSQL
Cluster size and HA, when a second cluster is added and how the register points to it, where the control database lives, the pooler, and the move procedure with its downtime. Kept in the map's Not yet specified, together with the deferred [Try a Family database lifecycle on IONOS managed PostgreSQL](https://github.com/artkoenig/family-agenda-cloud/issues/61). Facts for then: [Research IONOS managed PostgreSQL and Object Storage](https://github.com/artkoenig/family-agenda-cloud/issues/48).
