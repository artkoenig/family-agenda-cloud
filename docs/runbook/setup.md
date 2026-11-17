# Setup runbook

Sets up the one Cube and everything around it by hand, once. The same steps recreate it after a host loss.
Follows [Decide compute platform and topology](https://github.com/artkoenig/family-agenda-cloud/issues/54),
[Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58),
[Decide Operator backups and disaster recovery](https://github.com/artkoenig/family-agenda-cloud/issues/59) and
[Decide the transactional mail sender](https://github.com/artkoenig/family-agenda-cloud/issues/67).

Secrets never go into this repo. Every secret below is stored in the password manager under `family-agenda.cloud`.

Day-to-day work with the Families is in the [Families runbook](families.md).

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
3. Generate one Object Storage access key for the service. Store key and secret in the password manager. They go
   into the `.env` on the Cube as `BLOB_BUCKET_ACCESS_KEY` and `BLOB_BUCKET_SECRET_KEY`, with the blob bucket's name
   as `BLOB_BUCKET` ([step 7](#7-host-and-first-deploy)).

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
   `/opt/family-agenda`, and `/var/lib/family-agenda-blobs`, where the bucket of the Families' blobs is mounted.
   Safe to run again; run it again on a Cube set up before the blob mount.
2. Create `/opt/family-agenda/.env` on the Cube (root only, mode 600) with the keys of `cube/.env.example`. Generate
   each secret once, on the laptop, and store it in the password manager before it goes into the `.env`; the two
   places are the only ones a secret is kept in.

   | Key | What it is | How to get it |
   |---|---|---|
   | `LANDING_BASIC_AUTH_USER`, `LANDING_BASIC_AUTH_HASH` | Basic Auth in front of the landing page | a name and a password of the Operator's choice; the hash from `docker run --rm caddy:2.11.9 caddy hash-password --plaintext '<password>'`, in single quotes |
   | `OPERATOR_KEY` | wraps every family key and Family database password in the Directory | `openssl rand -base64 32`, exactly that |
   | `CONTEXT_KEY` | encrypts and signs the Contexts the cores open | `openssl rand -base64 32` |
   | `TRIGGER_TOKEN` | the bearer token of the cores' trigger port | `openssl rand -base64 32` |
   | `DIRECTORY_DATABASE_PASSWORD` | the Routing module's role on Postgres | `openssl rand -hex 32` |
   | `EGRESS_TICKET_KEY` | signs the Tickets the Egress Proxies check | `openssl rand -base64 32` |
   | `BLOB_BUCKET` | the name of the blob bucket | [step 4](#4-object-storage-contract-owned-buckets) |
   | `BLOB_BUCKET_ACCESS_KEY`, `BLOB_BUCKET_SECRET_KEY` | the Object Storage key the bucket is mounted with | [step 4](#4-object-storage-contract-owned-buckets) |
   | `FAMILY_WEBHOOK_SECRET` | signs the cores' `family.created` to the receiver | `openssl rand -base64 32` |
   | `REGISTRATION_DATABASE_PASSWORD` | the cores' role on Postgres for the shared registration database | `openssl rand -hex 32` (it goes into a URL) |
   | `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Logto's Traditional Web application the cores sign in with; redirect URI `https://app.family-agenda.cloud/sso/callback` | the Logto console |
   | `IDP_MANAGEMENT_ENDPOINT`, `IDP_MANAGEMENT_CLIENT_ID`, `IDP_MANAGEMENT_CLIENT_SECRET` | Logto's Machine-to-Machine application with the Management API role, which creates the Organizations | the Logto console |
   | `IDP_WEBHOOK_SECRET` | the signing key of Logto's PostRegister webhook to `https://app.family-agenda.cloud/idp/events` | the Logto console, after creating the webhook |

   Without the `OPERATOR_KEY` no family key and no Family database password in the Directory can be unwrapped
   again, from a backup either: the password manager's copy is the one that counts. `DIRECTORY_DATABASE_PASSWORD` and
   `REGISTRATION_DATABASE_PASSWORD` are set on Postgres at every deploy, so changing one in the `.env` and deploying changes it.
3. `scripts/deploy.sh`: copies `cube/`, `routing/` and `site/` to the Cube, pulls the images, builds the Routing
   module's, brings the services up and reloads Caddy. This is also the way to redeploy, and to bring a
   [new core version](#8-a-new-core-version) to the Families. What must be up before what, which
   Compose sees to:
   1. `postgres`, then `directory-database`, which makes the Routing module's role and the Directory's database,
      and the cores' role and registration database, and ends. `router`, `scheduler` and `receiver` start after it
      has ended.
   2. `blob-mount`, which mounts the blob bucket at `/var/lib/family-agenda-blobs/bucket` on the Cube
      ([ADR-0002](../adr/0002-the-blob-bucket-is-mounted-with-rclone-as-a-compose-service.md)). It is healthy once
      the bucket is mounted and its folder `families`, the blob root, is there. With a wrong bucket name or key it
      starts over and over, and the deploy fails waiting for it: `docker compose logs blob-mount` says why.
   3. The cores (`core`, two unless [scaled](#9-scaling-the-pool-of-cores)), `router`, `scheduler` and `receiver` start only
      once `blob-mount` is healthy. A core is healthy only while it sees the blob root.

   The plugins, their Egress Proxies and `caddy` wait for nothing, and the Routing module does not wait for the
   cores: it finds them at each call. The deploy ends when every service is up and healthy.

   The first deploy with the blob mount: a Family created before it has its old blob location in the Directory,
   in the Docker volume `family-agenda_blobs`, which no service mounts any more. After the deploy such a Family can
   neither store blobs nor be deleted (`The Family's blob location is not …; nothing was deleted`). So **before**
   that deploy delete every Family, the smoke check's included ([Families runbook](families.md)), and create them
   again after it; then `docker volume rm family-agenda_blobs`.
4. [Check the blob mount](#checking-the-blob-mount), after the first deploy and after every change to `blob-mount`.
5. Once: create the Family the smoke check opens and store its id in the password
   manager:
   `ssh root@family-agenda.cloud 'cd /opt/family-agenda && docker compose exec -T router routing create --organization-id <id>'`,
   with the id of a Logto Organization made for it in the Logto console.
6. `SMOKE_FAMILY_ID=<its id> scripts/smoke.sh`; with `LANDING_AUTH="user:password"` it also fetches the pages behind
   Basic Auth. It fails when that Family's address does not answer or an unknown Family id does not get 404.
7. Check by hand that the pool survives losing a core: on the Cube, `docker stop family-agenda-core-1`; run the smoke
   check again, which must pass; then `docker start family-agenda-core-1`.

The plugins and their Egress Proxies share a network with the cores and can reach the cores' ports 3002 (requests
with a Context) and 3001 (the Routing module's triggered operations); only the Context key and the trigger token, which
they do not hold, protect them.

The scripts reach the Cube as `root@family-agenda.cloud`; `CUBE_HOST` overrides it.

### Checking the blob mount

None of this has been run on the Cube yet; ADR-0002 lists what was tried on a laptop. Run it on the Cube, in
`/opt/family-agenda`, before the first Family of somebody else is created (stage (b) of
[#90](https://github.com/artkoenig/family-agenda-cloud/issues/90)), and write the result and the date of each check into
[#102](https://github.com/artkoenig/family-agenda-cloud/issues/102). `core-1` and `core-2` stand for
`family-agenda-core-1` and `-2`.

1. The mount is there, on the Cube and in every core:

   ```bash
   mountpoint /var/lib/family-agenda-blobs/bucket
   ```

   ```bash
   for core in $(docker compose ps -q core); do docker exec "$core" ls -ld /var/lib/family-agenda/blobs/bucket/families; done
   ```

   Expect `is a mountpoint`, and one line per core with the owner `node`.
2. A blob written through one core is read through another, and is in the bucket:

   ```bash
   docker exec family-agenda-core-1 node -e "const fs=require('node:fs');fs.mkdirSync('/var/lib/family-agenda/blobs/bucket/families/mount-check',{recursive:true,mode:0o700});fs.writeFileSync('/var/lib/family-agenda/blobs/bucket/families/mount-check/blob','written by core-1',{mode:0o600,flag:'wx'})"
   ```

   ```bash
   docker exec family-agenda-core-2 cat /var/lib/family-agenda/blobs/bucket/families/mount-check/blob
   ```

   ```bash
   docker compose exec blob-mount rclone ls "blobs:$(grep '^BLOB_BUCKET=' .env | cut -d= -f2)/families/mount-check"
   ```

   Expect `written by core-1` and one object `blob`. These are the calls the core's blob store makes.
3. A rename works (the core in supplied mode does none; the check is from the ticket):

   ```bash
   docker exec family-agenda-core-2 node -e "require('node:fs').renameSync('/var/lib/family-agenda/blobs/bucket/families/mount-check/blob','/var/lib/family-agenda/blobs/bucket/families/mount-check/renamed')" && docker exec family-agenda-core-1 cat /var/lib/family-agenda/blobs/bucket/families/mount-check/renamed
   ```

4. With the bucket unreachable, a write fails within seconds. Cut `blob-mount` off, write, and connect it again:

   ```bash
   docker network disconnect family-agenda_outbound family-agenda-blob-mount-1
   ```

   ```bash
   time docker exec family-agenda-core-1 node -e "require('node:fs').writeFileSync('/var/lib/family-agenda/blobs/bucket/families/mount-check/unreachable','x',{flag:'wx'})"
   ```

   ```bash
   docker network connect family-agenda_outbound family-agenda-blob-mount-1
   ```

   Expect an error (`EIO`) after 20 seconds at most, not a write that hangs or seems to work. Afterwards the write
   of check 2 under a new name works again.
5. Without the mount no core writes, and the mount comes back to running cores:

   ```bash
   docker compose stop blob-mount
   ```

   ```bash
   docker exec family-agenda-core-1 node -e "require('node:fs').mkdirSync('/var/lib/family-agenda/blobs/bucket/families/unmounted',{recursive:true})"
   ```

   ```bash
   docker compose up -d --wait blob-mount && docker exec family-agenda-core-1 cat /var/lib/family-agenda/blobs/bucket/families/mount-check/renamed
   ```

   Expect the write to fail (`EACCES` or `ENOTCONN`), `ls /var/lib/family-agenda-blobs/bucket` on the Cube to be
   empty while the service is stopped, and the read after it is back to work without restarting the core. If the
   read fails, restart the cores (`docker compose restart core`) and note it in the ticket.
6. Deleting a Family removes its folder from the bucket: create a Family, put a file into its folder, delete it
   ([Families runbook](families.md)), and list the bucket:

   ```bash
   docker exec family-agenda-core-1 node -e "const fs=require('node:fs');fs.mkdirSync('/var/lib/family-agenda/blobs/bucket/families/<id>',{recursive:true,mode:0o700});fs.writeFileSync('/var/lib/family-agenda/blobs/bucket/families/<id>/blob','x')"
   ```

   ```bash
   docker compose exec blob-mount rclone lsf "blobs:$(grep '^BLOB_BUCKET=' .env | cut -d= -f2)/families/"
   ```

   Expect the Family's id in the list before `routing delete` and not after it.

Clean up: `docker exec family-agenda-core-1 rm -r /var/lib/family-agenda/blobs/bucket/families/mount-check`.

## 8. A new core version

No command prepares the Families for a new core version, and the Routing module does not know which version the
cores run.

1. Read the release's notes in the public repo (`docs/upgrading.md`). Take a backup first if they say its migration
   cannot be undone: a core never goes back to a database a newer release migrated.
2. Change the core image in `cube/compose.yaml` (`x-core-image`) to the release's tag and digest, and the same image
   in the `real-core` job of `.github/workflows/ci.yml`, whose walk-through must pass against it.
3. `scripts/deploy.sh`. Compose replaces the cores.

What happens then, without the Operator:

- A core of the new release prepares each Family the first time it opens it, for a request or for its due work,
  whichever comes first. A Family nobody opens stays as it is until somebody does.
- While cores of both releases run, a core of the old one refuses a Family the new one has migrated
  (`409 migrated-by-newer-release`), and a core still preparing a Family for longer than 20 seconds answers
  `503 migrating`. The Router, the Scheduler and Provisioning then try the next core of the pool, each core at most
  once.
- If every core refuses, the browser gets `503` with `Retry-After: 30`, a scheduled run fails and is retried with
  its usual delay, and a Provisioning command fails with what each core answered. The Router's log says the same
  (`Every core that answered refused to open the Family`).

Check afterwards: `SMOKE_FAMILY_ID=<its id> scripts/smoke.sh`, and `routing families` for due work that keeps failing.

Going back to the release before means restoring the backup of step 1: its cores refuse every Family the new
release has opened.

## 9. Scaling the pool of cores

The cores are one Compose service, `core`, and the pool is its replicas: two unless `CORE_REPLICAS` in the `.env` on
the Cube says otherwise. The Routing module is told the pool by one name alone, `cores`, which every replica carries
on the `pool` network (`CORE_URL`, `CORE_TRIGGER_URL` in `cube/compose.yaml`), and asks at each call which cores the
name stands for, so it is neither reconfigured nor restarted.

1. On the Cube, set the number in `/opt/family-agenda/.env`, for example `CORE_REPLICAS=4`. The next deploy keeps it.
2. `cd /opt/family-agenda && docker compose up -d --wait core`. Compose starts or removes cores until that many run,
   and touches no other service.

What happens then, without the Operator:

- A new core takes its turn at requests and due work from the first call after it has started. A call that reaches it
  a moment before it listens goes on to the next core.
- A core that is removed is asked nothing from the next call on. What it was working on then is lost: a page being
  served breaks off, and a run of due work fails and is retried with its usual delay. Scale down when little is going
  on.
- With no core left, every Family's address answers `502`, and the Router's log says that the pool's name stands for
  no core or did not resolve.

Check afterwards: `docker compose ps core` lists that many cores as healthy, `docker compose exec router getent ahosts
cores` lists one address for each of them, and `SMOKE_FAMILY_ID=<its id> scripts/smoke.sh` passes.
