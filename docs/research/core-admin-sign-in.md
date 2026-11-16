# How the core signs an Admin in under supplied mode

Research for issue #126 (map #125). Sources read 2026-11-16, core repo artkoenig/family-agenda at `main` `1181f1a`. Facts only; this note decides nothing. Per the core's ADR-0001 rule, contracts come from its docs; source code is cited only where it confirms a doc or answers what the docs leave open, and such facts are marked **(code)**: they are implementation, not a documented contract.

Core sources: `docs/configuration.md` (sections "Triggered operations", "Admins without signing in", "Supplied mode", "Single sign-on (OIDC)", "Who becomes an Admin"), `docs/adr/0004-…`, `docs/adr/0007-identity-provider-configured-by-the-environment.md` (both amendments), `GLOSSARY.md` (Admin, Context, Triggered operation, Single sign-on, Identity Provider), `docs/schema.sql`. This repo: `routing/src/context.ts`, `routing/src/family-context.ts`.

## What we send

`routing/src/family-context.ts` `sealedContext` puts `identityProvider: { ...config.identityProvider, knownAdminsOnly: true }` into every Family's Context when the Operator configured one (`issuerUrl`, `clientId`, `clientSecret`, `requiredGroup`), and `publicUrl` = `<config.publicUrl>/<familyId>`. One Identity Provider config is thus shared by all Families.

## What an Admin is matched by

From configuration.md "Who becomes an Admin" and ADR-0007 amendment "sign-in only for known Admins":

1. Same `sub` as a stored Admin: signs in.
2. Otherwise an existing Admin with the same **verified email** is linked (its `sub` stored) and signs in. An Admin already tied to another identity is not re-tied.
3. Otherwise, with `knownAdminsOnly: true`: refused ("no Admin here has that address"); no Admin is made, not even the first.

Preconditions, checked on every sign-in: the ID token's `groups` claim contains `requiredGroup` (default `homelab-admin`); scopes `openid email profile groups`; the user has a verified email, else refused. Leaving the group ends no running session (14 days).

Details confirmed in code:

- Only `sub` is stored, not `iss`: column `admin.identity_subject TEXT UNIQUE -- the IdP sub` (`docs/schema.sql`). Match is by `sub` alone, per Family database.
- `email_verified` must be literally `true`; email compared after `trim().toLowerCase()` (`packages/domain/src/admin.ts` `parseEmail`) **(code)**.
- Identity resolution order exactly as above: `packages/application/src/admin-access.ts` `signInThroughIdentityProvider` **(code)**. A `sub` match does not need a verified email; the email check applies only to steps 2–3.
- Group is matched by exact string in the `groups` array (`packages/application/src/single-sign-on.ts` `complete`) **(code)**.

## Callback path and round trip

- Redirect URI: `<publicUrl>/sso/callback` (configuration.md "At the Identity Provider"; ADR-0007 amendment: "the redirect URI below the Context's `publicUrl`, its path prefix included"). For us: `<config.publicUrl>/<familyId>/sso/callback`, i.e. one redirect URI per Family to register at the Identity Provider.
- The sign-in is started at `<publicUrl>/sso/start` **(code: `apps/api/src/http/app.tsx`)**, linked from the sign-in page button. It sets a 10-minute cookie `fb_sso` (path `<prefix>/sso`, `SameSite=Lax`) with state, nonce and PKCE verifier, and 303-redirects to the IdP's authorization endpoint.
- Every SSO sign-in is a full OIDC authorization-code + PKCE round trip of the core's own (configuration.md "At the Identity Provider" step 1; `packages/adapters/src/oidc-identity-provider-client.ts` uses `openid-client` `discovery` + `buildAuthorizationUrl` + `authorizationCodeGrant`) **(code)**. No `prompt` parameter is sent, so whether the user sees a login screen depends on their session at the IdP. The core accepts no identity asserted by the caller: the Context carries no user, and nothing in the docs lets a caller sign an Admin in.
- SSO is offered only when the request reaches the core at the Context's `publicUrl`; the caller passes on the browser's host (`X-Forwarded-Host`/`-Proto` with `TRUST_PROXY=true`) (configuration.md "What the core keeps"). Elsewhere `/sso/start` and `/sso/callback` answer 404 **(code)**.
- After the callback the core issues its own session: cookie `fb_session`, path `<prefix>/`, `HttpOnly`, `SameSite=Lax`, 14 days; sessions are rows in the Family database (`admin_session`), so any core serving the Family accepts them (schema.sql; `sessionLifetimeMs` in admin-access.ts **(code)**). GLOSSARY "Single sign-on": the Family Agenda session that follows is its own. A protected Admin page without a session redirects to `<prefix>/admin/sign-in` **(code)**; it does not start SSO by itself.
- Password sign-in "stays and cannot be switched off" (configuration.md "Single sign-on (OIDC)").

## Adding Admins

- **Admin area:** any Admin adds another by email address; the password may be left empty for one who signs in only through the Identity Provider (configuration.md "Who becomes an Admin"; ADR-0007 amendment). Such an Admin is then linked on first SSO sign-in by verified email. Routes `GET /admin/admins`, `POST /admin/admins`, `POST /admin/admins/:id/password` **(code)**; no route to remove an Admin was found **(code)**. There is no invitation (no mail sent); "invite" does not appear in the docs.
- **From outside:** Triggered operation `POST /operations/enter-admin`, body `{ "email": "<address>" }`, answers `outcome` `"first"` | `"added"` | `"exists"` (no change), `400 invalid-email` (configuration.md "Triggered operations"). In supplied mode it runs on `TRIGGER_PORT` with `Authorization: Bearer <TRIGGER_TOKEN>` and the Family's Context in `X-Family-Context`, preparing the Family first if needed (configuration.md "Triggered operations in supplied mode"). The `family-agenda enter-admin` command runs in fixed mode only.
- `POST /operations/reset-admin-password` gives an Admin a random password (returned once) and ends their sessions; `404 unknown-admin`.

## What the core exposes about Admins

- Triggered operations listed by `GET /operations`: `due-work`, `purge`, `secret-sweep`, `enter-admin`, `reset-admin-password` (configuration.md). None lists Admins or reports Admin changes.
- No webhook, event or outbox for Admin changes is documented; none found in the code **(code)**. Admins added or changed in the Admin area are visible to an outside caller only by reading the Family database directly (not a documented contract).

## A Family created with a first Admin

- Yes, by email address: `enter-admin` on a Family without Admins returns `"first"`; that Admin has no password and signs in through the Identity Provider, which links its `sub` by the same verified email (configuration.md "Admins without signing in"; ADR-0007 amendment). The setup page is then gone.
- So the first Admin is identified by email, the same key step 2 of sign-in matches on; `sub` cannot be entered in advance (enter-admin takes email only).
- With `knownAdminsOnly: true` the setup page offers no SSO, only a password (configuration.md; `makesFirstAdminAt` in single-sign-on.ts). Until a first Admin exists, every page of the Family redirects to `<prefix>/setup`, where a password Admin can be created by whoever reaches it **(code: app.tsx middleware "Until the first Admin exists")**.
- The first Admin's Admin area shows only the Recovery Kit until it is confirmed (configuration.md "Who becomes an Admin"; ADR-0003).

## Doc inconsistency noted

GLOSSARY "Context" says the Context "opens only a Family that is already prepared, and writes nothing; only the Triggered operation that prepares the Family writes". configuration.md "Preparing on opening" says the first request or trigger with a Context prepares the database, and "Preparing the Family is no Triggered operation". The two disagree; configuration.md is the more detailed and newer section.
