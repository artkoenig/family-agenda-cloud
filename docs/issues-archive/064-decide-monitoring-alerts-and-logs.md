# #64 Decide monitoring, alerts and logs

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T19:28:32Z
- Closed: 2026-11-13T10:02:51Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/64

## Question

How are the Cube from [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54), its containers (`api`, `worker`, `cleanup`, Postgres, Caddy) and the WAL archive watched, with nobody on call? The options are IONOS Logging/Monitoring (see [Research IONOS platform services around the workloads](https://github.com/artkoenig/family-agenda-cloud/issues/50)), a small self-run stack, or an EU SaaS without Family content. This ticket decides which metrics and logs, which alerts reach the Operator and how, and how the growth triggers (CPU/RAM, oldest overdue Family, `api` p95) are seen. Covers [Monitoring and alerts](https://github.com/artkoenig/family-agenda-cloud/issues/30).


---

**Comment by artkoenig, 2026-11-13T09:23:36Z**

Input from [Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59): alert when the last WAL-G base backup is older than about 26 h or WAL archiving fails (`pg_stat_archiver.failed_count` rising, last archived WAL older than about 15 min). Also from [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58): the AI Model Hub token expiry (90 days at most).

---

**Comment by artkoenig, 2026-11-13T10:02:50Z**

## Resolution

**Dead man's switch with one external service, no own monitoring stack.** The Cube reports "all good" regularly; a missing report is an alert. That also covers a dead Cube or a dead IONOS.

1. **Service:** Healthchecks.io (EU, Latvia; open source, self-hostable later), free tier (20 checks). It receives pings only, never Family content, so the placement rule allows it.
2. **Checks (pings sent from the Cube):**
   - **`health`** (every 5 min): a script on the Cube pings only if all of these hold, otherwise it sends `/fail` with the reason:
     - `app.family-agenda.cloud/api/health` and `auth.family-agenda.cloud` answer over HTTPS
     - all containers are running
     - disk < 80 %, RAM < 85 %
     - `pg_stat_archiver` shows no new failures and the last archived WAL is younger than 15 min
     - the oldest overdue Family is younger than 15 min
     - the AI Model Hub token has more than 10 days left
   - **`backup`**: WAL-G pings after each daily base backup; alert if none arrives within 26 h.
   - **`cleanup`**: pings after each run.
3. **Alerts:** email plus push to the Operator's phone through the Healthchecks app. No on-call. Also subscribe to the IONOS status page by email.
4. **Growth triggers:** the same script appends CPU, RAM and the overdue backlog to a CSV on the Cube every 5 min; the Operator reads it when needed. `api` p95 is not measured for now.
5. **Logs:** Docker `json-file` driver with rotation (`max-size` 50 MB, 5 files per container), read over SSH with `docker compose logs`. No central logging. The app already masks Agenda link secrets; checking that nothing else sensitive is logged stays with [Monitoring and alerts](https://github.com/artkoenig/family-agenda-cloud/issues/30).

### Later, when needed
IONOS Logging/Monitoring (managed Grafana), dashboards, `api` p95, metrics per Family (Extraction failures, open Instances in the LRU). Kept in the map's Not yet specified.
