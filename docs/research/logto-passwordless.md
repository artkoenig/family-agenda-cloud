# Passwordless sign-in experience in Logto

Research for issue #132. Run 2026-11-17 against a throwaway Logto **1.46.0** (the version the core's `compose.yaml` pins), set up by the core's `tools/logto-setup` (core 0.8.0, commit `ac3208f`) and then changed through the Management API. Facts only; this note decides nothing. Points marked **untested** say why.

Everything to reproduce it is in [`logto-passwordless/`](logto-passwordless/): `compose.yaml` (Logto, Postgres, Mailpit, a webhook receiver, a mock OIDC provider), `bootstrap.sh` (Management API client), `api.sh` (Management API calls), `code.sh` (reads the newest code from Mailpit), `rp.mjs` (two OIDC clients, "core" and "routing"), `trial-config.sh` (every configuration change below, in order).

## Result

| # | Question | Result |
|---|---|---|
| 1 | Email code as the sole factor | **Works.** One `PATCH /api/sign-in-exp`. Re-running the core's `logto-setup` puts the password back. |
| 2 | Google on the same screen, account linking | Button shows on sign-in and sign-up screens. Linking **works** (tested with a mock OIDC provider): a confirm screen by default, silent with `automaticAccountLinking`. Real Google **untested**. |
| 3 | `email_verified` / `hd`, forcing a code | Logto drops an unverified Google email and asks for an email plus code. `hd` is kept only in the identity's raw data. **No setting** forces a code for a domain. |
| 4 | PostRegister for a social sign-up | **Fires**, with `primaryEmail` and the identity's raw data. Tested with the mock provider; real Google **untested**. |
| 5 | Invitation link (one-time token) for a new invitee, password sign-up off | **Works**, also with registration closed. Creates the account and signs in with no screen. Also fires PostRegister. |
| 6 | `prompt=none` for a second client, `organizations` claim | **Works** after the second client's first non-silent authorization in the same Logto session; before that Logto returns `consent_required`. The claim lists the user's organisation ids. |
| 7 | Terms/privacy, de/en | Agreement checkbox or dialog **works** for email, social and invitation sign-up. Mails and screens localise per `ui_locales` once German mail templates exist. Two rough edges, see below. |

## Setup

1. `docker compose -p logto-trial up -d`, then `./bootstrap.sh`: inserts a machine-to-machine app `trialm2m` with the role "Logto Management API access" directly into Postgres, instead of the console.
2. The core's setup, from a core checkout:

   ```sh
   cd tools/logto-setup
   LOGTO_M2M_APP_ID=trialm2m LOGTO_M2M_APP_SECRET=trialm2msecret0123456789 \
   LOGTO_ENDPOINT=http://localhost:3201 LOGTO_API_ENDPOINT=http://localhost:3201 \
   CONTEXT_MODE=supplied OIDC_CALLBACK_URL=http://localhost:8228/core/callback \
   IDP_MANAGEMENT_API=logto IDP_EVENTS_URL=http://receiver:8080/idp/events \
   SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_FROM=support@family-agenda.test \
   npx -y tsx@4.20.3 src/main.ts
   ```

   It creates the "Family Agenda" Traditional app, the PostRegister webhook, the organisation admin role, the SMTP connector with English templates, and opens registration with **email + password** (`registrationSignInExperience` in `tools/logto-setup/src/setup.ts`).
3. A second Traditional app "routing" (`POST /api/applications` with `redirectUris: ["http://localhost:8228/routing/callback"]`, then `POST /api/applications/{id}/secrets`), standing in for the routing service.
4. `node rp.mjs` with `CORE_ID`/`CORE_SECRET`/`ROUTING_ID`/`ROUTING_SECRET`. Both clients ask for the core's scopes: `openid email profile custom_data urn:logto:scope:organizations`. `http://localhost:8228/start/<client>?<params>` adds any extra authorization parameter (`prompt`, `ui_locales`, `first_screen`, `one_time_token`, `login_hint`, `scope`).

