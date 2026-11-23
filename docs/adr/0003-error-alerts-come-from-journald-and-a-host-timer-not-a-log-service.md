---
status: accepted
---

# Error alerts come from journald and a timer on the Cube, not from a log service

The Operator is told by mail about errors in any container on the Cube. No log service collects the logs for it. Docker writes every container's output to the Cube's systemd journal (log driver `journald`), and journald deletes it after 14 days, the retention the privacy policy states for container logs ([#196](https://github.com/artkoenig/family-agenda-cloud/issues/196)). A systemd timer on the Cube runs the `health` cron every 5 minutes. It reads the journal since its last run and the containers' states, applies one rule per service, and sends at most one digest mail per run through the hosted service's own SMTP account. On every run it also pings an external dead man's switch (healthchecks.io), which mails the Operator's private address outside IONOS when the pings stop.

## Considered Options

- **IONOS Logging Service** (Loki and a managed Grafana, in Germany, Terraform-managed). A pipeline is billed for every hour it exists, whatever it ingests, plus storage. That is a standing cost far above the value of a few MB of error lines a month, for one Operator. No EUR price for the pipeline-hour was published when this was decided.
- **Loki and Grafana on the Cube.** Free and searchable, but about 300 to 500 MB of RAM against the capacity budget of launch gate 10 (under 70 % of 8 GB), and still the Cube watching itself.
- **A free SaaS tier** (Grafana Cloud, Sentry, Better Stack). Convenient, but a new processor of log lines that carry IP addresses and Family ids. It would have to be named in the privacy policy and in the sub-processor list of gate 12.
- **A compose service with `docker.sock`.** Rejected: socket access is root on the Cube, and it would sit in a container.

## Consequences

- There is no UI to search logs. The Operator reads them with `journalctl` on the Cube. A searchable log service can come later without changing how errors are found.
- The journal is the only place container logs are kept, so the 14 days are enforced by journald's `MaxRetentionSec`, not by each service.
- Errors are found per service: by `level` in JSON logs, by severity words in Postgres and rclone, and by pattern in the core and the plugins until the core writes structured logs ([family-agenda#440](https://github.com/artkoenig/family-agenda/issues/440)).
- The external heartbeat reverses the accepted risk of [#192](https://github.com/artkoenig/family-agenda-cloud/issues/192). A dead Cube, a dead timer or an IONOS Mail outage is now noticed. healthchecks.io gets a ping with no personal data.
- The AI spend alert (gate 9) and the WAL alert (gate 11) are further checks of the same `health` cron.
