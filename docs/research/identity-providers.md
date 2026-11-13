# Identity Providers for hosted sign-in

Research for issue #35 (map #32, feeds #37; context: decision #20). Sources read 2026-11-07. Facts only; this note decides nothing. Not legal advice. Items marked **[LAWYER]** need professional review. Items marked **[UNVERIFIED]** could not be traced to a primary source.

## Situation

From #20 and #32: hosted sign-in runs only through Operator-configured Identity Providers, with no password sign-in and no broker IdP. The register maps (issuer, subject / verified email) to a Family. Creating an Admin in the Admin area also writes that mapping. One Family per person. Market: EU, German and English. Seller: the maintainer as Einzelunternehmer.

## Summary

| | Google | Apple | Microsoft (personal) | netID |
|---|---|---|---|---|
| Stable key | `iss`+`sub` | `iss`+`sub`, pairwise | `iss`+`sub`, pairwise per app ID | [UNVERIFIED] |
| `email_verified` | Yes, but Google is authoritative only for Gmail and Workspace | In discovery; Apple's wording seen only via forum quotes | Not in the ID token reference; `email` "isn't guaranteed to be correct" | [UNVERIFIED] |
| Usable as a mail address | Yes | Maybe a relay address; sender setup needed | Only as a prefill, per Microsoft | [UNVERIFIED] |
| Direct cost | No fee on the pages read [UNVERIFIED that none exists] | 99 USD per year | Publisher verification free; app registration cost not checked | Developer portal free |
| Setup effort | Low to medium: brand verification | Highest: membership, App ID, Services ID, key, mail relay, notifications | Low to medium; verification optional for this use | Unknown: docs need a portal login |

