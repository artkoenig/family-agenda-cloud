# IONOS AI Model Hub as the Operator-set LLM endpoint for Extraction

Research for issue #49 (feeds map #46 and build issue #29). Date: 2026-11-12. Not legal advice; items marked **[LAWYER/IONOS]** need a written answer from IONOS or professional review.

**Question:** Does the IONOS AI Model Hub fit as the one Operator-set LLM endpoint for all hosted Families: models (text, image input), OpenAI-compatible API and its gaps, schema-constrained output, context sizes, price, rate limits, where inference runs, what is logged, and the terms on personal data? Compared with the needs in the public repo's `docs/research/llm-item-extraction.md` and with what `packages/adapters/src/openai-compatible-extractor.ts` actually sends.

**Short answer:** Technically it fits, with two things to prove by measurement and one thing to clear on paper.

- **Fits:** OpenAI-compatible `/v1/chat/completions` and `/v1/models` at one Berlin endpoint; `response_format` `json_schema` with `strict` is in the API schema; four models take image input; context 128k–262k; prices of 0.10–0.65 EUR per 1M input tokens make Extraction cost cents per Family and month; default limit 5 requests/s per model per contract is far above the need for 1000 Families; inference only in Germany, prompts and outputs neither logged nor stored nor used for training, no sub-processors outside the IONOS group, DPA part of the contract, 99.9 % SLA.
- **Must be measured (not documented):** which models honour `json_schema`/`strict` (documented with an example only for Llama 3.3 70B; the API reference calls it "model-specific"), and whether the adapter's hard-coded `reasoning_effort: "low"` is accepted. Per the docs an unsupported value is an error, and only Qwen3.8 27B and GPT-OSS 120B list `low` as accepted. A model that rejects it fails every message as `unreachable`.
- **Must be cleared on paper [LAWYER/IONOS]:** the "Nutzungsbedingungen für KI-Dienste" define script-driven use and making the service available to third parties as misuse, "unless expressly provided otherwise in the service description". The API product is clearly meant for automated use in the customer's own applications, but no contractual service description was found that says so, and the hosted service processes third parties' (the Families') content. Not judged a blocker, but get it confirmed in writing before building on it.

Sourcing: all pages were read on 2026-11-12. Doc pages were read through a fetch tool that summarises; the AI terms, the sub-processor list and the third-party terms list were read as raw text. Nothing was tested against the live API (no account used). "Not documented" means: not on the pages read.

---

## 1. Models

Source: model list and comparison ([models](https://docs.ionos.com/cloud/ai/ai-model-hub/models), [LLMs](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms), [comparison](https://docs.ionos.com/cloud/ai/ai-model-hub/models/models-comparison)) and the model cards linked per row.

| Model (API id) | Developer | Input | Context | Reasoning / `reasoning_effort` | On IONOS since | Card |
|---|---|---|---|---|---|---|
| `Qwen/Qwen3.5-9B` | Alibaba (CN) | text, image (max 4 per request), video | 262k | on by default; only on/off, `"none"` turns it off | 2026-07-22 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/qwen3-5-9b) |
| `mistralai/Mistral-Small-24B-Instruct` (card links Mistral Small 3.2, 2506) | Mistral (FR) | text, image | 128k | none | 2025-08-01 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/mistral-small-24b) |
| `Qwen/Qwen3.8-27B` (INT4 quantised by IONOS) | Alibaba (CN) | text, image (max 4), video (beta) | 262k | on by default; `xhigh`, `medium` (default), `low`, `none` | 2026-08-27 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/qwen3-8-27b) |
| `meta-llama/Llama-3.3-70B-Instruct` (AWQ INT4) | Meta (US) | text | 128k | none | 2025-03-15 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/meta-llama-3-3-70b) |
| `openai/gpt-oss-120b` (MXFP4) | OpenAI (US) | text | 128k | `low`, `medium` (default), `high` | 2025-08-12 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/openai-gpt-oss-120b) |
| `Qwen/Qwen3.5-397B-A17B` (FP8) | Alibaba (CN) | text, image | 262k | on by default; only on/off, `"none"` turns it off | 2026-07-14 | [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/qwen3-5-397b) |

