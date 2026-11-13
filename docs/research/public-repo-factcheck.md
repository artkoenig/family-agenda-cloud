# Fact-check: public repo vs. `docs/skalierung-refactorings.md`

Issue: artkoenig/family-agenda-cloud#2. Method: read-only shallow clone of `artkoenig/family-agenda`, `main` at `83a960d2f13b3bc40b1de2470a6512ace0c01a14` ("Drop the hints about the state before 0.1.0 (#211)"), 2026-11-06. All paths are relative to that repo. Line numbers refer to that commit.

Legend: CONFIRMED = holds as written. DELTA = differs; the document should change or the plan must account for it.

## Summary of deltas that matter

1. **1.1 is already half done.** `bootApplication(config)` accepts optional `clock`, `secretStore`, `blobStore`, `extractor`, `textExtractor`, `identityProviderClient`, `tessdataCatalog` and either `databaseUrl` or `connectDatabase()`. Missing: a way to pass the `JobQueue`, and the DB-connection-by-value (only a factory). The refactoring is "complete the existing override seam", not "invent injection".
2. **`runMigrations` takes a `PostgresConnection`, not a URL** (1.5).
3. **`JobQueue` is effectively dead code**: only `start()`/`stop()` are called; `send`/`work` have no callers outside the adapter. pg-boss still opens its own pool and creates its schema in each Family database (1.1, 1.6).
4. **Module-level state is wider than the plugin hook** (1.2): the SDK-sharing hook is global, and plugins/Matrix read `process.env` (`DATABASE_URL`) directly. The `SourceRegistry` itself is per boot, not shared.
5. **Worker intervals are 5 s / 5 s / 1 h, but the secret sweep runs once at start, and extraction rides on the poll tick** (1.3).
6. **`private: true` and `tsx` confirmed**, and the production image runs `tsx` too (1.7).
7. **ADR-0008 explicitly says Agenda Cloud is a separate program talking over a network protocol and may stay proprietary.** A private repo that links the AGPL packages into one process is the opposite case (0.1).
8. **ADR-0004 says "no hosted multi-tenant version" and no hosted version at all; ADR-0013 nevertheless reads ADR-0004 as allowing "a hosted offering [giving] each Family its own Instance".** Internal tension that the new ADR should resolve.

## Section 1.1 Composition root as library

