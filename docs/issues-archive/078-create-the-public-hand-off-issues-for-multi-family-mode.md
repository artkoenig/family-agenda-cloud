# #78 Create the public hand-off issues for multi-Family mode

- State: CLOSED (NOT_PLANNED)
- Labels: wayfinder:task
- Created: 2026-11-14T14:13:12Z
- Closed: 2026-11-14T19:26:04Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/78

## Question

Task (AFK draft, HITL publish). Turn the decisions of [Map: Scaling refactorings for hosted family-agenda (Phase 0 + 1)](https://github.com/artkoenig/family-agenda-cloud/issues/1) into implementable issues in the public repo, each with a self-hosting-only rationale and no SaaS context. Fix the dangling references (#224–#238) in the build issues under [Run the hosted multi-Family service](https://github.com/artkoenig/family-agenda-cloud/issues/24). Answer records the new public issue links.

## Context (checked 2026-11-14 against public `main` @ `61fe07f`, release 0.6.0)

Already public, no issue needed:

- Plugin containers shared across Instances, Egress Proxy per plugin, contract 3.0 per-call ticket with Family `public_id` ([artkoenig/family-agenda#358](https://github.com/artkoenig/family-agenda/issues/358), closed).
- One OIDC IdP from the environment (public ADR-0007).

Exists, open: [artkoenig/family-agenda#357](https://github.com/artkoenig/family-agenda/issues/357) `KeyWrapper` with a versioned Operator key file (`needs-triage`).

Missing, from the decisions of [#1](https://github.com/artkoenig/family-agenda-cloud/issues/1): composition root as library (1.1), no module-level state + two-Instance isolation test (1.2), worker as due-work functions with backoff, pg-boss removed (1.3), HTTP app with routing by Family (1.4), stable migrations API with pool options (1.5), port contract tests (1.6), library-API guardrails (1.9), register port / control database, due index with `SKIP LOCKED` leases, Family session cookie, Agenda links with Family id ([#21](https://github.com/artkoenig/family-agenda-cloud/issues/21)), several Operator-configured IdPs and no password sign-in, `cleanup` workload and closing a Family ([#20](https://github.com/artkoenig/family-agenda-cloud/issues/20)), S3 `BlobStore`, data-at-rest encryption ([#23](https://github.com/artkoenig/family-agenda-cloud/issues/23)), Operator-set LLM endpoint and onboarding ([#19](https://github.com/artkoenig/family-agenda-cloud/issues/19)), in-app Backup/restore ([#18](https://github.com/artkoenig/family-agenda-cloud/issues/18)), OCR Operator settings ([#22](https://github.com/artkoenig/family-agenda-cloud/issues/22)), Operator settings (upload limit, retention, grace period, kit confirmation).

Watch:

- Decisions of #1 cite the **old** public ADR numbers (ADR-0004, -0008, -0011, -0012, -0013) and packages (`source-sdk`, in-process plugins) that the 2026-11-09 rewrite removed; map them to the new set (ADR-0001…0007) and to plugin containers before writing issues. 1.2's "Matrix plugin off = not in plugin list" is now simply not declaring it in `plugins.yml`.
- Public ADR-0003 says a provider "runs one Instance per Family"; the hand-off needs an ADR amendment for shared processes and many Family databases ([#31](https://github.com/artkoenig/family-agenda-cloud/issues/31)).
- Build issues under [#24](https://github.com/artkoenig/family-agenda-cloud/issues/24) say "hand-off issues from #78, not yet created"; replace with the real links once created.

