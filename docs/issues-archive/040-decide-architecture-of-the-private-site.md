# #40 Decide architecture of the private site

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T16:29:30Z
- Closed: 2026-11-13T21:32:36Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/40

## Question

Where do landing page, registration and Customer area run, on what stack, and how do they reach the control database, provisioning and provider webhooks?

---

**Comment by artkoenig, 2026-11-13T21:32:34Z**

## Resolution

**Placement and stack**
- Own Compose service **`site`**, built from a private image in this repo, in the same Compose project and behind the same Caddy. Nothing of it goes into the public image.
- TypeScript on Node, **Hono + htmx**, server-rendered, with the same toolchain and Family Agenda design system as the public app. No static-site generator; landing page and legal texts are pages of `site`.
- A second service, **`billing-worker`**, runs from the same private image with a different start command and has no ingress.

**URL layout (apex `family-agenda.cloud`)**
- `/` is the landing page; legal texts sit under their own paths. `/register/...` is registration, `/account/...` is the Customer area, and `/stripe/webhook` receives Stripe's events. Paths are English.
- `app.` stays purely the public app. `site` uses host-only cookies on the apex, so they never collide with `app.`'s `<Family id>.<token>` cookie.

**Sign-in on the site**
- `site` is its own OIDC client at Google and Authentik and keeps its own session (session rows in the `site` DB). Nothing is shared with `app.`.
- What happens after signing in on the landing page:
  - **Customer** stays on the landing page; the header shows **App** (link to `app.`, which signs in again through the Identity Provider without a prompt) and **Account** (the Customer area).
  - **Family Member who is not the Customer** is sent straight to `app.`.
  - **Person not yet mapped to a Family** continues the registration.
- The app's Payment lock page links to `/account`.

**Data**
- Own **`site` database** with its own role, in the same Postgres and covered by WAL archiving. It holds:
  - registrations in progress,
  - acceptance records (terms version, timestamp, 18+, consumer),
  - Stripe customer and subscription ids per Family, and who is the Customer (`iss`+`sub`),
  - trial-abuse keys (card fingerprint, verified mail),
  - the webhook inbox, the job queue and rate-limit counters.
- The control database holds only what the public register port defines. `site`'s role gets **SELECT on the identity mapping table only**, for the "already mapped person" check.

**Provisioning and lifecycle**
- `billing-worker` alone holds the Operator key file and the privileged DB role (`CREATEDB`). Internet-facing `site` has neither and only enqueues jobs into the `site` DB; `billing-worker` takes them with `FOR UPDATE SKIP LOCKED`.
- **Webhook:** `site` checks the signature and stores the event, unique on the event id, then answers 200. `billing-worker` processes events in order:
  - subscription created in trial: provisioning;
  - `past_due` day 7: Payment lock;
  - payment succeeded: unlock;
  - end, withdrawal or chargeback lost: closing.
- The timing of these steps comes from Stripe's retry and cancel settings where possible; our own timers are used only where Stripe sends no event.
- Every register change goes through the public register/provisioning library, never through raw SQL from private code.
- **Periodic jobs in `billing-worker`:**
  - a daily reconcile of Stripe against the register: it re-enqueues what is safe to repeat (provisioning, unlock) and only raises an alert for anything destructive (lock, closing);
  - deletion of abandoned registrations after 30 days;
  - provisioning retries with backoff, then an Operator alert.

**Cancel and withdraw buttons (§ 312k, withdrawal)**
- Both are public `site` pages, reachable without signing in: identifying data, then a confirmation mail with a link. Both are also offered inside `/account`. Their effects become jobs for `billing-worker`, which acts through the Stripe API.

**Abuse limits**
- Per-IP rate limits live in `site`, with counters in the `site` DB and the client IP from Caddy's `X-Forwarded-For`; the stock Caddy image stays.
- The daily provisioning cap is enforced again in `billing-worker` before `CREATE DATABASE`.

**Mail, release, monitoring**
- `site` and `billing-worker` send through the existing `no-reply@` IONOS mailbox; failed sends are counted into the `health` alert.
- The private image is pinned in `compose.yaml` next to the public one and shipped by `deploy.sh`. `smoke.sh` also covers the apex and `/stripe/webhook`, which must answer 400 to an unsigned request.
- `health` alerts when the oldest unprocessed inbox event or job is older than 15 min.

**Left open:** what the Customer area holds and what its pages say (map fog "Contents of the Customer area"); which mails exist (fog "Transactional mail"); firewall and internal networks ([Decide the network layout](https://github.com/artkoenig/family-agenda-cloud/issues/69)).

