# #29 Operator-set LLM endpoint

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:13Z
- Closed: 2026-11-14T19:25:25Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/29

## Parent

#24 (public state and standing rules there)

## What to build

Provide the LLM endpoint for all hosted Families through the Operator-set LLM endpoint (endpoint page hidden, optional read-only description line), as decided in [#19](https://github.com/artkoenig/family-agenda-cloud/issues/19).

Decided:

- Endpoint: IONOS AI Model Hub (OpenAI-compatible, Berlin), model `Qwen/Qwen3.8-27B` for every Family, model id in `.env`, switched by hand after a harness run ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)).
- API key: AI Model Hub token in the root-only `.env` (no key service, [#56](https://github.com/artkoenig/family-agenda-cloud/issues/56)), rotated by hand every 80 days ([#58](https://github.com/artkoenig/family-agenda-cloud/issues/58)); token valid until 2027-11-14 ([#85](https://github.com/artkoenig/family-agenda-cloud/issues/85)).
- Interim limit: no per-Family cap at launch; spend alert above 250 EUR/month over the IONOS Billing API in the `health` cron ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57), [#60](https://github.com/artkoenig/family-agenda-cloud/issues/60)). A refusing endpoint is a temporary error; worker backoff and the overdue-backlog alert are launch conditions.

Left to build: the configuration in `cube/` and the alert. Public 0.6.0 still stores the endpoint per Instance, set by an Admin on the AI page.

## Acceptance criteria

- [ ] Endpoint, model and key set from `.env`; key never stored in a Family database
- [x] Interim per-Family limit decided and documented ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57))
- [ ] Spend alert and overdue-backlog alert live in the `health` cron

## Blocked by

- Public Operator-set LLM endpoint and worker backoff: hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), not yet created
- Use of the AI Model Hub for third parties: [#62](https://github.com/artkoenig/family-agenda-cloud/issues/62) (blocks only launch stage (c), [#71](https://github.com/artkoenig/family-agenda-cloud/issues/71))


---

**Comment by artkoenig, 2026-11-14T19:18:39Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
