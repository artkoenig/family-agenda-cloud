# #1 Map: Scaling refactorings for hosted family-agenda (Phase 0 + 1)

- State: CLOSED (COMPLETED)
- Labels: wayfinder:map
- Created: 2026-11-06T20:01:27Z
- Closed: 2026-11-07T14:39:53Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/1

## Destination

Every decision in Phase 0 and Phase 1 of `docs/skalierung-refactorings.md` is made, so each public-repo refactoring can be handed off as an implementable issue, and the Phase 0 ADRs are settled. This map plans only; it builds nothing.

**Reached 2026-11-07.** Next: hand-off issues in the public repo (self-hosting rationale only), ADR drafts (0012 revised, 0004 superseded in part, 0008 rewritten, new ADRs for the Instance, the data-at-rest protection and multi-family Instances), and `GLOSSARY.md` additions ("Operator", "Onboarding", "Backup").

## Notes

- Source document: `docs/skalierung-refactorings.md` in this repo (German). Public repo: https://github.com/artkoenig/family-agenda (AGPLv3). This private repo is the SaaS side.
- Tickets and the map are private and may contain SaaS context. Issues/PRs later created in the public repo must be rewritten with a self-hosting-only rationale and no reference to SaaS plans.
- Language: English. Domain terms (e.g. "Composition Root", "Instance", "Operator") stay untranslated; consult the public repo's `GLOSSARY.md` and ADRs. In German conversation the Operator is "Betreiber"; "embedder" is obsolete.
- **Direction (changed 2026-11-07):** the cloud runs the **public image** itself: stateless `api`/`worker`/`cleanup` containers, scaled horizontally, serving many Families; only the database is bound to a Family (one per Family, ADR-0013, no `family_id`). Self-hosting runs the same image with one container of each kind and one Family. The private repo holds landing page, registration, provisioning, billing, operations. This replaces the earlier guideline "the public repo has no concept of tenants" and the private embedder.
- Skills: use `grilling` + `domain-modeling` for decisions; ADRs for the public repo are drafted, not committed, here.

## Decisions so far

<!-- one line per closed ticket -->