Mail goes to Mailpit (UI on port 8225); webhooks go to the receiver (`GET http://localhost:8226/log`).

## 1. Email code as the sole factor

Config:

```json
PATCH /api/sign-in-exp
{
  "signUp": {"identifiers": ["email"], "password": false, "verify": true},
  "signIn": {"methods": [{"identifier": "email", "password": false, "verificationCode": true, "isPasswordPrimary": false}]},
  "forgotPasswordMethods": []
}
```

Observed:

- Sign-up screen: one email field (plus the social buttons). A code mail arrives using the SMTP connector's `Register` template ("Your Family Agenda code"). Entering it creates the account; no password screen. User has `hasPassword: false`. ID token: `amr: ["otp"]`, `email_verified: true`.
- Sign-in screen: email field, then a code (`SignIn` template, "Your Family Agenda sign-in code"). No password field, no "forgot password" link.
- PostRegister reached the receiver with a valid `logto-signature-sha-256` (HMAC-SHA256 of the body with the hook's signing key).
- **Interaction with `logto-setup`:** the setup PATCHes `signUp`, `signIn`, `signInMode`, `forgotPasswordMethods`, branding and colours on every run (`applySignInExperience`), and rewrites the whole SMTP connector config. Re-running it after the change above put `signUp.password: true` and the email/username password methods back. Everything else set in this trial survived a re-run: social connectors and targets, `socialSignIn`, terms URLs and policy, `languageInfo`, `/api/email-templates`, custom phrases.
- `logto-setup` also creates the Instance admin with a username and password (`setup.ts`, `api.post("/api/users", { username, primaryEmail, password })`). With the config above, that user can still sign in by email code; the username and password are no longer offered on the screen.

## 2. Google on the same screen; account linking

Config: the Google connector with placeholder credentials, and a generic OIDC connector against [mock-oauth2-server](https://github.com/navikt/mock-oauth2-server) whose login form accepts any claims (full calls in `trial-config.sh`), then `PATCH /api/sign-in-exp {"socialSignInConnectorTargets": ["google", "mockgoogle"]}`.

- "Continue with Google" and "Continue with Mock Google" appear under the email field on both the sign-in and the sign-up screen.
- **Real Google untested:** no Google OAuth client exists for this trial. The connector accepted placeholder credentials; clicking the button was not completed.
- Linking, default (`socialSignIn.automaticAccountLinking` unset): signing in with the mock provider using the verified email of an existing email-code user (alice) showed a page offering to link to `alic****@example.org`, skip, or link another email. One click linked: same `sub`, no code asked, ID token `amr: ["fed"]`.
- Linking with `PATCH /api/sign-in-exp {"socialSignIn": {"automaticAccountLinking": true}}`: an existing user created through the API (erin) was linked on mock sign-in without any page.
- Docs: [Social sign-in](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/social-sign-in).

## 3. `email_verified`, `hd`, forcing a code

From source ([connector-google](https://github.com/logto-io/logto/blob/master/packages/connectors/connector-google/src/index.ts), v1.8.8 in the image at `/etc/logto/packages/connectors/connector-google/lib/index.js`): the connector reads `https://openidconnect.googleapis.com/v1/userinfo` and returns `email` **only if `email_verified` is true**; the full userinfo goes into `rawData`. The generic OIDC connector behaves the same, with an extra `trustUnverifiedEmail` option.

Tested with the mock provider:

| User | Claims | Result |
|---|---|---|
| carol | `email: carol@outlook.test`, `email_verified: false` | Logto showed "link your email" with an empty field; any address could be entered; a code was sent to it; then the account was created. `amr: ["fed","otp"]`. |
| dave | `email: dave@outlook.test`, `email_verified: true`, no `hd` | Account created directly, no code. |
| bob | `email: bob@gmail.test`, `email_verified: true` | Account created directly, no code. |

- `hd` and `email_verified` are not ID token claims for our clients. They stay in `user.identities.<target>.details.rawData` (readable via the Management API and present in the PostRegister payload).
- **No Logto setting** was found to require a code by email domain or by missing `hd`. The only lever seen is the connector itself: a connector that returns no email leads to carol's path (enter email, verify by code). A forked Google connector doing that for non-Gmail/non-Workspace accounts was **not tested**.
- Real Google **untested** (no OAuth client), so what Google really sends for `email_verified`/`hd` per account type is not observed here.

## 4. PostRegister for a social sign-up

Every sign-up in the trial (email code, mock social, invitation) posted PostRegister to the core's hook. A social one (trimmed):

```json
{
  "event": "PostRegister",
  "interactionEvent": "Register",
  "userId": "tzyie7zwn82c",
  "user": {
    "id": "tzyie7zwn82c",
    "primaryEmail": "ivy@gmail.test",
    "name": "Ivy",
    "identities": {
      "mockgoogle": {
        "userId": "ivy",
        "details": {"id": "ivy", "name": "Ivy", "email": "ivy@gmail.test",
                    "rawData": {"sub": "ivy", "email": "ivy@gmail.test", "email_verified": true, "iss": "http://mock-oidc:8080/default", "...": "..."}}
      }
    },
    "isSuspended": false
  },
  "application": {"id": "0iwz27rpq8wl9cf96u9p7", "type": "Traditional", "name": "Family Agenda"},
  "hookId": "3g0ma0fum0qz3lof8ttgz"
}
```

- `user.primaryEmail` is set, which is what the core's parser (`packages/application/src/registration-events.ts`) needs.
- The payload carries nothing about the terms agreement (point 7), and the user record has no field for it.
- Real Google **untested**; the shape comes from Logto, not from the connector, apart from `rawData`.

## 5. Invitation link with a one-time token

Done as the core does it (`packages/adapters/src/logto-identity-directory.ts`): organisation "Family F1" with the admin role, `POST /api/one-time-tokens {"email", "expiresIn"}`, `POST /api/organization-invitations` with `messagePayload: {link, locale}`. The link went to `/start/core?one_time_token=…&login_hint=…` (the core uses `/sso/start` with `first_screen=register` from `apps/api/src/http/app.tsx`).

- Mailpit got the `OrganizationInvitation` mail with the link.
- New invitee (frank), `signInMode: SignInAndRegister`, password sign-up off: opening the link showed **no screen**; the account was created and signed in. ID token `amr: ["otp"]`, `email_verified: true`, `organizations: []`. PostRegister fired with `interactionEvent: "Register"` (the core ignores it through `wasInvited`). Membership is not created by the token; the core's acceptance does that.
- Same with `PATCH /api/sign-in-exp {"signInMode": "SignIn"}` (registration closed; grace): account created and signed in.
- Opening a used link again: "Invalid link — the token has been consumed".
- `POST /api/one-time-tokens` also takes `context.jitOrganizationIds` and `context.interactionEvent` ([docs](https://docs.logto.io/end-user-flows/one-time-token)); the core sends neither; **not tested**.

## 6. `prompt=none` for a second client

Steps and results (alice is a member of organisation `f9bcnycl0g89`):

| Step | Result |
|---|---|
| No Logto session, `routing` with `prompt=none` | `error=login_required` |
| alice signs in through `core` (email code) | ID token `organizations: ["f9bcnycl0g89"]` |
| Same session, `routing` with `prompt=none` | `error=consent_required` ("requested scopes not granted"), also with `scope=openid` alone |
| Same session, `routing` without `prompt` | Redirected back at once, **no screen**; ID token with `aud` = routing, `organizations: ["f9bcnycl0g89"]` |
| Same session, `routing` with `prompt=none` | Works; same claims |
| Sign out, alice signs in through `core` again, then `routing` with `prompt=none` | `consent_required` again |

Why, from source: first-party apps get consent automatically in the interaction step ([koa-auto-consent.ts](https://github.com/logto-io/logto/blob/master/packages/core/src/middleware/koa-auto-consent.ts)); with `prompt=none` there is no interaction, so it only succeeds when the session already holds a grant for that client (`session.grantIdFor(clientId)` in `packages/core/src/oidc/init.ts`). Grants belong to the session, so every new sign-in starts without one for the routing client.

The `organizations` claim needs the `urn:logto:scope:organizations` scope and the `organizations` extended claim the core's setup enables (`PUT /api/configs/id-token`); both clients got it.

## 7. Terms, privacy, de/en

### Terms and privacy

Config: `PATCH /api/sign-in-exp {"termsOfUseUrl": "…/terms", "privacyPolicyUrl": "…/privacy", "agreeToTermsPolicy": "ManualRegistrationOnly"}`. The core's setup leaves these at `null` / `"Automatic"`. Other values: `Automatic`, `Manual` (also on sign-in; not tested).

- Email sign-up: a checkbox "I have read and agree to the Terms of Use and Privacy Policy" under the email field. Submitting without it opens a dialog ("To proceed, please agree…") with Cancel / Agree.
- Social sign-up: the social button works without the checkbox; back from the provider, a **new** user gets the same dialog before the account is created.
- Invitation link (jack): the dialog appears before the silent sign-up. **Agree** creates the account. **Cancel** shows "Invalid link" with the untranslated key `terms_acceptance_required_description`, **consumes the token** and creates no account; a new token is needed.
- Logto stores no record of the agreement on the user and sends none in PostRegister.

### Languages

- The sign-in UI follows `ui_locales` (`de` / `en`). The core sends no `ui_locales` today.
- With the default `languageInfo.autoDetect: true`, the UI followed the browser's language (German here) **after returning from the social provider**, although the flow started with `ui_locales=en`. With `PATCH /api/sign-in-exp {"languageInfo": {"autoDetect": false, "fallbackLanguage": "en"}}`, the UI stayed English through the social round trip, was English without `ui_locales`, and German with `ui_locales=de`.
- Mail: the SMTP connector (v1.5.6) first asks for a template from `/api/email-templates` by type and `payload.locale`, then falls back to the templates in its own config ([source](https://github.com/logto-io/logto/blob/master/packages/connectors/connector-smtp/src/index.ts), `getI18nEmailTemplate`). The core's setup only writes English config templates. After `PUT /api/email-templates` with `de` templates for `SignIn`, `Register`, `OrganizationInvitation`:
  - sign-in with `ui_locales=de`: German subject; with `ui_locales=en`: the English config template;
  - invitation with `messagePayload.locale: "de"` (the core sends the Family Language, `en` or `de`): German subject. Before the `de` templates existed, the same invitation came in English.
- Screen texts can be overridden per language: `PUT /api/custom-phrases/de {"action": {"sign_in": "Weiter mit Code"}}` changed the German button.
- Docs: [Email templates](https://docs.logto.io/connectors/email-connectors/email-templates), [Localized languages](https://docs.logto.io/customization/localized-languages).

## Sources

- Logto docs: [Sign-up and sign-in](https://docs.logto.io/end-user-flows/sign-up-and-sign-in), [Social sign-in](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/social-sign-in), [One-time token](https://docs.logto.io/end-user-flows/one-time-token), [First screen](https://docs.logto.io/end-user-flows/authentication-parameters/first-screen), [Invite organization members](https://docs.logto.io/end-user-flows/organization-experience/invite-organization-members), [Webhooks](https://docs.logto.io/developers/webhooks), [Google connector](https://docs.logto.io/integrations/google), [Email templates](https://docs.logto.io/connectors/email-connectors/email-templates), [Localized languages](https://docs.logto.io/customization/localized-languages).
- Logto source (read inside the 1.46.0 image under `/etc/logto/packages/`): `connectors/connector-google`, `connectors/connector-smtp`, `core/src/middleware/koa-auto-consent.ts`, `core/src/oidc/init.ts`. Management API schema: `GET /api/swagger.json` of the trial instance.
- Core (`family-agenda` at `ac3208f`): `tools/logto-setup/src/setup.ts`, `packages/adapters/src/logto-identity-directory.ts`, `packages/application/src/registration-events.ts`, `packages/application/src/family-admins.ts`, `apps/api/src/http/app.tsx`, `packages/domain/src/language.ts`.
