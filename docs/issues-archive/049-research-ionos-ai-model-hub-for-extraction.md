# #49 Research IONOS AI Model Hub for Extraction

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-12T08:54:56Z
- Closed: 2026-11-12T09:02:36Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/49

## Question

Does the IONOS AI Model Hub fit as the Operator-set LLM endpoint: models offered (text and image input), OpenAI-compatible API and its gaps, schema-constrained output (`response_format` `json_schema`), context sizes, price per token, rate limits and quotas, where inference runs, what is logged or kept, terms on processing personal data? Compare with the needs in the public repo's `docs/research/llm-item-extraction.md`.

---

**Comment by artkoenig, 2026-11-12T09:02:34Z**

**Resolution:** The IONOS AI Model Hub fits as the Operator-set LLM endpoint, with two things to measure and one to clear on paper. No blocker found.

- API: OpenAI-compatible `/v1/chat/completions` + `/v1/models` at `https://openai.inference.de-txl.ionos.com/v1` (Berlin only). `response_format` `json_schema`/`strict` is in the schema but "model-specific"; documented by example only for Llama 3.3 70B. Measure.
- Adapter gap: it always sends `reasoning_effort: "low"`; IONOS rejects unsupported values. Documented as accepted only by Qwen3.8 27B and GPT-OSS 120B. Measure the others; a rejecting model needs a public adapter change.
- Models: 6 LLMs, 128k-262k context; image input on Qwen3.5 9B, Mistral Small 24B, Qwen3.8 27B, Qwen3.5 397B (the adapter sends text only today).
- Price (net, per 1M tokens in/out): 0.10/0.15 EUR (Qwen3.5 9B) to 0.60/3.60 EUR; roughly 0.1-1 EUR per Family and month (own estimate).
- Limits: 5 req/s per model per contract, no token quota documented; 529 load shedding exists; SLA 99.9 %.
- Data: inference only in Germany; prompts/outputs not logged, stored or used for training; metadata (time, model, tokens) kept for an unpublished period; sub-processors only IONOS group (DE, RO, ES); DPA part of the contract.
- Terms: AI terms call script-driven use and making the service available to third parties misuse unless the service description provides otherwise; get written confirmation from IONOS that a multi-tenant SaaS backend is intended use.
- Measure first: `Qwen/Qwen3.8-27B`, `openai/gpt-oss-120b`, `mistralai/Mistral-Small-24B-Instruct`.

Details and sources: `docs/research/ionos-ai-model-hub.md`

