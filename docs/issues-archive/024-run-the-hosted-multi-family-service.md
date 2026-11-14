# #24 Run the hosted multi-Family service

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:11:49Z
- Closed: 2026-11-14T19:25:16Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/24

## Why

[Map: Scaling refactorings for hosted family-agenda (Phase 0 + 1)](https://github.com/artkoenig/family-agenda-cloud/issues/1) settled how the public codebase changes so one installation serves several Families; [Map: Run the hosted service on IONOS](https://github.com/artkoenig/family-agenda-cloud/issues/46) settled how it runs. This issue tracks the Operator side: configuration, deployment and operation on the Cube. The trial deployment that exercises it is [Map: Trial deployment of landing page and multi-Family family-agenda on the Cube](https://github.com/artkoenig/family-agenda-cloud/issues/77).

## State of the public repo (checked 2026-11-14 against `main` @ `61fe07f`, release 0.6.0)

Already in the public image:

- Source Types as plugin containers over REST (public ADR-0001): stateless plugins hold nothing and can be shared by several Instances; `plugins.yml` plus the generator; one Egress Proxy per plugin.
- Plugin contract 3.0: each call carries a signed ticket (Family `public_id`, Source) and the Egress Proxy allows only that Source's hosts ([artkoenig/family-agenda#358](https://github.com/artkoenig/family-agenda/issues/358), closed); the Family has a `public_id` (amendment to public ADR-0003). Plugin images pinned for 3.0 (`ics`, `imap`, `webuntis`).
- Published image `ghcr.io/artkoenig/family-agenda:<X.Y.Z>` with release workflow.
- One OIDC Identity Provider from the environment (`OIDC_*`, public ADR-0007).

Not yet in the public image (multi-Family mode is decided but not built):

- Register / control database, routing by Family, Family session cookie, Agenda links with Family id, `cleanup` workload, closing a Family.
- `KeyWrapper` with the Operator key file ([artkoenig/family-agenda#357](https://github.com/artkoenig/family-agenda/issues/357), open, `needs-triage`), S3 `BlobStore`, Operator-set LLM endpoint (the endpoint is still set per Instance by an Admin and stored in Postgres).
- Worker as due-work functions with backoff (still `setInterval`; pg-boss still started), composition root as library.
- Several IdPs (only one `OIDC_*` set) and switching password sign-in off (public docs: "The password stays and cannot be switched off").

The public issues artkoenig/family-agenda#224–#238 named in earlier versions of these tickets were never created; only #357 exists. Creating the hand-off issues is [Create the public hand-off issues for multi-Family mode](https://github.com/artkoenig/family-agenda-cloud/issues/78); the cut needed for the trial is [Decide the cut of public issues needed for the trial](https://github.com/artkoenig/family-agenda-cloud/issues/79).

**Watch:** the public ADR set was replaced on 2026-11-09 (artkoenig/family-agenda#289). Old ADR numbers quoted in this repo (ADR-0004 self-hosted only, ADR-0008, ADR-0011, ADR-0012, ADR-0013) no longer exist. Public ADR-0003 now says a provider "runs one Instance per Family", while map #1 decided shared `api`/`worker`/`cleanup` processes serving many Family databases; its amendment already anticipates "one Instance serves several Families, each in its own database". The hand-off issues must amend ADR-0003 accordingly.

## Standing rules

- AGPL rule: every code change lands in the public repo; the Cube runs only unmodified public release tags. This repo holds Compose, Caddy, `.env`, `plugins.yml`, scripts, runbooks (repo layout: [#84](https://github.com/artkoenig/family-agenda-cloud/issues/84)).
- No staging ([#65](https://github.com/artkoenig/family-agenda-cloud/issues/65)), no rollback, fix forward ([#58](https://github.com/artkoenig/family-agenda-cloud/issues/58)), one Cube ([#54](https://github.com/artkoenig/family-agenda-cloud/issues/54)).

## Sub-issues

Listed below; each names what blocks it.

## Out of scope

Landing page, registration, billing: [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32).


---

**Comment by artkoenig, 2026-11-14T19:18:27Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
