# #31 Publish the hosted-operation principles in the public ADRs

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:19Z
- Closed: 2026-11-14T19:25:29Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/31

## Parent

#24

## What to do

The supersession of the old public ADR-0004 (self-hosted only) decided in [#5](https://github.com/artkoenig/family-agenda-cloud/issues/5) is partly overtaken: on 2026-11-09 the public ADR set was replaced (artkoenig/family-agenda#289). The old ADR-0004 no longer exists (the new ADR-0004 is about Agenda Links and Admin sign-in), and public ADR-0003 already says that "a provider hosting Family Agenda as a service runs one Instance per Family", with an amendment anticipating one Instance serving several Families, each in its own database.

Left from [#5](https://github.com/artkoenig/family-agenda-cloud/issues/5), not yet in any public ADR:

- Hosted Instances use shared processes with one database per Family (ADR-0003 must be amended from "one Instance per Family").
- Matrix messengers are never hosted; IMAP, ICS and WebUntis may be.
- Every Family can be exported and moved to self-hosting at any time (no lock-in); data separated per database, key per Family.
- Operator access stated openly ([#17](https://github.com/artkoenig/family-agenda-cloud/issues/17)).

Wording stays public and explicit about the existence of a hosted offering, without plans, prices or private architecture. The maintainer decides the timing; it may ride with the hand-off issues of [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), since multi-Family mode needs the ADR-0003 amendment anyway.

## Acceptance criteria

- [ ] Timing decided
- [ ] Public ADR-0003 amended (or a new ADR added) with the points above

## Blocked by

None - timing is the maintainer's decision


---

**Comment by artkoenig, 2026-11-14T19:18:59Z**

Retitled: the old public ADR-0004 was replaced with the whole ADR set on 2026-11-09 (artkoenig/family-agenda#289), so there is nothing left to supersede; what remains of #5 is listed in the body.
