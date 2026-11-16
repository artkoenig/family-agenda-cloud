# Authentik: mail code and Google in one flow

Research for issue #127 (map #125; builds on `docs/research/operator-oidc-provider.md`). Sources read 2026-11-16: docs.goauthentik.io (2026.8 docs) and the goauthentik/authentik repository at tag `version/2026.8.5`, the latest release (2026-10-21). Facts only; this note decides nothing. Items marked **[UNVERIFIED]** could not be confirmed from a primary source or were not tested. Nothing here was run: all findings come from docs and source code.

## Question

Can one Authentik OIDC provider offer mail code or magic link as the sole first factor **and** Google as a source in the same flow, with no password? How are new identities created (enrollment flow, or API from our registration), how is group membership set (the Context's `requiredGroup`), does a second relying party (a Family's core, after the Routing module) get a silent sign-in from the Authentik session, and what does one Docker Compose server need?

## Result

| Need | Finding |
|---|---|
| Magic link as sole first factor | Yes: upstream example flow, identification then Email stage then login, no password stage |
| Mail code (OTP) as sole first factor | Not documented. Source code does not forbid an Authenticator Validation stage with the email class right after identification, but the user needs an enrolled email device **[UNVERIFIED]** |
| Google in the same flow | Yes: Identification stage lists selected OAuth sources under the identifier field |
| New identity by enrollment flow | Yes: source enrollment flow for Google; any enrollment flow for mail |
| New identity by API | Yes: `POST /api/v3/core/users/` with `groups` |
| Group membership | API (`groups` field, `add_user`), or User Write stage "Create users group"; `groups` claim is in the default `profile` scope |
| Silent SSO for second RP | Yes in code: `prompt=none` succeeds when an Authentik session exists and the authorization flow has no interactive stage |
| Docker Compose | PostgreSQL, server, worker; no Redis since 2025.10; 2 CPU cores, 2 GB RAM; SMTP via `AUTHENTIK_EMAIL__*` |

## Findings

### Magic link as first factor

