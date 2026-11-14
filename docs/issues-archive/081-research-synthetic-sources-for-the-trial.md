# #81 Research synthetic Sources for the trial

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-14T14:13:17Z
- Closed: 2026-11-14T14:21:55Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/81

## Question

How do 50 Families get synthetic `ics` and `imap` Sources: an ICS fixture server and an IMAP test server (GreenMail, Dovecot, others) with seeded German mail including PDFs, where they run (on the Cube or outside), and how the plugin containers reach them through their Egress Proxies and per-Source allowlists (contract 3.0)?

---

**Comment by artkoenig, 2026-11-14T14:21:54Z**

## Answer

**Recommendation:** demo Source or ICS files behind Caddy for the broad 50-Family run, plus one Dovecot IMAP fixture on the Cube (50 mailboxes, German mail with PDFs) for Extraction. Only the IMAP fixture reaches "sync with real Extraction".

Key facts (public `v0.6.0`, `ics` 0.4.0, `imap` 0.3.0, all contract 3.0):

- **Demo Source** (`tools/demo-source`): contract 3.0, stateless, no configuration, so 50 Families can each add one against one shared `plugin-demo`. States Events, Lessons, Tasks; no messages, so no Extraction and no LLM call; no outbound connection, so no Egress Proxy path. **No published image**, only a local build from the public tag (AGPL rule: maintainer's call). 2 s delay per call by default.
- **Egress Proxy** refuses names without a dot (Compose service names) and any name resolving to a private, loopback or link-local address; no switch in the released image. A fixture needs a public DNS name resolving only to public addresses (A record to the Cube's own public IP, no AAAA) and a published port.
- **No `egress:` entry needed**: the fixture host entered in the Source is allowed for that Source only.
- **IMAP plugin**: 993 implicit TLS, any other port STARTTLS; no plaintext and no private CA possible in the image. Certificate must be publicly trusted for the host name (Let's Encrypt via Caddy). First run reads only mail with INTERNALDATE within 14 days; poll response max 10 MB, 60 s.
- **ICS**: no extra server; a Caddy `file_server` site with one `.ics` per Family over HTTPS. Exercises the Egress Proxy, not Extraction.
- **IMAP server**: Dovecot CE (official image, PEM certificate, Maildir, small RAM). GreenMail as fallback (preload directory of `.eml`, but JVM, in memory, PKCS12). Stalwart is too much.
- **Seeding**: script in this repo, 3 to 5 mails per mailbox, PDFs under 200 kB, unique Message-ID, dates relative to the run day.

Not verified: container reaching a port published on the Cube's own public IP (one curl test on the Cube); multi-Family mode is not built; Dovecot 2.4 passwd-file syntax; Caddy certificate path; GreenMail with ImapFlow.

See `docs/research/synthetic-sources.md` on branch `research/synthetic-sources`.

