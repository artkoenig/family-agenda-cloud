# IONOS managed PostgreSQL and Object Storage

Research for issue #48 (map #46, feeds #26, #27, #55). Checked 2026-11-12 against IONOS Cloud docs, the PostgreSQL v2 API reference and the EUR price list. Documentation reading only: nothing was tried on a real IONOS contract. Items marked **[UNVERIFIED]** are not stated in a primary source and need a hands-on test or a support question.

## Question

Can IONOS Cloud in Germany carry the hosted service's data layer: one PostgreSQL database and role per Family (about 100 at start, up to about 1000) plus one control database, with app containers that open 1–2 connections per active Family and close idle ones after about 5 minutes; and one S3-compatible bucket with a prefix per Family?

## Short answer

Yes, no blocker found in the documentation.

- **PostgreSQL**: per-Family databases and roles are created and dropped with plain SQL; the API manages clusters only. No limit on the number of databases or roles is documented. The hard ceiling is `max_connections`: at most 1000 per cluster (11 reserved), fixed by RAM, not configurable. One cluster therefore carries roughly 490–989 Families that are active at the same moment. A managed PgBouncer exists, but pools are per database and role, so it does not lift that ceiling for this design.
- **Restore is whole-cluster only.** Point-in-time recovery of a single Family means restoring to a new cluster and copying one database across.
- **Object Storage**: S3 basics, bucket policy, lifecycle per prefix, versioning and SSE-S3 are there, in Frankfurt and Berlin. There is no IAM and no STS, so no per-Family credentials: the service uses one key and enforces the Family prefix itself.
- **Cost**: a 3-node 2 core / 8 GB / 100 GB cluster is about €425 per 30 days; a single node of that size about €142. Object Storage is €0.007 per GB per 30 days, requests free.
- **To settle by a short hands-on test** before #55: the privileges of the cluster's initial user (create/drop role and database, revoke connect), and how PgBouncer treats roles created by SQL.

## PostgreSQL

Product: IONOS Cloud "PostgreSQL" (DBaaS), API v2. v2 became generally available on 2026-05-18; v1 was shut down on 2026-09-28, so only v2 matters. Source: <https://docs.ionos.com/cloud/databases/postgresql>, <https://docs.ionos.com/cloud/api-reference/databases/postgresql-v2>.

German endpoints: `https://postgresql.de-txl.ionos.com/v2` (Berlin), `https://postgresql.de-fra.ionos.com/v2` (Frankfurt). Bearer token only. Terraform and Ansible are supported.

### Creating and dropping databases and roles

