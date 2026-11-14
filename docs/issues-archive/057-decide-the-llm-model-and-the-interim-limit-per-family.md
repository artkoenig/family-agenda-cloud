# #57 Decide the LLM model and the interim limit per Family

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-12T08:55:19Z
- Closed: 2026-11-13T15:03:23Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/57

## Question

Which model serves Extraction for all hosted Families, what interim limit per Family applies, and what happens when the Operator's quota runs out? Covers [Operator-set LLM endpoint](https://github.com/artkoenig/family-agenda-cloud/issues/29).

---

**Comment by artkoenig, 2026-11-13T15:03:22Z**

## Resolution

**`Qwen/Qwen3.8-27B` on the IONOS AI Model Hub serves Extraction for every hosted Family, with no per-Family cap at launch and an Operator-side spend alert instead.**

### The model

- **`Qwen/Qwen3.8-27B`**, the one Operator-set LLM endpoint (`https://openai.inference.de-txl.ionos.com/v1`, Berlin) for all Families, through the unchanged `OpenAiCompatibleExtractor`.
- Chosen for quality, not price. On the synthetic German corpus ([Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53)) it found 58/58 Items with every date and time right; `openai/gpt-oss-120b` missed 4, all of them in long multi-Item messages — school newsletters, the very thing the product is for. A missed Elternbrief Task is the failure a Family notices; about **1.00 EUR per Family and month** against gpt-oss's 0.12 EUR is not worth that.
- Secondary effects accepted: about 1100 output tokens of reasoning per message (the cost driver, output is 2.70 EUR per 1M), 5.2 s median and 8.8 s p90 latency, INT4 quantisation by IONOS.
- `reasoning_effort: "low"` is accepted by this model, so no public-repo change is needed. Mistral Small (the cheapest) stays out: it answers `400` and would fail every message.
- Image input is not used: attachments are turned into text by poppler/Tesseract in `worker` before Extraction. The model would take images if that ever changes.
- **No automatic fallback model.** A silent switch would change extraction quality with nobody noticing.

### Interim limit per Family: none

- Nothing in the public image can cap a Family, and IONOS documents no spending limit; a per-Family cap would have to be built from the `usage` field of each answer. Not built now.
- The volume is structurally bounded: Extraction runs **once per Source Record**, a Family's Sources are its own mailboxes, calendars and WebUntis accounts, and retention caps what is kept. At 300 messages per Family and month the whole 100-Family bill is a few EUR.
- Instead, an **Operator-side ceiling**: a sibling of the token-expiry check in the `health` cron ([Decide monitoring, alerts and logs](https://github.com/artkoenig/family-agenda-cloud/issues/64)) reads the month's AI Model Hub spend over the IONOS Billing API and alerts above **50 EUR** (about 50× the expected bill at 100 Families). The maintainer also looks at DCD "Cost & Usage" monthly.
- Per-Family usage accounting and any real quota belong to billing, not here: ruled out of scope on the map, to the entry-point map.

### When the endpoint says no

- The adapter maps every non-2xx to `unreachable` (401/403 to `unauthorized`) and ignores `Retry-After`; the Source Record stays pending and the `worker` retries on its next due run. Rate limits are no constraint: 5 requests/s per model and contract against about 30,000 requests a day at 1000 Families.
- Accepted as is, with two conditions before registration opens:
  1. the **backoff** noted against [Decide worker as due-work functions (1.3)](https://github.com/artkoenig/family-agenda-cloud/issues/11) must be in, or `nextDueAt()` spins hot while the endpoint fails;
  2. the **overdue-backlog alert** from #64 is what tells the maintainer that Extraction is stuck — there is no separate LLM alert.

### Model lifecycle

- The model id lives in the root-only `.env` on the Cube and is switched by hand: run the measuring harness (`prototype/extraction-measure`) on the corpus first, then edit and `deploy.sh`, with the maintainer's own Family as canary ([Decide staging](https://github.com/artkoenig/family-agenda-cloud/issues/65)). A model change is a release like any other.
- `openai/gpt-oss-120b` is the documented successor if Qwen3.8-27B is retired or gets too slow.

### Open before launch

- **Quality on real, anonymised mail and PDFs** is still unmeasured (open from #53). Re-run the harness before registration opens; it may move the choice to gpt-oss-120b.
- The terms question of [Get IONOS's written word on serving Families through the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/62) is deliberately **not** waited for here (maintainer's call): it changes the paperwork in [Decide the processing agreements and the sub-processor list](https://github.com/artkoenig/family-agenda-cloud/issues/70), not the model choice. Should the answer forbid serving third parties, the whole AI Model Hub falls, not this model.

### Facts behind it

- [Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53) (measured 2026-11-12, main @ 2a1d62e, contract 2.0) and `docs/research/ionos-ai-model-hub.md` (prices, rate limits, error codes, `reasoning_effort` per model).
- Build issue this answers: [Operator-set LLM endpoint](https://github.com/artkoenig/family-agenda-cloud/issues/29).


---

**Comment by artkoenig, 2026-11-13T15:21:20Z**

## Correction to the resolution (from [Decide the cost model per Family](https://github.com/artkoenig/family-agenda-cloud/issues/60))

Two numbers in "Interim limit per Family" were wrong by two orders of magnitude:

- "At 300 messages per Family and month the whole 100-Family bill is a few EUR" — at the 1.00 EUR per Family and month this resolution itself chose, the 100-Family bill is **about 100 EUR a month**. The sentence stands only as the argument that volume is structurally bounded, not as a figure.
- The Operator-side ceiling of **50 EUR**, called "about 50× the expected bill at 100 Families", is in fact **half** of it and would have fired at about 50 Families. It is raised to **250 EUR a month** — about 2.5× the expected 100-Family bill, still far below runaway. The alert stays where it was: the `health` cron reading the month's AI Model Hub spend over the IONOS Billing API.

Everything else in the resolution stands, model choice included; it was made on quality against a correctly stated 1.00 vs 0.12 EUR per Family and month. The per-Family tail stays uncapped at launch, with the trigger for the successor now fixed in [#60](https://github.com/artkoenig/family-agenda-cloud/issues/60): one Family above 10 EUR of inference in one month.

