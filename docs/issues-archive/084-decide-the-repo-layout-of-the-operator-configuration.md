# #84 Decide the repo layout of the Operator configuration

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-14T14:13:21Z
- Closed: 2026-11-14T17:50:26Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/84

## Question

Where in this repo do `compose.yaml`, the Caddyfile, `plugins.yml`, `bootstrap.sh`, `deploy.sh`, `smoke.sh`, the runbooks and the E2E tests live, how is the landing page in `site/` shipped to Caddy, and what stays out of git (`.env`, key file)?

---

**Comment by artkoenig, 2026-11-14T17:50:25Z**

## Resolution

**Directories**

```
cube/            the Compose project, copied 1:1 to /opt/family-agenda on the Cube
  compose.yaml
  Caddyfile
  plugins.yml
  .env.example
  postgres/Dockerfile
scripts/         run on the Operator's laptop
  bootstrap.sh  deploy.sh  smoke.sh
site/            the landing page (unchanged)
e2e/             k6 and Playwright, own package.json, talks HTTP only
docs/runbook/    runbooks (unchanged)
```

- `cube/` is exactly what `rsync` copies. Scripts live apart because they do not belong on the Cube.
- **One `compose.yaml`** that grows with each ticket (first only Caddy for the landing page). No profiles, no override files.

**Landing page**
- `deploy.sh` copies `site/` to `/opt/family-agenda/site`; Caddy mounts it read-only and serves it with `file_server`. No build, no image. It goes away without replacement when the `site` service arrives.
- **Basic Auth and `noindex` live in the Caddyfile, not in the HTML:** `basic_auth` with one user whose bcrypt hash comes from `.env` (`LANDING_BASIC_AUTH_HASH`), and the header `X-Robots-Tag: noindex, nofollow`. At launch two lines of the Caddyfile go; `site/` stays untouched.

**Out of git**
- `.env` and the Operator key file. Both exist only on the Cube and in the password manager, never in the working tree. `deploy.sh` does not copy them and excludes them from `rsync --delete`.
- In git: `cube/.env.example` with every key and no values. `.gitignore` gets `.env` and `*.key` as a safety net.

**SSH target of the scripts**
- `root@family-agenda.cloud` with the key `~/.ssh/id_ed25519_family_agenda_cloud`, overridable with the environment variable `CUBE_HOST`. No IP address in the repo.

**Own Postgres image (WAL-G)**
- `cube/postgres/Dockerfile`, built on the Cube through `build:` in Compose. No registry; the image stays on the Cube.

**Not decided here**
- Whether `deploy.sh` insists on a clean, pushed working tree. Left to the ticket that writes it.
- What `e2e/` contains beyond its place: [Decide how the 50 test users sign in](https://github.com/artkoenig/family-agenda-cloud/issues/82) and [Decide the E2E scenario, pass thresholds and AI Model Hub budget](https://github.com/artkoenig/family-agenda-cloud/issues/83).

