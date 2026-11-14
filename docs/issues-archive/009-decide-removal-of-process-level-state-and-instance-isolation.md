# #9 Decide removal of process-level state and Instance isolation (1.2)

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-06T20:02:05Z
- Closed: 2026-11-06T20:21:35Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/9

## Question

What is global per process today besides the plugin registry? How are Matrix services disabled per Instance? What does the two-Instances-two-databases isolation test assert?

---

**Comment by artkoenig, 2026-11-06T20:06:35Z**

Fact-check delta (see docs/research/public-repo-factcheck.md): Only the `registerHooks` hook is global; `SourceRegistry` is created per boot (the document's 'loaded once and shared' is wrong). `source-matrix` is a per-process singleton reading `process.env` (`DATABASE_URL`) with fixed ports 8008/29318; nothing switches Matrix off per Instance.

---

**Comment by artkoenig, 2026-11-06T20:21:34Z**

## Resolution

- **Plugin hook:** `registerHooks` stays the only allowed process-global: idempotent, documented. Rule for plugins: no Instance state at module level; everything Instance-specific arrives as a per-call parameter. Written into the plugin SDK docs and checked by the isolation test.
- **Matrix plugin:** not refactored. Matrix is never hosted (see ADR 0.2 decision), so "off" means `source-matrix` is not in the injected plugin list (from the Composition Root decision); no extra flag. Documented: `source-matrix` supports exactly one Instance per process.
- **`process.env`:** library packages (everything except entry points and `selfHostedAdapters`) never read `process.env`; exception: the Matrix plugin. Enforcement by lint rule belongs to 1.9.
- **Isolation test** (two Instances, two PGlite databases, one process, in the regular API test suite; 1.9 only adds the CI hookup): (1) writes in A invisible in B via API and worker, (2) secrets and blobs stay separate through their per-Instance adapter scoping, (3) disposing A leaves B running, (4) shared plugin modules carry no shared state (a plugin counts calls per Instance), (5) worker runs of A and B do not interfere.
- **Noted for the worker ticket:** `polling`/`reconciling`/`lastFailures` in `apps/worker/src/main.ts` are top-level module state and must move into a per-Instance worker object.