| Claim | Verdict | Evidence |
|---|---|---|
| `bootApplication` and `bootWorker` live in `apps/api/src/composition-root.ts` | CONFIRMED | `bootApplication` L194, `bootWorker` L375. |
| They build adapters themselves from `readConfig()` | DELTA (partly) | `readConfig()` (`apps/api/src/config.ts` L21) is called by the entry points (`apps/api/src/main.ts` L7, `apps/worker/src/main.ts` L10, `apps/api/src/cli.ts` L13), not inside the boot functions. The boot functions take an `ApplicationConfig` (L93-120) and default the adapters themselves. |
| Adapters could be passed in | DELTA | Already possible, as optional overrides: `clock`, `secretStore`, `blobStore`, `extractor`, `textExtractor`, `identityProviderClient`, `tessdataCatalog` (L105-119); defaults resolved in `resolveDefaults` (L156) and `resolveStores` (L172). Database: `DatabaseConfig = { databaseUrl } \| { connectDatabase: () => PostgresConnection }` (L86-91; "called on every boot"). Tests use exactly this seam (`apps/api/test/support/boot.ts`, PGlite). |
| `JobQueue` among the adapters | DELTA | `bootWorker` hard-codes `new PgBossJobQueue(config.databaseUrl)` (L377) and its config type demands `databaseUrl` (L375), so `bootWorker` cannot use `connectDatabase` alone. No `jobs.send`/`jobs.work` call exists in `apps/` or `packages/` outside `packages/adapters/src/pg-boss-job-queue.ts`; the port (`packages/application/src/ports.ts` L798-801) has no consumer. |
| Ports `SecretStore`, `BlobStore`, `Extractor`, `Clock` exist | CONFIRMED | `ports.ts`: `Clock` L30, `SecretStore` L134, `BlobStore` L144, `Extractor` L758 (also `TextExtractor` L772, `OcrModelStore`, `JobQueue` L798). `Extractor` is `extract/health/models`, so a quota-metering LLM adapter fits. |
| Other hidden adapters the list omits | DELTA | Not injectable today: `Argon2idPasswordHasher` (hard-coded in `createAdminAccess` call), `OidcIdentityProviderClient` default, `TessdataDirectory` (filesystem), `masterKeyFile` (L97) read by `loadMasterKey` (L360) even when a custom `secretStore` is given, `pluginDirectory` / `workspacePackages` (plugin discovery from disk). A KMS `SecretStore` must still satisfy `masterKeyFile` (the Recovery Kit uses `masterKey`, L93 of the wiring: `createRecoveryKitAccess({ clock, families, masterKey })`). |
| `selfHostedAdapters(config)` factory | n/a | Does not exist; `resolveDefaults`/`resolveStores` are the private precursors. |
| `bootApplication` also runs migrations and mkdir/link of tessdata on every boot | DELTA (new) | `runMigrations(postgres)` (L197) and `ocrModels.linkBundled()` (L227-231) run per boot; booting an Instance per Family on demand pays this each time (relevant to the LRU pool in phase 2). |
| `Application.close()` closes the pool | CONFIRMED | `close: () => postgres.close()` (L355). Pool is `new pg.Pool({ connectionString })` with no size option (`packages/adapters/src/postgres/database.ts` L28), so "1-2 connections per family" needs a new option. |

## Section 1.2 No module-level state

| Claim | Verdict | Evidence |
|---|---|---|
| `source-registry.ts` uses `registerHooks` | CONFIRMED | `apps/api/src/source-registry.ts` L3, L131. |
| "The registry is loaded once and shared between instances" | DELTA | Only the hook is global (`hookRegistered` L120, `sharingDirectories` L119, mutated by `shareSdkWith` L128-150). `SourceRegistry.discover(...)` is called per `bootApplication` (L111-114) and holds its own per-instance `loading`/`loadFailures` maps (L44-45), so each Instance re-reads manifests. Plugin module code is cached by Node's ESM loader per process, so plugin module-level state would be shared across Instances. Also `sharingDirectories` only grows. |
| "Nothing else is global per process" | DELTA | (a) `packages/source-matrix/src/index.ts`: `export default createMatrixPlugin()` (L416), a process-wide singleton plugin with closure state (`sessions` Map, `services`, L165-167); reads `process.env.MATRIX_INSTANCE_FILE`, `SYNAPSE_PYTHON`, `MAUTRIX_WHATSAPP` (L165, L420-421) and, in `servicesFromEnvironment`, `process.env.DATABASE_URL`, `MATRIX_DATA_DIRECTORY`, `MATRIX_HOST`, `MATRIX_SERVER_NAME` (L427-436). With several Families in one process this resolves to one database. (b) Module-level constants only (`nonGroupRoomTypes` etc.) are immutable. (c) `apps/api/src/http/app.tsx` L136-146 reads font files with `readFileSync` at import (immutable, shared). (d) `apps/api/src/http/agenda-page.tsx` `let` vars (L52, L92, L119-120) are inside client-side script strings, not server state. (e) `apps/worker/src/main.ts` top-level `polling`, `reconciling`, `lastFailures` (L28, L67, L69) are per-process and top-level-await module state; fine for the worker entry point but not reusable. |
| Matrix services (Synapse, bridges, ADR-0011) can be switched off per Instance | DELTA | There is no explicit switch. They run only while an Admin has enabled at least one Messenger (ADR-0011, "Messengers are enabled by an Admin"); `services.reconcile` is driven by the worker's 5 s tick. A SaaS deployment that never enables the Matrix Source Type gets the effect, but "disable per Instance" would need e.g. not installing/discovering `source-matrix` (it is a workspace package, found via `workspacePackages`). Synapse also needs its own `synapse` database on the same Postgres server (ADR-0011, "How it fits together"). |
| Test: two instances/two DBs in one process | Not present | `apps/api/test/support/boot.ts` creates one throwaway Instance per test; no two-Instance test exists. |

