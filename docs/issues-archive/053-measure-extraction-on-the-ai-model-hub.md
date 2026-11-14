# #53 Measure Extraction on the AI Model Hub

- State: CLOSED (COMPLETED)
- Labels: wayfinder:prototype
- Created: 2026-11-12T08:55:07Z
- Closed: 2026-11-12T16:20:15Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/53

## Question

Which AI Model Hub model extracts Items from real German school mail and PDFs well enough, and what does a typical Family use per month in tokens and money? A rough harness against the public image's Extractor with a small set of real messages; compare two or three models.

---

**Comment by artkoenig, 2026-11-12T16:20:14Z**

## Resolution

**Measured on synthetic mail only** (user's choice: synthetic first, real later). 16 hand-written German messages (Elternbriefe, newsletter, club, Kita, PDF attachment text, OCR-noisy scan, relative dates, cancelled and empty cases; 29 required Items), 2 runs per model, through the public image's **unchanged** `OpenAiCompatibleExtractor` (main @ 2a1d62e, contract 2.0), against `https://openai.inference.de-txl.ionos.com/v1`, 2026-11-12. Scored before the app's own evidence/date check and retry.

| Model | `reasoning_effort: "low"` | Recall | Dates right | Times right | Evidence verbatim | Extras | Tokens/msg in / out | EUR per 1000 msgs | Median / p90 latency |
|---|---|---|---|---|---|---|---|---|---|
| Qwen3.8-27B | accepted | **58/58** | 58/58 | 16/16 | 68/69 | 1 | 901 / 1087 | 3.29 | 5.2 s / 8.8 s |
| gpt-oss-120b | accepted | 54/58 | 54/54 | 14/16 | 63/63 | 0 | 883 / 426 | 0.41 | 2.7 s / 8.1 s |
| Mistral Small 24B | **rejected, HTTP 400** ("Accepted values: none, high") → every message fails `unreachable` | 56/58 ¹ | 56/56 | 14/16 | 70/70 | 4 | 854 / 297 | 0.17 | 6.8 s / 13.7 s |
| Llama 3.3 70B | not tried unchanged | 56/56 ¹ | 55/56 | 16/16 | 67/69 | 3 | 868 / 273 | 0.74 | 5.6 s / 10.7 s |
| Qwen3.5-9B | accepted | 22/23 on 10 msgs, then stopped | | | | | | | one message (OCR scan) ran into the adapter's 5-min timeout |

¹ only with `reasoning_effort` removed from the request, which needs a change in the public repo.

**Findings**
- `json_schema` with `strict: true` and the adapter's schema (type unions with `null`, `enum` with `null`) is honoured by all five models: no `invalid-output` at all.
- `reasoning_effort: "low"` decides which models work unchanged: Qwen3.8-27B, gpt-oss-120b and Qwen3.5-9B accept it; Mistral Small rejects it. So with today's adapter only Qwen3.8-27B and gpt-oss-120b are usable.
- Qwen3.8-27B was flawless on this set but spends about 1100 output tokens (reasoning) per message, so it costs about 8× gpt-oss.
- gpt-oss-120b missed 4 Items, all in long or multi-Item messages (Lesewettbewerb in the newsletter, the Klassenfahrt itself, Weihnachtsferien, one OCR task). No false Items.
- Mistral Small (stripped): extras like "end of Christmas break" and "Geschwisterfotos", one test listed as a Task with a wrong weekday.
- Llama 3.3: once made up an event not in the message, English titles for German mail, 2× HTTP 502 `UPSTREAM_UNAVAILABLE`. Not worth pursuing.
- Qwen3.5-9B: too slow (reasoning is not bounded by `low`).

**Tokens and money per Family** (synthetic, short mails: about 900 input tokens per message; real newsletters with attachments will be larger): at 300 messages per Family and month, about 0.12 EUR (gpt-oss-120b) or about 1.00 EUR (Qwen3.8-27B). The app retries once when an Item fails its check, which adds a little. Either way it stays far below anything that matters for pricing.

**Answer to the question:** Qwen3.8-27B or gpt-oss-120b, both usable with the unchanged public image. Qwen3.8-27B extracts best and gpt-oss-120b is cheaper. Choosing between them is for "Decide the LLM model and the interim limit per Family". Mistral Small would be the cheapest, but only after a public-repo change that makes `reasoning_effort` configurable or omittable (outside this map). **Open: quality on real, anonymised mail and PDFs.** Re-run this harness on real mail before launch.

**Asset:** harness, corpus, logs and raw results on the throwaway branch `prototype/extraction-measure` of this repo (local commit 3076dc0, `prototypes/extraction-measure/`; not pushed yet). Run it with `PUBLIC_REPO=<family-agenda checkout> tsx run.ts <runs> <model...>`, plus `STRIP_REASONING_EFFORT=1` to test without the parameter.


---

**Comment by artkoenig, 2026-11-12T16:53:57Z**

Addendum, Qwen3.5-9B (the earlier runs finished partway, 18 rows each, with and without `reasoning_effort`): about 8000 output tokens (reasoning) per message, **median 156 s**, max 262 s, 3 adapter timeouts (5 min); recall 34/35 and 30/30 on the messages it answered; about 1.30 EUR per 1000 messages. Its reasoning is not bounded by `low`, which makes it too slow for Extraction. The verdict stands. Raw results added to `prototype/extraction-measure`.

---

**Comment by artkoenig, 2026-11-12T19:05:10Z**

Harness pushed: [`prototype/extraction-measure`](https://github.com/artkoenig/family-agenda-cloud/tree/prototype/extraction-measure/prototypes/extraction-measure).
