# #86 Deploy the landing page on the apex behind Basic Auth

- State: CLOSED (COMPLETED)
- Labels: wayfinder:task
- Created: 2026-11-14T14:13:25Z
- Closed: 2026-11-14T18:14:32Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/86

## Question

Task. Caddy on the Cube serves `site/` on `family-agenda.cloud` (German at the root, English under `en/`) with a valid certificate, Basic Auth and `noindex`. Answer records the URL and how to redeploy.

---

**Comment by artkoenig, 2026-11-14T18:14:30Z**

## Resolution

Deployed on 2026-11-14.

- **URL:** `https://family-agenda.cloud/` (German), `https://family-agenda.cloud/en/` (English). `http://` redirects to `https://`.
- **Certificate:** Let's Encrypt, obtained by Caddy, valid until 2027-02-12, renewed by Caddy.
- **Basic Auth:** user `preview`; the password is with the Operator, its bcrypt hash in `/opt/family-agenda/.env` on the Cube. Without or with wrong credentials the answer is 401.
- **`noindex`:** header `X-Robots-Tag: noindex, nofollow` on every response, set in the Caddyfile.
- **Stack:** Caddy 2.11.9 as the only service of the Compose project `family-agenda` in `/opt/family-agenda`; `site/` is mounted read-only and served by `file_server`.
- **Host:** Docker 29.9.3 with Compose v5.7.1, `unattended-upgrades` with a reboot at 04:00, SSH with keys only (`scripts/bootstrap.sh`).

**Redeploy:** `scripts/deploy.sh` from the Operator's laptop, then `scripts/smoke.sh`. To open the page at launch, remove the `header X-Robots-Tag` and `basic_auth` directives from `cube/Caddyfile` and deploy.

Checked with `scripts/smoke.sh`: redirect, 401 without credentials, the `noindex` header, both pages and the stylesheet with credentials; also a font file and the certificate by hand. Not checked in a browser.

The files (`cube/`, `scripts/`, the runbook section) are in the working tree of branch `claude/deploy-landing-page-family-agenda-bbf6e3`, not committed yet.

Fits [Decide the repo layout of the Operator configuration](https://github.com/artkoenig/family-agenda-cloud/issues/84), with one addition: `scripts/lib.sh` holds what the three scripts share.

