# #5 Decide how ADR-0004 is superseded (ADR 0.2)

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-06T20:01:53Z
- Closed: 2026-11-06T20:14:05Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/5

## Question

ADR-0004 excludes a hosted offering. What exactly does the new ADR state (hosted instances with shared processes and one database per family; Messenger and WebUntis stay self-hosting only), and how much of ADR-0004 stays valid? Output: ADR draft.

---

**Comment by artkoenig, 2026-11-06T20:06:32Z**

Fact-check delta (see docs/research/public-repo-factcheck.md): ADR-0004 says there will be no hosted version at all, so 0.2 reverses it rather than amending it. ADR-0013 reads ADR-0004 as allowing a hosted instance per family, which contradicts that; ADR-0013 is also partly superseded by ADR-0016.

---

**Comment by artkoenig, 2026-11-06T20:14:04Z**

## Resolution

**Decision (ADR draft for public repo, supersedes ADR-0004 partially; ADR-0004 status becomes "partially superseded by ADR-00XX"):**

- Hosted Instances are allowed *in addition*: the maintainer may operate a hosted offering using shared processes and one database per Family. The service part of ADR-0004 (Remote Access, Notifier, hosted Extractor, backup target; Agenda Cloud as a separate system) stays valid for self-hosters.
- Source Types in hosted operation: **Matrix messengers are never hosted** (stay self-hosting only, same rationale as ADR-0004 / ADR-0011). **IMAP, ICS and WebUntis are allowed hosted.** Open risk: whether WebUntis works from datacenter IPs is unverified (to be checked in a later phase, not an ADR condition).
- Principles: (1) every Family can be exported and moved to self-hosting at any time (no lock-in); (2) Family data stays separated per database, key management per Family. Details (KMS, backups, region) are out of this map.
- Wording: public and explicit about the existence of a hosted offering, without plans, prices or private architecture. Publishing the ADR in the public repo happens when the maintainer decides, not automatically with the refactorings.
- Also resolves the internal tension: ADR-0013 reads ADR-0004 as allowing a hosted Instance per Family; the new ADR makes that explicit.