## Section 1.3 Worker loop

| Claim | Verdict | Evidence |
|---|---|---|
| `pollDue()` every 5 s | CONFIRMED | `tickMs = 5_000` (`apps/worker/src/main.ts` L5), `setInterval(poll, tickMs)` (L65), `worker.polling.pollDue()` (L32). Overlap guarded by `polling ??=` (L31). |
| Services reconciled every 5 s | CONFIRMED | `servicesTickMs = 5_000` (L8), `setInterval(reconcile, servicesTickMs)` (L86). |
| Retention hourly | CONFIRMED | `retentionTickMs = 60*60*1000` (L18), `setInterval(purge, ...)` (L26); also once at start (L25). |
| "All via `setInterval`" | CONFIRMED | Three `setInterval`s. (The only other one in `apps/` is `mdns-main.ts` L52, 60 s, unrelated.) |
| Secret sweep belongs with the periodic work | DELTA | `worker.secretSweep.sweep()` runs once at worker start (L13-15), not periodically. |
| Extraction is a separate tick | DELTA | `extraction.extractPending()` is chained after `pollDue()` in the same 5 s tick (L48); there is no separate extraction timer. `pollDue` itself decides per Source from its last-run time and interval (`packages/application/src/polling.ts` L146-175), i.e. due-ness is computed, not stored; a `nextDueAt()` needs a new query over Source intervals, plus catalogue-entry intervals (L146, L159). |
| Not `JobQueue`-based | CONFIRMED | pg-boss is started but no jobs are enqueued or worked (see 1.1). |
| "200 queries per second idle for 1,000 families" | DELTA (arithmetic) | One tick per 5 s per Family = 200 ticks/s; each tick issues several queries (sources, catalogues, pending messages, plus the services reconcile tick), so the real count is a multiple. The qualitative point stands. |

## Section 1.4 HTTP app without own server

| Claim | Verdict | Evidence |
|---|---|---|
| `createApp(application)` returns a Hono app, `main.ts` binds the port | CONFIRMED, different name and signature | `createHttpApp(application, options)` in `apps/api/src/http/app.tsx` L149 returns `new Hono<Env>()` (L166). `apps/api/src/main.ts` L9-16 passes `createHttpApp(...).fetch` to `serve({ port: config.port })` from `@hono/node-server`. No listener is created inside `createHttpApp`. |
| Options are config-independent | DELTA | `HttpOptions` needs `trustProxy`, `version`, `publicUrl`, `agendaAccess` (`main.ts` L10-16); a gateway must supply per-Family values. `publicUrl` is a per-Instance origin (`config.ts` L38-43). |
| `createHttpApp` is exported from a package | DELTA | `apps/api/package.json` `exports` lists only `./composition-root` and `./config`; `./http/app` is not exported, and `apps/api` is `private: true`. |
| Other per-Family HTTP state | CONFIRMED none beyond the fonts read at import | See 1.2(c). Sessions live in Postgres (`AdminSessionRepository`). |

## Section 1.5 Migrations by call

| Claim | Verdict | Evidence |
|---|---|---|
| `runMigrations(url)` exists | DELTA | Signature is `runMigrations(connection: PostgresConnection)` (`packages/adapters/src/postgres/database.ts` L48-50), which only calls `connection.migrate()`. A URL variant needs `connectPostgres(url)` first (L27). Exported from `@family-agenda/adapters` (imported at `composition-root.ts` L28). |
| Safe to run for many DBs sequentially | CONFIRMED with note | `migrate()` takes `pg_advisory_lock(7_342_001)` per database (L25, L35) and refuses newer/older migration history (`refuseOldMigrationHistory`, `refuseNewerMigrationHistory`, imported L6). A "stale DB is skipped" rollout (phase 2) must handle those refusals as a status, not a crash. |
| Migrations also run on every boot | CONFIRMED (new) | `bootApplication` L197. |

