# #71 Decide launch readiness

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T10:13:37Z
- Closed: 2026-11-13T15:27:47Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/71

## Question

What must be proven before registration opens, each with its threshold and where the proof is filed: load test, restore drill ([Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59)), WAL archiving, Extraction quality on real anonymised mail and PDFs (re-run the harness of [Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53)), Authentik mail sign-in test.

---

**Comment by artkoenig, 2026-11-13T14:57:36Z**

Prerequisite from [Decide how plugin containers and their Egress Proxies run on the Cube](https://github.com/artkoenig/family-agenda-cloud/issues/68): the hosted egress scoping is a breaking plugin contract 3.0 ([Scope an Egress Proxy's allowlist per Source with a per-call ticket (contract 3.0)](https://github.com/artkoenig/family-agenda/issues/358)), so `ics`, `imap` and `webuntis` each need a contract-3.0 release before registration opens.

---

**Comment by artkoenig, 2026-11-13T15:03:51Z**

Launch conditions from [Decide the LLM model and the interim limit per Family](https://github.com/artkoenig/family-agenda-cloud/issues/57): re-measure Extraction on real, anonymised mail and PDFs with the `prototype/extraction-measure` harness; the worker backoff from [1.3](https://github.com/artkoenig/family-agenda-cloud/issues/11) must be in, or `nextDueAt()` spins hot while the LLM endpoint fails.

---

**Comment by artkoenig, 2026-11-13T15:27:45Z**

## Resolution

### Launch is three stages, not one event

"Registration opens" is the last of three, and each gate below belongs to exactly one of them.

- **(a) Own Family.** The hosted service runs in production and serves only the maintainer's Family — the canary of [Decide staging](https://github.com/artkoenig/family-agenda-cloud/issues/65). Nothing legal is needed; nobody else's content is on the Cube.
- **(b) About 5 invited Families.** Created by hand, no self-registration, each told in writing that it is a trial. This is the only way to get real mail through the system, which several gates need.
- **(c) Registration opens.** Self-registration and billing are live. **"Launch readiness" in this ticket means stage (c).**

### The gates

Every gate has a threshold that can be read as pass or fail, and files its proof in `docs/launch-checklist.md` (below).

**Stage (a) — own Family**

1. **Plugin contract 3.0 released** for `ics`, `imap` and `webuntis` ([Scope an Egress Proxy's allowlist per Source with a per-call ticket (contract 3.0)](https://github.com/artkoenig/family-agenda/issues/358), from [#68](https://github.com/artkoenig/family-agenda-cloud/issues/68)). Threshold: the digests pinned in the cloud `plugins.yml` resolve to contract-3.0 images, and one Source of each type syncs in production through its own Egress Proxy with an allowlist holding **only that Source's hosts**.
2. **Worker backoff in** ([1.3](https://github.com/artkoenig/family-agenda-cloud/issues/11), condition from [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)). Threshold: with the LLM endpoint answering 503, a pending Source Record is retried with growing delay and `worker` CPU stays flat — no hot `nextDueAt()` loop.
3. **Build issues done** ([Run the hosted multi-Family service](https://github.com/artkoenig/family-agenda-cloud/issues/24) and its children [#25](https://github.com/artkoenig/family-agenda-cloud/issues/25)–[#28](https://github.com/artkoenig/family-agenda-cloud/issues/28)), released as a tag `X.Y.Z`, deployed by `deploy.sh` with `smoke.sh` green.
4. **Certificates and DNS.** Threshold: Caddy holds valid certificates for the apex, `app.` and `auth.`; SPF, DKIM and DMARC records resolve.
5. **WAL archiving running** (mandatory per [#54](https://github.com/artkoenig/family-agenda-cloud/issues/54)). Threshold: a WAL segment reaches the Berlin bucket at least every 5 minutes and a base backup exists.

**Stage (b) — invited Families**

6. **Authentik mail sign-in** ([Test Authentik for mail sign-in](https://github.com/artkoenig/family-agenda-cloud/issues/45)). Threshold: a sign-in code arrives in **under 60 s at three providers** (Gmail, GMX or web.de, iCloud), none in the spam folder, SPF/DKIM/DMARC passing in the received headers.
7. **Restore drill** ([#59](https://github.com/artkoenig/family-agenda-cloud/issues/59)), the full path once on a throwaway Cube, timed: `bootstrap.sh`, WAL-G restore to a point in time about 10 minutes back, bring up one named Family, confirm its Items are there and its blobs resolve. Thresholds: **RPO of at most 5 minutes confirmed** and the **measured wall-clock time written into the runbook**. No threshold on duration — best effort is the operating promise. Plus the cheap half-drill, because it is the case that will actually happen: a **single-Family restore into the running production instance**.
8. **Extraction quality on real mail** (re-run of [Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53) with the `prototype/extraction-measure` harness, condition from [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)). Corpus: **at least 50 real, anonymised messages, including at least 8 PDFs and at least 5 multi-Item Elternbriefe**. Thresholds: **no missed Item in a multi-Item message** and **at least 95 % of all Items with date and time right**; a wrong date counts as a miss, a spurious Item is recorded but does not block. Decision rule: if `Qwen/Qwen3.8-27B` misses it, re-run with `openai/gpt-oss-120b` and take that if it clears it; if neither clears it, **registration does not open** and the work goes to the prompt or the adapter, not to a longer model list.
9. **AI spend alert live** — the `health` cron reads the month's AI Model Hub spend over the Billing API and alerts above **250 EUR** ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57) as corrected by [#60](https://github.com/artkoenig/family-agenda-cloud/issues/60)).

**Stage (c) — registration opens**

10. **Capacity check instead of a load test.** The ticket asked for a load test; throughput is not the risk, since 100 Families at 300 messages a month is about one message per Family and day. The risks are the LRU cap against `max_connections` 300 ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)) and RAM on 8 GB with about six plugin containers ([#68](https://github.com/artkoenig/family-agenda-cloud/issues/68)). So: a script creates **120 Family databases** and drives **60 Instances open at once** across `api` and `worker`. Thresholds: **no connection error**, **total RSS under 70 % of 8 GB**, and the **61st Family evicts an Instance instead of failing**. The figures are filed with the run. A real load test is deferred until a growth trigger fires.
11. **WAL soak.** Threshold: **7 consecutive days with zero `archive_failed` and no WAL alert** from the `health` cron, ending no earlier than the day registration opens.
12. **Processing agreements and sub-processor list** ([#70](https://github.com/artkoenig/family-agenda-cloud/issues/70)) in place, which keeps [Get IONOS's written word on serving Families through the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/62) **blocking for stage (c)** — the list shown to Families names the AI Model Hub, and serving third parties through it is the clause being asked about. It is explicitly **not** blocking for stages (a) and (b), where the only Families are the maintainer's own and invited people told it is a trial.
13. **Entry point** — landing page, registration, billing and legal texts come from [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32); this map only notes that stage (c) cannot open without them.

### Where the proof is filed

`docs/launch-checklist.md` in this repo, created with this decision: one section per gate with its stage, threshold, measured value, date and a link to the artifact (run output, runbook line, release tag). It is the single document read before each stage is entered, and the only place a gate counts as passed. A gate whose measured value is missing is a failed gate.

### Rejected

- **One launch event with one gate list.** It would have forced gates that need real mail to be met before any real mail exists, and gates that need nobody to wait on legal answers.
- **A throughput load test before launch.** Measures the one thing that is not scarce; the capacity check measures what is.
- **A duration threshold on restore.** The service promises best effort and no on-call; a number nobody is bound to is not a gate.