- Upstream ships `blueprints/example/flows-login-email-magic-link.yaml`: Identification (email, username), Email stage (`token_expiry: minutes=30`, template `email/account_confirmation.html`, `recovery_max_attempts: 5`), User Login. No password stage ([blueprint](https://github.com/goauthentik/authentik/blob/version/2026.8.5/blueprints/example/flows-login-email-magic-link.yaml)). This was already noted in `operator-oidc-provider.md`.
- How the link works, from source: the Email stage creates a `FlowToken` that pickles the current flow plan, and the link carries it as `flow_token`. Opening the link restores that plan into the session of the browser that opened it and continues from there ([email stage](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/stages/email/stage.py), [executor](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/flows/views/executor.py)). So the sign-in finishes in the browser that opens the link, not in the tab that asked for it. Read from code, not tested **[UNVERIFIED]**.
- The Email stage creates the token with `revoke_on_execution=False` ([email stage](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/stages/email/stage.py)); the model default is `True` ([flows models](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/flows/models.py)). So the link is not consumed on first open and stays usable until expiry. A mail scanner opening it would not burn it; whether a scanner's GET completes a login in the scanner's session is **[UNVERIFIED]**.
- The stage rejects a restored token whose user differs from the pending user, and sends no mail for an unsaved placeholder user from "Pretend user exists" ([email stage](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/stages/email/stage.py)).
- Failed sends are retried by the worker ([Email stage docs](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/email/)). The docs describe only tokenized links, no code mode.

### Mail code (OTP) as first factor

- The Email Authenticator Setup stage (since 2025.2.0) enrolls an email device; it can reuse the user's existing address, and the user confirms with a one-time code ([docs](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/authenticator_email/)).
- Authenticator Validation docs: the stage "normally appears in authentication flows after Identification and Password", and passwordless "currently relies on WebAuthn authenticators" ([docs](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/authenticator_validate/)). Email OTP is not documented as a first factor.
- Source: the validation stage only needs a saved pending user and lists that user's devices, email included ([stage.py](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/stages/authenticator_validate/stage.py)). Nothing in it requires a prior password. So identification followed by validation with the email class looks possible, but is not a documented setup **[UNVERIFIED]**.
- Users without an email device hit "Not configured action": Skip, Deny, or Configure (inject a setup stage) ([docs](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/authenticator_validate/)). With Configure, the first sign-in would enroll the device through a code sent to the address **[UNVERIFIED]**.
- API: `POST /authenticators/admin/email/` exists, but `EmailDeviceRequest` has only `name`, no user or address field ([schema.yml](https://github.com/goauthentik/authentik/blob/version/2026.8.5/schema.yml)). Pre-creating a device for an API-created user is therefore not shown **[UNVERIFIED]**.
- For unknown identifiers with "Pretend user exists", the validation stage returns an empty device list ([stage.py](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/stages/authenticator_validate/stage.py)).

### Google as a source in the same flow

- The Identification stage shows "Selected OAuth and SAML sources" below the identifier field; with no user fields selected, only sources are shown. It also has an optional enrollment flow link and a passwordless flow link ([identification](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/identification/)). So one stage can offer the email field (for the link) and a Google button.
- Google source setup: Google OAuth client, redirect URI `https://<authentik domain>/source/oauth/callback/<slug>/` ([Google](https://docs.goauthentik.io/users-sources/sources/social-logins/google/cloud/)). The Source stage that embeds a source inside a flow is Enterprise, per the same page; the Identification stage listing is not marked so.
- The Google type requests scopes `email profile` and maps `email` and `name` ([google.py](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/sources/oauth/types/google.py)).
- Each source has an `authentication_flow` (existing users), an `enrollment_flow` (new users), and `user_matching_mode`: `identifier` (default), `email_link`, `email_deny`, `username_link`, `username_deny` ([core models](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/core/models.py)). `email_link` links to a user with the same address and is flagged in code: "Can have security implications when a source doesn't validate email addresses."
- If the OAuth start happens in a flow where the user already identified, authentik passes `login_hint` with the user's email to the source ([OAuth source](https://docs.goauthentik.io/users-sources/sources/protocols/oauth/)).

### New identities

- Enrollment by flow: the default `default-source-enrollment` flow (no authentication required) prompts for a username only if none is set, then User Write with `user_creation_mode: always_create`, then User Login ([blueprint](https://github.com/goauthentik/authentik/blob/version/2026.8.5/blueprints/default/flow-default-source-enrollment.yaml)). The Google page says new users are asked for a username unless a property mapping such as `return {"username": info.get("email")}` sets it; that mapping also runs on later logins ([Google](https://docs.goauthentik.io/users-sources/sources/social-logins/google/cloud/)).
- User Write stage: "Create users group" adds new users to one group; user type Internal, External or Service Account; a policy can set `groups` (list of `Group` objects) in the flow plan context before the stage ([User Write](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/user_write/)).
- Enrollment by API: `POST /api/v3/core/users/` takes `username` (required), `email`, `groups`, `attributes`, `type`; plus `/core/groups/{group_uuid}/add_user/` and `/remove_user/`, and `/core/users/{id}/recovery_email/` ([schema.yml](https://github.com/goauthentik/authentik/blob/version/2026.8.5/schema.yml)). An API-created user with an email address meets the magic-link flow's needs (pending user plus `email`) per the Email stage code; not tested **[UNVERIFIED]**.
- Linking a later Google sign-in to an API-created user depends on `user_matching_mode` (see above).

### Groups in the token

- The default `profile` scope mapping returns `"groups": [group.name for group in request.user.groups.all()]`, so the claim carries group names ([providers-oauth2.yaml](https://github.com/goauthentik/authentik/blob/version/2026.8.5/blueprints/system/providers-oauth2.yaml), [OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
- The default `email` scope mapping returns `"email_verified": False` for every user ([providers-oauth2.yaml](https://github.com/goauthentik/authentik/blob/version/2026.8.5/blueprints/system/providers-oauth2.yaml)). A core that checks `email_verified` would need a custom mapping.

### Silent SSO for a second relying party

- Issuer is per application by default, `https://authentik.company/application/o/<application_slug>/`; a global mode uses the instance root for all providers set to it ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
- Authorize endpoint, from source ([authorize.py](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/providers/oauth2/views/authorize.py)):
  - `prompt=none` without an Authentik session returns `login_required` to the client.
  - With a session, it runs the provider's authorization flow and then issues the code. The session is the Authentik one, shared by all applications on that instance.
  - `prompt=none` together with `prompt=consent` returns `consent_required`.
  - `prompt=login` or `max_age=0` force re-authentication; `max_age` is checked against the session's login event.
- Default authorization flows: `default-provider-authorization-implicit-consent` and `...-explicit-consent` ([blueprints](https://github.com/goauthentik/authentik/tree/version/2026.8.5/blueprints/default)). With implicit consent no stage asks the user, so a second RP after the Routing module's sign-in gets a code without interaction. Behaviour of `prompt=none` with an explicit-consent flow, or when an application policy denies the user, was not traced **[UNVERIFIED]**.

### One Docker Compose server

- Compose file on `main`: `postgresql` (`postgres:16-alpine`), `server`, `worker`; no Redis. Worker mounts the Docker socket for outposts ([compose.yml](https://github.com/goauthentik/authentik/blob/main/lifecycle/container/compose.yml)). Needs `PG_PASS` and `AUTHENTIK_SECRET_KEY`.
- 2025.10 removed Redis: caching, embedded outpost and WebSocket moved to Postgres, expecting "roughly 50% more database connections" ([2025.10 release notes](https://docs.goauthentik.io/releases/2025.10/), [blog](https://goauthentik.io/blog/2025-11-13-we-removed-redis/)).
- Host: "at least 2 CPU cores and 2 GB of RAM"; listens on 9000 (HTTP) and 9443 (HTTPS) ([Docker Compose install](https://docs.goauthentik.io/install-config/install/docker-compose/)).
- Mail: `AUTHENTIK_EMAIL__HOST`, `__PORT`, `__USERNAME`, `__PASSWORD`, `__USE_TLS`, `__USE_SSL`, `__TIMEOUT`, `__FROM`; test with `docker compose exec worker ak test_email <to>` ([email config](https://docs.goauthentik.io/install-config/email/)). Email stages can instead carry their own SMTP settings.

## Consequences for this repo

- The magic-link path and Google can share one identification screen without Enterprise. A mail code needs an undocumented flow shape and per-user email devices.
- The magic link finishes in whichever browser opens it, and stays valid for the token expiry, not single-use.
- `requiredGroup` maps onto the `groups` claim (group names) of the `profile` scope.
- Mail delivery is part of sign-in; ties to `docs/research/eu-transactional-mail.md`.

## Not verified

To test before any choice: email-OTP validation directly after identification with no password; creating an email device for a user by API; magic link opened in another browser or by a mail scanner; API-created user signing in by link and later by Google with `email_link`; `prompt=none` with explicit consent or a denying policy; Postgres connection count on one server.
