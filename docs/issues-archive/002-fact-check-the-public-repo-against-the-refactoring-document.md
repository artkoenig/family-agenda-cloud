# #2 Fact-check the public repo against the refactoring document

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-06T20:01:45Z
- Closed: 2026-11-06T20:06:30Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/2

## Question

Do the assumptions in `docs/skalierung-refactorings.md` hold in `artkoenig/family-agenda` (main)? Verify and report deltas for: `bootApplication`/`bootWorker` in `apps/api/src/composition-root.ts` and `readConfig()`; module-level state (`source-registry.ts`/`registerHooks`, anything else global per process); worker loop in `apps/worker/src/main.ts` (intervals); where the Hono app is created vs bound to a port; `runMigrations(url)`; `/setup` in `apps/api/src/http/app.tsx`; the CLI commands; the `private: true`/`tsx` setup; existing ports (`SecretStore`, `BlobStore`, `Extractor`, `JobQueue`, `Clock`); text of ADR-0004, ADR-0008, ADR-0011, ADR-0013.

---

**Comment by artkoenig, 2026-11-06T20:06:00Z**

Findings written to \`docs/research/public-repo-factcheck.md\` (public repo \`main\` @ 83a960d, read-only). Not committed (no commits yet in this repo). Issue stays open.

Key deltas vs \`docs/skalierung-refactorings.md\`:
- 1.1: \`bootApplication\` already takes optional overrides (clock, secretStore, blobStore, extractor, textExtractor, \`connectDatabase\`). Gaps: \`JobQueue\` hard-wired in \`bootWorker\` (needs \`databaseUrl\`), \`masterKeyFile\` still required, hasher/OIDC/tessdata/plugin dirs not injectable. \`readConfig()\` is called by entry points, not inside boot.
- 1.2: registry is per boot; only the \`registerHooks\` hook is global. \`source-matrix\` is a process singleton reading \`process.env\` (\`DATABASE_URL\`, fixed ports 8008/29318) and must be off in shared processes. No per-Instance switch exists.
- 1.3: intervals confirmed (5 s poll, 5 s services, 1 h retention). Secret sweep runs once at start; extraction is chained to the poll tick; due-ness is computed from last-run, so \`nextDueAt()\` needs a new query.
- 1.4: function is \`createHttpApp(application, options)\`; not exported from \`apps/api\`.
- 1.5: \`runMigrations\` takes a \`PostgresConnection\`, not a URL.
- 1.7: \`private: true\` and \`tsx\` (also in Dockerfile CMD) confirmed; packages export \`.ts\` sources.
- 1.8: \`/setup\` gate is at \`app.tsx\` L240-274; CLI only has \`reset-admin-password\`; confirmed.
- \`JobQueue\`: only start/stop used, send/work have no callers.
- ADR-0004: "no hosted version at all" (not just multi-tenant), so 0.2 is a reversal. ADR-0008: says Agenda Cloud as a separate networked program may stay proprietary; in-process linking is not covered. ADR-0011/0013 confirmed (0013 partly superseded by 0016; tension with 0004 noted).

---

**Comment by artkoenig, 2026-11-06T20:06:29Z**

Resolved: findings in docs/research/public-repo-factcheck.md (public repo main @ 83a960d). Deltas copied to affected tickets.
