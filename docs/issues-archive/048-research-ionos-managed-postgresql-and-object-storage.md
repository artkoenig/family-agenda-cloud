# #48 Research IONOS managed PostgreSQL and Object Storage

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-12T08:54:53Z
- Closed: 2026-11-12T09:01:47Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/48

## Question

Can IONOS managed PostgreSQL hold one database and role per Family (about 100 at start, up to about 1000) plus the control database: creating and dropping databases and roles over SQL or API, connection limits per size, versions and upgrade policy, backups and point-in-time recovery, private access from compute, high availability, price per size? Can IONOS Object Storage hold blobs with a prefix per Family: S3 compatibility gaps, scoped access keys, lifecycle rules, versioning, encryption, German regions, price?

---

**Comment by artkoenig, 2026-11-12T09:01:46Z**

Resolved: no blocker found for IONOS (documentation reading only, nothing run on a real contract).

- PostgreSQL (DBaaS v2, Berlin/Frankfurt): the API manages clusters only; per-Family databases and roles are created and dropped with SQL. No limit on their number is documented.
- Hard ceiling: `max_connections` is fixed by RAM, at most 1000 per cluster (989 usable), so about 490–989 concurrently active Families per cluster. The managed PgBouncer pools per database and role and does not lift this.
- Backups: daily base backup + WAL every 5 minutes, retention 1–365 days, point-in-time restore of the whole cluster only; restoring one Family goes through a temporary cluster.
- Access only through an IONOS private LAN; HA with 1–5 instances and automatic failover, 3 recommended.
- Price per 30 days at 2 cores / 8 GB / 100 GB: about €142 for one instance, €425 for three.
- Object Storage (Frankfurt/Berlin): bucket policy, per-prefix lifecycle, versioning, SSE-S3; no IAM or STS, so one service key and prefix isolation in the app. €0.007 per GB per 30 days, requests free.
- To test hands-on before #55: rights of the cluster's initial user (create/drop role and database, revoke connect) and the pooler with SQL-created roles.

Details and open points: `docs/research/ionos-postgres-object-storage.md`

