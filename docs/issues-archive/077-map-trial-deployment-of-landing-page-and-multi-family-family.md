# #77 Map: Trial deployment of landing page and multi-Family family-agenda on the Cube

- State: CLOSED (NOT_PLANNED)
- Labels: wayfinder:map
- Created: 2026-11-14T14:13:11Z
- Closed: 2026-11-14T19:26:02Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/77

## Destination

On one Cube, the landing page (apex, behind Basic Auth and `noindex`) and family-agenda in multi-Family mode (`app.`) run in the topology decided for production: `api`/`worker`/`cleanup`, Postgres with WAL-G, Authentik (`auth.`), plugin containers with their Egress Proxies, Object Storage, mail, monitoring, AI Model Hub. An automated end-to-end run with 50 concurrent synthetic Families (sign-in, Agenda, add a Source, sync with real Extraction) is green. No registration, no billing.

## Notes

- **This map carries execution**, not only decisions: `task` tickets build and deploy.
- Decisions of [Map: Run the hosted service on IONOS](https://github.com/artkoenig/family-agenda-cloud/issues/46), [Map: Scaling refactorings for hosted family-agenda (Phase 0 + 1)](https://github.com/artkoenig/family-agenda-cloud/issues/1) and [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32) stand. Build issues live under [Run the hosted multi-Family service](https://github.com/artkoenig/family-agenda-cloud/issues/24).
- State on 2026-11-14 (public `main` @ `61fe07f`, release 0.6.0): the plugin side is ready for shared hosting — stateless plugin containers shared by several Instances, one Egress Proxy each, plugin contract 3.0 with per-call tickets naming the Family's `public_id`, pinned `ics`/`imap`/`webuntis` images, published `ghcr.io/artkoenig/family-agenda` image, one OIDC IdP from the environment. The core is still single-Family: no control database, register, routing by Family, `KeyWrapper` (public #357 open), S3 `BlobStore`, Operator-set LLM endpoint, due-work worker or `cleanup`; password sign-in cannot be switched off. The public issues #224–#238 once named in the build issues never existed; the build issues under #24 were corrected on 2026-11-14 and now point to #78. Public ADRs were renumbered (artkoenig/family-agenda#289); public ADR-0003 says a provider runs one Instance per Family and needs amending for shared processes (#31).
- **AGPL rule (standing):** every code change to family-agenda lands in the public repo; the Cube runs only unmodified public release tags. This private repo holds only Compose, Caddy, `.env`, `plugins.yml`, scripts, runbooks, the landing page and E2E tests that talk HTTP. No import of family-agenda code, no patched image. Own Postgres image with WAL-G, Authentik and Caddy are separate works. Public issues carry a self-hosting-only rationale, no SaaS context.
- The Cube becomes the production Cube; its data is throwaway until launch stage (a) of `docs/launch-checklist.md`.
- Synthetic data only; no real Family content.
- Language: English in tickets; domain terms untranslated. Skills: `grilling` + `domain-modeling` for decisions, `research` for research tickets (findings in `docs/research/`).

## Decisions so far

<!-- one line per closed ticket -->
- [Research end-to-end and load tools for 50 concurrent browser users](https://github.com/artkoenig/family-agenda-cloud/issues/80): k6 HTTP drives the 50 Families at protocol level (runs on a laptop or a standard runner) and Playwright Test adds at most 5 real browsers; sign-in through Authentik depends on #82, 50 real browsers were not measured.
- [Research synthetic Sources for the trial](https://github.com/artkoenig/family-agenda-cloud/issues/81): the demo Source (contract 3.0, no published image) or ICS files behind Caddy cover add-and-sync for 50 Families, but only an IMAP fixture gives real Extraction: Dovecot on the Cube under a public DNS name with a Let's Encrypt certificate on 993, because the Egress Proxy refuses Compose names and private addresses; hairpin to the Cube's own public IP is untested.
- [Provision the Cube and its surroundings](https://github.com/artkoenig/family-agenda-cloud/issues/85): `cube-1` (Debian 13) runs in Frankfurt on `85.215.67.239` with SSH by key, `@`/`app`/`auth` point to it, the buckets `family-agenda-cloud-blobs` and `family-agenda-cloud-backup` exist and the AI Model Hub token is valid until 2027-11-14; the mailbox is not set up.
- [Decide the repo layout of the Operator configuration](https://github.com/artkoenig/family-agenda-cloud/issues/84): `cube/` is the Compose project copied 1:1 to `/opt/family-agenda`, `scripts/` runs on the laptop, `e2e/` holds the tests; `site/` is copied and served by Caddy's `file_server`, Basic Auth and `noindex` sit in the Caddyfile, and `.env` and the Operator key file stay out of git.
- [Deploy the landing page on the apex behind Basic Auth](https://github.com/artkoenig/family-agenda-cloud/issues/86): `https://family-agenda.cloud/` serves `site/` through Caddy 2.11.9 with a Let's Encrypt certificate, Basic Auth (user `preview`) and `noindex`; `scripts/deploy.sh` redeploys, the Cube is bootstrapped with Docker.

## Not yet specified

- The mailbox `no-reply@family-agenda.cloud`: the domain contract includes no Mail Basic mailbox; which product to book, and whether the trial needs mail at all.
- Deploying the multi-Family image itself (Compose, `bootstrap.sh`, `deploy.sh`, `smoke.sh`): waits for the cut and the repo layout.
- Authentik setup on the Cube and its mail path.
- WAL-G archiving and the monitoring crons in the trial.
- The E2E run itself and where its results are recorded.
- Removing the test Families and data before launch stage (a).
- How the 50-Family run relates to the launch gate "capacity check of 120 databases and 60 open Instances" from [Decide launch readiness](https://github.com/artkoenig/family-agenda-cloud/issues/71).

## Out of scope

- `site` service, registration, Stripe, `billing-worker`, legal texts: [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32).
- Real Family data on the Cube.
- WebUntis Sources in the E2E run (no fake server).






