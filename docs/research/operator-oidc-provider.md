# Operator-run OIDC provider

Research for issue #44 (map #32; context: `docs/research/identity-providers.md`). Sources read 2026-11-07. Facts only; this note decides nothing. Items marked **[UNVERIFIED]** could not be confirmed from a primary source or were not tested. Nothing here was run: all findings come from docs and source code.

## Requirements

From #44, plus the maintainer's sharpening during the research:

1. **Hard: no passwords.** Email code or magic link works as the sole, repeatable first factor and as recovery, with password login fully disabled.
2. Passkey optional, never forced.
3. Self-service recovery.
4. Users created through an API by our registration.
5. Standalone use, no brokering of social logins.
6. More than one instance, or safe restart.

Pocket ID is out: passkey-only by design, no self-service recovery, single instance.

## Result

| Candidate | Email code/link as sole first factor | Verdict |
|---|---|---|
| Authentik | Yes, magic link, via an example flow shipped upstream | Meets all on docs |
| Ory Kratos + Hydra (self-hosted) | Yes, code, built in | Meets all on docs; own login UI needed |
| Ory Network (hosted) | Yes, same engine | Meets all on docs, but Ory runs it, not the Operator |
| Keycloak | Not built in; only with a third-party extension | Conditional |
| ZITADEL | Not in the hosted login; only with a custom login UI on the Session API | Conditional |
| Rauthy | No: email OTP is documented as 2FA | Fails |
| Kanidm | No email sign-in in the credential types | Fails |

## Comparison

| | Keycloak | ZITADEL | Authentik | Kanidm | Rauthy | Ory Kratos + Hydra |
|---|---|---|---|---|---|---|
| Latest release | 26.8.2 | v4.20.1 | 2026.8.5 | v1.12.0 | v0.37.2 (pre-1.0) | v26.2.0 (March 2026) |
| Password | Yes | Yes | Yes, a flow stage that can be left out | Password + TOTP | Yes | Yes, can stay disabled |
| Email code | Extension only | Second factor; first check only through Session API | Enrolled authenticator; first-factor use **[UNVERIFIED]** | No | 2FA | Yes, first factor |
| Magic link | No built-in authenticator | Open request #6099 | Yes, first factor | No | Used for activation and reset only | Recovery only; `link` is legacy |
| Passkey optional | Yes | Yes | Yes | Passkeys preferred; policy can set minimum | Yes | Separate method; coexistence not stated **[UNVERIFIED]** |
| Self-service recovery | Reset Credentials flow by email | API; hosted reset not listed on the Login app page | Email recovery flows | Off by default, can be enabled | Email reset; not for passkey-only accounts | `code` flow |
| User-creation API | `POST /admin/realms/{realm}/users` | `POST /v2/users/new` | `POST /api/v3/core/users/` | **[UNVERIFIED]** | `POST /users` (seen only in a fork PR), API keys documented | `POST /admin/identities` |
| Multi-instance | Clustered; needs a replicated DB | Stateless binary on PostgreSQL | Stateless server and worker on PostgreSQL | Replication between nodes | Raft, 3 or 5 nodes | "just spin up another container" |
| Ops effort | Medium: JVM, about 1.25 GB per instance, extension kept in step with versions | Medium to high: documented minimal HA is 3 nodes; custom UI to build | Low to medium: 2 cores, 2 GB; server, worker, PostgreSQL | Not assessed; moot | Low on paper: embedded DB | High: two services, PostgreSQL, own UI, courier |
| Software cost | Free | Free self-hosted | Free open source | Free | Free | Free; CVE timing not guaranteed in OSS |
| Hosted offer read | None | Free to 100 DAU; Pro 100 USD per month | None | None | None | From 770 USD per year plus usage |
| Licence | Apache-2.0 | AGPL-3.0-only; login app MIT | MIT, `authentik/enterprise/` separate | MPL-2.0 | Apache-2.0 | Apache-2.0 |
| EU hosting | Self-host anywhere | Self-host, or EU region | Self-host only | Self-host | Self-host | Self-host, or EU storage on paid plans |

Licences and releases: GitHub API for each repository, 2026-11-07. Self-hosted infrastructure cost was not priced.

## Findings per candidate

### Authentik

