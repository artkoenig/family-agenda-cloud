# #23 Decide protection of Family keys and data at rest

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T13:38:38Z
- Closed: 2026-11-07T13:46:24Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/23

## Question

How are the Family keys and the Family data protected so that one stolen secret (e.g. the operator key) does not expose every Family, and how does encryption of data at rest work **self-hosted as well as hosted**?

## Facts (main @ 57b7351)

- The master key protects only **credentials** (`EnvelopeSecretStore`: IMAP passwords, WebUntis secret, ICS URLs, LLM and OIDC client secrets) and, per "Decide Agenda link format", derives the Agenda link HMAC. **Messages, Items and blobs are stored unencrypted** in Postgres and the blob store.
- "Decide multi-family Instances in the public image" wraps each Family's master key with an operator key read from env/Docker secret; "Decide Recovery Kit in hosted operation" keeps it out of databases and backups.
- Risk today: database/backup access alone exposes all messages; together with the operator key also all credentials (live mailbox access).
- Fundamental limit: no end-to-end encryption with Family-only keys, since the worker polls Sources and calls the LLM with nobody signed in; the server must be able to decrypt.

## Requirement (maintainer, 2026-11-07)

- Encryption of data **must also work self-hosted**, not only in the cloud.

## Options to grill

1. **Operator key in a KMS / Vault** (e.g. OpenBao/Vault transit, or an EU cloud KMS) instead of env: the key never leaves; containers only unwrap single Family keys via API, with audit log, policies, maybe rate limits. Self-hosted: the file master key stays, or an optional Vault adapter?
2. **Data at rest:** app-level encryption of messages/attachments/Items with the Family key (works self-hosted without extra infrastructure, also protects dumps and backups) vs. storage-level encryption (encrypted volumes, S3 server-side encryption, encrypted backups), which only protects against stolen disks/backups. Cost of app-level encryption: no SQL search/filter over encrypted columns, key needed for every read, migration of existing data.
3. **Key separation:** derive separate keys from the master key (credentials, data, Agenda links), so `api` serving Agenda pages holds only what it needs; credentials decrypted only by the worker and the Source setup.
4. **OAuth instead of passwords** for mail providers that support it (Gmail, Outlook): revocable, limited tokens. Possibly its own ticket for the IMAP Source.
5. Key rotation (operator key, Family keys) and what it means for Agenda links (HMAC changes with the key) and the Recovery Kit.

Affects: "Decide multi-family Instances in the public image", "Decide Recovery Kit in hosted operation", "Decide Agenda link format", "Decide Backup format, export and restore in the app".

---

**Comment by artkoenig, 2026-11-07T13:46:22Z**

## Resolution

**Data at rest, app-level, self-hosted and hosted alike**
- **Encrypted:** all content — every free text that Sources deliver or Admins enter: `source_record` sender, subject, body, `stated`, link; Event title and location; Task title and `bring`; Family Member and Agenda names; and every blob (attachments, photos).
- **Plain:** structure — ids, times and dates, status, kinds, foreign keys — so the timeline and due queries keep working with their indexes. (No query searches text today.)
- **`external_id`** is stored as an HMAC with the Family's key: uniqueness stays, content (e.g. mail addresses in Message-IDs) is gone.
- **Where:** in the adapters — the Postgres repositories for columns, and a wrapper around every `BlobStore` (file and S3 alike). `domain` and `application` are unaware; port contracts unchanged. AES-256-GCM, random nonce per value.
- **Existing data:** a one-time, resumable in-app step encrypts existing rows and blobs in batches when a Family is opened (plain SQL cannot, the key lives only in the app); the Family is restricted until it finishes.

**Keys**
- The Family master key stays the single root (one Recovery Kit). HKDF derives separate keys for **credentials** (the existing `EnvelopeSecretStore`), **data**, and **Agenda links** (HMAC).
- All containers get all three for now (`api` also sets up Sources and needs credentials). Per-container distribution can come later without re-encrypting data.
- **Operator key (hosted):** new port `KeyWrapper` wraps/unwraps Family keys. Hosted: OpenBao/Vault transit — the operator key never leaves the vault, every unwrap is logged. A key from file/env only for development and tests. Self-hosted: the master key stays a file in its own volume; data encryption still protects dumps and backups, since the key is not part of them (ADR-0006).
- **Rotation:** operator key rotatable by re-wrapping all Family keys (Family keys, Agenda links and Recovery Kits unchanged). Family keys are not rotated; they change only on restore into another Instance (#18).

**Out of this map:** OAuth instead of passwords for mail providers (an IMAP Source feature).

Changes: "Decide multi-family Instances in the public image" (operator key from env → `KeyWrapper` with OpenBao/Vault transit), "Decide Recovery Kit in hosted operation" (operator key in the vault), "Decide Agenda link format" (HMAC with the derived link key).

---
_Generated by [Claude Code](https://claude.ai/code)_

---

**Comment by artkoenig, 2026-11-12T20:23:21Z**

Partly changed by [Decide where OpenBao and Authentik run](https://github.com/artkoenig/family-agenda-cloud/issues/56): the `KeyWrapper` port stays, but the hosted Operator key comes from a versioned key file instead of OpenBao/Vault transit (public repo: artkoenig/family-agenda#357). An external key service can come later behind the same port.