## Section 1.6 Contract tests for ports

| Claim | Verdict | Evidence |
|---|---|---|
| Ports exist: `BlobStore`, `SecretStore`, `Extractor`, `JobQueue` | CONFIRMED | `ports.ts` L144, L134, L758, L798. |
| Exportable suites exist today | DELTA | None found as shared suites. Tests live under `apps/api/test` (`deployment`, `http`, `use-cases`, `source-plugins`, `support`) with in-memory fakes in `test/support`. `tools/release` has an SDK-API check (`check-sdk`, `sdk-api`, `packages/source-sdk/api.txt`), the only existing "public API" tooling. |
| `JobQueue` needs a contract | DELTA | Unused port (see 1.1); a contract for it is speculative. `SecretStore` has `list()` (used by `createSecretSweep`), which a KMS adapter must also support. |

## Section 1.7 Publishing packages

| Claim | Verdict | Evidence |
|---|---|---|
| All packages `"private": true` | CONFIRMED | Root, `apps/api`, `apps/worker`, `packages/{adapters,application,contracts,domain,source-sdk,source-ics,source-imap,source-matrix,source-webuntis}`, and `tools/*` (grep of every `package.json`). |
| Code runs through `tsx` at runtime | CONFIRMED | `apps/api/package.json` `start`/`cli` scripts; `apps/worker/package.json` `start`; `Dockerfile` L26 (`family-agenda` CLI wrapper) and L42 (`CMD ["node","--import","tsx","src/main.ts"]`); `compose.yaml` L79; `tsx` is a runtime dependency of both apps. |
| Packages export TypeScript sources | CONFIRMED (new) | e.g. `packages/adapters/package.json` `exports: { ".": "./src/index.ts" }`; `apps/api` exports `./src/*.ts`. Publishing needs a build step and `exports` to point to `dist`. |
| Workspace deps | CONFIRMED | `workspace:*` between packages; pnpm 12.17.0, Node >= 22.12 (root `package.json`). |
| `source-sdk` public API tracked | CONFIRMED (new) | `tools/release` `check-sdk` fails when the SDK API changes without a version bump; this is a ready model for a SemVer gate on the new library API. |
| depcruise present | CONFIRMED | `.dependency-cruiser.cjs` rules: domain/application/adapters layering, `source-plugins-import-only-source-sdk`, `packages-do-not-import-apps`, `no-circular`. Note `packages-do-not-import-apps` means the composition root, which lives in `apps/api`, cannot be consumed by a package; the private repo imports from `apps/api` via its `exports`. |

## Section 1.8 Automatable setup

| Claim | Verdict | Evidence |
|---|---|---|
| `/setup` open until first Admin exists, at `app.tsx:240` | CONFIRMED, line shifted | Gate middleware L240-247 (`admins.needsFirstAdmin()`; redirects to `/setup`, 404 on `/setup` once an Admin exists); `GET /setup` L257; `POST /setup` L259-274 (`admins.createFirstAdmin`, then session start and redirect to `/admin/recovery-kit`). Whoever posts first wins; `AdminRepository.addFirst` returns boolean (`ports.ts` L54) so the race is resolved in the DB. |
| CLI knows only `reset-admin-password` | CONFIRMED | `apps/api/src/cli.ts` L5-11; installed as `/usr/local/bin/family-agenda` (`Dockerfile` L26). It boots a full `bootApplication(readConfig())` (L13) including migrations. |
| LLM endpoint set only in Admin area | CONFIRMED | `llmEndpoint: LlmEndpointAccess` (`createLlmEndpointAccess`, `composition-root.ts` L294-299) is reached via HTTP admin routes only; `readConfig` has no LLM variables. Stored in the single-row `llm_endpoint` table (ADR-0013 amendment), its key via `SecretStore`. |
| Recovery Kit after first admin | DELTA (new) | The first-admin flow redirects to `/admin/recovery-kit`; `RecoveryKitAccess` is built from the master key (`composition-root.ts` L93). A provisioned Family without master-key file semantic (KMS) must define what the Recovery Kit means. |

