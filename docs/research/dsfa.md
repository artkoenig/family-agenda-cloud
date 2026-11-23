# Does the hosted service need a DSFA?

Research for issue #183 (map #179; feeds #196). As of 2026-11-23. Not legal advice. States the facts and how each criterion reads; the decision is the Operator's. Items marked **[UNVERIFIED]** were not confirmed from a primary source in this session; **[LAWYER]** needs professional review.

Builds on `docs/research/legal-duties-b2c-eu.md` F8 (§ 38 BDSG), F9 (household exemption, Art. 8, Art. 9) and F10 (Operator as controller). That file assumed the Operator is controller; this one does too. If the Operator were instead a processor for each Family, the DSFA duty would sit with the controller and the processor would only assist (Art. 28(3)(f), as cited in WP248 III.C.b), but F9 suggests the household Customer is outside the GDPR, which leaves the Operator.

## Gist

- **No entry of the DSK Muss-Liste fits squarely.** The closest are Nr. 11 (AI "zur Steuerung der Interaktion mit den Betroffenen oder zur Bewertung persönlicher Aspekte") and Nr. 9 (comprehensive profiles of interests or relationships). Extraction of Items from mails reads as neither, but the wording is broad. The list itself says it is not exhaustive.
- **Art. 35(3)(b)** (large-scale Art. 9 data) turns on "large scale", which is undefined; a few hundred to 1000 Families is a borderline number. Art. 9 data arrive incidentally, not as the purpose.
- **WP248's nine criteria:** at least two read as met on a plain reading: (4) sensitive or highly personal data, which WP248 says expressly may include "emails" and "personal documents", and (7) vulnerable data subjects, which names children. (8) innovative technology (LLM) is arguable; (5) large scale is borderline. WP248: "In most cases" two criteria mean a DPIA is required.
- **WP248's own counter-example** (a single physician or lawyer: sensitive + vulnerable, DPIA not likely required) rests on recital 91's "not on a large scale" carve-out for individual professionals. Whether a one-person Operator serving many Families profits from it is the open legal question **[LAWYER]**; the carve-out is about the scale of the processing, not the size of the controller.
- **If no DPIA is done**, WP248 requires the controller to "justify and document the reasons" and record the high-risk assessment anyway.
- **§ 38 Abs. 1 Satz 2 BDSG:** a controller whose processing is subject to a DSFA under Art. 35 must appoint a Datenschutzbeauftragter regardless of headcount. So "DSFA required" also means "DSB required"; a DSFA done voluntarily is read by many as not triggering it **[UNVERIFIED]**, interpretation not checked against authority guidance.

## Facts about the processing

From `GLOSSARY.md` (this repo and the public repo), `docs/research/ionos-ai-model-hub.md`, `docs/research/legal-duties-b2c-eu.md`:

| Fact | Source in repo |
|---|---|
| Sources: WebUntis timetables, ICS calendars, IMAP mailboxes (chosen folders), Matrix-bridged Messengers (WhatsApp, Signal, Telegram) | public `GLOSSARY.md` Source Type, Messenger. Whether Matrix is offered hosted at launch **[UNVERIFIED]**; launch checklist names only `ics`, `imap`, `webuntis`. |
| Each message is read once by an LLM (Extraction) to find Events, Lessons, Tasks; attachments incl. PDFs | public `GLOSSARY.md` Extraction; ticket text |
| LLM: IONOS AI Model Hub, inference in Germany, prompts/outputs not stored or used for training, IONOS processor under its DPA | `docs/research/ionos-ai-model-hub.md` |
| Family Members include children; Items concern them; an Agenda can be opened without sign-in via a secret Agenda Link | public `GLOSSARY.md` Family Member, Agenda, Agenda Link |
| Only parents (Admins) sign in; children have no accounts | public `GLOSSARY.md` Admin |
| No scoring, no decisions about persons, no profiling for the Operator's own purposes; Items only shown to the Family | product design; not written as a rule anywhere **[UNVERIFIED]** |
| Planned scale: sized for 1000 Families, ~30 messages per Family and day | `docs/research/ionos-ai-model-hub.md` §rate limits |
| Credentials of Sources encrypted per Family (Family key) | `GLOSSARY.md` Family key |
| Operator: one natural person, German Einzelunternehmer, fewer than 20 people | ticket |
| Data subjects not the Customer: spouse, children, teachers and other senders of school mails | `legal-duties-b2c-eu.md` F8, F9 |

## Findings

### D1. Art. 35 GDPR: the general rule

Art. 35(1): a DPIA is required where processing, "in particular using new technologies", is "likely to result in a high risk to the rights and freedoms of natural persons", before the processing starts. Art. 35(3) lists three cases "in particular", non-exhaustively; Art. 35(4) has the authorities publish lists (the DSK Muss-Liste); Art. 35(7) sets the minimum content; Art. 35(9) asks for the views of data subjects where appropriate; Art. 35(11) asks for review when the risk changes. Art. 36(1): prior consultation of the authority if the DPIA shows a high risk the controller does not mitigate.

