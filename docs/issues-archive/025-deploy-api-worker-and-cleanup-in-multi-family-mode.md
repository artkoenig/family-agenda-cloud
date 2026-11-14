# #25 Deploy api, worker and cleanup in multi-Family mode

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:11:56Z
- Closed: 2026-11-14T19:25:18Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/25

## Parent

#24 (public state and standing rules there)

## What to build

Deployment of the public image as three workloads in `cube/compose.yaml` on the one Cube ([#54](https://github.com/artkoenig/family-agenda-cloud/issues/54)), sharing one control database:

- `api`: HTTP app routing by Family, ×1, behind Caddy on `app.`.
- `worker`: claims due Families from the due index (`FOR UPDATE SKIP LOCKED` + lease), ×1; a second replica only on the growth path.
- `cleanup`: retention, secret and blob sweep, final deletion of closed Families.
- Control database in the same Postgres 17 container as the Family and Authentik databases ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)); backed up with the rest by WAL-G ([#59](https://github.com/artkoenig/family-agenda-cloud/issues/59)).
- Connection budget: `max_connections` 300, at most 60 open Instances per `api`/`worker` through the LRU cap, pool per Instance 1–2 connections, idle close ~5 min ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)).
- Plugin containers `ics`/`imap`/`webuntis` shared by all Families, each with its Egress Proxy, from a cloud-only `plugins.yml` ([#68](https://github.com/artkoenig/family-agenda-cloud/issues/68)); needs contract 3.0, which 0.6.0 has.
- Release: pinned public tag `X.Y.Z` in `compose.yaml`, `scripts/deploy.sh` (rsync, pull, up), `scripts/smoke.sh` from `deploy.sh`; migrations additive only, lazy per Family database on open; no rollback, fix forward ([#58](https://github.com/artkoenig/family-agenda-cloud/issues/58), [#65](https://github.com/artkoenig/family-agenda-cloud/issues/65)).

## Acceptance criteria

- [ ] `api`, `worker`, `cleanup` and the plugin containers run on the Cube from an unmodified public release tag, config versioned in `cube/`
- [ ] Two `worker` replicas never process the same Family concurrently (checked once on the Cube before registration opens; there is no staging)
- [ ] Release procedure documented in `docs/runbook/` (fix forward, no rollback)
- [ ] Connection budget documented

## Blocked by

- Public multi-Family mode (register/control database, routing by Family, due index, `cleanup`): hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), not yet created; trial cut in [#79](https://github.com/artkoenig/family-agenda-cloud/issues/79)


---

**Comment by artkoenig, 2026-11-14T19:18:29Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
