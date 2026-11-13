# AGPLv3 derivative-work and contribution-model options

Research for issue #3 (feeds #4 and `docs/skalierung-refactorings.md` section 0.1). Not legal advice. Items marked **[LAWYER]** need professional review.

## Situation

- Public repo `artkoenig/family-agenda`: AGPLv3, contributions under DCO, no CLA, "relicensed while it has a single copyright holder" (ADR-0008, status: proposed).
- ADR-0008 consequence: "Without a CLA, the project cannot be relicensed or dual-licensed later without every contributor's consent." Agenda Cloud is assumed to be a *separate program over a network protocol*, hence free to stay proprietary.
- Plan in `skalierung-refactorings.md`: the private repo imports the published packages (composition root, ports) and runs many Instances **in the same process**. That contradicts the "separate program" assumption of ADR-0008 and ADR-0004 (which also excludes a hosted offering; superseded by 0.2).
- Today the author is sole copyright holder. That changes with the first external contribution.

## Findings from primary sources

### F1. The author can license their own code under several licenses
GNU GPL FAQ: "the copyright holder for a program can release it under several different licenses in parallel"; "If you are the copyright holder for the code, you can release it under various different non-exclusive licenses at various times" ([GPL FAQ #HeardOtherLicense, #ReleaseUnderGPLAndNF](https://www.gnu.org/licenses/gpl-faq.html)).
Consequence: while the author owns *all* the code, the private SaaS can use it with no AGPL obligations for the author's own use. The problem starts only with third-party-owned code.

### F2. Third-party contributions need their holder's permission to be relicensed
GPL FAQ #Consider: if Y contributes to X's GPL project, "X must get Y's permission before releasing that code under another license" ([FAQ](https://www.gnu.org/licenses/gpl-faq.html)). Same logic applies to AGPL.
Consequence: with DCO only, each contributor keeps copyright and grants AGPLv3 (inbound = outbound). Author's private SaaS using contributor code is then bound by AGPL for that code.

### F3. When is the private repo a "modified version" / "covered work"?
- AGPLv3 s.0: to "modify" is "to copy from or adapt all or part of the work in a fashion requiring copyright permission"; a "covered work" is "the unmodified Program or a work based on the Program" ([AGPLv3 text](https://www.gnu.org/licenses/agpl-3.0.txt)).
- s.5(c): conveyed work must be licensed "as a whole" under the AGPL, "regardless of how [its parts] are packaged".
- s.5 aggregate: separate programs not "combined with it such as to form a larger program" do not become covered.
- GPL FAQ #MereAggregation (FSF's view, "ultimately judges will decide"): separate programs are typically those using "pipes, sockets and command-line arguments"; "modules ... designed to run linked together in a shared address space ... almost surely" form one program; same executable = "definitely combined". #GPLPlugins: dynamic linking with shared data structures = single combined program.
- #GPLInProprietarySystem: "You cannot incorporate GPL-covered software in a proprietary system"; a system incorporating it "is an extended version of that program".
Conclusion (FSF position): a private gateway/scheduler that imports the packages into one Node process is very likely a work based on the Program. A separate process that talks HTTP to an unmodified Instance is likely an aggregate-style separate program, but intimate data exchange can still blur this. **[LAWYER]**: how a court (German/EU, since the author is in Germany) treats JS/TS imports; the FSF view is not binding law.

### F4. Private use is free; network use is the AGPL trigger
- AGPLv3 s.0: "Mere interaction with a user through a computer network, with no transfer of a copy, is not conveying", so no s.5/s.6 duty from SaaS alone.
- AGPLv3 s.13: "if you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network ... an opportunity to receive the Corresponding Source of your version ... at no charge". GPL FAQ #UnreleasedModsAGPL: a company running a modified AGPL program on a website "must release the modified source code".
- Plain GPL by contrast does not require this (#UnreleasedMods, #GPLRequireSourcePostedPublic).
Consequence: if the SaaS is a modified version/work based on the Program, the **entire combined work** (private gateway, scheduler, adapters) must be offered as source to every family using the hosted service. Unmodified deployment of the public code alone triggers only the unmodified-use rules (s.13 applies only "if you modify").
Open: what counts as "Corresponding Source" for the private adapters (S3/KMS/billing/quota code) when those are inside the covered work. **[LAWYER]**

### F5. Additional permissions (exceptions) are possible only by copyright holders
AGPLv3 s.7: additional permissions can be placed on "material, added by you ... for which you have or can give appropriate copyright permission", and for others' material only "if authorized by the copyright holders of that material". s.10: no "further restrictions" may be imposed on downstream rights.
Consequence: a linking/embedding exception ("GPL with classpath-style exception") can be added by the author now, while sole holder; later it needs every contributor's agreement unless the contributions are already covered by it.

### F6. What DCO is (and is not)
DCO 1.1 ([developercertificate.org](https://developercertificate.org/)): contributor certifies they wrote it or may submit it "under the open source license indicated in the file" (a)-(c); (d) record is public and "may be redistributed consistent with this project or the open source license(s) involved". It is a provenance certificate, **not a license grant and not an assignment**. Kernel docs: sign-off "certifies that you wrote it or otherwise have the right to pass it on as an open-source patch" ([kernel.org](https://www.kernel.org/doc/html/latest/process/submitting-patches.html)). No relicensing right is given to the maintainer.
Note (b)'s "unless I am permitted to submit under a different license" gives no right to the *project* to relicense; it concerns the contributor's upstream.

### F7. What CLAs do
- License-grant CLA, e.g. Apache ICLA: contributor grants "perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute" plus a patent license ([Apache ICLA](https://www.apache.org/licenses/icla.pdf)). The right to *sublicense* is what enables dual-licensing/relicensing.
- Assignment, e.g. FSF: enables enforcement ("only the copyright holder or someone having assignment of the copyright can enforce the license"; with multiple authors, enforcement needs "the cooperation of all authors") ([FSF why-assign, Moglen](https://www.gnu.org/licenses/why-assign.html)). Assignment under German law is problematic: authors' rights (Urheberrecht) are generally not transferable, only usage rights (Nutzungsrechte) are granted. **[LAWYER]** (secondary knowledge, not verified against statute here; check UrhG s.29 and s.31).

## Options

| # | Option | What it solves | Costs / risks |
|---|---|---|---|
| A | **Only own code in the SaaS**; reject or re-implement external contributions touching code the private repo uses | Keeps F1: author owns everything, no AGPL duty for SaaS | Contributors blocked from the core; contradicts ADR-0008 spirit; contributions to the public repo still exist and must not be pulled in without permission; ongoing provenance bookkeeping |
| B | **Introduce a CLA (license grant) now**, before the first external contribution (can be wired in via bot/PR check) | Permits dual-licensing: AGPL for public, proprietary for private SaaS; permits future relicensing | Deters some contributors (ADR-0008 rejected this); needs an entity or sole-person as licensee; German-law drafting **[LAWYER]**; reverses ADR-0008 consequence line |
| C | **Comply with AGPL s.13 for the SaaS**: publish the whole hosted stack's source under AGPL (offer to users) | No CLA needed; stays DCO-only; fully conformant | The private repo effectively becomes open-source; "open core" moat disappears (competitors can host it); secrets must stay out of the repo; scope of "Corresponding Source" needs review |
| D | **Architectural separation**: keep SaaS as a separate program talking to unmodified Instances over a network protocol (as ADR-0008 assumed) | Aggregate-style separation per FSF FAQ; no AGPL on the private code | Defeats the point of 1.1-1.7 (embedding in one process); the FSF test turns on semantics of communication too, not only sockets; legal uncertainty **[LAWYER]** |
| E | **Mixed**: A for the embedding-relevant packages (core/ports/composition root) + DCO for the rest | Contributions possible where the SaaS does not depend on them | Needs a clear package/ownership boundary (e.g. CODEOWNERS, "no external contributions" paths); fragile if boundaries move |
| F | **AGPL with additional permission (s.7)** for the author's own embedding, plus CLA or sole ownership | Explicit grant for hosting uses | Exceptions on contributors' code need their consent; same CLA/ownership prerequisite as B |
| G | Assignment-style CLA (FSF model) | Strongest enforcement/relicensing | Heaviest for contributors; legal fit in Germany doubtful **[LAWYER]** |

Not recommended in this note: switching to a source-available or permissive license; out of scope and a larger decision.

## Prerequisites for relicensing or dual-licensing

1. Know every copyright holder: `git log` authors/co-authors; only the author today ("single copyright holder", ADR-0008). Any employer claims on past work **[LAWYER]**.
2. Contributions from now on need either a license-grant CLA (B/G) or individual written permission for the specific relicensing (F2).
3. Dependencies must permit the target license (AGPL-compatible per ADR-0008; for a proprietary SaaS the AGPL-licensed dependencies are not relicensable by the author, only third-party-licensed MIT/BSD/Apache ones are usable freely).
4. Record decision as an ADR that supersedes the CLA line in ADR-0008.
5. Timing matters: adopting a CLA is trivial before the first external commit and hard afterwards (every prior contributor must consent, F2).

## What needs a lawyer

- Whether importing the published packages into the SaaS process makes it a "work based on the Program" under German/EU copyright law (F3), and where the line sits for options D/E.
- Scope of "Corresponding Source" for a hosted stack under s.13 (F4), and whether SaaS users' interaction with the unmodified vs. modified Program differs.
- A valid CLA text for a German sole proprietor/entity: scope of Nutzungsrechte, sublicensing, patent grant, contributors' employers, minors (F7).
- Validity/enforceability of DCO as a license basis in the EU (F6) and whether DCO alone gives any relicensing room.
- Whether an s.7 additional permission can be drafted narrowly and survive contributions (F5).
- Trademark and data-protection aspects of the hosted offering are separate from this question.

## Decision input for ADR (0.1)

- The cheapest reversible step before any external contribution lands: choose B (CLA) or commit to C/D, and record it. Waiting costs optionality (F2, prerequisite 5).
- If the product strategy is "open code, paid hosting convenience" (like many AGPL SaaS), C is legally simplest.
- If the private repo should stay proprietary while embedding, only A+sole ownership, B, or D reach that; B keeps contributions open.

## Sources

- AGPLv3 text: https://www.gnu.org/licenses/agpl-3.0.txt (ss.0, 5, 7, 10, 13)
- GNU GPL FAQ: https://www.gnu.org/licenses/gpl-faq.html (#HeardOtherLicense, #ReleaseUnderGPLAndNF, #Consider, #MereAggregation, #GPLPlugins, #GPLInProprietarySystem, #UnreleasedMods, #UnreleasedModsAGPL, #GPLRequireSourcePostedPublic)
- FSF, Why assign copyright: https://www.gnu.org/licenses/why-assign.html
- Developer Certificate of Origin 1.1: https://developercertificate.org/
- Linux kernel, Sign your work: https://www.kernel.org/doc/html/latest/process/submitting-patches.html
- Apache ICLA: https://www.apache.org/licenses/icla.pdf
- Repo: `artkoenig/family-agenda` docs/adr/0008-agplv3-with-dco.md, 0004-self-hosted-only-with-paid-agenda-cloud-services.md