Source: these provisions as quoted and paraphrased in WP248 rev.01 (sections III.B.a, III.C, Annex 2). **[UNVERIFIED]** GDPR text itself not re-read: EUR-Lex returned a bot challenge to this session.

Art. 35(3) cases applied:

| Case | Reading for this service |
|---|---|
| (a) systematic and extensive evaluation of personal aspects, with decisions producing legal or similarly significant effects | Not met: Items are shown to the Family; no decision about a person is taken. |
| (b) "processing on a large scale of special categories of data referred to in Article 9(1)" or Art. 10 data | Art. 9 data occur: doctor or therapy appointments (health), religious instruction or church dates (religion), possibly school mails about a child's illness or support needs. They come incidentally in free text and are not the purpose. Whether incidental Art. 9 data count, and whether the volume is "large scale", is open **[LAWYER]**. |
| (c) systematic monitoring of a publicly accessible area on a large scale | Not met. |

### D2. DSK Muss-Liste (Art. 35(4), nicht-öffentlicher Bereich)

Version 1.1 of 17.10.2018, replacing the list of 18.07.2018 ([DSK Muss-Liste PDF](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf)). No later version was found **[UNVERIFIED]**: a search found only the same Version 1.1 (copy on [HmbBfDI](https://datenschutz-hamburg.de/fileadmin/user_upload/HmbBfDI/Datenschutz/Informationen/DSFA_Muss-Liste_fuer_den_nicht-oeffentlicher_Bereich_-_Stand_17.10.2018.pdf)). Hinweis 1: the list "ist nicht abschließend" and supplements Art. 35(1) and (3); Hinweis 2: it follows WP248's approach.

| Nr. | Entry (short) | Reading |
|---|---|---|
| 1, 2 | Biometric / genetic data plus one WP248 criterion | Not met. |
| 3 | Large-scale data under Sozial-, Berufs- or Amtsgeheimnis | Not met; school mails are not processed by a secrecy-bound body here. |
| 4, 6, 12 | Location data at scale; mobile optical capture; phone sensors | Not met. Event places are planned places, not tracking. |
| 5, 10 | Combining data from several sources at scale, for purposes they were not collected for, with opaque algorithms, to support decisions (5) or find unknown correlations (10) | The service combines several Sources per Family, but on the Family's own request and for the purpose the mails were sent (informing the family). All conditions are cumulative ("sofern" plus bullets); the decision and correlation purposes are absent. Reads as not met. |
| 7, 8, 13, 14, 15, 17 | Rating portals, employee monitoring, voice/video personality analysis, purchase profiles, anonymisation of Art. 9 data, fitness performance | Not met. |
| 9 | "Erstellung umfassender Profile über die Interessen, das Netz persönlicher Beziehungen oder die Persönlichkeit der Betroffenen" (examples: dating portals, large social networks) | An Agenda shows a family's week: clubs, doctors, school. That is an aggregate, but kept for the family, not built by the Operator as a profile. Reads as not met; borderline if the Operator ever used the Items itself. |
| 11 | "Einsatz von künstlicher Intelligenz zur Verarbeitung personenbezogener Daten zur Steuerung der Interaktion mit den Betroffenen oder zur Bewertung persönlicher Aspekte der betroffenen Person" (examples: AI customer support, call-centre mood analysis) | The LLM finds dates and tasks in text. It does not converse with the data subjects and does not evaluate them. Reads as not met on the wording and examples; the nearest entry, so the one an authority would look at first **[LAWYER]**. |
| 16 | Art. 9 data, even if not large-scale, collected repeatedly through innovative sensors or mobile apps and received centrally (telemedicine) | Not met: no sensors; Art. 9 data arrive as mail text. |

The list closes with WP248's nine criteria a) to i) as "maßgebliche Kriterien". No Art. 35(5) list (processing exempt from a DPIA) by the DSK was found **[UNVERIFIED]**.

### D3. WP248 rev.01 criteria

WP248 rev.01, adopted 4 April 2017, last revised 4 October 2017 ([PDF](https://ec.europa.eu/newsroom/just/document.cfm?doc_id=47711)); endorsed by the EDPB on 25 May 2018, Endorsement 1/2018 item 6 ([EDPB page](https://www.edpb.europa.eu/documents/guideline/data-protection-impact-assessments-high-risk-processing_en), [endorsement](https://edpb.europa.eu/sites/default/files/files/news/endorsement_of_wp29_documents_en_0.pdf)). No newer EDPB DPIA guideline is listed on that page.

Rule: "In most cases, a data controller can consider that a processing meeting two criteria would require a DPIA"; sometimes one suffices; where unclear, WP248 recommends doing one anyway (III.B.a).

| # | Criterion | Reading |
|---|---|---|
| 1 | Evaluation or scoring, profiling, predicting | Not met: no assessment of persons. |
| 2 | Automated decision with legal or similar effect | Not met. |
| 3 | Systematic monitoring | Reading mailboxes continuously is "systematic" in WP29's sense (occurring according to a system), but the criterion aims at observing data subjects who may not know. Senders of school mails (teachers) do not know their mails are read by an LLM service. Arguable, leaning not met. |
| 4 | Sensitive data or data of a highly personal nature | **Reads as met.** Art. 9 data occur (D1). Beyond Art. 9, WP248 names data "linked to household and private activities (such as electronic communications …)" and says the criterion "may also include data such as personal documents, emails, diaries". The service reads emails and PDFs and holds a family's calendar. |
| 5 | Large scale | **Borderline.** Factors: number of data subjects (1000 Families, a few thousand persons, a tiny share of the population), volume and range of data (whole mail folders, calendars, timetables), duration (permanent while subscribed), geography (EU-wide offer). Scale per Family is small; the sum is not trivial. |
| 6 | Matching or combining datasets beyond reasonable expectations | Several Sources are combined, but on the Admin's choice and as the product's stated purpose; within expectations of the Customer. Third-party senders' expectations are the weak spot. Leaning not met. |
| 7 | Vulnerable data subjects | **Reads as met.** WP248 names children, who "can be considered as not able to knowingly and thoughtfully oppose or consent". Children are Family Members and the subject of many Items (school, doctors). They have no account and cannot exercise rights themselves; the power-imbalance reasoning in WP248 is about the data subject vs. the controller. |
| 8 | Innovative use or new technology | **Arguable.** LLM extraction of personal mails is new technology in recital 91's sense ("achieved state of technological knowledge"); Art. 35(1) singles out "new technologies". Against: it is used as a text parser with schema output, no generation shown to third parties. |
| 9 | Prevents exercising a right or using a service | Not met. |

Count: two met (4, 7), one arguable (8), one borderline (5). By WP248's rule of thumb, a DPIA is likely required unless the controller documents why the risk is not high.

**Counter-reading.** WP248's "No" examples include processing of "personal data from patients or clients by an individual physician, other health care professional or lawyer" (recital 91), although sensitive and vulnerable are both ticked. Recital 91 excludes such processing from being "large-scale". What carries that example is the scale and the professional context, not that the controller is one person. A one-person Operator processing the mails of many Families is a different setting **[LAWYER]**.

WP248 also: if a controller concludes no DPIA is needed despite matching criteria, it "should justify and document the reasons for not carrying out a DPIA" (III.B.a), and must keep the Art. 30 record in any case.

### D4. § 38 BDSG

[§ 38 Abs. 1 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__38.html): besides Art. 37(1)(b) and (c) GDPR, a DSB is required where at least 20 persons are constantly engaged in automated processing; and, regardless of that number, where the controller or processor carries out processing that is subject to a DSFA under Art. 35 GDPR, or processes data commercially for transfer, anonymised transfer or market or opinion research.

Reading:
- Headcount trigger: not met (one person).
- DSFA trigger: met if, and only if, the DSFA is required by Art. 35 (D1 to D3). The statute says "unterliegen", i.e. subject to the duty; a DSFA carried out voluntarily is commonly read as not triggering it **[UNVERIFIED]**, no authority guidance read.
- Art. 37(1)(c) GDPR (core activities consist of large-scale processing of Art. 9 data) is a separate DSB trigger with the same "large scale" question as Art. 35(3)(b) **[UNVERIFIED]**, Art. 37 and WP243 not re-read.
- The DSB may be external (Art. 37(6) GDPR) **[UNVERIFIED]**, not re-read.

### D5. What a DSFA would have to contain

Art. 35(7) minimum, per WP248 Annex 2: systematic description of the processing and purposes; necessity and proportionality; risks to data subjects; measures to address them. Inputs already in the repo: IONOS no-retention and Germany-only inference (`ionos-ai-model-hub.md`), per-Family encryption of Source credentials, Egress Proxy allowlist, Agenda Link revocation. Writing it is map #179's open point "DSFA itself", not this ticket.

## Open points for the Operator or a lawyer

1. Do incidental Art. 9 data in free text count for Art. 35(3)(b) and WP248 criterion 4? **[LAWYER]**
2. Is ~1000 Families "large scale"? **[LAWYER]**
3. Does Muss-Liste Nr. 11 cover LLM extraction that neither interacts with nor evaluates the data subject? **[LAWYER]**
4. Any DSK or Länder authority guidance since 2018 on DSFA for LLM use (e.g. DSK Orientierungshilfe KI) **[UNVERIFIED]**, not read in this session.
5. Does § 38 BDSG bite on a voluntary DSFA? **[UNVERIFIED]**

## Limits of this research

Read in full on 2026-11-23: DSK Muss-Liste Version 1.1 (PDF, text extracted), WP248 rev.01 sections III.B and III.C (PDF, text extracted), § 38 BDSG (summary of gesetze-im-internet.de). GDPR articles and recitals not re-read from EUR-Lex (bot challenge); quoted through WP248. Facts about the service are from the repos' glossaries and research notes, not from code.