- Grace period when closing a Family (decided on the map, recorded in [Decide multi-family Instances in the public image](https://github.com/artkoenig/family-agenda-cloud/issues/20#issuecomment-6708315550)): closing locks the Family at once (no sign-in, Agenda links dead, workers skip it); grace period exists only for an Operator undo on request; length is an Operator setting, default 7 days; then cleanup deletes database, blobs, wrapped key and register entries.

- [Decide OCR models in hosted operation](https://github.com/artkoenig/family-agenda-cloud/issues/22): the Operator decides the OCR languages, the same for all Families; models are part of the image via build argument `OCR_LANGUAGES` (default `deu eng` + `osd`, fetched at build time from `tessdata_fast` at a pinned commit with SHA-256 checks); optional start parameter `OCR_EXTRA_LANGUAGES` downloads more at container start (checksummed; a failed download leaves the language unavailable, start continues) and hand-placed files count for self-hosters; available = image + model directory; no in-app download or deletion; N Tesseract processes per worker and an Operator-set page limit per attachment; ADR-0012 revised.

- [Decide onboarding flow and operator-set LLM endpoint](https://github.com/artkoenig/family-agenda-cloud/issues/19): Onboarding is its own UI before the Admin view, replacing `/setup` and the kit gate, with stored progress; self-hosted: Admin → new or restore → time zone → kit → LLM (skippable); hosted: sign in → language/time zone → new or restore; kit confirmation forced by an Operator setting (default on), confirmed after a restore; time zone per Family; LLM endpoint behind a port, Family-set or Operator-set (then hidden, read-only description line hosted); term "Operator" ("Betreiber") replaces "embedder".

- [Decide Backup format, export and restore in the app](https://github.com/artkoenig/family-agenda-cloud/issues/18): restore adopts the Backup's master key (Recovery Kit required, nothing re-keyed, previous kit invalid); Backup = all tables as stored + blobs + migration version, streamed and encrypted as a whole with a kit-derived key; older migrates, newer refused; no sessions, Matrix or LLM endpoint (target keeps its own); restoring Admin kept; typed confirmation, atomic apply; hosted upload limit set by the Operator; download offered in the closing dialog before locking; manual only.

- [Decide protection of Family keys and data at rest](https://github.com/artkoenig/family-agenda-cloud/issues/23): app-level AES-256-GCM of all content columns and blobs in the adapters (structure stays plain), `external_id` as HMAC, self-hosted and hosted alike; HKDF-derived keys for credentials, data and Agenda links from the one master key; hosted Operator key behind a `KeyWrapper` port in OpenBao/Vault transit; resumable in-app encryption of existing data; Operator key rotatable, Family keys not (a restore replaces the whole Family, key included).

- [Decide Recovery Kit in hosted operation](https://github.com/artkoenig/family-agenda-cloud/issues/17): kit stays hosted (way out of the cloud), always viewable while the Family exists; Operator access stated openly, "only ciphertext" applies to self-hosted backup targets only; Operator key never in databases or backups; no Operator recovery of lost kits. **Changed by onboarding:** the kit counts as confirmed after a restore; forced confirmation is an Operator setting.

- [Decide Agenda link format](https://github.com/artkoenig/family-agenda-cloud/issues/21): `/a/<Family id>/<Agenda id>.<HMAC(link key, Agenda id)>`, nothing stored, recomputed for display; revoked by deleting the Agenda; page, days, activity, tasks, ICS, manifest and photos (only shown members) hang off the link; old UUID links break without redirect; `Referrer-Policy: no-referrer`, secret masked in logs.

- [Decide multi-family Instances in the public image](https://github.com/artkoenig/family-agenda-cloud/issues/20): one address; Family from session cookie `<Family id>.<token>` (session in the Family DB) or the Agenda link path; Operator-configured IdPs incl. Google, identity → Family mapping in the register; register port (single Family self-hosted, control DB hosted); workers share a due index with `SKIP LOCKED` leases plus a per-DB advisory lock; separate cleanup (retention with Operator-set X, secret sweep, closing Families after a grace period); S3 blobs, Family keys wrapped by the Operator key (now via `KeyWrapper`); LRU of open Instances per container. OCR models split out → decided in the OCR decision.

- [Legal review of license and CLA decision](https://github.com/artkoenig/family-agenda-cloud/issues/13): no lawyer; reviewed from public sources; open points dissolved by dropping the CLA (no external code merged, SDK Apache-2.0). Remaining premise: the maintainer holds all rights to the code.

- [Decide contract tests for the ports (1.6)](https://github.com/artkoenig/family-agenda-cloud/issues/14): contracts for `BlobStore`, `SecretStore`, `Extractor` only; new `packages/port-contracts` (vitest peer dep); vitest-bound `describe…Contract(name, setup)`; default adapters and in-memory doubles run the same suites; Instance separation is a contract case; Extractor contract against an OpenAI-compatible stub server; quota exhaustion = `unreachable`; tightening a contract is major.

- [Decide guardrails for the library API and isolation (1.9)](https://github.com/artkoenig/family-agenda-cloud/issues/16): library API = `exports` of composition/http/application/adapters/domain/contracts/source-sdk; `api.txt` snapshot + SemVer check per package (extends `check-sdk`); depcruise: entry-point imports only, `http` sees no adapters; ESLint bans `process.env`/`cwd`/process time zone and top-level `let`; everything in `pnpm check`. (Since nothing is published, the API boundary is now internal.)

- [Decide migrations as stable API (1.5)](https://github.com/artkoenig/family-agenda-cloud/issues/12): migration stays lazy on open (always in `bootApplication`); `runMigrations`, `connectPostgres` and the two history errors become stable API; additive migrations only; no rollout loop, status call or `migrate` option.

- [Decide worker as due-work functions (1.3)](https://github.com/artkoenig/family-agenda-cloud/issues/11): `worker.dueWork.run()` + `nextDueAt()`; main sleeps to min(nextDue, 15 s); future `lastRunAt` counts as due; `run()` is overlap-safe. **Changed:** retention and secret sweep moved to cleanup; `dueWork` = polling + extraction.

- [Decide HTTP app without own server (1.4)](https://github.com/artkoenig/family-agenda-cloud/issues/10): `createHttpApp` moves to its own package; **reopened in part:** routing by Family moves into the public code; bare-UUID Agenda access replaced by Agenda links.

- [Decide setup automation: first admin and LLM endpoint (1.8)](https://github.com/artkoenig/family-agenda-cloud/issues/7): No CLI or token; `createAdmin` (password optional) callable by provisioning; `email_verified` required; **changed:** hosted IdPs are Operator-configured, no password sign-in hosted; LLM part replaced by the onboarding decision.

- [Decide removal of process-level state and Instance isolation (1.2)](https://github.com/artkoenig/family-agenda-cloud/issues/9): Plugin hook is the only allowed global; plugins keep no Instance state at module level; Matrix plugin not refactored, off = not in plugin list; libraries never read `process.env`; isolation test with two Instances/DBs in the regular suite.

- [Decide Composition Root as library (1.1)](https://github.com/artkoenig/family-agenda-cloud/issues/8): Required `Adapters` object passed to `bootApplication`/`bootWorker`; `selfHostedAdapters(config)` for defaults; hasher/OIDC/tessdata/plugins injectable; config split (behavior vs I/O); own package, apps become thin entry points. Wiring is now the public image's own multi-family composition.

- [Decide ADR: The Instance is embeddable (ADR 0.3)](https://github.com/artkoenig/family-agenda-cloud/issues/6): Instance = one Family's whole system (database, adapters, jobs), disposable in-process; **reopened in part:** "no tenants in public code" no longer holds.

- [Decide how ADR-0004 is superseded (ADR 0.2)](https://github.com/artkoenig/family-agenda-cloud/issues/5): Partial supersession; hosted Instances added alongside Agenda Cloud services; Matrix messengers never hosted, IMAP/ICS/WebUntis allowed; export/no lock-in and per-Family separation as principles; published when the maintainer decides. (Must also state Operator access openly, see the Recovery Kit decision.)

- [Decide license and contribution model (ADR 0.1)](https://github.com/artkoenig/family-agenda-cloud/issues/4): revised: AGPLv3 stays; no CLA, no external code merged ("open source, not open contribution"); plugin SDK Apache-2.0; ADR-0008 rewritten accordingly.

- [Fact-check the public repo against the refactoring document](https://github.com/artkoenig/family-agenda-cloud/issues/2): Most assumptions hold; deltas: ADR-0004 is reversed not amended; bootApplication already takes overrides but bootWorker/masterKeyFile/Matrix singleton do not; SourceRegistry is per boot; createHttpApp is unexported; runMigrations takes a connection.

- [AGPLv3 derivative-work and contribution-model options](https://github.com/artkoenig/family-agenda-cloud/issues/3): Same-process import likely makes a private repo a derivative work; DCO gives no relicensing room; seven options compared; CLA is time-sensitive; German-law points flagged.

## Review against the code (2026-11-07, main @ 83a960d)

Decisions to revisit (details in each ticket's review comment):

- [Decide setup automation: first admin and LLM endpoint (1.8)](https://github.com/artkoenig/family-agenda-cloud/issues/7): LLM via injected Extractor alone never runs → resolved by the LLM endpoint port in [Decide onboarding flow and operator-set LLM endpoint](https://github.com/artkoenig/family-agenda-cloud/issues/19). `email_verified` already enforced.
- [Decide Composition Root as library (1.1)](https://github.com/artkoenig/family-agenda-cloud/issues/8): master key should be **required** (root of credentials, data and Agenda-link keys; wrapped via `KeyWrapper` when hosted); pg-boss is started but unused → remove; time zone per Family (now stored in the Family DB, set in onboarding).
- [Decide ADR: The Instance is embeddable (ADR 0.3)](https://github.com/artkoenig/family-agenda-cloud/issues/6): `SecretStore` cannot be shared unscoped (secret sweep); now a contract case (1.6).
- [Decide worker as due-work functions (1.3)](https://github.com/artkoenig/family-agenda-cloud/issues/11): `nextDueAt()` loops hot while the endpoint fails → backoff needed.
- [Decide migrations as stable API (1.5)](https://github.com/artkoenig/family-agenda-cloud/issues/12): `connectPostgres` needs pool options.

## New requirements (maintainer, 2026-11-07)

- Onboarding, LLM configuration and Recovery Kit confirmation → decided in [Decide onboarding flow and operator-set LLM endpoint](https://github.com/artkoenig/family-agenda-cloud/issues/19).
- Backups only from the app; only a signed-in Admin may restore → decided in [Decide Backup format, export and restore in the app](https://github.com/artkoenig/family-agenda-cloud/issues/18).
- OCR models when hosted → decided in [Decide OCR models in hosted operation](https://github.com/artkoenig/family-agenda-cloud/issues/22).

## Not yet specified

- Nothing left.

## Out of scope

- [Decide publishing the packages (1.7)](https://github.com/artkoenig/family-agenda-cloud/issues/15): nothing is published; the cloud runs the public image. Publishing the plugin SDK for third parties may return as its own effort.
- A person in several Families (separated parents, grandparents): one Family per person; ruled out in the multi-family decision.
- OAuth instead of passwords for mail providers: an IMAP Source feature, ruled out in the data-at-rest decision.
- Per-container key distribution (`api` without the credentials key): needs Source setup moved out of `api`; later improvement, no re-encryption needed.
- Scheduled Backups to own storage (path, S3): ruled out in the Backup decision; manual download only.
- Private-repo work (landing page, registration, provisioning, billing, operations, Operator backups). Its own map later, as a fresh effort.

