# #35 Research Identity Providers for hosted sign-in

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-07T16:29:18Z
- Closed: 2026-11-07T16:33:16Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/35

## Question

Which Identity Providers should hosted sign-in offer in the EU (Google, Apple, Microsoft, others)? Cover `email_verified` behaviour, cost, setup effort, privacy implications, and the options for people without such an account given that hosted has no password sign-in.

---

**Comment by artkoenig, 2026-11-07T16:33:14Z**

## Resolution

Findings: `docs/research/identity-providers.md` (untracked for now; the repo has no commits).

- **Key:** only `iss`+`sub` is stable. Apple and Microsoft `sub` are pairwise, so mappings depend on the client registration.
- **`email_verified`:** not comparable across providers. Google is authoritative only for Gmail and Workspace. Microsoft documents no such claim and says `email` isn't guaranteed correct. Apple lists it, but may yield a relay address (its wording confirmed only via forum quotes). So the "verified email" half of the register mapping (#20) is weak.
- **Cost/effort:** Google: no fee found, brand verification needs public homepage + privacy policy. Apple: 99 USD/year, App ID + Services ID, relay mail setup (SPF/DKIM). Microsoft: publisher verification free and apparently not needed for sign-in only.
- **No such account:** options are requiring one, netID (portal free, claims unverified), or an Operator-run standalone OIDC provider with passkeys (must not broker, per #20). EUDI Wallet acceptance isn't mandatory for us (Art. 5f(2) exempts micro/small enterprises).
- **Privacy:** provider sees each sign-in; US transfer rests on the DPF, appeal C-703/25 P registered. Needs legal review.

No decision made; open checks are listed at the end of the note.
