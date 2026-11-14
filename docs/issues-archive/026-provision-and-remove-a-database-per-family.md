# #26 Provision and remove a database per Family

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:01Z
- Closed: 2026-11-14T19:25:20Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/26

## Parent

#24 (public state and standing rules there)

## What to build

Lifecycle of a Family's database in the Postgres 17 container on the Cube ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)):

- Create a database and role for a new Family, wrap its master key via `KeyWrapper` (Operator key file), write the register entry (Family id → database, wrapped key, status, due time).
- Final deletion after the grace period (Operator setting, default 7 days): drop database and role, delete the blob prefix, wrapped key and register entries. Triggered by `cleanup`.
- Operator undo of a closing within the grace period (runbook or small tool).
- Capacity on the start setup: no limit on Family databases, `max_connections` 300 ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)); launch gate (c) checks 120 databases and 60 open Instances ([#71](https://github.com/artkoenig/family-agenda-cloud/issues/71)). Second cluster and how the register points to it are deferred to the move to managed PostgreSQL ([#46](https://github.com/artkoenig/family-agenda-cloud/issues/46), Not yet specified).
- Only with what the public image offers (AGPL rule); for the trial without registration see [#87](https://github.com/artkoenig/family-agenda-cloud/issues/87).

## Acceptance criteria

- [ ] Provisioning is idempotent and safe to retry
- [ ] Final deletion leaves no database, role, blobs, key or register rows behind (checked on the Cube with test Families; there is no staging)
- [ ] Undo runbook tested
- [ ] Capacity limits documented

## Blocked by

- Public register, `cleanup` and closing a Family: hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), not yet created
- [artkoenig/family-agenda#357](https://github.com/artkoenig/family-agenda/issues/357) (`KeyWrapper`, open)
- [#87](https://github.com/artkoenig/family-agenda-cloud/issues/87) (how Families are provisioned without registration)


---

**Comment by artkoenig, 2026-11-14T19:18:32Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