Also offered: `lightonai/LightOnOCR-2-1B` (OCR, image in, Markdown out, 16k context, no prompt control; [card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/ocr-models/lightonocr-2-1b)), a coding model (Qwen3 Coder Next 80B), embeddings, reranker, FLUX image generation, Whisper.

- All LLMs: tool calling and streaming. Maximum output tokens are not documented on any card.
- The developer only supplies the weights; all models are run by IONOS (see §8).
- **Model churn is real.** IONOS retired Mistral Nemo and Llama 3.1 8B in October 2026, Llama 3.1 405B in September 2026, Teuken 7B in April 2026 ([models](https://docs.ionos.com/cloud/ai/ai-model-hub/models)). The terms allow retiring or replacing models "mit einer angemessenen Frist", no fixed notice period ([AI terms §3](https://cloud.ionos.de/terms-gtc/ki-dienste/)). The model id is Operator config, and a retirement means re-measuring.

## 2. OpenAI compatibility, against what the adapter sends

Base URL `https://openai.inference.de-txl.ionos.com/v1`, `Authorization: Bearer <token>` ([text generation](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/text-generation), [API reference](https://docs.ionos.com/cloud/api-reference/ai/ai-model-hub)).

| What the adapter does | IONOS | Verdict |
|---|---|---|
| `GET {baseUrl}/models`, reads `data[].id` | `GET /v1/models` returns `{object:"list", data:[{id, object, created, owned_by}]}`; lists all types (LLM, embedding, image …) unless `?type=llm` ([list models](https://docs.ionos.com/cloud/api-reference/ai/ai-model-hub/models/list-models)) | Fits. The check lists non-chat models too; irrelevant when the Operator sets the model. |
| `POST {baseUrl}/chat/completions`, `model`, `messages` with `system` + `user` as plain strings | Supported | Fits. |
| `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}` | In the request schema; support and `strict` handling "model-specific" ([create chat completion](https://docs.ionos.com/cloud/api-reference/ai/ai-model-hub/chat-completions/create-chat-completion)) | See §3. **Measure.** |
| `reasoning_effort: "low"`, always | "Reasoning-capable models also accept the `reasoning_effort` parameter, with accepted values varying by model"; an unsupported value "will return an error rather than falling back to a default" (text generation page); the API reference says 400. `low` is listed for Qwen3.8 27B and GPT-OSS 120B. Qwen3.5 9B/397B document only on/off via `"none"`. Mistral Small and Llama 3.3 have no reasoning; what they do with the parameter is not documented. | **Gap risk.** Works as documented only for Qwen3.8 27B and GPT-OSS 120B. For the others: measure; if rejected, the public adapter needs a way to omit or set the value (a change in the public repo). |
| Reads `choices[0].message.content` as string, `finish_reason === "length"` | `content` holds the answer; the reasoning trace is in a separate field `message.reasoning`; `finish_reason` `stop`/`length`/`tool_calls` | Fits. Reasoning does not pollute `content`. |
| Sends no `max_tokens` | Default is not documented. Reasoning tokens count toward the limit; if the limit is hit while reasoning, `content` is empty and `finish_reason` is `length` | Probably fine (adapter reports `invalid-output`). Default limit: measure. |
| 401/403 → `unauthorized`; any other non-2xx → `unreachable`; no retry | 400 validation, 404 unknown model, 413 too large, 422 model does not implement a parameter, 429 rate limit with `Retry-After`, 502/503/504, 529 overload with `Retry-After` ([error codes](https://docs.ionos.com/cloud/ai/ai-model-hub/error-codes)) | Fits the app's model (#29: quota exhaustion shows as `unreachable`). The adapter ignores `Retry-After`; retry is the worker's business. |
| Client timeout 5 minutes | Server-side request timeout not documented (504 exists) | Open point. |
| Text only: the adapter sends no image parts (the app turns PDFs and scans into text itself, with poppler and Tesseract) | — | Image input is not needed by today's adapter; see §4. |

Other points:

- **Token, not API key.** Auth uses an IONOS Cloud token (a JWT) that belongs to one user, has a TTL chosen at creation and is not limited to the AI Model Hub; its reach is that user's rights. IONOS recommends a dedicated user in a group with only "Access and manage AI Model Hub" ([access management](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/access-management)). Expired tokens are "the most common cause of sudden 401 errors" ([troubleshooting](https://docs.ionos.com/cloud/ai/ai-model-hub/troubleshooting)). Maximum TTL: not documented on the pages read. Plan token rotation and an alert on `unauthorized`.
- No per-token spending limit or budget is documented. Usage per model is visible in the DCD "Cost & Usage" and through the Billing API ([FAQ](https://docs.ionos.com/cloud/ai/ai-model-hub/faqs)). A per-Family limit (#29) has to be built in the hosted service, from the `usage` field of each answer.
- Also offered but not needed: `/v1/responses`, `/v1/embeddings`, `/v1/rerank`, `logprobs`/`top_logprobs`, `seed` (best effort, model-specific).

## 3. Schema-constrained output

- The Chat Completions schema accepts `response_format` of type `text`, `json_object` or `json_schema`; `json_schema` needs `name` and `schema`, `strict` is optional. "Which formats a model supports is model-specific", as is whether `strict` is honoured ([create chat completion](https://docs.ionos.com/cloud/api-reference/ai/ai-model-hub/chat-completions/create-chat-completion)).
- The only worked example is on the Llama 3.3 70B card: `json_schema`, `strict: true`, `additionalProperties: false` ([card](https://docs.ionos.com/cloud/ai/ai-model-hub/models/llms/meta-llama-3-3-70b)). No other model card, the comparison table or a how-to mentions structured output. There is no per-model capability flag in `GET /v1/models`.
- Not documented: the constraining backend, which JSON Schema features it supports, and what happens with unsupported ones (error or silently skipped). The adapter's schema uses nested objects, arrays, type unions `["string","null"]` and an `enum` that includes `null`; whether each model's backend enforces those is unknown.
- The adapter validates every answer itself, so a model that ignores the schema shows up as `invalid-output`, not as wrong Items. That makes measuring cheap: run the fixture set and count `invalid-output`.
- An unsupported `response_format` would most likely surface as 400 or 422 `UPSTREAM_NOT_IMPLEMENTED` (inferred from the error table, not stated).

## 4. Image input (scans, photos)

- Models with image input: Qwen3.5 9B, Mistral Small 24B, Qwen3.8 27B, Qwen3.5 397B. Sent as `image_url` content parts on the `user` message, as a public URL or a base64 data URI (must contain a literal `;base64`). Limits: request body 16 MiB, each decoded image 12 MiB, Qwen cards: at most four images per request. A model without image input answers 400 ([image input](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/image-input)).
- For private documents use base64 only; a remote URL would have to be publicly reachable.
- Image tokens are billed as input tokens; the conversion is model-specific and not given on the cards read. IONOS suggests 200 DPI for document pages.
- Requests over 4 MiB are limited in concurrency (six at a time on the image-input page, two at a time on the [PDF guide](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/pdf-to-text); the pages disagree); the rest get 503 with `Retry-After: 1`.
- PDFs cannot be sent as files; IONOS's own guide renders each page to PNG and sends one page per request, to LightOnOCR-2-1B for plain OCR or to Mistral Small 24B with a prompt.
- Whether image input combines with `response_format` is not documented.
- Relevance: today's adapter sends text only. Image input at IONOS would matter only if scans should be read by a vision model instead of Tesseract, which is a change in the public repo and outside this map. If wanted later, LightOnOCR-2-1B (0.15/0.30 EUR per 1M tokens) or one of the four vision LLMs can do it at the same endpoint; German quality unmeasured (the OCR card says "multilingual" without a language list).

## 5. Price

Net prices per 1M tokens, EUR, "zuzüglich gesetzlicher Umsatzsteuer", no date on the page ([price list](https://cloud.ionos.de/preise), same figures on the [product page](https://cloud.ionos.de/managed/ai-model-hub)):

| Model | Input | Output |
|---|---|---|
| Qwen3.5-9B | 0.10 | 0.15 |
| Mistral Small 24B | 0.10 | 0.30 |
| gpt-oss-120b | 0.15 | 0.65 |
| Qwen3.8-27B | 0.40 | 2.70 |
| Qwen3.5-397B-A17B | 0.60 | 3.60 |
| Llama 3.3 70B | 0.65 | 0.65 |
| LightOnOCR 2 | 0.15 | 0.30 |

- Pay per use; no base fee, free tier or minimum is listed. The offer is for businesses only ("ausschließlich an Gewerbetreibende").
- Billing rules ([FAQ](https://docs.ionos.com/cloud/ai/ai-model-hub/faqs)): system prompt counts as input on every request; reasoning tokens are output tokens; repeated input is billed at the full rate (prefix caching speeds up but gives no discount); every retry is billed; a request the client aborts is billed for the tokens already generated ([error codes](https://docs.ionos.com/cloud/ai/ai-model-hub/error-codes), 499).
- **Illustration, own estimate, not measured:** one message = about 2,200 input tokens (the adapter's instructions and schema plus a mail of about 1,500 tokens) and 500 output tokens including some reasoning. Cost per 1,000 messages: Qwen3.5-9B 0.30 EUR, Mistral Small 0.37 EUR, gpt-oss-120b 0.66 EUR, Llama 3.3 1.76 EUR, Qwen3.8-27B 2.23 EUR, Qwen3.5-397B 3.12 EUR. At 300 messages per Family and month that is about 0.09 to 0.94 EUR per Family and month. Long newsletters with attachments and reasoning-heavy answers move this up; the output price of the Qwen 27B/397B models makes reasoning the main cost driver there. Real token counts come out of the measuring run (`usage`).

## 6. Rate limits and quotas

Source: [rate limits](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/rate-limits).

- Default: 5 requests/s base, burst 10, **per model and per contract** (not per user or token). `GET /v1/models` has its own limit of the same size. Contracts "can have custom limits"; how to ask for more is not described.
- No token-per-minute limit and no monthly quota is documented.
- 429 with `Retry-After` when the limit is exceeded. Separately, **529** means load shedding: `user_overloaded` (own traffic) or `server_overloaded` (the platform lacks capacity for that model; "retry later, or consider a different model"). So capacity per model is shared and not guaranteed.
- Headers `X-RateLimit-Limit-Requests`, `-Remaining-Requests`, `-Reset-Requests`; `X-Request-Id` for support.
- Fit: 5 requests/s is 432,000 requests per day. 1000 Families at 30 messages a day are 30,000 requests per day, spread by the worker. The limit is no constraint; all Families share it, so one Family's backlog must not starve the others (worker scheduling, not an IONOS matter).
- The terms allow IONOS to rate-limit and, on suspected misuse, to throttle, downgrade to a weaker model or suspend ([AI terms §2.4, §2.7](https://cloud.ionos.de/terms-gtc/ki-dienste/)).

## 7. Availability

- SLA section 13 covers the AI Model Hub API endpoints: 99.9 % monthly average ("wirtschaftlich angemessene Anstrengungen"), downtime counted as minutes with 500/502/503/504; credits of 10 % / 25 % / 40 % of the month's AI Model Hub fees; claim within two weeks with request logs. Stand 08/2026 ([SLA](https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/service-level-agreement/)). 429 and 529 do not count as downtime as described.
- Third-party status mirrors list several AI Model Hub degradations in 2026 (capacity, one API outage of about an hour). Not verified against [status.ionos.cloud](https://status.ionos.cloud). Extraction is asynchronous, so short outages only delay Items.
- One region only: the endpoint is `de-txl` (Berlin); no second region to fail over to.

## 8. Inference location, logging, retention

Source: [data handling](https://docs.ionos.com/cloud/ai/ai-model-hub/governance-and-compliance/data-handling), unless noted. These are statements in product documentation; the contractual commitments are the DPA and the AI terms (§9).

- **Location:** all inference in IONOS data centres in Germany; prompts and outputs are processed there and nowhere else. The service catalog names Berlin ([service catalog](https://docs.ionos.com/cloud/support/general-information/service-catalog)).
- **Content:** prompts and outputs are not written to any log or persistent storage and are not accessed by IONOS staff; they exist in host and GPU memory, in plaintext, during processing.
- **Training:** content is not used to train, fine-tune or improve any model. The AI terms make this contractual: any use beyond providing the service, technical security and troubleshooting, "insbesondere für das Training", is "ausdrücklich untersagt"; quality improvement and misuse checks on content apply to SaaS use only, not to the API ([AI terms §2.3](https://cloud.ionos.de/terms-gtc/ki-dienste/)).
- **Metadata:** timestamp, model and token counts per request are recorded (billing, operations). Operational logs are kept "only for the period necessary to operate the service reliably"; **no fixed retention period is published.**
- **Third parties:** content is not disclosed to model developers; they supply weights only and are not processors.
- **Sub-processors:** the doc page says no third-party sub-processors are engaged. The contractual list (Stand 11/2026) names IONOS group companies for the AI Model Hub: IONOS SE (Germany; support and operation), IONOS Cloud Romania S.R.L. and IONOS Cloud Solutions Spain S.L.U. (third-level support, administrative remote access) ([list, PDF](https://cloud.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/cloud/avv/IONOS_Cloud_GmbH_Unterauftragnehmer.pdf)). All in the EU; the privacy text of the hosted service has to name them.
- **Security:** TLS in transit, ISO 27001 data centres, AI Model Hub in scope of BSI C5. No pseudonymisation by IONOS.
- The optional `user` request field is an "opaque identifier for your end user"; the adapter does not send it. Keep it that way, or send nothing that identifies a Family.

## 9. Terms on personal data and on use

- **Roles and DPA:** the customer stays controller; IONOS is processor. The DPA ("Datenschutzpaket", Art. 28 GDPR) is part of the contract and needs no separate signature. As read: version 7.4, Stand 06/2023; processing in the EU/EEA; deletion at the end of processing; general authorisation for sub-processors with 14 days to object; audits normally satisfied by ISO 27001 ([DPA](https://cloud.ionos.de/terms-gtc/terms-enterprise-cloud/enterprise-datenschutzpaket/)). The hosted service is itself a processor for the Families (or controller, per the entry-point map), which makes IONOS its sub-processor.
- **Kinds of data:** "you decide what personal data your requests contain"; for special categories (Art. 9 GDPR) "no restrictions apply beyond the measures described on this page", the legal basis is the customer's job (data handling page). Children's data is not addressed anywhere. School letters can contain health or religion details; that is the hosted service's legal question, not an IONOS restriction.
- **Use restrictions in the AI terms** ([Nutzungsbedingungen für KI-Dienste](https://cloud.ionos.de/terms-gtc/ki-dienste/), no date on the page), which cover both SaaS AI products and "Zugriff auf KI-Modelle und deren API-Schnittstellen (… PaaS)":
  - §2.5: the AI services are meant "für die interaktive Nutzung durch eine natürliche Person …, soweit in der Leistungsbeschreibung nicht ausdrücklich anders vorgesehen".
  - §2.6: misuse includes "skript-, makro- oder softwaregesteuerte Nutzung" and not using the service for the customer's own purpose, "insbesondere durch Weiterverkauf der KI-Dienste oder des Zugangs hierzu an Dritte, sonstige entgeltliche oder unentgeltliche Überlassung an Dritte".
  - §2.8: no misuse where the use is expressly provided for in the service description; APIs must not be used in a way that endangers the infrastructure.
  - Reading: an inference API is by nature software-driven, and IONOS markets the Hub for building it into "eigene Anwendungen" ([product page](https://cloud.ionos.de/managed/ai-model-hub)); Families get Items, never access to the API. So the hosted service most likely is use for the customer's own purpose as provided. But the exception hangs on "the service description", and no contractual Leistungsbeschreibung for the AI Model Hub was found (the service catalog is informational). **[LAWYER/IONOS]** Ask IONOS to confirm in writing that calling the API from a multi-tenant SaaS backend that processes end customers' content is intended use.
  - §4.2: use for developing or running high-risk AI systems (Art. 6 AI Act) is forbidden. Extracting dates from school mail for a family calendar is not an Annex III use as far as can be seen (the education entries concern admission, grading and exam proctoring), but this is a legal classification. **[LAWYER]**
  - §1.6: third-party model terms must be followed; the list names Meta's Llama use policy and OpenAI's usage policies for GPT-OSS ([list, PDF](https://cloud.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/KI-Dienste/KI-Nutzungsbedingungen_Drittanbieter_DE.pdf)). Qwen and Mistral Small are Apache 2.0 and not on the list.
  - §1.3–1.5, §6.1: no liability for wrong output; the customer must check output before relying on it. Consistent with the app (evidence check, Items editable).
- **EU AI Act:** IONOS sees itself as provider of the AI system "AI Model Hub"; the customer is deployer and may become provider of its own system; transparency duties (telling users that AI is involved) are the customer's ([EU AI Act page](https://docs.ionos.com/cloud/ai/ai-model-hub/governance-and-compliance/eu-ai-act)).

## 10. Models worth measuring

Measure with the public repo's German fixture set through the unchanged adapter; record `invalid-output` rate, per-field accuracy, tokens and latency.

1. **`Qwen/Qwen3.8-27B`**: the only model that is documented to accept `reasoning_effort: "low"` *and* takes images; the newest; the earlier research rates the Qwen 27B class "close to BYOK quality" on this text. Costly output (2.70 EUR), so watch reasoning tokens. INT4 quantisation may cost some accuracy.
2. **`openai/gpt-oss-120b`**: accepts `low`, a third of the price, large model. Text only, which is all the adapter needs.
3. **`mistralai/Mistral-Small-24B-Instruct`**: cheapest sensible option, European developer, no reasoning (fast), image input, the model IONOS itself uses for prompted PDF extraction. Risk: may reject `reasoning_effort`; that is the first thing the run shows.

Optional fourth as a floor: `Qwen/Qwen3.5-9B` (0.10/0.15 EUR), same `reasoning_effort` question. Not worth measuring first: Llama 3.3 70B (oldest, text only, pricier than gpt-oss, though the one model with a documented `json_schema` example, so a fallback if the others fail on structured output) and Qwen3.5 397B (most expensive; only if the 27B is not good enough).

## 11. Open points

- **Structured output per model:** not documented beyond Llama 3.3 70B. Measure with the adapter's exact schema (type unions with `null`, `enum` with `null`, `strict: true`).
- **`reasoning_effort: "low"`** on Mistral Small 24B, Llama 3.3 70B, Qwen3.5 9B/397B: accepted, ignored or 400? If rejected, choosing such a model needs a change to the public adapter.
- **Written confirmation of intended use** (AI terms §2.5/§2.6/§2.8) and whether a contractual service description for the AI Model Hub exists. **[LAWYER/IONOS]**
- **Retention period of operational metadata**: unpublished. Ask IONOS; the privacy text needs it.
- **DPA version:** read as 7.4 / 06/2023; confirm that this is the current one and that it covers the AI Model Hub (the sub-processor list of 11/2026 does name it).
- **Default and maximum output tokens**, **server-side request timeout**, **maximum token TTL**: not documented on the pages read.
- **Raising rate limits** and whether capacity can be reserved; behaviour and frequency of 529 `server_overloaded` under real load.
- **Image tokens per page** and the two-versus-six concurrency limit for large requests: only relevant if scans go to a vision model.
- **Price list has no date**; the USD list on cloud.ionos.com differs slightly. Re-read before fixing cost per Family.
- Live behaviour was not tested; everything above is from documentation and terms.
