# #65 Decide staging

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T10:13:18Z
- Closed: 2026-11-13T14:27:58Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/65

## Question

Does a second environment exist next to production? If so: how small, what it shares with production (Cube, buckets, AI Model Hub token, domain or subdomain) and how a release reaches it before production. Builds on [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54), [Decide Postgres hosting and cluster capacity](https://github.com/artkoenig/family-agenda-cloud/issues/55) and [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58).

---

**Comment by artkoenig, 2026-11-13T14:27:57Z**

## Resolution

**No second environment. The maintainer's self-hosted Instance on the home server is the test place; production is tested before registration opens, and then guarded by a smoke check after each release.**

- **Staging:** none. No second Cube, no second Compose project beside production. What a standing staging would buy — a rehearsal surface — is already there twice over: the maintainer runs a self-hosted Instance on the home server, which (unlike `pnpm preview`) exercises real Sources, real mail, WebUntis and the LLM path, and `pnpm preview up <pr>` runs a pull request as a throwaway Instance with demo data on the laptop. A second Cube would add a second Authentik, second mail sender, second DNS set and permanent drift; the scarce resource is Operator work, not the ~22.50 EUR/month.
- **Before registration opens, production *is* the staging.** The checks that cannot run on `localhost` run on production itself in that window, when it holds no Customer and no Family content: the Authentik mail sign-in test ([Decide where OpenBao and Authentik run](https://github.com/artkoenig/family-agenda-cloud/issues/56)), Let's Encrypt HTTP-01 on the real apex / `app.` / `auth.`, DKIM and SPF of `no-reply@family-agenda.cloud` ([Decide the transactional mail sender](https://github.com/artkoenig/family-agenda-cloud/issues/67)), the Google OAuth redirect URIs, and the restore drill ([Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59)). Testing there has the virtue that it tests the real names, certificates and DNS, which no throwaway can.
- **What stands between a release and production:** CI, then the release tried by hand on the home server Instance, then `deploy.sh`, then a **smoke check** on production. No staging deploy in between.
- **Smoke check:** `smoke.sh` in this repo, run by `deploy.sh` right after `docker compose up -d`. It checks: HTTPS 200 on `app.` and `auth.`; every container running and healthy; the schema version in the database matching the deployed image; one round trip to the AI Model Hub; the newest WAL segment in the Berlin bucket younger than about 10 minutes; the `health` dead man's switch green ([Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64)). On failure it prints loudly and exits non-zero; the Operator decides. **No automatic rollback** — an older image refuses an already migrated database ([Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58)), so the attempt would fail second and leave a worse state. Without a staging environment this is the only check that touches the real hostnames, certificates and Postgres, so it is mandatory, not optional.
- **Deployable to production: release tags only** (`ghcr.io/artkoenig/family-agenda:X.Y.Z`). A hotfix is cut as a patch release, never deployed as `sha-<commit>`. `main` and `sha-<commit>` stay the tags for the home server Instance and `pnpm preview`. Production never runs a commit that no release note describes — which is exactly the state to avoid when restoring from backup alone.
- **Canary:** the maintainer's own Family is the first Family on production, used daily, and every release is watched there before anyone else is told. It is the only honest test of the real Source paths and it also closes the "real mail not yet measured" gap from [Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53). Accepted: the maintainer's own Family content sits on the shared Cube from day one.

### Later, at a notable number of Families
A **throwaway Cube**, created for one risky change and destroyed the same day (Cubes bill by the hour, about 0.60 EUR for a day), rather than a standing staging. Kept in the map's Not yet specified: which changes earn it (the move to managed PostgreSQL, an Authentik or Postgres major upgrade, an ingress or certificate change, a change to the backup or restore path, the first run of a destructive migration), and what it shares with production — nothing writable: own ephemeral IP with `staging.` / `auth-staging.` records edited by hand, own certificates, own bucket, own freshly generated Operator key file, Postgres empty and seeded unless the change is about data, no mail sender, and the production AI Model Hub token reused. The backup bucket is never shared: a staging WAL stream pointed at the production prefix is a way to lose the real backup.

