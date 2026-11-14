# #27 Object storage, key management and identity providers

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:05Z
- Closed: 2026-11-14T19:25:22Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/27

## Parent

#24 (public state and standing rules there)

## What to build

- Blobs: bucket `family-agenda-cloud-blobs` (Frankfurt, versioning 14 days) exists ([#85](https://github.com/artkoenig/family-agenda-cloud/issues/85)); one service key, prefix per Family enforced by the app ([#48](https://github.com/artkoenig/family-agenda-cloud/issues/48)); lifecycle rules delete nothing the app still references. Needs an S3 `BlobStore` in the public image.
- Operator key as a versioned, root-only key file on the Cube (no OpenBao, [#56](https://github.com/artkoenig/family-agenda-cloud/issues/56)), mounted only into `api`/`worker`/`cleanup`, never in databases or backups; offline copies in the password manager and on paper; rotation procedure.
- Identity providers: Google plus Authentik (mail codes, on `auth.`, same Cube, own database; [#56](https://github.com/artkoenig/family-agenda-cloud/issues/56), mail test passed in [#45](https://github.com/artkoenig/family-agenda-cloud/issues/45)). Client registration, redirect URLs, secrets in the root-only `.env` ([#58](https://github.com/artkoenig/family-agenda-cloud/issues/58)).
- No password sign-in in multi-Family mode.

Public 0.6.0 supports exactly one OIDC IdP from `OIDC_*` with a required group, and the password cannot be switched off (public ADR-0004, ADR-0007). Several Operator-configured IdPs, identity → Family mapping in the register and no password sign-in need public work.

## Acceptance criteria

- [ ] Bucket and IdP clients set up by hand following `docs/runbook/setup.md` (no infrastructure as code, [#58](https://github.com/artkoenig/family-agenda-cloud/issues/58))
- [ ] Operator key rotation tested on the Cube before registration opens (there is no staging)
- [ ] Recovery procedure for the Operator key file documented (loss of every copy means loss of all Families)
- [ ] Sign-in via Google and via Authentik mail code works end to end on the Cube

## Blocked by

- [artkoenig/family-agenda#357](https://github.com/artkoenig/family-agenda/issues/357) (`KeyWrapper` with Operator key file, open)
- Public S3 `BlobStore`, several IdPs and no password sign-in: hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), not yet created


---

**Comment by artkoenig, 2026-11-14T19:18:34Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