## Section 1.9 Guardrails

| Claim | Verdict | Evidence |
|---|---|---|
| depcruise rule for a public API | Feasible | `.dependency-cruiser.cjs` already has per-package rules; a rule for library entry points is additive. |
| CI test with two Families | Not present | See 1.2. `apps/api/test/support/in-process-postgres.ts` (`acquirePostgres`) and `boot.ts` provide the seam (`connectDatabase`) to boot two Instances in one process. `pnpm check` = lint + typecheck + depcruise + crap + mutation (root `package.json`), so a new test also runs under Stryker/CRAP gates. |

## ADRs

All four ADRs have front matter `status: proposed` (ADR-0013: `proposed, partly superseded by ADR-0016`).

### ADR-0004 (`docs/adr/0004-self-hosted-only-with-paid-agenda-cloud-services.md`)

- CONFIRMED: excludes a hosted offering. Wording: "runs only as a self-hosted Instance that serves one Family. There will be no hosted multi-tenant version." Reason: WhatsApp (ADR-0001) and WebUntis cannot run in a provider's cloud. Doc 0.2's "messenger and WebUntis stay self-hosted" matches this rationale. "Considered Options" rejects multi-tenant SaaS with row-level security, and "SaaS plus a local connector agent".
- DELTA: ADR-0004 does not leave room for a hosted per-Family Instance; it limits the paid offering to Agenda Cloud *services* (Remote Access, `Notifier`, hosted `Extractor`, backup target) that an Instance subscribes to, "a separate system with its own repository", holding "no Items". The doc's "partial supersession" is therefore a full reversal of the first two sentences, not an amendment. The Agenda Cloud services table also lists a `Notifier` port and Remote Access that do not appear in `ports.ts` today (no `Notifier` interface found), so the doc's port list (SecretStore, BlobStore, Extractor, JobQueue, Clock) is the real set.
- DELTA: ADR-0004 says "No Source ever runs in Agenda Cloud"; this stays consistent with the doc only if the hosted Instances run without Matrix/WebUntis (as the doc states) but WebUntis `source-webuntis` and IMAP/ICS run in the hosted worker. IMAP and ICS are compatible with the ADR's rationale; WebUntis is listed in the doc as "possibly" switched off, ADR-0004 would require it off.
- Cross-reference: ADR-0013 and ADR-0011 cite ADR-0004 (hosted offering; Remote Access).

### ADR-0008 (`docs/adr/0008-agplv3-with-dco.md`)

- CONFIRMED: AGPLv3, DCO sign-off per commit, no CLA. "Without a CLA, the project cannot be relicensed or dual-licensed later without every contributor's consent."
- CONFIRMED: sole copyright holder today. GitHub contributors API: `artkoenig` 116 commits, plus `github-actions[bot]` 1 and `renovate[bot]` 1 (no external human contributor as of this check). `main` is a single squashed-history clone only at depth 1; contributor counts come from the API.
- DELTA (important for 0.1): the ADR's Consequences state "Agenda Cloud is a separate program that talks to the Instance over a network protocol, so it is not covered by the Instance's licence and may stay proprietary." The doc's design (private repo imports the public packages as a library in one process) is the case the ADR does not cover. Doc 0.1's reading (derived work) is consistent with the ADR's reasoning but contradicts its consequence; the ADR needs updating. While the author is sole copyright holder he can license his own code to himself under any terms (dual-licensing), but the repo's own DCO policy applies to future contributions. Legal review remains advisable; this fact-check does not give legal advice.
- Dependency note: ADR-0008 lists AGPL-compatible dependencies; private adapters (S3, KMS SDKs) are in the private repo and are not checked by it.

