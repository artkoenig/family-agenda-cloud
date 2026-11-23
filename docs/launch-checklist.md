# Launch checklist

The single document read before each launch stage is entered. Thresholds and the stage split come from
[Decide launch readiness](https://github.com/artkoenig/family-agenda-cloud/issues/71); fill in **Measured**,
**Date** and **Proof** as each gate is met. **A gate whose measured value is missing is a failed gate.**

Stages:

- **(a) Own Family** — production serves only the maintainer's Family (the canary of
  [#65](https://github.com/artkoenig/family-agenda-cloud/issues/65)). Nothing legal needed.
- **(b) About 5 invited Families** — created by hand, no self-registration, each told in writing that it is a trial.
- **(c) Registration opens** — self-registration and billing live. This is "launch readiness".

## Stage (a) — own Family

### 1. Plugin contract 3.0 released

- **Threshold:** the digests pinned in the cloud `plugins.yml` resolve to contract-3.0 images
  ([family-agenda#358](https://github.com/artkoenig/family-agenda/issues/358)), and one Source of each of `ics`,
  `imap`, `webuntis` syncs in production through its own Egress Proxy with an allowlist holding only that Source's hosts.
- **Measured:** — **Date:** — **Proof:**

### 2. Worker backoff in

- **Threshold:** with the LLM endpoint answering 503, a pending Source Record is retried with growing delay and
  `worker` CPU stays flat — no hot `nextDueAt()` loop ([#11](https://github.com/artkoenig/family-agenda-cloud/issues/11)).
- **Measured:** — **Date:** — **Proof:**

### 3. Build issues done

- **Threshold:** [#24](https://github.com/artkoenig/family-agenda-cloud/issues/24) and its children
  [#25](https://github.com/artkoenig/family-agenda-cloud/issues/25)–[#28](https://github.com/artkoenig/family-agenda-cloud/issues/28)
  closed, released as a tag `X.Y.Z`, deployed by `deploy.sh` with `smoke.sh` green.
- **Measured:** — **Date:** — **Proof:**

### 4. Certificates and DNS

- **Threshold:** Caddy holds valid certificates for the apex, `app.` and `auth.`; SPF, DKIM and DMARC records resolve.
- **Measured:** — **Date:** — **Proof:**

### 5. WAL archiving running

- **Threshold:** a WAL segment reaches the Berlin bucket at least every 5 minutes and a base backup exists
  ([#54](https://github.com/artkoenig/family-agenda-cloud/issues/54), [#59](https://github.com/artkoenig/family-agenda-cloud/issues/59)).
- **Measured:** — **Date:** — **Proof:**

## Stage (b) — invited Families

### 6. Authentik mail sign-in

- **Threshold:** a sign-in code arrives in under 60 s at three providers (Gmail, GMX or web.de, iCloud), none in the
  spam folder, SPF/DKIM/DMARC passing in the received headers ([#45](https://github.com/artkoenig/family-agenda-cloud/issues/45)).
- **Measured:** — **Date:** — **Proof:**

### 7. Restore drill

- **Threshold:** the full path once on a throwaway Cube, timed — `bootstrap.sh`, WAL-G restore to a point in time about
  10 minutes back, bring up one named Family, confirm its Items are there and its blobs resolve. **RPO of at most 5
  minutes confirmed**, and the measured wall-clock time written into the restore runbook (no threshold on duration).
  Plus the half-drill that will actually happen: a single-Family restore into the running production instance.
- **Measured:** — **Date:** — **Proof:**

### 8. Extraction quality on real mail

- **Threshold:** `prototype/extraction-measure` over at least 50 real, anonymised messages, including at least 8 PDFs
  and at least 5 multi-Item Elternbriefe: **no missed Item in a multi-Item message** and **at least 95 % of all Items
  with date and time right**. A wrong date counts as a miss; a spurious Item is recorded but does not block.
- **Decision rule:** if `Qwen/Qwen3.8-27B` misses it, re-run with `openai/gpt-oss-120b` and take that if it clears it.
  If neither clears it, registration does not open and the work goes to the prompt or the adapter, not to a longer
  model list ([#53](https://github.com/artkoenig/family-agenda-cloud/issues/53), [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)).
- **Measured:** — **Date:** — **Proof:**

### 9. AI spend alert live

- **Threshold:** the `health` cron reads the month's AI Model Hub spend over the IONOS Billing API and alerts above
  **250 EUR** ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57) as corrected by
  [#60](https://github.com/artkoenig/family-agenda-cloud/issues/60)).
- **Measured:** — **Date:** — **Proof:**

### 15. Error alert and heartbeat live

Numbered after the last gate so that gates 10 to 14, which issues cite by number, keep their numbers.

- **Threshold:** on the Cube, an error written on purpose by a container reaches the Operator by mail, and a stopped
  `health` timer reaches the Operator's private address through healthchecks.io, **each within 15 minutes**
  ([ADR 0003](adr/0003-error-alerts-come-from-journald-and-a-host-timer-not-a-log-service.md)).
- **Measured:** — **Date:** — **Proof:**

## Stage (c) — registration opens

### 10. Capacity check

- **Threshold:** a script creates 120 Families through Provisioning and drives 60 of them at once through the Router
  and the Scheduler against the pool of cores ([#90](https://github.com/artkoenig/family-agenda-cloud/issues/90)).
  **60 Families served at once with no failed request and no connection error**, **at most 2 Postgres connections held
  per Family served and the total under the usable `max_connections` of the Postgres in use**
  (`docs/research/ionos-postgres-object-storage.md`, Connection limits), and **total RSS of the pool, the Routing module and
  Postgres under 70 % of 8 GB** ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55),
  [#68](https://github.com/artkoenig/family-agenda-cloud/issues/68)).
  A throughput load test is deferred until a growth trigger fires.
- **Measured:** — **Date:** — **Proof:**

### 11. WAL soak

- **Threshold:** 7 consecutive days with zero `archive_failed` and no WAL alert from the `health` cron, ending no
  earlier than the day registration opens.
- **Measured:** — **Date:** — **Proof:**

### 12. Processing agreements and sub-processor list

- **Threshold:** [#70](https://github.com/artkoenig/family-agenda-cloud/issues/70) decided and in place. This keeps
  [#62](https://github.com/artkoenig/family-agenda-cloud/issues/62) (IONOS's written word on the AI Model Hub) blocking
  for stage (c), and explicitly not for stages (a) and (b).
- **Measured:** — **Date:** — **Proof:**

### 13. Entry point

- **Threshold:** landing page, registration, billing and legal texts from
  [#32](https://github.com/artkoenig/family-agenda-cloud/issues/32) are live.
- **Measured:** — **Date:** — **Proof:**

### 14. Content Security Policy

- **Threshold:** every page served below `app.family-agenda.cloud` carries a strict Content Security Policy, sent by the
  core or else added by the Router, and the core's escaping has been reviewed, so that script from one Family's content
  cannot run and reach another Family's pages on the shared origin
  ([#90](https://github.com/artkoenig/family-agenda-cloud/issues/90), amendment).
- **Until then:** the Operator does not sign in as an Admin of more than one Family in the same browser.
- **Measured:** — **Date:** — **Proof:**
