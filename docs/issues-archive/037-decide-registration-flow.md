# #37 Decide registration flow

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T16:29:23Z
- Closed: 2026-11-07T20:18:01Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/37

## Question

What are the steps from landing page to first sign-in: invitation link for the pilot, Identity Provider, acceptance of terms, provisioning trigger, failure and retry, abuse protection, and the switch to open registration?

---

**Comment by artkoenig, 2026-11-07T20:18:01Z**

**Decision: registration flow**

Steps: landing page → choose tariff (monthly or yearly) → sign-in → confirm mail address → order page (mandatory information, terms, payment method, order button) → provisioning → app, where Onboarding runs.

- **No pilot, no invitation links.** Registration is open from launch, so billing and legal texts must be live first.
- **Identity Providers:** Google plus one Operator-run OIDC provider. No Microsoft, Apple or netID.
- **Operator-run provider:** Authentik, subject to the spike; fallback Ory Kratos + Hydra. Pocket ID rejected. Sign-in by mail link or code, repeatable; passkey offered, never forced; no passwords. Mail sign-in is also the recovery path. Open signups stay off; our registration creates users through the API.
- **Accepted risk:** sign-in is as strong as the mailbox; a mail outage blocks users without a passkey.
- **Mail address:** prefilled from the claim, confirmed by the Customer, verified by code or link before ordering. Same path for all providers.
- **Trial:** 2 weeks with payment method taken at the start; turns into the Subscription automatically. Replaces trial without a payment method. §§ 312j and 312k buttons needed from day 1; button label for lawyer review.
- **Acceptance:** one unticked checkbox for terms, plus 18+ and consumer confirmation; privacy notice linked; version and timestamp stored.
- **Provisioning:** queued job triggered by Stripe's webhook for the created Subscription in trial. Waiting page polls; automatic retries with backoff, then Operator alert and a "we'll mail you" page. On final failure the Operator cancels the Subscription before any charge. Sign-in resumes where registration stopped.
- **Already mapped person:** detected by `iss`+`sub` after sign-in and sent to their Family. A second provider account counts as another person; a verified mail address already used by a Customer is blocked.
- **Abuse:** one trial per card fingerprint and per verified mail address, otherwise the order starts without trial. Rate limits per IP, daily provisioning cap with Operator alert. No CAPTCHA.
- **Abandoned registrations:** deleted after 30 days.
