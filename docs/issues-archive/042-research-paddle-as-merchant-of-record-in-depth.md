# #42 Research Paddle as Merchant of Record in depth

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-07T16:43:25Z
- Closed: 2026-11-07T16:49:11Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/42

## Question

Is Paddle fit to be the Merchant of Record for this service? [Compare payment providers](https://github.com/artkoenig/family-agenda-cloud/issues/33) left gaps. Establish from primary sources: product acceptance, real cost at low prices (bespoke pricing under $10, fee base, disputes, refunds), contract structure and buyer terms, withdrawal and § 312k handling, German invoices and booking of payouts, trial and app-side conversion, portal and mail languages (de/en), integration effort, and remaining work for the seller.

---

**Comment by artkoenig, 2026-11-07T16:49:10Z**

Resolved: no hard disqualifier. AUP does not exclude the product; sole traders accepted (acceptance itself only known after review). Still open: yearly auto-renewal in Buyer Terms vs § 309 Nr. 9 BGB [LAWYER], German order button label (§ 312j), bespoke pricing for €5 (under $10). Cost: about €0.75 on €5 (18% of net, fee on gross), €3.00 on €50 (7%), €20 per chargeback even if won. Paddle sells, Operator supplies under separate agreement, so glossary wording must change. App-side trial fits; cardless still early access. No SEPA direct debit. Own § 312k page stays. Findings: `docs/research/paddle.md` (untracked).