### ADR-0011 (`docs/adr/0011-messengers-are-read-through-matrix-bridges.md`)

- CONFIRMED: Synapse and bridges are child processes of the *worker*, run only while at least one Messenger is enabled by an Admin; `source-matrix` is one Source Type; Synapse uses a separate `synapse` database on the Instance's Postgres server (created by the worker on first start); bridge sessions live in SQLite in the `matrix-data` volume; "reachable only on the Instance's internal network".
- DELTA: "per-Instance switch off" is by Admin enablement and plugin presence only (see 1.2); there is no config flag. A shared worker process hosting many Families would collide on ports (`synapse: 8008`, bridge `29318`, fixed in `servicesFromEnvironment`) and on `DATABASE_URL`, `MATRIX_DATA_DIRECTORY`, `MATRIX_SERVER_NAME`. Switching it off for SaaS is therefore a must, not a nicety.
- DELTA: ADR-0011 states the image carries Synapse's Python env and bridges for every Instance, a few hundred MB, "also without Messengers" (Consequences). Relevant for the RAM/image estimates in the doc's table: the idle cost without Messenger excludes them (Synapse only runs when enabled), consistent with "ca. 350 MB ohne Messenger".
- Cross-reference: cites ADR-0010 (plugin registration, `services` reconcile "every few seconds"), ADR-0016, ADR-0001, ADR-0004 (homeserver never in Agenda Cloud).

### ADR-0013 (`docs/adr/0013-an-instance-is-one-family-without-family-ids.md`)

- CONFIRMED: "Every Instance has its own database"; "no `families` table and no `family_id` column"; Family implied by the database; single-row tables with boolean key constrained to `true`.
- DELTA: partly superseded by ADR-0016: `settings` is now `family`, tables are singular, single-row tables are `family`, `llm_endpoint`, `background_activity`; ADR-0017 adds `identity_provider`. The code's `FamilyRepository` (`ports.ts` L40) is that single-row table. Doc section "Ziel und Leitlinien" cites ADR-0013 correctly in substance.
- DELTA: ADR-0013 says "a hosted offering would give each Family its own Instance rather than share one (ADR-0004)", while ADR-0004 says there will be no hosted version. The doc's model (one database per Family, shared processes) is compatible with ADR-0013's data model but "Instance" in the ADRs means a deployment unit (process + volumes). The doc's "embeddable Instance" ADR should define whether "Instance" = process or = logical Family. Consequences also state: "Serving several Families from one Instance would need a Family id... We accept that"; the doc keeps its database-per-Family so no conflict, but it makes a new in-process "multi-Instance" concept the ADR did not anticipate.
- Related: `ADR-0007` (family boundary without row-level security) is superseded by this ADR.

## Other facts relevant to later issues

- Public repo has `docs/research/` and `GLOSSARY.md` (domain terms: Instance, Family, Source, Source Type, Admin, Origin, Item, Recovery Kit, Agenda). Use these terms in the new ADRs.
- Image `CMD` is `src/main.ts` of `apps/api` only; the worker is a separate service in `compose.yaml` (`apps/worker`). Both migrate at start under the advisory lock.
- The self-hosted deployment always runs two processes sharing one Postgres, with `ActivityRepository` ("shared between the worker and the api", `ports.ts` ~L810) as an existing cross-process state; there is no in-process event channel, so API and worker already coordinate only via the database. This favours the doc's "scheduler + runDueWork" split.
- Tests boot real composition root against in-process PGlite (`@electric-sql/pglite` dev-dependency of `apps/api` and `adapters`); production uses `pg`.
