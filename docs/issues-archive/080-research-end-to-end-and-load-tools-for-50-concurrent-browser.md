# #80 Research end-to-end and load tools for 50 concurrent browser users

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-14T14:13:15Z
- Closed: 2026-11-14T14:18:33Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/80

## Question

Which tool drives 50 concurrent users through the htmx UI of family-agenda (sign-in, Agenda, add a Source) from a laptop or CI against the Cube: Playwright alone, k6 browser, Artillery with Playwright, or protocol-level load plus a few browsers? Resource needs on the driving machine, reporting, licence. Consider the public repo's branch `research/ui-test-runner` and its browser-test issues. Tests live in the private repo and talk HTTP only.

---

**Comment by artkoenig, 2026-11-14T14:18:32Z**

**Answer:** protocol-level load with **k6 HTTP** for the 50 Families, plus **Playwright Test** with a few real browsers (at most 5) walking the same journey.

- Driving machine: k6 documents ~1-5 MB per VU, so 50 VUs run on a laptop or a 2 vCPU / 8 GB runner. For 50 real browsers the only vendor figure is Artillery's 1 vCPU + 1 GB per virtual user (about 50 vCPU / 50 GB); Playwright and k6 publish none. Not measured here.
- htmx at protocol level: plain HTTP returning HTML. The script must send `HX-Request: true`, send `Origin` on POSTs (Hono CSRF), read `hx-get` from the HTML to follow lazy fragments, and follow `HX-Redirect` itself. Session is the cookie `fb_session` in k6's per-VU jar.
- Sign-in through Authentik is the weak point: scriptable through the flow executor API, depending on #82; fallback is sign-in with Playwright and handing the cookie to k6.
- Reporting: k6 thresholds (non-zero exit), percentiles, HTML report; Playwright HTML report, JUnit, traces.
- Licences: k6 AGPL-3.0 (run as an unmodified binary), Playwright Apache-2.0, Artillery MPL-2.0 with BSL parts.
- Fits the public repo: it chose Playwright Test with Chromium against a fake `Application`, without sign-in; no overlap, nothing imported.
- k6 browser rejected (API only inspired by Playwright, TypeScript not type-checked); Artillery rejected (scaling needs AWS Fargate or Azure ACI).

See `docs/research/e2e-load-tools.md` on branch `research/e2e-load-tools`.
