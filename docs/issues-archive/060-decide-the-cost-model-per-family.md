# #60 Decide the cost model per Family

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:27Z
- Closed: 2026-11-13T15:21:23Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/60

## Question

What does the service cost per month at 100 and at 1000 Families, fixed and per Family (compute, Postgres, storage, LLM, helpers)? Is that acceptable to go on? The result feeds the price decision of the entry-point map.

---

**Comment by artkoenig, 2026-11-13T15:21:22Z**

## Resolution

### The model

Everything net, per month, from the decisions already on this map. Volume assumption: **300 messages per Family and month** (`docs/research/ionos-ai-model-hub.md`), the one load-bearing number in the whole model.

| Line | 100 Families | 1000 Families |
|---|---|---|
| Cube ([#54](https://github.com/artkoenig/family-agenda-cloud/issues/54)) | 17.52 (Basic Cube M) | 23.36 (Memory Cube M) |
| Reserved IPv4 | 5.00 | 5.00 |
| Postgres ([#55](https://github.com/artkoenig/family-agenda-cloud/issues/55)) | 0 (container on the Cube) | 142 (managed, 2 cores/8 GB/100 GB) |
| Mail ([#67](https://github.com/artkoenig/family-agenda-cloud/issues/67)) | 1.50 (IONOS Mail Basic 1) | ~5.00 (Scaleway TEM at ~20k mails) |
| Domain `family-agenda.cloud` ([#52](https://github.com/artkoenig/family-agenda-cloud/issues/52)) | ~1.70 | ~1.70 |
| Healthchecks.io ([#64](https://github.com/artkoenig/family-agenda-cloud/issues/64)) | 0 (free tier) | 0 |
| Object Storage, backups and blobs ([#59](https://github.com/artkoenig/family-agenda-cloud/issues/59)) | ~0.10 | ~0.60 |
| **Fixed** | **~25.80** | **~178** |
| LLM, `Qwen/Qwen3.8-27B` ([#57](https://github.com/artkoenig/family-agenda-cloud/issues/57)) | 100 (1.00 per Family) | 1000 |
| **Total** | **~126** | **~1178** |
| **Per Family** | **1.26** | **1.18** |

**What the model says.** Infrastructure is noise: about 26 EUR a month at launch, 0.26 EUR per Family at 100 and 0.18 at 1000. The LLM is 79 % of the bill at 100 Families and 85 % at 1000, and it is the only line that scales with the number of Families. So the cost model is **1.00 EUR of inference plus about 0.20 EUR of infrastructure per Family and month**, flat across scale. Growing from 100 to 1000 Families is a 10× bill, not a step change.

### Acceptable to go on: yes

At 1.25 EUR per Family and month the fixed cost is covered by a handful of paying Families and the per-Family cost is an order of magnitude below any plausible price. Nothing in the topology has to change to make the numbers work.

**Price input for [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32)** — setting the price stays there, this is only the cost side checked against the figure the Operator has in mind, **4.99 EUR per Family and month gross**:

- 4.99 gross at 19 % VAT is 4.19 net; payment fees of about 0.25 + 2 % take another ~0.35; so ~3.84 EUR net per Family against 1.26 EUR of cost, a contribution of ~2.58 EUR (62 %). Under the small-business rule (§ 19 UStG, no VAT) it is ~3.38 EUR (73 %).
- Fixed cost is covered at **about 10 paying Families**.
- A Family turns cost-negative above **about 1100 messages a month** (~36 a day), roughly 3.6× the assumed volume. That is the headroom the price buys; see the tail-risk rule below.
- Payment fees themselves are **not** part of this map; they are listed here only so the price decision does not forget them.

### Rules this decision fixes

1. **The volume assumption is named, not hidden.** 300 messages per Family and month is an estimate, never measured. It is written into the growth CSV on the Cube next to the move triggers, and checked against the first month of real usage in DCD "Cost & Usage". Every number above moves linearly with it.
2. **The price must cover about 3× the assumed volume.** At 4.99 gross it covers 3.6×, which is the reason the figure clears cost; a lower price has to be checked against this line, not against the 1.26 EUR average.
3. **Tail cost per Family stays unbounded at launch**, as decided in [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57) — a Family at 3000 messages costs about 10 EUR. The named successor is per-Family usage accounting with a real quota, which [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57) ruled out of this map and into [Map: Public entry point of the hosted service (landing page, registration, billing)](https://github.com/artkoenig/family-agenda-cloud/issues/32). Its trigger is fixed here: **one Family above 10 EUR of inference in one month**. The Billing API shows only the contract total, so until that accounting exists the tail is visible merely as the aggregate alert moving while the Family count does not.
4. **The AI spend alert of [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57) is corrected to 250 EUR/month.** Its resolution read "at 300 messages per Family and month the whole 100-Family bill is a few EUR" and set the alert at 50 EUR as "about 50× the expected bill"; at 1.00 EUR per Family that bill is about 100 EUR, so the old threshold would have fired at ~50 Families. 250 EUR is about 2.5× the expected 100-Family bill and still far below runaway. Corrected in a comment on [#57](https://github.com/artkoenig/family-agenda-cloud/issues/57).

### Still open

- The `.cloud` domain price is an assumption (~20 EUR/year); the contract was taken at IONOS SE on 2026-11-13 and the real figure is in the control panel. It moves the fixed cost by at most ~1 EUR a month.
- Blob volume per Family is unmeasured; at 0.007 EUR per GB and 30 days it would take ~140 GB per Family to matter, so it is left as a rounding line.
- The LLM figure depends on the re-measurement on real, anonymised mail still open from [#53](https://github.com/artkoenig/family-agenda-cloud/issues/53). A move to `openai/gpt-oss-120b` would cut the per-Family cost from ~1.00 to ~0.12 EUR, i.e. the whole cost model to ~0.32 EUR per Family.

