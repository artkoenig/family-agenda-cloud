# #68 Decide how plugin containers and their Egress Proxies run on the Cube

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T10:13:28Z
- Closed: 2026-11-13T14:57:19Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/68

## Question

How do Source Types run for many Families on the one Cube with Docker Compose ([Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54)), how does egress stay restricted per plugin, and how many containers and how much RAM is that at 100 Families?

---

**Comment by artkoenig, 2026-11-13T14:57:18Z**

## Resolution

**The three hosted Source Types run as one shared container each on the Cube, every one with its own Egress Proxy, and a per-call ticket makes the proxy's allowlist request name its Family.**

### Shape on the Cube

- **One container per Source Type for all Families**: `plugin-ics`, `plugin-imap`, `plugin-webuntis`, one replica each. The plugin contract (ADR-0001) calls these stateless: every call carries the Source's configuration, its decrypted secrets and its Sync Cursor, so one container may serve many Instances. Per Family it would be 300 containers at 100 Families, for nothing.
- **`matrix` is not hosted** and it is the only singleton (one replica per Instance), so no Source Type needs a container per Family. A singleton Source Type would have to be decided anew.
- **One Egress Proxy per plugin** (`plugin-<id>-egress`, from the core image, CONNECT on 3128), on an internal network shared with that one container, as the generator already wires it. Not one shared proxy: that would hand `plugin-ics` the IMAP and WebUntis allowlist and throw away the per-container token.
- **Containers come from the generator**: a cloud-only `plugins.yml` in the private repo (no `matrix` block, digests pinned, Renovate-tracked) turned into `compose.plugins.yaml` by the core image, deployed by `deploy.sh` next to `compose.yaml`. The tested path, and egress wiring plus tokens stay consistent.
- **No `mem_limit`/`cpus` for now.** Hard limits were considered and dropped as unnecessary at this size; the Cube's RAM is watched by the `health` check from [Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64) instead.
- **Count and RAM at 100 Families**: 6 containers added (3 plugins + 3 proxies), roughly 150 MB per plugin and 100 MB per proxy, about **0.8 GB** on top of Postgres (3 GB), Authentik, `api`/`worker`/`cleanup` and Caddy — about 7 GB of the Basic Cube M's 8 GB, nothing to spare.
- **Growth trigger**: at sustained RAM above about 70 %, or when a fourth hosted Source Type arrives, recreate vertically on a **Memory Cube M** (4 vCPU / 16 GB, 23.36 EUR, about +6 EUR/month), as step 1 of the growth path in [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54). Plugins are the last workload to move off the Cube, since they only ever talk to `api` on the internal network.
- **Updating a plugin** is independent of a core release: bump the digest in the cloud `plugins.yml` and restart only that pair (`docker compose up -d plugin-imap plugin-imap-egress`); a short gap is accepted, and the digest must have run on the maintainer's own Instance first ([Decide staging](https://github.com/artkoenig/family-agenda-cloud/issues/65)).

### Egress per plugin, with the Family named

[Decide multi-family Instances in the public image](https://github.com/artkoenig/family-agenda-cloud/issues/20) already settled the rule: one address, and **every request names its own Family** — the session cookie `<Family id>.<token>`, or the Family id in the Agenda link path — which `api` resolves through the Family register (Family id → database) and the LRU of open Instances. Plugins and their proxies were never mentioned there.

Today's allowlist endpoint breaks that rule: `GET /egress/<service>` on `api:3001` is keyed on the **container** (a token per plugin service) and `allowlistOf` asks `hostsOf(sourceTypeId)` → `sources.listOfType(id)`, which is one Family's `sources` table. With one container per Source Type for all Families there is no Family in the request at all.

**Decision: the Family is carried per call, not collected across Families.**

- When the core calls a plugin, it mints a **ticket**: Instance (Family id) + Source id + a short expiry, HMAC-signed with a key the core and the proxies share. The call hands the plugin a proxy URL carrying that ticket.
- The plugin presents it to its Egress Proxy as `Proxy-Authorization` on the CONNECT.
- The proxy asks `api` with the ticket; `api` verifies it and from there it is the ordinary path of every other request: register → that one Family's database → **that one Source's** host fields, plus the container's declared hosts.
- Explicitly rejected: a cross-Family register of egress hosts in the control database (the union of all Families' host fields per Source Type). It would make every Family's mail and calendar hosts reachable from the one shared container, and it is exactly the rule from #20 turned around. Also rejected: signing the hosts **into** the ticket, which would drop the `api` request but freeze the allowlist at call time and make the proxy a verifier of core-issued permissions instead of a thing that asks the core.
- Self-hosting gains from it too: the allowlist narrows from per Source Type to per Source.

Cost: one internal request per CONNECT, as today.

### Hand-off and prerequisite

This is a **breaking plugin-contract change** (`contractVersion` **3.0**, after 2.0 in artkoenig/family-agenda#356): a plugin that keeps using the bare `HTTPS_PROXY` environment proxy gets `407` and the core reads it as a temporary error. Public-repo issue: [Scope an Egress Proxy's allowlist per Source with a per-call ticket (contract 3.0)](https://github.com/artkoenig/family-agenda/issues/358).

Because of it, **the three plugin repositories (`ics`, `imap`, `webuntis`) need a contract-3.0 release before registration opens**; noted as a prerequisite on [Decide launch readiness](https://github.com/artkoenig/family-agenda-cloud/issues/71).

### Facts behind it

- ADR-0001 (`docs/adr/0001-typescript-core-with-source-types-as-plugin-containers.md`), `docs/configuration.md` on the generator and the proxies, `apps/api/src/egress/{allowlist,allowlist-server}.ts`, `packages/application/src/egress-hosts.ts`, `plugins.yml` — public repo at `main`.
- Cube M sizing from [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54) and `docs/research/ionos-compute.md`.

