# #44 Research Operator-run OIDC provider without forced passkeys

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-07T20:11:43Z
- Closed: 2026-11-07T20:16:39Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/44

## Question

Which Operator-run OIDC provider fits hosted sign-in beside Google, now that Pocket ID is rejected as passkey-only by design? Required: passkey optional, not forced; self-service recovery; users created through an API by our registration; standalone use, no brokering of social logins; can run with more than one instance or restart safely. Compare at least Keycloak, ZITADEL, Authentik, Kanidm, Rauthy, Ory, on sign-in methods, recovery, API, operating effort, cost, licence, EU hosting.


---

**Comment by artkoenig, 2026-11-07T20:16:38Z**

Pocket ID rejected (passkey-only). With mail code as sole repeatable first factor and no passwords: Authentik and self-hosted Ory Kratos + Hydra meet the requirements on docs; Keycloak and ZITADEL only conditionally (extension / custom login UI); Rauthy and Kanidm fail. Nothing was run. Open: Authentik multi-instance licensing, Ory admin-created users with code login. See docs/research/operator-oidc-provider.md (branch research/operator-oidc-provider).
