# #51 Open the IONOS account and an AI Model Hub token

- State: CLOSED (COMPLETED)
- Labels: wayfinder:task
- Created: 2026-11-12T08:55:02Z
- Closed: 2026-11-12T15:35:37Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/51

## Question

Not a decision: the maintainer opens an IONOS Cloud account (as Einzelunternehmer) and creates an AI Model Hub token, so models can be measured. The answer records the contract name and where the token is kept, never the token itself.

---

**Comment by artkoenig, 2026-11-12T15:35:35Z**

## Resolution

Done on 2026-11-12.

- **Contract:** IONOS Cloud, Einzelunternehmer, contract number 39683376, login artkoenig@gmail.com.
- **Group:** `ai-model-hub` with only "Access and manage AI Model Hub". **No dedicated user yet:** the token was created with the main account, so its reach is the whole contract. Before any token goes into the hosted service, create a dedicated user in that group (see [Decide infrastructure as code and the release procedure](https://github.com/artkoenig/family-agenda-cloud/issues/58)).
- **Token:** kept on the maintainer's machine at `~/.config/ionos/ai-model-hub.token` (raw JWT, not JSON). **Expires 2026-11-13**; [Measure Extraction on the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/53) will likely need a fresh one.
- **Verified:** `GET https://openai.inference.de-txl.ionos.com/v1/models` returns 200.
- **Gotcha:** the downloaded token file carries trailing whitespace; sent as is it gives `401 paas-auth-1`. Strip it (`tr -d '\r\n '`) wherever the token is read from a file or secret.
