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

`app` is every Family's address, `auth` Logto's sign-in and registration.

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

Support alias: in the IONOS mail settings, set up the alias (forwarding) `support@family-agenda.cloud` to the
Operator's mailbox. Central sign-in's pages name it to a person who cannot get into their Family
(`routing/src/sign-in-pages.ts`). Check: a mail to it arrives in the Operator's mailbox.

Check: SPF (`v=spf1 include:_spf-eu.ionos.com ~all`) and the DKIM records resolve; add a DMARC record
`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<operator address>` if none exists.

## 6. AI Model Hub token

Generate a new token in the DCD (Management → Token Manager) and save it without trailing whitespace:

```bash
pbpaste | tr -d '[:space:]' > ~/.config/ionos/ai-model-hub.token && chmod 600 ~/.config/ionos/ai-model-hub.token
```

Set a calendar reminder two weeks before it expires. It is the cores' `LLM_API_KEY` in the `.env`
([step 7](#7-host-and-first-deploy)); a new token is that value changed and `scripts/deploy.sh`. An expired one fails
every Family's Extraction as `unauthorized`.

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
   | `LOGTO_DATABASE_PASSWORD` | Logto's role on Postgres, which owns Logto's database | `openssl rand -hex 32` (it goes into a URL) |
   | `IDP_MANAGEMENT_CLIENT_ID`, `IDP_MANAGEMENT_CLIENT_SECRET` | Logto's Machine-to-Machine application with the Management API role: the cores create the Organizations with it, `routing delete` deletes them | `pending` at first; [Setting up Logto](#setting-up-logto) |
   | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Logto's Traditional Web application "Family Agenda" the cores sign in with; redirect URI `https://app.family-agenda.cloud/sso/callback` | `pending` at first; the core's `logto-setup` prints them |
   | `IDP_WEBHOOK_SECRET` | the signing key of Logto's PostRegister webhook to `http://router:8080/idp/events`; the Router signs a lost PostRegister it sends again with it | `pending` at first; the core's `logto-setup` prints it |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth client of Logto's Google connector; optional, empty leaves Google off the sign-in screen | empty at first; [Google sign-in](#google-sign-in) |
   | `LLM_API_KEY` | the AI Model Hub token every core extracts with | [step 6](#6-ai-model-hub-token) |
   | `LLM_MODEL` | the AI Model Hub model; optional, `Qwen/Qwen3.8-27B` unless set | `openai/gpt-oss-120b` is the alternative ([launch checklist](../launch-checklist.md), gate 8) |

   Without the `OPERATOR_KEY` no family key and no Family database password in the Directory can be unwrapped
   again, from a backup either: the password manager's copy is the one that counts. `DIRECTORY_DATABASE_PASSWORD` and
   `REGISTRATION_DATABASE_PASSWORD` are set on Postgres at every deploy, so changing one in the `.env` and deploying changes it;
   so is `LOGTO_DATABASE_PASSWORD`. The cores ask Logto nothing before the first sign-in, so the first deploy comes
   up with the Logto keys at `pending`.
3. `scripts/deploy.sh`: copies `cube/`, `routing/` and `site/` to the Cube, pulls the images, builds the Routing
   module's, brings the services up and reloads Caddy. This is also the way to redeploy, and to bring a
   [new core version](#8-a-new-core-version) to the Families. What must be up before what, which
   Compose sees to:
   1. `postgres`, then `directory-database`, which makes the Routing module's role and the Directory's database,
      the cores' role and registration database, and Logto's role and database, and ends. `router`, `scheduler`,
      `receiver` and `logto` start after it has ended. `logto` seeds its database on its first start.
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
5. Once, after the first deploy: [set up Logto](#setting-up-logto).
6. Once: create the Family the smoke check opens and store its id in the password
   manager:
   `ssh root@family-agenda.cloud 'cd /opt/family-agenda && docker compose exec -T router routing create --organization-id <id>'`,
   with the id of a Logto Organization made for it in the Logto console.
7. `SMOKE_FAMILY_ID=<its id> scripts/smoke.sh`; with `LANDING_AUTH="user:password"` it also fetches the pages behind
   Basic Auth. It fails when that Family's address does not answer or an unknown Family id does not get 404.
8. Check by hand that the pool survives losing a core: on the Cube, `docker stop family-agenda-core-1`; run the smoke
   check again, which must pass; then `docker start family-agenda-core-1`.

The plugins and their Egress Proxies share a network with the cores and can reach the cores' ports 3002 (requests
with a Context) and 3001 (the Routing module's triggered operations); only the Context key and the trigger token, which
they do not hold, protect them.

The scripts reach the Cube as `root@family-agenda.cloud`; `CUBE_HOST` overrides it.

### Setting up Logto

Logto ([ADR-0009 of the core](https://github.com/artkoenig/family-agenda/blob/main/docs/adr/0009-admins-exist-only-in-the-identity-provider.md))
holds every Family's Admins; each Family is a Logto Organization. Its database is `logto` on the same Postgres as
the Directory, and is in the Operator's backups with it. The pages are at `https://auth.family-agenda.cloud`; the admin
console listens on the Cube's loopback alone.

1. `ssh -L 3002:localhost:3002 root@family-agenda.cloud`, open `http://localhost:3002`, create the console's
   administrator and store it in the password manager.
2. **Applications → Create → Machine-to-machine**, name `Family Agenda management`, role **Logto Management API access**. Put
   its App ID and App secret into the `.env` as `IDP_MANAGEMENT_CLIENT_ID` and `IDP_MANAGEMENT_CLIENT_SECRET`.
   Logto offers no way to create this application without the console.
3. On the Cube, the core's setup, with the mailbox of [step 5](#5-mailbox) for the codes that verify an email
   address:

   ```bash
   cd /opt/family-agenda && read -rs SMTP_PASSWORD && export SMTP_PASSWORD \
     LOGTO_M2M_APP_ID=$(sed -n 's/^IDP_MANAGEMENT_CLIENT_ID=//p' .env) \
     LOGTO_M2M_APP_SECRET=$(sed -n 's/^IDP_MANAGEMENT_CLIENT_SECRET=//p' .env) \
     && docker compose run --rm --no-deps -e LOGTO_M2M_APP_ID -e LOGTO_M2M_APP_SECRET \
       -e LOGTO_ENDPOINT=https://auth.family-agenda.cloud -e IDP_EVENTS_URL=http://router:8080/idp/events \
       -e SMTP_HOST=smtp.ionos.de -e SMTP_PORT=465 -e SMTP_USER=no-reply@family-agenda.cloud -e SMTP_PASSWORD \
       -e SMTP_FROM=no-reply@family-agenda.cloud core logto-setup
   ```

   The `core` service brings the rest: `CONTEXT_MODE=supplied`, the callback `OIDC_CALLBACK_URL`, and
   `IDP_MANAGEMENT_*`. It creates the Traditional Web application "Family Agenda" with that redirect URI, the
   PostRegister webhook to the Router (`/idp/events`, passed on to a core), the Organization role `admin`, the SMTP
   connector, and opens registration: email and password, the email verified by a code before the account exists.
   It must say `Registration open`.
4. Put the printed `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `IDP_WEBHOOK_SECRET` into the `.env`; the other printed
   values are in `cube/compose.yaml` already and must match it (`OIDC_ISSUER_URL=https://auth.family-agenda.cloud/oidc`,
   `IDP_MANAGEMENT_ENDPOINT=http://logto:3001`).
5. Central sign-in's own client, the landing page's "Anmelden" ([#154](https://github.com/artkoenig/family-agenda-cloud/issues/154)):
   `docker compose run -T --rm --no-deps router routing sign-in-client` registers the Traditional Web application
   "Family Agenda central sign-in" with the redirect URI `https://app.family-agenda.cloud/sign-in/callback` and the
   post-logout redirect URI `https://app.family-agenda.cloud/` (Abmelden, `/sign-in/out`), or updates it, and prints `CENTRAL_SIGN_IN_CLIENT_ID` and `CENTRAL_SIGN_IN_CLIENT_SECRET`; put both into the `.env`.
   Without them the Router answers `/sign-in` with 404. It sends the person into the Family of the Organization
   their ID token claims; a claim gone stale, of an Admin removed meanwhile, still sends them there, where the core
   refuses them: accepted, no special case. Then `scripts/deploy.sh`.

The setup may run again, after a new core version for example; it creates nothing twice and prints the same values.
It sets the sign-in methods, branding and SMTP connector back to its own on every run, so **deploy after every run of
the setup** (the wizard does).

The sign-in screen is Family Agenda's own ([#132](https://github.com/artkoenig/family-agenda-cloud/issues/132)):
`scripts/deploy.sh` sets it with `routing sign-in-experience` (`routing/src/sign-in-experience.ts`) after the setup's.
Sign-up stays the setup's: email, verified by a code, with a password; the terms and privacy policy
(`https://family-agenda.cloud/agb`, `/datenschutz`) must be accepted, for Google and invitations too. Sign-in is by
email and password, email and code, or passkey; a forgotten password is reset by a code. Google signs in when
`GOOGLE_CLIENT_*` are set and links to the account of the same verified email without asking. Screens follow the
browser's language, German otherwise. The Account Center at `https://auth.family-agenda.cloud/account` changes the
password and passkeys and shows the email. MFA is off. It also sets central sign-in's post-logout redirect URI, so
that Abmelden returns to the landing page ([#173](https://github.com/artkoenig/family-agenda-cloud/issues/173)). To run it alone:
`docker compose exec -T router routing sign-in-experience`; it ends with `Logto's sign-in experience is set`, and says
whether with Google.

The mails Logto sends are Family Agenda's own, German and English, not the SMTP connector's plain English texts:
`scripts/deploy.sh` puts them into Logto with `routing mail-templates` (`routing/src/mail-templates.ts`) as email
templates, which the setup leaves alone. Logto picks the one of the reader's language, else English. The logo in them
is `site/mail-logo.png`, served at `https://family-agenda.cloud/mail-logo.png`.

`scripts/logto-setup-wizard.sh` walks steps 1 to 5 and the deploy; it reads the secrets hidden and writes them
straight into the Cube's `.env`.

Check: until the landing page links to it ([#130](https://github.com/artkoenig/family-agenda-cloud/issues/130)),
register at the address the wizard prints last (`https://auth.family-agenda.cloud/oidc/auth?client_id=<OIDC_CLIENT_ID>&…&first_screen=register`)
with an address of the Operator's; the code mail arrives, and after it the new Family's address answers. The
callback may then show an error, since the sign-in started at Logto; `routing families` lists the Family anyway. The console shows the delivery under **Webhooks → Family Agenda**. Logto
does not retry a webhook: a PostRegister the Router or the cores miss creates no Family. Delete the trial Family
([Families runbook](families.md)).

### Google sign-in

Once, by the Operator; until then the sign-in screen offers no Google, and the deploy says so.

1. [Google Cloud console](https://console.cloud.google.com/), a project `Family Agenda`: **Google Auth Platform →
   Branding**: app name `Family Agenda`, support and developer email the Operator's, home page
   `https://family-agenda.cloud`, privacy policy `https://family-agenda.cloud/datenschutz`, terms
   `https://family-agenda.cloud/agb`, authorised domain `family-agenda.cloud`. **Audience**: External. **Data access**:
   `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile` only, so no review beyond brand verification is needed.
2. **Clients → Create client → Web application**, name `Logto`. The redirect URI names Logto's connector id, which
   exists only after the first run with the client: enter `https://auth.family-agenda.cloud/callback/pending` for now.
3. Put its client id and secret into the `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, store them in the
   password manager, and `scripts/deploy.sh`; it must say `with Google (connector created)`.
4. The connector id: in the Logto console (**Connectors → Social connectors → Google**), or
   `docker compose exec -T postgres psql -U postgres -d logto -Atc "select id from connectors where connector_id = 'google-universal'"`.
   Replace the redirect URI of step 2 with `https://auth.family-agenda.cloud/callback/<connector id>`.
5. Check: sign in with Google at the address the wizard prints last (with `first_screen=sign_in` instead of
   `register`), with a Google account whose email already has an account at Logto: no extra screen, the same account.

Google shows the app's name and logo on its screen only after brand verification, which needs the landing page and
privacy policy reachable without Basic Auth; until launch Google's screen names the domain instead. Rotating the
secret: change the `.env`, deploy; the run says `connector updated`. Emptying both keys leaves the connector and its
button as they are: remove it in the console.

### Checking the blob mount

All six checks passed on the Cube on 2026-11-16; the results are in
[#102](https://github.com/artkoenig/family-agenda-cloud/issues/102), and ADR-0002 lists what was tried on a laptop
before. Run them again in `/opt/family-agenda` after a change to the `blob-mount` service or its rclone image, and
write the result and the date of each check into #102. `core-1` and `core-2` stand for
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

   Expect an error (`EIO`) after 20 seconds at most, not a write that hangs or seems to work; on the Cube it came at
   once, on `close`. Afterwards the write
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
   in the `real-core` job of `.github/workflows/real-core.yml`, together with the core commit that job checks out (`ref`,
   the commit the image was built from; the demo Source plugin is built from it). The job's walk-through must pass.
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
