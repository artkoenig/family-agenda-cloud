# #69 Decide the network layout

- State: CLOSED (NOT_PLANNED)
- Labels: wayfinder:grilling
- Created: 2026-11-13T10:13:31Z
- Closed: 2026-11-14T19:25:55Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/69

## Question

How does the private site of [Decide architecture of the private site](https://github.com/artkoenig/family-agenda-cloud/issues/40) reach the control database, and which firewall rules exist beyond the public 80/443 and allow-listed SSH of the one Cube?

---

**Comment by artkoenig, 2026-11-13T21:32:50Z**

Input from [Decide architecture of the private site](https://github.com/artkoenig/family-agenda-cloud/issues/40): two private services join the Compose project: `site` (internet-facing behind Caddy on the apex, own `site` DB, SELECT on the register's identity mapping table only) and `billing-worker` (no ingress, Operator key file, CREATEDB role, outbound to Stripe API and SMTP). `site` needs outbound to Stripe, Google/Authentik OIDC and SMTP.
