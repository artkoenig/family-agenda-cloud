# Setup runbook

Sets up the one Cube and everything around it by hand, once. The same steps recreate it after a host loss.
Follows [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54),
[Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58),
[Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59) and
[Decide the transactional mail sender](https://github.com/artkoenig/family-agenda-cloud/issues/67).

Secrets never go into this repo. Every secret below is stored in the password manager under `family-agenda.cloud`.

## 1. SSH key

On the laptop, one key only for the Cube:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_family_agenda_cloud -C "operator@family-agenda.cloud"
```

## 2. Virtual data center and Cube (DCD, contract 39683376)

1. Create a virtual data center `family-agenda`, location `de/fra`.
2. Reserve one public IPv4 in `de/fra` (IP Manager), name `family-agenda-cube`.
3. Add a **Basic Cube M** (4 vCPU / 8 GB / 240 GB NVMe), name `cube-1`.
   - Image: newest Debian, set on the storage element **before** provisioning. It cannot be set afterwards; the
     Cube then has to be deleted and created again.
   - SSH key: the public key from step 1. No password login.
   - No default network security group on the data center.
4. Connect its NIC to the internet (public LAN) and assign the reserved IPv4 as primary IPv4. Leave **DHCP on**:
   without it the Debian image gets no address and the Cube is unreachable.
5. Activate the NIC firewall, ingress only:
   - TCP 80 from anywhere
   - TCP 443 from anywhere
   - TCP 22 from the Operator's home IP only
   - (optional) ICMP from the Operator's home IP
6. Provision. Check: `ssh -i ~/.ssh/id_ed25519_family_agenda_cloud root@<IP>` works.

## 3. DNS (IONOS SE, domain `family-agenda.cloud`)

A records, TTL 1 hour, all pointing to the reserved IPv4:

| Host | Type | Value |
|---|---|---|
| `@` | A | `<IP>` |
| `app` | A | `<IP>` |
| `auth` | A | `<IP>` |

Remove the default A/AAAA records of the IONOS parking page on the apex and on `www`. No wildcard. No AAAA records:
the Cube has IPv4 only. Do not activate the IONOS SSL certificate; Caddy gets its own from Let's Encrypt. Leave the
mail records IONOS created (MX, SPF, DKIM) untouched.

Check: `dig +short family-agenda.cloud app.family-agenda.cloud auth.family-agenda.cloud` returns the IP three times.

## 4. Object Storage (contract-owned buckets)

1. Bucket for blobs in **Frankfurt** (`eu-central-4`, endpoint `s3.eu-central-4.ionoscloud.com`):
   versioning on, lifecycle rule "delete noncurrent versions after 14 days" and "abort incomplete multipart uploads
   after 7 days". No rule that expires current versions. Block Public Access on.
2. Bucket for Operator backups in **Berlin** (`eu-central-3`, endpoint `s3.eu-central-3.ionoscloud.com`):
   Block Public Access on. Retention (14 days) is done by WAL-G, not by a lifecycle rule.
3. Generate one Object Storage access key for the service. Store key and secret in the password manager.

Bucket names are global; record the chosen names in the ticket.

## 5. Mailbox

Not set up yet: the domain contract includes no Mail Basic mailbox, it has to be booked as its own product.

IONOS Mail Basic 1, mailbox `no-reply@family-agenda.cloud`. Store the password in the password manager.
Add the mailbox to the Operator's mail client (bounces are read by hand).

Check: SPF (`v=spf1 include:_spf-eu.ionos.com ~all`) and the DKIM records resolve; add a DMARC record
`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<operator address>` if none exists.

## 6. AI Model Hub token

Generate a new token in the DCD (Management → Token Manager) and save it without trailing whitespace:

```bash
pbpaste | tr -d '[:space:]' > ~/.config/ionos/ai-model-hub.token && chmod 600 ~/.config/ionos/ai-model-hub.token
```

Set a calendar reminder two weeks before it expires.

Check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/.config/ionos/ai-model-hub.token)" https://openai.inference.de-txl.ionos.com/v1/models
```

## 7. Host and first deploy

1. `scripts/bootstrap.sh`: Docker, `unattended-upgrades` with a reboot at 04:00, SSH with keys only,
   `/opt/family-agenda`. Safe to run again.
2. Create `/opt/family-agenda/.env` on the Cube (root only, mode 600) with the keys of `cube/.env.example` and the
   values from the password manager.
3. `scripts/deploy.sh`: copies `cube/`, `routing/` and `site/` to the Cube, pulls the images, builds the Routing
   module's, brings the services up, reloads Caddy and runs `routing roll-out` for the `CORE_VERSION` of the `.env`.
   This is also the way to redeploy.
4. Once: create the Family the smoke check opens, with an address of the Operator's, and store its id in the password
   manager:
   `ssh root@family-agenda.cloud 'cd /opt/family-agenda && docker compose exec -T router routing create --admin-email <address>'`.
5. `SMOKE_FAMILY_ID=<its id> scripts/smoke.sh`; with `LANDING_AUTH="user:password"` it also fetches the pages behind
   Basic Auth. It fails when that Family's address does not answer or an unknown Family id does not get 404.
6. Check by hand that the pool survives losing a core: on the Cube, `docker compose stop core-1`; run the smoke check
   again, which must pass; then `docker compose start core-1`.

The plugins and their Egress Proxies share a network with the cores and can reach the cores' port 3000; only the
Context key, which they do not hold, protects that interface.

The scripts reach the Cube as `root@family-agenda.cloud`; `CUBE_HOST` overrides it.
