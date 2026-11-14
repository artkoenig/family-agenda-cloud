# #52 Choose and register the domain

- State: CLOSED (COMPLETED)
- Labels: wayfinder:task
- Created: 2026-11-12T08:55:04Z
- Closed: 2026-11-13T08:50:38Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/52

## Question

Which name and domain does the hosted service run under? The one address of the service, the sender of its mail and the IdP redirect URLs hang off it. The answer records the domain, the registrar and where DNS is hosted.

---

**Comment by artkoenig, 2026-11-13T08:50:37Z**

## Resolution

- **Name:** Family Agenda. **Domain:** `family-agenda.cloud`, no variants (no `.de`/`.eu`/unhyphenated copies).
- **Registered:** 2026-11-13, expires 2027-11-13, registrar **IONOS SE** (not INWX, as first planned). Name servers for now: IONOS defaults (`ns1046.ui-dns.org`, `ns1033.ui-dns.com`, `ns1068.ui-dns.biz`, `ns1100.ui-dns.de`). DNSSEC unsigned.
- **DNS:** zone moves to IONOS Cloud DNS as code (`dns_zone`/`dns_record`) under [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58); then delegate the name servers at IONOS SE and turn on DNSSEC. Token for Cloud DNS lasts at most 90 days: part of the rotation there.
- **Layout:** apex `family-agenda.cloud` = landing page; `app.family-agenda.cloud` = the one address of the service; `auth.family-agenda.cloud` = Authentik; mail sender `no-reply@family-agenda.cloud`, SPF/DKIM/DMARC on the apex; no wildcard.
- **Certificates:** Caddy on the Cube over HTTP-01; Certificate Manager not needed.