- Sign-in: upstream ships `example/flows-login-email-magic-link.yaml`, described as a "Passwordless login flow". The flow is identification, email, user login, with no password stage; the link lives 30 minutes in the example ([example flows](https://docs.goauthentik.io/add-secure-apps/flows-stages/flow/flows/), [blueprint](https://github.com/goauthentik/authentik/blob/main/blueprints/example/flows-login-email-magic-link.yaml)). Upstream says to use it only if inbox access is an acceptable sign-in factor. Importing it overrides the default flow.
- Repeatable: nothing in the blueprint limits it to one use per user. Not tested.
- Recovery: with email as the only factor, the login flow is itself the recovery path. Separate recovery flows also exist. The MFA-verifying one requires an MFA device, and the variant without MFA is marked not recommended ([example flows](https://docs.goauthentik.io/add-secure-apps/flows-stages/flow/flows/)).
- Passkey: the Identification stage can offer passkeys through autofill from 2025.12.0 and falls back to the normal flow ([identification](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/identification/)). Combining this with the magic-link blueprint is **[UNVERIFIED]**.
- Enumeration: "Pretend user exists" continues for unknown identifiers, and Email stages handle the placeholder user ([identification](https://docs.goauthentik.io/add-secure-apps/flows-stages/stages/identification/)).
- API: `/core/users/` is in the [OpenAPI schema](https://github.com/goauthentik/authentik/blob/main/schema.yml); instances serve `/api/v3/` ([API docs](https://api.goauthentik.io/)).
- HA: server and worker are stateless, all state is in PostgreSQL ([HA](https://docs.goauthentik.io/docs/install-config/high-availability)). The current [compose file](https://github.com/goauthentik/authentik/blob/main/lifecycle/container/compose.yml) has PostgreSQL, server and worker, no Redis. "Multi-instance deployment support" is listed under Enterprise Plus ([pricing](https://goauthentik.io/pricing/)); whether that restricts running replicas or only covers support is **[UNVERIFIED]**. The HA page describes replicas without naming a licence.
- Cost: open source is free and lists B2C use. Enterprise is 0.02 USD per customer user per month, counted on registered accounts. No hosted version ([pricing](https://goauthentik.io/pricing/)).

### Ory Kratos + Hydra

- Sign-in: `selfservice.methods.code.passwordless_enabled: true` enables login and registration by code ([one-time code](https://www.ory.com/docs/kratos/passwordless/one-time-code)). The trait needs `credentials.code` with `identifier: true` and `via: email`. Passwordless and MFA use of `code` are mutually exclusive in the [config schema](https://github.com/ory/kratos/blob/master/embedx/config.schema.json).
- Password off: methods are chosen under `selfservice.methods` ([login](https://www.ory.com/docs/kratos/self-service/flows/user-login)). A worked code-only config was not found.
- Admin-created identities: created without credentials, and the user sets one up afterwards ([create identities](https://www.ory.com/docs/kratos/manage-identities/create-users-identities)). The code path rejects an account that "has not setup up sign in with code" ([source](https://github.com/ory/kratos/blob/master/selfservice/strategy/code/strategy_login.go)). Whether `POST /admin/identities` with a code-identifier schema sets this up is **[UNVERIFIED]**, and it matters: it is the registration path.
- Recovery: `code` is recommended. `link` is deprecated because scanners can invalidate links, and links may open in another browser ([recovery](https://www.ory.com/docs/kratos/self-service/flows/account-recovery-password-reset)).
- OIDC: Kratos alone does not issue tokens in the self-hosted setup. `oauth2_provider.url` points it at Hydra ([schema](https://github.com/ory/kratos/blob/master/embedx/config.schema.json)). Hydra needs a login and consent UI, custom or a forked reference ([Hydra](https://www.ory.com/docs/hydra/self-hosted/deploy-hydra-example)).
- HA: no extra scaling requirements; SQLite is not for production ([production](https://www.ory.com/docs/kratos/guides/production)). `--watch-courier` exists "to simplify single-instance setup" ([source](https://github.com/ory/kratos/blob/master/cmd/serve/root.go)), so several instances should run a separate courier **[UNVERIFIED]**. Mail is delivered at least once ([SMTP](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp)).
- OSS limits: CVE patching has no guaranteed timeframe, and community updates can lag ([OEL](https://www.ory.com/docs/self-hosted/oel)). Last OSS release was March 2026.
- Ory Network: Production 770 USD per year, 0.14 USD per average daily active user per month, 21 USD monthly credit, EU storage included ([pricing](https://www.ory.com/pricing)). OAuth2 and OIDC work with its identities by default ([integration](https://www.ory.com/docs/oauth2-oidc/identity-provider-integration-settings)). This is not Operator-run; whether that is acceptable is open.

### Keycloak

- Sign-in: the [authenticator list](https://github.com/keycloak/keycloak/blob/main/services/src/main/resources/META-INF/services/org.keycloak.authentication.AuthenticatorFactory) has no email-code or magic-link login authenticator; `ResetCredentialEmail` is for reset. Release notes searched (26.3, 26.4, 26.8.x) show none.
- Extension: [for-keycloak/email-otp-authenticator](https://github.com/for-keycloak/email-otp-authenticator) (Unlicense, 33 stars, active) adds email OTP and has a "sole authenticator" setting, which suggests first-factor use. Its README does not state this outright **[UNVERIFIED]**. Maintained by third parties, so it must track Keycloak versions.
- Passkey: integrated in the default forms, alongside other methods ([docs](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/authentication/passkeys.adoc)).
- API: users and `execute-actions-email` are in the [OpenAPI file](https://www.keycloak.org/docs-api/latest/rest-api/openapi.yaml).
- HA: single-cluster or multi-cluster v2 with a synchronously replicated database ([HA](https://www.keycloak.org/high-availability/introduction)). 1250 MB per Pod base; 15 password logins per second per vCPU ([sizing](https://www.keycloak.org/high-availability/single-cluster/concepts-memory-and-cpu-sizing)).

### ZITADEL

- Hosted login: email OTP is a second factor only; first factors are password, external IdP and passkey ([hosted login](https://zitadel.com/docs/guides/integrate/login/hosted-login), [Login app](https://zitadel.com/docs/guides/integrate/login-ui/login-app)). "One time code for authentication (Magic Link)", [#6099](https://github.com/zitadel/zitadel/issues/6099), is open.
- Custom UI: the Session API documents an email-code flow that starts from a user check, with no password step ([MFA guide](https://zitadel.com/docs/guides/integrate/login-ui/mfa)). The OIDC finish step mandates no factors ([OIDC guide](https://zitadel.com/docs/guides/integrate/login-ui/oidc-standard)). So a custom login app could work, but this is not presented as passwordless login, and needs a test **[UNVERIFIED]**. OTP Email must be enrolled per user. The third-party [zitadel-login](https://github.com/david1gp/zitadel-login) project reports the same approach.
- Password off: "Username Password allowed" disabled means "only login with external identity providers" ([settings](https://zitadel.com/docs/guides/manage/console/default-settings)). Its effect on a custom Session API login is **[UNVERIFIED]**.
- Passwordless-only policy: [#8996](https://github.com/zitadel/zitadel/issues/8996) is closed with a pointer to a "next iteration" of user schemas, about passkeys.
- API: `CreateUser`, `POST /v2/users/new`; `AddHumanUser` is deprecated ([docs](https://zitadel.com/docs/apis/resources/user_service_v2/user-service-create-user)).
- HA: stateless binary, PostgreSQL. Minimal HA cluster is three nodes of 4 cores and 16 GB, or about 8 GB without non-essentials ([production](https://zitadel.com/docs/self-hosting/manage/production)).
- Cloud: free to 100 DAU, Pro 100 USD per month with 25,000 DAU, EU residency ([pricing](https://zitadel.com/pricing)). A custom login UI on Cloud was not checked.
- Licence: [AGPL-3.0-only](https://github.com/zitadel/zitadel/blob/main/LICENSING.md), with `apps/login/` under MIT.

### Rauthy

- Email OTP is opt-in, "as 2FA" in the config comment. If a user has passkeys too, passkeys are always used and the OTP is only a fallback ([changelog](https://github.com/sebadob/rauthy/blob/main/CHANGELOG.md)). No email first factor is documented ([registration](https://sebadob.github.io/rauthy/config/user_reg.html)): activation sets a password or passkey.
- Passkey-only accounts cannot use reset mails and rely on an Admin if all devices are lost ([passkeys](https://sebadob.github.io/rauthy/config/passkeys.html)).
- Email OTP code had an expiry bug, [#1730](https://github.com/sebadob/rauthy/issues/1730), closed 2026-09.
- HA: Hiqlite Raft, 3 or 5 nodes ([HA](https://sebadob.github.io/rauthy/config/ha.html)). API keys are [documented](https://github.com/sebadob/rauthy/blob/main/book/src/work/api_keys.md).

### Kanidm

- Credentials are passkeys, attested passkeys, and password + TOTP ([credentials](https://kanidm.github.io/kanidm/stable/accounts/authentication_and_credentials.html)). No email code or link sign-in appears. Login by email address itself is an open request, [#3601](https://github.com/kanidm/kanidm/issues/3601).
- Recovery: disabled by default; when enabled, a reset link goes to a registered address behind proof of work.
- Positioning: the [introduction](https://kanidm.github.io/kanidm/stable/introduction_to_kanidm.html) addresses organisations and personal services, with no mention of customer-facing use.
- Replication exists ([deployment](https://github.com/kanidm/kanidm/blob/master/book/src/repl/deployment.md)); limits not read. [#4244](https://github.com/kanidm/kanidm/issues/4244) reports `email_verified` hardcoded to true, open.

## Consequences for this repo

- With email as the only factor, sign-in is as strong as the mailbox. Transactional mail becomes part of sign-in, so mail outage means no sign-in for these users. This ties to the mail ticket on map #32.
- Magic links can be consumed by mail scanners and open in another browser, per Ory. Whether Authentik's confirmation link is affected was not checked.
- `email_verified` from the Operator's provider would be under the Operator's control, unlike the providers in `identity-providers.md`.

## Not verified

To test before any choice: Authentik magic link combined with passkey autofill, and API-created users signing in repeatedly; Kratos `POST /admin/identities` followed by code login with password disabled; Keycloak extension as sole factor; ZITADEL custom login finishing OIDC on an email-code-only session. Also: Authentik's Enterprise Plus wording on multi-instance; Authentik email authenticator as first factor; Kratos passkey and code side by side; Kratos courier with several instances; Kanidm user API and replication limits; third-party EU hosting for any candidate; infrastructure cost.
