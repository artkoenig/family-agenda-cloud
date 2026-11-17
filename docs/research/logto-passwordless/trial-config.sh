#!/bin/sh
# The configuration the trial applied on top of the core's logto-setup, in the order it was tested.
# Not a proposal: it records what was set to observe Logto's behaviour (see ../logto-passwordless.md).
set -eu
cd "$(dirname "$0")"

# Point 1: email verification code as the only factor; no password, no "forgot password".
./api.sh PATCH /api/sign-in-exp '{
  "signUp": {"identifiers": ["email"], "password": false, "verify": true},
  "signIn": {"methods": [{"identifier": "email", "password": false, "verificationCode": true, "isPasswordPrimary": false}]},
  "forgotPasswordMethods": []
}'

# Point 2: the real Google connector (placeholder credentials, never completed a sign-in) ...
./api.sh POST /api/connectors '{
  "connectorId": "google-universal",
  "config": {"clientId": "untested-placeholder.apps.googleusercontent.com", "clientSecret": "placeholder",
             "scope": "openid profile email", "prompts": ["select_account"]}
}'
# ... and a generic OIDC connector against mock-oauth2-server that stands in for Google.
./api.sh POST /api/connectors '{
  "connectorId": "oidc",
  "metadata": {"target": "mockgoogle", "name": {"en": "Mock Google"}},
  "config": {
    "authorizationEndpoint": "http://localhost:8227/default/authorize",
    "tokenEndpoint": "http://mock-oidc:8080/default/token",
    "clientId": "logto", "clientSecret": "anything", "scope": "openid profile email",
    "idTokenVerificationConfig": {"jwksUri": "http://mock-oidc:8080/default/jwks", "issuer": "http://mock-oidc:8080/default"},
    "tokenEndpointAuthMethod": "client_secret_post"
  }
}'
./api.sh PATCH /api/sign-in-exp '{"socialSignInConnectorTargets": ["google", "mockgoogle"]}'
# Point 2, second half: link a social identity to an existing account without asking.
./api.sh PATCH /api/sign-in-exp '{"socialSignIn": {"automaticAccountLinking": true}}'

# Point 7: terms and privacy, agreement asked on registration only.
./api.sh PATCH /api/sign-in-exp '{
  "termsOfUseUrl": "https://family-agenda.test/terms",
  "privacyPolicyUrl": "https://family-agenda.test/privacy",
  "agreeToTermsPolicy": "ManualRegistrationOnly"
}'
# Point 7: German mail templates (picked by locale), no browser language detection, one custom phrase.
./api.sh PUT /api/email-templates '{"templates": [
  {"languageTag": "de", "templateType": "SignIn",
   "details": {"subject": "Dein Family-Agenda-Anmeldecode", "content": "<p>Dein Code: {{code}}</p>", "contentType": "text/html"}},
  {"languageTag": "de", "templateType": "Register",
   "details": {"subject": "Dein Family-Agenda-Registrierungscode", "content": "<p>Dein Code: {{code}}</p>", "contentType": "text/html"}},
  {"languageTag": "de", "templateType": "OrganizationInvitation",
   "details": {"subject": "Du bist zu einer Family Agenda eingeladen", "content": "<p><a href=\"{{link}}\">Einladung annehmen</a></p>", "contentType": "text/html"}}
]}'
./api.sh PATCH /api/sign-in-exp '{"languageInfo": {"autoDetect": false, "fallbackLanguage": "en"}}'
./api.sh PUT /api/custom-phrases/de '{"action": {"sign_in": "Weiter mit Code"}}'
