# #45 Test Authentik for mail sign-in

- State: CLOSED (COMPLETED)
- Labels: wayfinder:task
- Created: 2026-11-07T20:18:03Z
- Closed: 2026-11-13T17:56:32Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/45

## Question

Does Authentik meet the sign-in decided in [Decide registration flow](https://github.com/artkoenig/family-agenda-cloud/issues/37)? Run it and verify: user created through the API; repeated sign-in by mail link or code with passwords disabled; passkey optional; two replicas allowed under the free licence; mail scanners do not invalidate links. If it fails, repeat for Ory Kratos + Hydra. Checklist source: docs/research/operator-oidc-provider.md.


---

**Comment by artkoenig, 2026-11-13T17:56:30Z**

**Answer: Authentik meets the #37 sign-in.** All five checks pass against Authentik 2026.8.5 (unlicensed; 2 server replicas, 1 worker, PostgreSQL, no Redis), so the Ory Kratos + Hydra fallback was not run. Spike, tests and full results: `spikes/authentik-mail-signin/` (README) on branch `claude/implement-45-6b0034`.

| Check | Result |
|---|---|
| User created through the API | Pass: `POST /api/v3/core/users/`, no usable password, no devices |
| Repeated sign-in by mail code or link, passwords disabled | Pass: code flow (first sign-in enrols the mail device in-flow) and link flow, fresh sessions each time |
| Passkey optional | Pass (browser test): not required at first sign-in, can be added later, passkey and mail code both sign in afterwards |
| Two replicas under the free licence | Runs: flows started on one replica finish on the other. Allowed: reading, not tested. No replica counting in code; "multi-instance" on the pricing page is an Enterprise Plus support item; core MIT |
| Mail scanners do not invalidate links | Pass: a "Continue" step guards the link token; prefetch and unconfirmed opens leave it usable; single use after Continue |

**Notes for implementation**
- Validate stage starts the last-used method on its own (sends a code mail, or opens the passkey prompt); the other is one click away.
- Mail device keeps the address it was enrolled with; address change must reset it (per source, untested).

**Not covered, to do before production**
- Stock `default-authentication-flow` (password) still reachable by URL: delete or replace.
- No test that open signups are unreachable.
- No OIDC provider configured: claims and redirect back to the app untested.
- Scanners that click Continue, or run in a real browser; passkey autofill; passkey on the link flow.