Protocol baseline: `iss`+`sub` are "the only Claims that an RP can rely upon as a stable identifier" ([OIDC Core 5.7](https://openid.net/specs/openid-connect-core-1_0.html)). `email_verified: true` only means the provider took steps to confirm control "at the time the verification was performed", and the means are "context specific" ([OIDC Core 5.1](https://openid.net/specs/openid-connect-core-1_0.html)). So the claim says nothing about current ownership, and it is not comparable across providers.

## Findings per provider

### Google
- Claims: `email_verified` comes with the `email` scope. Use `sub` as the key; `email` "may not be unique to this account and could change over time" ([OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)).
- Authority: Google is authoritative for an address only if it ends in `@gmail.com`, or if `email_verified` is true and `hd` is set (Workspace). Otherwise Google recommends another challenge ([verify ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)). So a verified non-Gmail address on a Google account does not prove what a Gmail address proves.
- Setup: sign-in-only apps need brand verification, typically 2-3 business days per Google. This needs a public homepage on a verified domain, describing the app and linking a privacy policy on the same domain. Changes to consent-screen details need re-verification ([brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [homepage](https://support.google.com/cloud/answer/13807376?hl=en), [policy compliance](https://developers.google.com/identity/verification/authentication-policy-compliance)). These points came through search summaries of the linked pages. This ties Google to the landing page and legal texts on map #32.
- Cost: no fee on the pages read.

### Apple
- Protocol: OIDC discovery exists; subject type `pairwise`; scopes `openid`, `email`, `name`; `email_verified` listed as a claim ([discovery](https://appleid.apple.com/.well-known/openid-configuration)).
- `email_verified`: forum posts quote Apple docs as "always true", with a possible false for Apple at Work & School users, and as either string or boolean ([thread 121411](https://developer.apple.com/forums/thread/121411)). The canonical page was not retrievable, so this is **[UNVERIFIED]** against first-party docs. `is_private_email` is reported missing for some relay users ([thread 808653](https://developer.apple.com/forums/thread/808653)).
- Name and email: name arrives only at first sign-in and must be stored immediately. Email stays in the identity token on later responses ([Apple docs](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple)).
- Cost: 99 USD per membership year; individuals can enrol ([program](https://developer.apple.com/programs/whats-included/)).
- Setup: web sign-in needs a Services ID tied to a primary App ID ([web configuration](https://developer.apple.com/help/account/configure-app-capabilities/configure-sign-in-with-apple-for-the-web)), so an Apple App ID is needed even without an app.
- Mail: to reach relay addresses, every sending domain must be registered (32 sources for individuals, 100 for organizations), with SPF, and DKIM if the mail provider uses its own envelope domain. Unregistered sources bounce ([relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/)). This affects the transactional mail ticket on map #32.
- Lifecycle: Apple sends server notifications for `email-disabled`, `consent-revoked` and `account-deleted` ([account changes](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts)).

### Microsoft
- Claims: the [ID token reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference) lists no `email_verified`. `email` "isn't guaranteed to be correct and is mutable"; Microsoft says never to use it for authorization, and to ask the user directly if an address is needed, using the claim only as prefill. `sub` is pairwise per application ID. Personal accounts carry tenant `9188040d-6c67-4c5b-b112-36a304b66dad`.
- `xms_edov` signals a verified email domain owner and needs the `email` claim. Its definition is written around tenants, so its value for personal accounts is unclear ([optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)).
- Do not map by `email`, `preferred_username` or `upn` ([claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)).
- Setup: publisher verification costs nothing, but needs a verified Cloud Partner Program account and an app registered with a work or school account. The consent block for unverified apps covers permissions beyond basic sign-in and profile ([overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)), so sign-in-only use appears outside it. Whether Partner Program verification is open to an Einzelunternehmer was not checked.

### Others
- **netID** (GMX, WEB.DE and others): the foundation's site says the developer portal is open and free for any operator, after registration ([announcement](https://enid.foundation/go-live-des-developer-portals/)). A third-party listing says it is OIDC-based ([marketplace](https://commercemarketplace.adobe.com/enid-enid-connector-magento.html)). Foundation material cites over 20 million users ([enid](https://enid.foundation/en/netid-simplifies-app-login-for-over-20-million-users-login-with-just-one-click/)). Claims, `email_verified` behaviour and contract terms are behind the portal login: **[UNVERIFIED]**.
- Facebook, Yahoo and others were not examined.

## People without such an account

Admins other than the Customer are affected too, because each Admin needs a mapping (#20).

| Option | Facts | Tension |
|---|---|---|
| Require one of the listed providers | No extra work. Whether Google and Microsoft accept sign-up with a third-party address was not checked | Excludes people who refuse these providers |
| Add netID | Covers GMX and WEB.DE users, a German-market fit | Docs unverified; DE-centred, weaker fit for other EU markets |
| Operator-run OIDC provider with passkeys and/or email code | Passkeys are a [W3C Recommendation](https://www.w3.org/TR/webauthn-3/) term for discoverable credentials. [Keycloak](https://www.keycloak.org/docs/latest/server_admin/index.html) supports passkeys. [ZITADEL](https://zitadel.com/pricing): free to 100 daily active users, Pro 100 USD per month, EU residency. Its [hosted login](https://zitadel.com/docs/guides/integrate/login/hosted-login) has passkeys and email OTP as a second factor | Another component to run. Must be used standalone: brokering social logins through it would contradict "no broker IdP" (#20). Lost-passkey recovery needs a design. Passwordless email-only first factor not confirmed for either product |
| EUDI Wallet | [eIDAS Art. 5f(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401183) exempts micro and small enterprises, and applies only where strong authentication is required. So no duty here | Wallet availability and relying-party onboarding not checked; German launch date seen only in [secondary sources](https://www.heuking.de/en/news-events/newsletter-articles/detail/digitale-identitaet-mit-annahmepflicht-eudi-wallet-und-european-business-wallet-im-ueberblick.html) |

## Privacy

- The provider learns that the person uses the service and when they sign in. Google names Google Ireland Limited as controller for EEA users ([privacy policy](https://policies.google.com/privacy?gl=ie)). The controllers for Apple and Microsoft were not confirmed.
- Hide My Email keeps the real address from the Operator, at the cost of the mail setup above.
- US transfers: the General Court upheld the EU-US Data Privacy Framework on 3 September 2025 ([T-553/23](https://eur-lex.europa.eu/eli/C/2025/6610/oj/eng) notice). An appeal is registered as C-703/25 P; its current status was not confirmed. Whether Google, Apple and Microsoft are listed could not be read from the [DPF list](https://www.dataprivacyframework.gov/list). **[LAWYER]**
- Inference: a plain server-side redirect after a click loads no provider script on the landing page, unlike embedded provider buttons. Whether that matters under § 25 TDDDG is **[LAWYER]**.
- Scopes can stay at `openid email` plus name where needed. The privacy policy has to name each provider. **[LAWYER]**

## Consequences for this repo

- The "verified email" half of the register key is the weak part: Microsoft documents no such claim, Google is authoritative only for some addresses, and Apple may yield a relay address nobody would type into an invitation. Matching an Admin invited by email to a sign-in therefore cannot work the same way across providers. An alternative is an invitation link that binds `iss`+`sub` when accepted.
- Pairwise `sub` (Apple, Microsoft) means the mapping depends on the client registration: replacing it may orphan every mapping. Apple's team-transfer process was not examined.
- A Customer's mail address for contract and billing mail cannot rely on the claim everywhere. Microsoft explicitly says to ask the user; Apple may need relay setup.
- Losing a provider account means losing sign-in, with no password fallback. A second Admin or an Operator support path is the only way back. Apple's `account-deleted` makes this visible; for the others no equivalent was checked.
- Google's verification depends on the public homepage and privacy policy, which affects the closed pilot's order of work. The rule for unverified sign-in-only apps during a pilot was not fully established.

## Not verified

Apple's canonical claim page; netID's claims and terms; Google and Microsoft registration fees; Apple client-secret rotation rules; Apple and Microsoft controllers; DPF listings; status of C-703/25 P; EU market share per provider.
