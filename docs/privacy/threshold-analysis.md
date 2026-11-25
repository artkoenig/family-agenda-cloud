# Schwellwertanalyse and risk assessment

The Operator's documented check of whether the hosted service Family Agenda Cloud needs a Datenschutz-Folgenabschätzung
(DSFA, Art. 35 GDPR), with a risk assessment that has the content of a DSFA (Art. 35(7)) without the name. WP248 rev.01
III.B.a asks a controller that carries out no DSFA although criteria are met to "justify and document the reasons";
this is that document.

The conclusion is decided in [#198](https://github.com/artkoenig/family-agenda-cloud/issues/198): **no DSFA, no
Datenschutzbeauftragter (DSB), risk accepted.** This document argues it from the facts and decides nothing. The
readings are those of the research for [#183](https://github.com/artkoenig/family-agenda-cloud/issues/183). Not legal
advice: **[LAWYER]** marks a legal reading no lawyer has reviewed, **[UNVERIFIED]** a fact that research did not
confirm from a primary source. Both marks are carried over from the research and are listed in
[section 10](#10-known-open-legal-points).

## 1. Head

- **Controller:** Artjom König, Family Agenda, Ludwigsweg 7, 53773 Hennef, Germany (as in the
  [record of processing activities](records-of-processing.md))
- **Contact:** support@family-agenda.cloud
- **Version:** 2026-11-25, written against the record of processing activities of 2026-11-25 and the privacy policy of
  25 November 2026 (`site/legal/datenschutz.de.md`).

**Change log**

| Date | Change |
| --- | --- |
| 2026-11-25 | First version ([#239](https://github.com/artkoenig/family-agenda-cloud/issues/239)). Not yet accepted by the Operator ([#237](https://github.com/artkoenig/family-agenda-cloud/issues/237)). |
| 2026-11-25 | No written confirmation is asked of IONOS on the AI Model Hub; facts and risk 5 rest on IONOS's documented statements (#237). |
| 2026-11-25 | Accepted by the Operator in this version (#237). |

**Re-check log** (Art. 35(11); the triggers are in [section 9](#9-re-check-triggers-art-3511))

| Date | Trigger | Result |
| --- | --- | --- |
| 2026-11-25 | First check, before launch | No DSFA, no DSB, risk accepted (#198) |

## 2. Processing in scope

The processing is described once, in the [record of processing activities](records-of-processing.md). This check
covers its six activities:

1. [Website delivery and operation](records-of-processing.md#1-website-delivery-and-operation)
2. [Registration and sign-in](records-of-processing.md#2-registration-and-sign-in)
3. [Sign in with Google](records-of-processing.md#3-sign-in-with-google)
4. [The service: Family, Sources and Agendas](records-of-processing.md#4-the-service-family-sources-and-agendas)
5. [Trial, Subscription and payment](records-of-processing.md#5-trial-subscription-and-payment)
6. [Contract mails and support](records-of-processing.md#6-contract-mails-and-support)

Activities 1 to 3, 5 and 6 are the ordinary processing of a paid web service (logs, accounts, payment, mail). The
questions of this check arise from activity 4. The readings below rest on these facts:

- **Source Types:** only `ics`, `imap` and `webuntis` are hosted. Messengers (the Matrix bridge) are not hosted at
  launch (#198, item 2).
- **Extraction:** each message is read once by an LLM, to find dates and tasks. The model is an open one that IONOS
  runs at its AI Model Hub in Germany; content is not stored and not used for training (record, activity 4 and the
  measures table; `docs/research/ionos-ai-model-hub.md`). These are IONOS's documented statements; the Operator asks
  for no separate written confirmation (decided 2026-11-25, #237).
- **Children** are Family Members without accounts. Only Admins sign in; parents enter the children's data, and many
  Items concern them.
- **Art. 9 data arrive incidentally:** health data (a doctor's appointment) and data on religion (religious
  education) that mails and calendars happen to hold. They are not the purpose.
- **Scale:** the service is sized for 1000 Families, with about 30 messages per Family and day
  (`docs/research/ionos-ai-model-hub.md`).
- **No own use:** Items and content are shown only to the Family; the Operator scores nobody, decides nothing about
  persons and builds no profiles ([section 7](#7-rules-that-keep-the-reading-true)).
- **The Operator** is one natural person and the sole controller, Family content included
  ([#196](https://github.com/artkoenig/family-agenda-cloud/issues/196), item 1).

## 3. Art. 35(3) GDPR

Art. 35(3) names three cases in which a DSFA is required "in particular". The GDPR's text was not re-read from
EUR-Lex; it is quoted through WP248 **[UNVERIFIED]**.

| Case | Reading |
| --- | --- |
| (a) Systematic and extensive evaluation of personal aspects, with decisions producing legal or similarly significant effects | **Not met.** Items are shown to the Family; no decision about a person is taken. |
| (b) Processing on a large scale of special categories of data (Art. 9(1)) or of Art. 10 data | **Open.** Art. 9 data occur: doctor or therapy appointments (health), religious education or church dates (religion), possibly school mails about a child's illness or support needs. They come incidentally in free text and are not the purpose. "Large scale" is undefined, and 1000 Families is borderline. Whether incidental Art. 9 data count, and whether the volume is "large scale", is open **[LAWYER]**. |
| (c) Systematic monitoring of a publicly accessible area on a large scale | **Not met.** |

## 4. DSK Muss-Liste v1.1 (17.10.2018)

The list of the Datenschutzkonferenz under Art. 35(4) for the non-public sector: "Liste der Verarbeitungstätigkeiten,
für die eine DSFA durchzuführen ist", "Version 1.1 vom 17.10.2018, ersetzt die Liste vom 18.07.2018"
([PDF](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf),
read 2026-11-25). No later version was found **[UNVERIFIED]**.

The entries are quoted from the column "Maßgebliche Beschreibung der Verarbeitungstätigkeit". **No entry fits
squarely.** The nearest are Nr. 11 and Nr. 9.

| Nr. | Entry | Reading |
| --- | --- | --- |
| 1 | „Verarbeitung von biometrischen Daten zur eindeutigen Identifizierung natürlicher Personen, wenn mindestens ein weiteres folgendes Kriterium aus WP 248 Rev. 01 zutrifft“ | Not met: no biometric data. |
| 2 | „Verarbeitung von genetischen Daten im Sinne von Artikel 4 Nr. 13 DSGVO, wenn mindestens ein weiteres folgendes Kriterium aus WP 248 Rev. 01 zutrifft“ | Not met: no genetic data. |
| 3 | „Umfangreiche Verarbeitung von Daten, die dem Sozial-, einem Berufs- oder besonderen Amtsgeheimnis unterliegen, auch wenn es sich nicht um Daten gemäß Art. 9 Abs. 1 und 10 DS-GVO handelt“ | Not met: school mails are not processed by a body bound to such secrecy here. |
| 4 | „Umfangreiche Verarbeitung von personenbezogenen Daten über den Aufenthalt von natürlichen Personen“ | Not met. The places of events are planned places, not tracking. |
| 5 | „Zusammenführung von personenbezogenen Daten aus verschiedenen Quellen und Verarbeitung der so zusammengeführten Daten, sofern die Zusammenführung oder Verarbeitung in großem Umfang vorgenommen werden, für Zwecke erfolgen, für welche nicht alle der zu verarbeitenden Daten direkt bei den betroffenen Personen erhoben wurden, die Anwendung von Algorithmen einschließen, die für die betroffenen Personen nicht nachvollziehbar sind, und der Erzeugung von Datengrundlagen dienen, die dazu genutzt werden können, Entscheidungen zu treffen, die Rechtswirkung gegenüber den betroffenen Personen entfalten, oder diese in ähnlich erheblicher Weise beeinträchtigen können“ | Reads as not met. The service combines several Sources per Family, but on the Family's own request and for the purpose the mails were sent for (informing the Family). The conditions are cumulative, and the decision purpose is absent. |
| 6 | „Mobile optisch-elektronische Erfassung personenbezogener Daten in öffentlichen Bereichen, sofern die Daten aus ein oder mehreren Erfassungssystemen in großem Umfang zentral zusammengeführt werden.“ | Not met. |
| 7 | „Umfangreiche Erhebung und Veröffentlichung oder Übermittlung von personenbezogenen Daten, die zur Bewertung des Verhaltens und anderer persönlicher Aspekte von Personen dienen und von Dritten dazu genutzt werden können, Entscheidungen zu treffen, die Rechtswirkung gegenüber den bewerteten Personen entfalten, oder diese in ähnlich erheblicher Weise beeinträchtigen“ | Not met: no rating portal, nothing published. |
| 8 | „Umfangreiche Verarbeitung von personenbezogenen Daten über das Verhalten von Beschäftigten, die zur Bewertung ihrer Arbeitstätigkeit derart eingesetzt werden können, dass sich Rechtsfolgen für die Betroffenen ergeben oder diese Betroffenen in anderer Weise erheblich beeinträchtigt werden“ | Not met: no employees. |
| 9 | „Erstellung umfassender Profile über die Interessen, das Netz persönlicher Beziehungen oder die Persönlichkeit der Betroffenen“ (Einsatzfelder: „Betrieb von Dating- und Kontaktportalen“, „Betrieb von großen Sozialen Netzwerken“) | Reads as not met. An Agenda shows a Family's week: clubs, doctors, school. That is an aggregate, but it is kept for the Family and not built by the Operator as a profile. It would be borderline if the Operator ever used the Items itself. **Kept clearly not met by the no-own-use rule of [section 7](#7-rules-that-keep-the-reading-true).** |
| 10 | „Zusammenführung von personenbezogenen Daten aus verschiedenen Quellen und der Verarbeitung der so zusammengeführten Daten, sofern die Zusammenführung oder Verarbeitung in großem Umfang vorgenommen werden, für Zwecke erfolgen, für welche nicht alle der zu verarbeitenden Daten direkt bei den betroffenen Personen erhoben wurden, die Anwendung von Algorithmen einschließen, die für die betroffenen Personen nicht nachvollziehbar sind, und der Entdeckung vorher unbekannter Zusammenhänge zwischen den Daten für nicht im Vorhinein bestimmte Zwecke dienen“ | Reads as not met, as Nr. 5: the conditions are cumulative, and the correlation purpose is absent. |
| 11 | „Einsatz von künstlicher Intelligenz zur Verarbeitung personenbezogener Daten zur Steuerung der Interaktion mit den Betroffenen oder zur Bewertung persönlicher Aspekte der betroffenen Person“ (Einsatzfeld: „Kundensupport mittels künstlicher Intelligenz“; Beispiel: „Ein Callcenter wertet automatisiert die Stimmungslage der Anrufer aus.“) | Reads as not met on the wording and the examples. The LLM finds dates and tasks in text; it does not converse with the data subjects and does not evaluate them. It is the nearest entry, so the one an authority would look at first **[LAWYER]**. **Kept clearly not met by the no-own-use rule of [section 7](#7-rules-that-keep-the-reading-true).** |
| 12 | „Nicht bestimmungsgemäße Nutzung von Sensoren eines Mobilfunkgeräts im Besitz der betroffenen Personen oder von Funksignalen, die von solchen Geräten versandt werden, zur Bestimmung des Aufenthaltsorts oder der Bewegung von Personen über einen substantiellen Zeitraum“ | Not met. |
| 13 | „Automatisierte Auswertung von Video- oder Audio-Aufnahmen zur Bewertung der Persönlichkeit der Betroffenen“ | Not met. |
| 14 | „Erstellung umfassender Profile über die Bewegung und das Kaufverhalten von Betroffenen“ | Not met. |
| 15 | „Anonymisierung von besonderen personenbezogenen Daten nach Artikel 9 DS-GVO nicht nur in Einzelfällen (in Bezug auf die Zahl der betroffenen Personen und die Angaben je betroffener Person) zum Zweck der Übermittlung an Dritte“ | Not met. |
| 16 | „Verarbeitung von personenbezogenen Daten gemäß Art. 9 Abs. 1 und Art. 10 DS-GVO - auch wenn sie nicht als „umfangreich“ im Sinne des Art 35 Abs. 3 lit. b) anzusehen ist - sofern eine nicht einmalige Datenerhebung mittels der innovativen Nutzung von Sensoren oder mobilen Anwendungen stattfindet und diese Daten von einer zentralen Stelle empfangen und aufbereitet werden.“ | Not met: no sensors; Art. 9 data arrive as the text of mails. |
| 17 | „Verarbeitung von Daten gemäß Art. 9 Abs. 1 und Art. 10 DS-GVO - auch wenn sie nicht als „umfangreich“ im Sinne des Art 35 Abs. 3 lit. b) anzusehen ist – sofern die Daten durch die Anbieter neuer Technologien dazu verwendet werden, die Leistungsfähigkeit der Personen zu bestimmen.“ | Not met. |

The list says of itself (Hinweis 1): „Diese Liste ist nicht abschließend, sondern ergänzt die in den Absätzen 1 und 3
des Artikels 35 DSGVO enthaltenen allgemeinen Regelungen.“ Hinweis 2 says that it follows the approach of WP248, and
it closes with WP248's nine criteria as „maßgebliche Kriterien“. So that no entry fits does not end the check;
section 5 follows. No DSK list under Art. 35(5), of processing exempt from a DSFA, was found **[UNVERIFIED]**.

## 5. WP248 rev.01, the nine criteria

Guidelines of the Article 29 Working Party, adopted 4 April 2017 and last revised 4 October 2017
([PDF](https://ec.europa.eu/newsroom/just/document.cfm?doc_id=47711)), endorsed by the EDPB on 25 May 2018.

| # | Criterion | Reading |
| --- | --- | --- |
| 1 | Evaluation or scoring, profiling, predicting | Not met: no assessment of persons. |
| 2 | Automated decision with legal or similar effect | Not met. |
| 3 | Systematic monitoring | Arguable, leaning not met. Reading mailboxes continuously is "systematic" (it occurs according to a system), but the criterion aims at observing data subjects who may not know. The senders of school mails do not know that an LLM service reads their mails. |
| 4 | Sensitive data or data of a highly personal nature | **Reads as met.** Art. 9 data occur (section 3). Beyond Art. 9, WP248 names data "linked to household and private activities (such as electronic communications …)" and says the criterion "may also include data such as personal documents, emails, diaries". The service reads emails and PDFs and holds a Family's calendar. |
| 5 | Large scale | **Borderline.** Number of data subjects: 1000 Families, a few thousand persons, a tiny share of the population. Volume and range: whole mail folders, calendars, timetables. Duration: permanent while subscribed. Geography: an EU-wide offer. The scale per Family is small; the sum is not trivial. |
| 6 | Matching or combining datasets beyond reasonable expectations | Leaning not met. Several Sources are combined, but on the Admin's choice and as the product's stated purpose. The expectations of third-party senders are the weak spot. |
| 7 | Vulnerable data subjects | **Reads as met.** WP248 names children, who "can be considered as not able to knowingly and thoughtfully oppose or consent". Children are Family Members and the subject of many Items (school, doctors). They have no account and cannot exercise rights themselves. |
| 8 | Innovative use or new technology | **Arguable.** Extraction of personal mails by an LLM is new technology in the sense of recital 91, and Art. 35(1) singles out "new technologies". Against: the model is used as a text parser with schema output; nothing it generates is shown to third parties. |
| 9 | Prevents exercising a right or using a service | Not met. |

**Count:** two met (4, 7), one arguable (8), one borderline (5).

**The two-criteria rule.** WP248 III.B.a: "In most cases, a data controller can consider that a processing meeting two
criteria would require a DPIA"; sometimes one suffices, and where it is unclear WP248 recommends doing one. A
controller who concludes otherwise "should justify and document the reasons for not carrying out a DPIA".

**Why the rule is departed from here** (#198, item 1). The criteria are indicators of a high risk; "in most cases" is
not "always". The two that are met describe what data there are and whom they concern. What is done with the data
is what keeps the risk from being high:

1. **No evaluation of persons, and no decisions.** Extraction finds dates and tasks. Nobody is scored, ranked or
   predicted, and nothing is decided about anyone (criteria 1 and 2 not met; Art. 35(3)(a) not met).
2. **Children appear only as the subject of dates.** A child is in the service as the person a lesson, an appointment
   or a task is for. The child is not addressed, has no account, and is not observed or assessed.
3. **No tracking.** No analytics; the website loads nothing from third parties. A place in an Item is the planned
   place of a date, not a tracked position.
4. **Processing only for the Family's own purpose.** The data come from the Family's own mailbox, calendar and school
   portal, and go back to the same Family as its Agenda. The Operator makes no use of them
   ([section 7](#7-rules-that-keep-the-reading-true)).

**The physician and lawyer example is not leaned on.** Among WP248's examples of processing that needs no DSFA is that
of "personal data from patients or clients by an individual physician, other health care professional or lawyer",
although sensitive data and vulnerable data subjects are both met. That example rests on recital 91, which excludes
such processing from being "large-scale". What carries it is the scale and the professional context, not that the
controller is one person. A one-person Operator who processes the mails of many Families is a different setting
**[LAWYER]**. The conclusion here rests on the four reasons above, not on the size of the Operator.

## 6. Conclusion and § 38 BDSG

- **No DSFA under Art. 35.** No case of Art. 35(3) and no entry of the Muss-Liste reads as met; Art. 35(3)(b) and
  Nr. 11 stay open **[LAWYER]** (sections 3 and 4). Two WP248 criteria read as met, and the risk is still not high,
  for the four reasons of section 5. The risk that an authority reads it
  otherwise is accepted (#198, item 1).
- **No DSB.** [§ 38 Abs. 1 Satz 2 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__38.html) requires a
  Datenschutzbeauftragter, whatever the headcount, where processing is subject to a DSFA under Art. 35. With no DSFA
  under Art. 35, that trigger does not apply. The headcount trigger of Satz 1 (at least 20 persons constantly engaged
  in automated processing) is not met either: the Operator is one person. `support@family-agenda.cloud` is the
  contact (#196, item 8).
- **If an authority disagrees,** the risk assessment of [section 8](#8-risk-assessment) becomes the DSFA, and an
  external DSB is appointed then (#198, item 1).

## 7. Rules that keep the reading true

The readings of sections 3 to 5 hold only while these two rules hold. Breaking one is a re-check trigger
([section 9](#9-re-check-triggers-art-3511)).

**Messengers are not hosted until this check is redone** (#198, item 2). The hosted Source Types are `ics`, `imap`
and `webuntis`. Before Messengers (the Matrix bridge) are offered, the check is redone.

**Content is not used for the Operator's own purposes** (#198, item 3):

- Items and Source Records are shown only to the Family.
- There is no analytics, no profiling and no AI training on content.
- Content is viewed only as the AGB allow (§ 10(3)): to fix a fault with an Admin's consent, or where the law
  requires it.

The privacy policy states the same rule in § 4, "Keine eigene Nutzung":

> Einträge und Inhalte zeigen wir nur Ihrer Familie. Wir werten sie nicht aus, erstellen keine Profile und trainieren
> damit keine KI-Modelle. Wir sehen Inhalte nur ein, um mit Zustimmung eines Admins einen Fehler zu beheben, oder wenn
> wir gesetzlich dazu verpflichtet sind.

This rule keeps Muss-Liste Nr. 9 (no profile is built by the Operator) and Nr. 11 (no evaluation of personal aspects)
clearly not met.

## 8. Risk assessment

The content of Art. 35(7)(a) to (d). It adds no measure: #198, item 4 decides that the existing ones suffice and that
there are no product changes.

### (a) Description of the processing

By reference: [section 2](#2-processing-in-scope) and the
[record of processing activities](records-of-processing.md), activities 1 to 6, with its recipients table and its
measures table.

### (b) Necessity and proportionality

- **Purpose:** giving a Family its Agendas, from the Sources the Family connected (record, activity 4). There is no
  second purpose ([section 7](#7-rules-that-keep-the-reading-true)).
- **Legal bases** (#196, item 2): Art. 6(1)(b) for the Admin's own data and for sign-in, Trial, Subscription, mail
  and support; Art. 6(1)(f) for the data of other persons (partner, children, teachers, senders), the interest being
  that the Family organises its everyday life; Art. 6(1)(c) for billing records; Art. 6(1)(f) for security. Art. 8
  does not apply, since children have no accounts. For incidental Art. 9 data there is no clean basis; this is an
  accepted risk (#196, item 3).
- **Necessity:** an Agenda cannot be made from a mail without reading the mail. Extraction is the service the Family
  orders; the Family chooses which Sources, and for a mailbox which folders, are read.
- **Data minimisation:** the service fetches only the Sources a Family connected and does not change them. The model
  receives the text of a message once and keeps nothing. The logs of the mail sender hold no address.
- **Retention** (policy § 8): Family content until the Family is deleted; a Locked Family is deleted after 30 days;
  backups 14 days; server logs 14 days; sign-in logs 30 days; outbox entries and bounces 30 days. Source Records are
  kept until the Family is deleted; a shorter period is not pursued (#198, item 4).
- **Information and rights:** the privacy policy names the AI extraction and its limits, children as data subjects
  and incidental Art. 9 data (§ 4), and informs third persons (§ 5, Art. 14). Rights go through
  `support@family-agenda.cloud`; the Export serves Art. 20.

### (c) and (d) Risks and the measures against them

Data subjects are those of the record: **Admins**, **Family Members** (children included) and **third persons in
Sources**. Likelihood and severity are the Operator's estimate, in words. Every measure is in place or decided; its
state is in the record's
[measures table](records-of-processing.md#technical-and-organisational-measures-art-301g-art-32).

| # | Risk | Concerns | Likelihood | Severity | Measures |
| --- | --- | --- | --- | --- | --- |
| 1 | Another Family or an outsider reads a Family's data | Admins, children, third persons | Low | High: mails, a child's school and doctor's dates | One database and one database role per Family. TLS on every address. Content Security Policy on every page of the service (decided, gate 14); until then the Operator signs in to one Family per browser. |
| 2 | Source credentials leak | Admins; through the mailbox or portal behind them, children and third persons | Low | High: access to a whole mailbox or school portal | Source credentials are encrypted under the Family key, one per Family; a leaked Family key opens only that Family's credentials. Each plugin reaches only the hosts of its Source, through its Egress Proxy. Credentials are deleted with the Family. |
| 3 | An Agenda Link leaks | Admins, children, third persons named in Items | Medium: the link is made to be passed on | Medium: one Agenda's Items can be read | An Agenda Link can be revoked by an Admin at any time; the policy says who can read with it (§ 4). TLS. |
| 4 | Extraction makes a wrong Item or misses one | Admins, children | Medium | Low to medium: a missed or wrong date | Extraction decides nothing about persons. The policy says that it can be incomplete or wrong (§ 4). Admins can delete Items. The Sources are not changed, so the original mail stays with the Family. |
| 5 | The LLM provider keeps content or moves it out of Germany | Admins, children, third persons | Low | High | The model runs at the IONOS AI Model Hub in Germany, under IONOS Cloud's processing agreement; content is not stored, and IONOS's terms for AI services prohibit use for training (§ 2.3). These are IONOS's documented statements; the Operator asks for no separate written confirmation (decided 2026-11-25, #237). A provider or model outside Germany is a re-check trigger (section 9). |
| 6 | The Operator views content | Admins, children, third persons | Low | Medium | The no-own-use rule (section 7; policy § 4; AGB § 10(3)): content is viewed only to fix a fault with an Admin's consent, or where the law requires it. |
| 7 | Third persons do not know that their mails are processed | Third persons (teachers, clubs, senders) | High: it is the normal case | Low: their mail is read once to find dates and is shown only to the Family it was sent to | Public information under Art. 14 in policy § 5; telling each person would be disproportionate (Art. 14(5)(b), #196, item 7). Their rights, the objection under Art. 21 included, go through `support@`. No own use; the model stores nothing. |
| 8 | Incidental Art. 9 data (health, religion) are processed | Children, Admins, third persons | High that such data occur | Medium | They are processed only to show them to the Family, which had them in its own mailbox or calendar already. No own use. The model runs in Germany and stores nothing. The policy says so openly (§ 4). Admins can delete Items. |
| 9 | Data are kept longer than needed: Source Records stay until the Family is deleted | Admins, children, third persons | High: it is the design | Low to medium: old mails add to what a breach would expose (risks 1 and 10) | Admins can delete single Items and the whole Family at any time. A Locked Family is deleted after 30 days ([#191](https://github.com/artkoenig/family-agenda-cloud/issues/191); the automatic deletion is decided and not yet built). Backups 14 days; server logs 14 days, sign-in logs 30 days. |
| 10 | Backups are lost or breached | Every data subject of the record | Low | High: the backups hold every Family's database | Backups are continuous and kept 14 days, in a bucket in Berlin apart from the Cube in Frankfurt; public access to both buckets is blocked. IONOS Cloud's measures as processor (TOM annex, ISO/IEC 27001, C5 Type 1; the certification of the Berlin Object Storage region is called pending). Whether the buckets are encrypted at rest is **[UNVERIFIED]**. |

### (e) Residual risk and accepted risks

With these measures no risk remains high in likelihood and severity together; risks 7 to 9 are likely, with low to
medium severity, and risks 1, 2, 5 and 10 are severe, with low likelihood.

Accepted by the Operator:

- **No DSFA and no DSB** (#198, item 1), with the fallback of section 6.
- **No consent checkbox for Art. 9 data** (#196, item 3): there is no clean Art. 9 basis for incidental data.
- **Source Records are kept until the Family is deleted** (#198, item 4): shorter retention is not pursued now.
- **The open legal points of [section 10](#10-known-open-legal-points).**

## 9. Re-check triggers (Art. 35(11))

This check is redone, and the result logged in [section 1](#1-head), when one of these happens (#198, item 5):

| Trigger | Where the step is |
| --- | --- |
| More than 1000 Families | [Families runbook, "Create a Family"](../runbook/families.md#create-a-family) |
| A new Source Type | [Setup runbook, "10. A new Source Type"](../runbook/setup.md#10-a-new-source-type) |
| An AI provider or model outside Germany | [Setup runbook, "6. AI Model Hub token"](../runbook/setup.md#6-ai-model-hub-token) |
| Any own use of content | [Families runbook, "A Family's content"](../runbook/families.md#a-familys-content) |
| DSK guidance on LLMs that touches this case | No runbook step: there is no place where a change is made. It is raised in the pull request of #239. |

Before Messengers are offered, the check is redone in any case ([section 7](#7-rules-that-keep-the-reading-true)).

## 10. Known open legal points

From the research for #183. They are known and accepted under #198, not resolved.

1. Do incidental Art. 9 data in free text count for Art. 35(3)(b) and for WP248 criterion 4? **[LAWYER]**
2. Is processing for about 1000 Families "large scale"? **[LAWYER]**
3. Does Muss-Liste Nr. 11 cover extraction by an LLM that neither interacts with the data subject nor evaluates them?
   **[LAWYER]**
4. Guidance of the DSK or of a Land authority since 2018 on a DSFA for the use of LLMs (such as the DSK's
   Orientierungshilfe on AI) was not read **[UNVERIFIED]**. It is also a re-check trigger (section 9).
5. Does § 38 BDSG apply to a DSFA carried out voluntarily? The statute says "unterliegen"; a voluntary DSFA is
   commonly read as not triggering it **[UNVERIFIED]**. It matters only for the fallback of section 6.
6. Art. 37(1)(c) GDPR (core activities consisting of large-scale processing of Art. 9 data) is a separate DSB trigger
   with the same "large scale" question as point 2; Art. 37 and WP243 were not re-read **[UNVERIFIED]**.
7. Whether a one-person Operator serving many Families can rely on WP248's physician and lawyer example
   **[LAWYER]**. It is not leaned on (section 5).
8. The GDPR's own text was not re-read from EUR-Lex; Art. 35 is quoted through WP248 **[UNVERIFIED]**.
