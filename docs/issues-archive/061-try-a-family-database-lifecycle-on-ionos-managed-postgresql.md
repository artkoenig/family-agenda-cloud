# #61 Try a Family database lifecycle on IONOS managed PostgreSQL

- State: CLOSED (NOT_PLANNED)
- Labels: wayfinder:task
- Created: 2026-11-12T09:02:14Z
- Closed: 2026-11-13T07:43:27Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/61

## Question

Not a decision: on a smallest test cluster, try what [Research IONOS managed PostgreSQL and Object Storage](https://github.com/artkoenig/family-agenda-cloud/issues/48) could not verify from the docs: may the initial user create and drop roles and databases, revoke `CONNECT` and end sessions; the length limit of role names; whether the managed pooler works with roles created over SQL and on which port; which storage classes can be chosen; the real backup retention; a restore of one Family through a temporary cluster and `pg_dump`. The answer records what worked and what did not, then the cluster is deleted.

---

**Comment by artkoenig, 2026-11-13T07:43:26Z**

Deferred, not resolved. [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54) starts with Postgres as a container on the Cube, so a managed cluster is needed only at the move (about 100 paying Families, a second Cube, or a tight Cube). No DCD token exists yet (only the AI Model Hub token, expiring 2026-11-13), and the trial costs money. It no longer blocks [Decide Postgres hosting and cluster capacity](https://github.com/artkoenig/family-agenda-cloud/issues/55): its part 2 (after the move) is decided on the documented facts of [Research IONOS managed PostgreSQL and Object Storage](https://github.com/artkoenig/family-agenda-cloud/issues/48), and the open checks listed here are a precondition of the move itself. Kept in the map's Not yet specified; reopen when the move comes near.
