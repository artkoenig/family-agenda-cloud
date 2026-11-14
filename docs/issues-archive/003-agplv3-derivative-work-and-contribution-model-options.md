# #3 AGPLv3 derivative-work and contribution-model options

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-06T20:01:48Z
- Closed: 2026-11-06T20:06:15Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/3

## Question

What are the options (and trade-offs) for 0.1 of the document: a private repo using AGPLv3 packages in the same process, while contributions run under DCO without CLA (ADR-0008)? Cover: CLA vs DCO, relicensing/dual-licensing prerequisites, offering SaaS source under AGPL, using only own code. High-trust sources only; not legal advice, flag what needs a lawyer.

---

**Comment by artkoenig, 2026-11-06T20:05:59Z**

Research done: `docs/research/agpl-contribution-options.md` (local, uncommitted).

Key points:
- Sole author may license own code in parallel under other terms (GPL FAQ); third-party contributions need their holder's permission to relicense. DCO is a provenance certificate, not a license grant, so DCO-only gives no relicensing room.
- FSF view: importing the packages into the same process likely makes the private repo a work based on the Program. AGPL s.13 then requires offering the whole combined source to hosted users.
- Options: A own code only; B license-grant CLA before first external contribution; C publish SaaS source under AGPL; D separate program over network; E mixed by package; F s.7 exception; G assignment CLA.
- Lawyer needed: derivative-work line under German/EU law, scope of Corresponding Source, CLA drafting, DCO validity.
- Timing: CLA is easy before the first external commit, hard after.

Issue left open.

---

**Comment by artkoenig, 2026-11-06T20:06:15Z**

Resolved: findings in docs/research/agpl-contribution-options.md (seven options A–G compared, lawyer questions listed). Unblocks the license decision.
