# #30 Monitoring and alerts

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:17Z
- Closed: 2026-11-14T19:25:27Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/30

## Parent

#24 (public state and standing rules there)

## What to build

As decided in [Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64): no dashboards, no central logging, no on-call.

- Dead man's switch at Healthchecks.io (EU, pings only); alerts by email and push.
- `health` cron every 5 min: HTTPS of apex/`app.`/`auth.`, containers, disk/RAM, WAL archive, overdue backlog (number of overdue Families, oldest due time), AI Model Hub token expiry, AI spend above 250 EUR/month ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)), failed mail handovers ([#67](https://github.com/artkoenig/family-agenda-cloud/issues/67)).
- `backup` ping within 26 h (WAL-G base backup, [#59](https://github.com/artkoenig/family-agenda-cloud/issues/59)); `cleanup` ping per run.
- Growth triggers in a CSV on the Cube (open Instances, connections, Families, RAM).
- Logs: rotated Docker `json-file`. Agenda link secrets are masked by the app; verify nothing else sensitive is logged.

## Acceptance criteria

- [ ] Healthchecks.io checks for `health`, `backup` and `cleanup` set up, alerting by email and push
- [ ] Runbooks in `docs/runbook/` for backlog, cleanup failure, connection exhaustion, WAL archive failure, full disk
- [ ] Log rotation configured; log review for secrets done

## Blocked by

- #25 (workloads deployed)
- Overdue backlog and per-run `cleanup` report need public multi-Family mode: hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78)


---

**Comment by artkoenig, 2026-11-14T19:18:42Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