- The v2 API has resources for clusters, backups, backup locations and versions. It has **no endpoints for databases or users**.
- A cluster carries one `credentials` object: `username` (2–16 characters, letters, digits, underscore), `password` (8–256), `database` (2–63). Sending a new username or database name on update adds it; nothing is ever removed this way.
- The API reference says customers connect "using standard PostgreSQL tools to create additional users, databases, and access grants". So per-Family provisioning is `CREATE ROLE`, `CREATE DATABASE`, `GRANT`, and removal is `DROP DATABASE`, `DROP ROLE`. Source: <https://docs.ionos.com/cloud/api-reference/databases/postgresql-v2/clusters>.
- No superuser. The FAQ says most DBA actions remain available by other means. In v2 the default `postgres` database cannot be connected to; admin statements must run from the database named in `credentials` (this can be the control database). Source: <https://docs.ionos.com/cloud/databases/postgresql/postgresql-faq>.
- **Limit on count**: none documented by IONOS. PostgreSQL itself has no practical limit at 1000 databases (<https://www.postgresql.org/docs/current/limits.html>).
- **[UNVERIFIED]** The exact attributes of the initial user (`CREATEDB`, `CREATEROLE`), whether it can `DROP DATABASE` of a database owned by another role, `REVOKE CONNECT ... FROM PUBLIC`, and terminate other sessions (`pg_terminate_backend`) before a drop. Whether the 16-character username limit applies to roles created by SQL.

### Connection limits

`max_connections` is set from RAM and cannot be changed. 11 connections are reserved for the platform. When the limit is reached, new connections are refused. Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/limitations>.

| RAM per instance | max_connections | usable |
|---|---|---|
| 4 GB | 384 | 373 |
| 5 GB | 512 | 501 |
| 6 GB | 640 | 629 |
| 7 GB | 768 | 757 |
| 8 GB | 896 | 885 |
| more than 8 GB | 1000 | 989 |

Reading for this service: at 1–2 connections per active Family, an 8 GB instance carries about 440–885 concurrently active Families, any larger one about 490–989. With 1000 Families of which only a part is active within any 5-minute window, one cluster can suffice; a second cluster is the way past the ceiling. The control database's own connections come out of the same budget.

Memory: about 1.5 GB base, plus `work_mem` (8 MB) per connection, plus `shared_buffers` at about 15% of RAM. Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/resource-allocation>. 989 connections at 8 MB each is about 8 GB on its own, so plan 16 GB if the full limit is to be used.

### Pooler

- Managed PgBouncer, cluster property `connectionPooler`: `DISABLED` (default), `TRANSACTION` or `SESSION`. Only the mode is configurable. Source: <https://docs.ionos.com/cloud/api-reference/databases/postgresql-v2/clusters>.
- Port 6432 instead of 5432 is documented on the v1 page; **[UNVERIFIED]** for v2.
- PgBouncer keeps one pool per database and role. With one database and role per Family it cannot share server connections between Families, so it does not raise the number of concurrently active Families. It helps only against bursts within one Family.
- **[UNVERIFIED]** Pool size per pair, client connection limit, and whether roles created by SQL can authenticate through the pooler.
- Transaction mode breaks session features (session advisory locks, `LISTEN`, session-level `SET`). Check the app's driver and migration tool before turning it on.

Given the app already closes idle connections after 5 minutes, start without the pooler.

### Sizes and quota

Per instance: 1–62 cores, 4–240 GB RAM, 10–4096 GB storage; 1–5 instances per cluster. Storage grows online and never shrinks. Changing cores or RAM causes a switchover and drops connections. Default contract quota: 16 cores, 32 GB RAM, 1500 GB disk, 10 clusters, 5 instances per cluster; raised through support. Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/limitations>.

A 3-node 4 core / 16 GB cluster needs 48 GB RAM and exceeds the default quota.

### Versions and upgrade policy

- PostgreSQL 14, 15, 16, 17, 18 on v2.
- Minor versions: applied automatically in a weekly 4-hour maintenance window. Day and time (UTC) are configurable; without a setting it falls on a weekday between 07:00 and 17:00.
- Major versions: started by the customer through the console or API. Upgrade only, not reversible, with downtime. A base backup is taken afterwards.
- IONOS follows the PostgreSQL 5-year support period.
- Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/upgrade-maintenance>.
- **[UNVERIFIED]** What happens to a cluster whose major version reaches end of life (forced upgrade or not, notice period).

### Backups and point-in-time recovery

Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/backup-recovery-and-migration>, <https://docs.ionos.com/cloud/api-reference/databases/postgresql-v2/clusters>.

- Daily base backup plus continuous WAL archiving to IONOS Object Storage. WAL is uploaded every 5 minutes, so the worst-case loss after a total cluster loss is about 5 minutes.
- `backup.retentionDays`: 1–365, default 7. `backup.location` is chosen at creation (another region is possible) and cannot be changed later. Backups are encrypted.
- The limitations page still says backups cover the last 7 days. This contradicts the v2 API schema; **[UNVERIFIED]** which one holds.
- Restore options: a new cluster from a backup, optionally to a point in time (`restoreFromBackup.sourceBackupId`, `recoveryTargetDatetime`); or an in-place restore that overwrites the cluster. Cloning a cluster is supported.
- **Restore is always the whole cluster.** There is no per-database restore. Restoring one Family: restore to a temporary cluster at the wanted time, `pg_dump` that Family's database, load it into the live cluster, delete the temporary cluster.
- A final base backup is taken when a cluster is deleted.
- Deletion duty (#26): after a Family's database is dropped, its data stays in backups until `retentionDays` has passed. Pick the retention with that in mind and state it in the privacy text.
- Backup storage is billed at €0.007 per GB per 30 days.

### Private access

- A cluster is attached to a private LAN of a virtual data center (`datacenterId`, `lanId`, a private IP in CIDR form). This cannot be changed after creation. No public endpoint is documented, so the app containers must run in, or be routed into, that LAN.
- A DNS name of the form `pg-<id>.postgresql.de-txl.ionos.com` is provided. TLS is always on (Let's Encrypt certificate), authentication is SCRAM-SHA-256.
- Address ranges that must not be used in the LAN: `10.208.0.0/12`, `10.233.0.0/18`, `10.233.64.0/18`, `192.168.230.0/24`.
- Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/limitations>, <https://docs.ionos.com/cloud/databases/postgresql/postgresql-faq>.

### High availability

Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/high-availability>.

- 1–5 instances: one primary and warm standbys. Standbys do not serve reads.
- Automatic failover. Clients are disconnected and must reconnect with backoff.
- Replication `ASYNCHRONOUS` (default) or `STRICTLY_SYNCHRONOUS` (needs at least 2 instances).
- IONOS recommends at least 3 instances for production.
- A single-instance cluster has no failover; recovery is then from backup, with up to about 5 minutes of loss and a restore time that grows with data size. **[UNVERIFIED]** Whether a failed single instance is rebuilt automatically, and how long that takes.
- **[UNVERIFIED]** A published SLA figure for the PostgreSQL service was not looked up.

### Other

- The log endpoint was removed in v2. Logs and metrics (`logsEnabled`, `metricsEnabled`) go to the IONOS Logging and Monitoring services, which are billed separately.
- Extensions include `pg_stat_statements`, `pg_cron`, `pg_trgm`. Source: <https://docs.ionos.com/cloud/databases/postgresql/overview/activate-extensions>.

### Price

Source: <https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-eur-en>, net prices.

| Item | Price |
|---|---|
| 1 core | €0.06 per hour |
| 1 GB RAM | €0.007 per hour |
| 1 GB storage, Essential | €0.04 per 30 days |
| 1 GB storage, Balanced | €0.07 per 30 days |
| 1 GB storage, Performance | €0.15 per 30 days |
| 1 GB backup | €0.007 per 30 days |

Calculated per 30 days (720 hours) with Performance storage, without backup storage and traffic. The calculation assumes cores, RAM and storage are each billed per instance.

| Per instance | Usable connections | 1 instance | 2 instances | 3 instances |
|---|---|---|---|---|
| 1 core, 4 GB, 10 GB (minimum) | 373 | €65 | €130 | €195 |
| 2 cores, 4 GB, 50 GB | 373 | €114 | €228 | €342 |
| 2 cores, 8 GB, 100 GB | 885 | €142 | €283 | €425 |
| 4 cores, 8 GB, 100 GB | 885 | €228 | €456 | €684 |
| 4 cores, 16 GB, 200 GB | 989 | €283 | €567 | €850 |

- Cores are 76% or more of the bill at small sizes. RAM, which sets the connection limit, is cheap: going from 4 GB to 8 GB adds €20 per instance.
- **[UNVERIFIED]** The price list names three storage classes, while the v2 documentation read here mentions only one SSD class. Which classes a v2 cluster can select was not confirmed.
- No committed-use or reserved discount was found in the price list.

## Object Storage

Source root: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage>.

### Regions and bucket types

IONOS has two bucket types. Contract-owned buckets are the recommended type and the one new features target.

| Type | Region | Endpoint |
|---|---|---|
| Contract-owned | `eu-central-3` Berlin | `s3.eu-central-3.ionoscloud.com` |
| Contract-owned | `eu-central-4` Frankfurt | `s3.eu-central-4.ionoscloud.com` |
| User-owned | `de` Frankfurt | `s3.eu-central-1.ionoscloud.com` |
| User-owned | `eu-central-2` Berlin | `s3.eu-central-2.ionoscloud.com` |

Use a contract-owned bucket in the region of the app servers. The BSI IT-Grundschutz certificate was marked as pending for `eu-central-3`. Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/bucket-types>.

### S3 gaps

Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/s3-api-compatibility>, <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/overview/limitations>.

- Not available: IAM (announced for contract-owned buckets, no date), STS, bucket notifications, metrics and analytics, MFA delete, SSE-KMS (not mentioned anywhere), storage classes other than Standard.
- Not available on contract-owned buckets: access logging, cross-region replication, inventory. Object Copy works only on buckets without encryption.
- Available: multipart upload, pre-signed URLs, bucket policy, CORS, versioning, lifecycle, Object Lock, tagging, Block Public Access.
- Limits: 1000 contract-owned buckets per contract, object up to 5 TiB, single upload up to 5 GiB, key up to 1024 characters, 200 million objects per bucket (50 million with versioning), 5 access keys per user.
- List Objects and Delete Objects are rate limited per contract on contract-owned buckets; the answer is HTTP 429 with `Retry-After`. Deleting a Family's prefix (#26) must page, retry and back off. Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/overview/rate-limits>.
- No native private endpoint. Access from a private LAN goes through a Managed Network Load Balancer or over the public endpoint. Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/how-tos/access-object-storage-from-private-lan>.

### Scoped keys and bucket policies

- An access key carries the rights of its user. A key cannot be scoped on its own.
- Scoping is done with a bucket policy: principal `arn:aws:iam:::user/<contractNumber>:<userUUID>`, resource `arn:aws:s3:::<bucket>/<prefix>/*`, conditions such as `aws:SourceIp` and `s3:prefix`. Policy size up to 1 MiB on contract-owned buckets. Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/settings/bucket-policy/examples>.
- Contract owner and administrators always have full access.
- Result for #27: create one technical, non-admin IONOS user for the service, grant it the bucket through a policy, optionally restricted to the servers' source IPs, and turn on Block Public Access. Isolation between Families is the service's job, by always building keys from the Family's prefix. One IONOS user per Family is possible in principle but not practical at 1000 Families and has no API-side temporary credentials.
- **[UNVERIFIED]** The full list of policy actions and condition keys IONOS evaluates.

### Lifecycle

Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/settings/lifecycle>.

- Rules: expire current versions after days or on a date, delete noncurrent versions, remove expired delete markers, abort incomplete multipart uploads.
- Scope: whole bucket or a prefix. One rule per prefix. No transitions between storage classes.
- For #27: a rule that expires current versions deletes by age, whether or not the database still references the object. Do not put such a rule on Family prefixes. Safe rules are aborting incomplete multipart uploads and, with versioning on, deleting noncurrent versions after N days.

### Versioning

Supported. Once enabled it can only be suspended. Every version is billed in full. With versioning, deleting a Family's prefix must delete all versions and delete markers, or rely on a noncurrent-version rule; until then the data still exists.

### Encryption

- In transit: TLS 1.2 and 1.3.
- At rest: SSE-S3 (AES-256) and SSE-C. A bucket default encryption can be set, by API only. No customer-managed keys through a key service.
- Source: <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/s3-api-compatibility>, <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/object-storage-faqs>; API: <https://docs.ionos.com/cloud/api-reference/backup-and-storage/ionos-object-storage/ionos-object-storage-for-contract-owned-buckets/encryption>.

### Price

Source: <https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-eur-en>, <https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/overview/pricing>.

| Item | Price |
|---|---|
| Storage | €0.007 per GB per 30 days, billed hourly |
| Requests (PUT, GET, LIST, DELETE) | no charge |
| Inbound traffic | no charge |
| Outbound from a contract-owned bucket to IONOS services in the same data center or country | no charge |
| Other outbound traffic | first 2 TB per month free across the contract, then €0.030 per GB, falling in tiers |

100 GB costs €0.70 per 30 days, 1 TB about €7.20. Outbound traffic from user-owned buckets is always billed as public traffic, another reason for a contract-owned bucket.

## Open points

1. **Hands-on test of the initial user's rights** (one hour on a minimum cluster): create and drop role and database, revoke `CONNECT` from `PUBLIC`, terminate sessions before a drop, role name length.
2. **Pooler with SQL-created roles**: only relevant if the connection ceiling becomes a problem.
3. **One cluster or several**: the connection ceiling of 989 and whole-cluster restore both argue for a Family-to-cluster mapping in the control database from the start, even with one cluster.
4. **One instance or three**: €142 against €425 per 30 days at 2 cores / 8 GB. Decide against the availability goal in the map (#46). Ask IONOS how a failed single instance is recovered.
5. **Backup retention against deletion duty**: dropped Family data lives on in backups for `retentionDays`.
6. **Storage classes on v2** and the 7-day versus 365-day backup retention contradiction: confirm in the console or with support.
7. **End-of-life handling of major versions**: not documented.
8. **Where the app containers run**: PostgreSQL is reachable only inside an IONOS private LAN, so compute must be IONOS too (or tunnelled in). Object Storage is reached over its public endpoint.
9. **Default quota** (32 GB RAM, 16 cores for DBaaS): request an increase before a 3-node cluster above 8 GB.
