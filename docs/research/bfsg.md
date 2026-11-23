# BFSG: does it apply to the Operator?

Research for issue #184 (map #179). Sources read 2026-11-23. Facts only; this note decides nothing. Not legal advice. Items marked **[UNVERIFIED]** could not be traced to a primary source; **[OPEN]** means the primary sources read do not answer it.

## Situation

German Einzelunternehmer, no employees. Sells a B2C Subscription to the hosted Family Agenda through `family-agenda.cloud`, checkout via Stripe (no Merchant of Record, so the Operator is the seller). Pages in question: landing page, sign-in/registration, checkout, `/kuendigen`, `/widerruf`, legal pages, the app itself.

## Summary

- **The service is in scope.** BFSG covers "Dienstleistungen im elektronischen Geschäftsverkehr" provided to consumers after 28 June 2025 (§ 1 Abs. 3 Nr. 5). A website that sells to consumers is one; BMAS says the whole website including checkout is covered (F1, F2).
- **The Operator is exempt as a service microenterprise.** § 3 Abs. 3 BFSG: § 3 Abs. 1 (the accessibility duty) does not apply to Kleinstunternehmen offering or providing services. Kleinstunternehmen = fewer than 10 persons employed **and** turnover **or** balance sheet at most €2M (§ 2 Nr. 17). The Directive exempts them from the requirements "and any obligations relating to the compliance" (Art. 4(5)); BMAS: they are "vom Anwendungsbereich des Gesetzes ausgenommen" (F3).
- **Counting:** the MLBF counts in annual work units per Recommendation 2003/361/EC; a regularly working owner counts. One owner without staff = about 1 AWU. Status changes only after the thresholds are crossed in **two consecutive** financial years; new businesses estimate in good faith (F4).
- **Consequence while exempt:** no accessibility requirements under the BFSGV, no Anlage 3 information ("Barrierefreiheitserklärung") is required, no notifications to the MLBF. Accessibility stays voluntary (F3, F5).
- **If the exemption is ever lost** (≥10 AWU, or both turnover and balance sheet above €2M, two years running): BFSGV § 12 Nr. 3 (websites and online applications perceivable, operable, understandable, robust) and § 19 (identification, authentication, security and payment functions), Anlage 3 information in the AGB or another clearly visible place naming the MLBF, fines up to €100,000 (F5–F7).
- **Open:** whether the app itself (used after the contract) is part of the e-commerce service or only the sales path is; how a Stripe-hosted checkout fits; neither matters while the exemption holds (F8).

## Findings

### F1. Scope: Dienstleistungen im elektronischen Geschäftsverkehr
- BFSG applies to the listed services "die für Verbraucher nach dem 28. Juni 2025 erbracht werden"; Nr. 5: "Dienstleistungen im elektronischen Geschäftsverkehr" ([§ 1 Abs. 3 BFSG](https://www.gesetze-im-internet.de/bfsg/__1.html)).
- Definition: digital services under § 1 Abs. 4 Nr. 1 DDG, offered via websites and mobile apps, provided electronically and at the individual request of a consumer, "im Hinblick auf den Abschluss eines Verbrauchervertrags" ([§ 2 Nr. 26 BFSG](https://www.gesetze-im-internet.de/bfsg/__2.html)). § 1 Abs. 4 Nr. 1 DDG refers to a service under Art. 1(1)(b) Directive (EU) 2015/1535 ([§ 1 DDG](https://www.gesetze-im-internet.de/ddg/__1.html)).
- Directive: "services provided at a distance, through websites and mobile device-based services by electronic means and at the individual request of a consumer with a view to concluding a consumer contract" (Art. 3(30)); the obligations "should apply to the online sale of any product or service" (recital 43) ([Directive (EU) 2019/882](https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng)).
- Consumer = natural person acting mainly outside trade or profession (§ 2 Nr. 16). Dienstleistungserbringer = any natural or legal person providing or offering a service to consumers on the Union market (§ 2 Nr. 4).
- Excluded website content includes third-party content "weder finanziert noch entwickelt ... noch dessen Kontrolle" (§ 1 Abs. 4 Nr. 4).

### F2. Which pages (official guidance)
- BMAS example 3 (hairdresser, not a Kleinstunternehmen, selling products and booking appointments on its website): both count as e-commerce services; "Die gesamte Webseite inklusive Check-out ist nach den Vorschriften des BFSG barrierefrei zu gestalten" ([BMAS Leitlinien, p. 2](https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf)).
- The MLBF FAQ and business pages do not break down which parts of a site or app are covered ([MLBF FAQ](https://www.mlbf-barrierefrei.de/Fragen-und-Antworten-zum-Barrierefreiheitsst%C3%A4rkungsgesetz/), [MLBF Unternehmen](https://www.mlbf-barrierefrei.de/Informationen-f%C3%BCr-Unternehmen/)).
- **[UNVERIFIED]** Chamber FAQs citing the Bundesfachstelle (ZDH, Feb 2025) say general contact pages, contact forms and job postings usually fall outside; not read on a Bundesfachstelle page.

### F3. Microenterprise exemption for services
- "Absatz 1 gilt nicht für Kleinstunternehmen, die Dienstleistungen anbieten oder erbringen." BMAS must issue guidance for them ([§ 3 Abs. 3 BFSG](https://www.gesetze-im-internet.de/bfsg/__3.html)).
- Kleinstunternehmen: "weniger als zehn Personen beschäftigt" and "entweder einen Jahresumsatz von höchstens 2 Millionen Euro erzielt oder" a balance sheet total of at most €2M ([§ 2 Nr. 17 BFSG](https://www.gesetze-im-internet.de/bfsg/__2.html)).
- Directive Art. 4(5): "Microenterprises providing services shall be exempt from complying with the accessibility requirements ... and any obligations relating to the compliance with those requirements." Recital 70: even the proportionality assessment would be a disproportionate burden, so "The requirements and obligations of this Directive should therefore not apply to microenterprises providing services". Recital 53: microenterprises must "genuinely fulfil the requirements of Commission Recommendation 2003/361/EC" ([Directive (EU) 2019/882](https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng)).
- BMAS: "Kleinstunternehmen, die Dienstleistungen erbringen, sind vom Anwendungsbereich des Gesetzes ausgenommen"; a hairdresser with 4 staff and €1M turnover "muss die Barrierefreiheitsanforderungen nicht beachten, obwohl es Dienstleistungen im elektronischen Geschäftsverkehr anbietet". Products microenterprises are not exempt ([BMAS Leitlinien, p. 2–3](https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf)).
- MLBF: the accessibility duty does not apply to microenterprises offering services ([MLBF FAQ](https://www.mlbf-barrierefrei.de/Fragen-und-Antworten-zum-Barrierefreiheitsst%C3%A4rkungsgesetz/)).
- Note: the BFSG text exempts only § 3 Abs. 1; that § 14 (Anlage 3 information, notifications) falls away too follows from Art. 4(5), recital 70 and BMAS's "vom Anwendungsbereich ausgenommen", not from the wording of § 3 Abs. 3 itself.
- Other Member States: Art. 4(5) is mandatory ("shall be exempt"), so national transpositions should carry the same exemption. **[UNVERIFIED]** not checked per country.

### F4. How the thresholds are counted
MLBF business page ([MLBF Unternehmen, section Kleinstunternehmen](https://www.mlbf-barrierefrei.de/Informationen-f%C3%BCr-Unternehmen/)), based on the Annex to Recommendation 2003/361/EC ([Recommendation 2003/361/EC](https://eur-lex.europa.eu/eli/reco/2003/361/oj/eng), Annex Art. 4–6):
- Headcount in annual work units (AWU); part-time and part-year work pro rata.
- Counted: employees, persons in employee-like subordination, **owner-managers** and partners working regularly and benefiting financially. Not counted: apprentices, maternity/parental leave.
- Turnover excluding VAT, from the latest approved annual accounts; new businesses without accounts estimate in good faith ("nach Treu und Glauben").
- Crossing or falling below a threshold changes the status only if it happens in two consecutive financial years. MLBF asks for evidence from the last two financial years.
- Linked and partner enterprises' figures may have to be added (Annex Art. 3, 6).
- Applied to the Operator: one owner, no staff ≈ 1 AWU; turnover far below €2M. Not a linked enterprise unless the Operator holds ≥25 % stakes in other enterprises (not known here).

### F5. Duties if the exemption did not apply (§ 14 BFSG)
- Offer or provide only if the service meets the BFSGV and the Anlage 3 Nr. 1 information has been prepared and made available to the public in accessible form; keep it as long as the service is offered; keep conforming as the service and standards change; on non-conformity take corrective action and notify the MLBF and the authorities of other Member States served; cooperate on request ([§ 14 BFSG](https://www.gesetze-im-internet.de/bfsg/__14.html)).
- Anlage 3 Nr. 1: in the AGB or "auf andere deutlich wahrnehmbare Weise": general description of the service in an accessible format, explanations needed to understand its delivery, how it meets the requirements, the competent market surveillance authority; also the Art. 246 EGBGB information ([Anlage 3 BFSG](https://www.gesetze-im-internet.de/bfsg/anlage_3.html)).
- MLBF: this is called "Information zur Barrierefreiheit"; "Erklärung zur Barrierefreiheit" is the term for public bodies under Directive (EU) 2016/2102. Authority to name: MLBF AöR. Missing or incomplete information is formal non-conformity ([MLBF Unternehmen](https://www.mlbf-barrierefrei.de/Informationen-f%C3%BCr-Unternehmen/); [MLBF FAQ](https://www.mlbf-barrierefrei.de/Fragen-und-Antworten-zum-Barrierefreiheitsst%C3%A4rkungsgesetz/)).
- Exceptions (fundamental alteration, disproportionate burden; §§ 16, 17) need a documented assessment, renewed at least every 5 years for services, and notification of the MLBF ([BMAS Leitlinien, p. 3–4](https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf)).

### F6. Technical requirements (BFSGV), for reference
- § 12 Nr. 3: "Webseiten, einschließlich der zugehörigen Online-Anwendungen und auf Mobilgeräten angebotenen Dienstleistungen" must be "auf konsistente und angemessene Weise wahrnehmbar, bedienbar, verständlich und robust" ([§ 12 BFSGV](https://www.gesetze-im-internet.de/bfsgv/__12.html)). § 12 also covers information about the service (more than one sensory channel) and support services.
- § 19 (e-commerce): accessibility information about the products/services sold, where the responsible operator provides it; identification, authentication, security and payment functions, and identification methods, electronic signatures and payment services, perceivable, operable, understandable and robust ([§ 19 BFSGV](https://www.gesetze-im-internet.de/bfsgv/__19.html)).
- State of the art applies; deviation allowed if equal accessibility is reached otherwise; the Bundesfachstelle publishes the list of relevant standards ([§ 3 BFSGV](https://www.gesetze-im-internet.de/bfsgv/__3.html)). Conformity is presumed for harmonised standards published in the OJ ([§ 4 BFSG](https://www.gesetze-im-internet.de/bfsg/__4.html)).
- **[UNVERIFIED]** That EN 301 549 / WCAG 2.1 AA is the practical benchmark: not stated on the pages read; no harmonised standard under 2019/882 was checked in the OJ.

### F7. Enforcement
- Authority: Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen (MLBF AöR), Carl-Miller-Straße 6, 39112 Magdeburg; competent since the Länder Staatsvertrag entered into force on 26 September 2025 ([MLBF](https://www.mlbf-barrierefrei.de/); [Schleswig-Holstein](https://www.schleswig-holstein.de/DE/fachinhalte/A/arbeitsschutz/mlbf)).
- Fines: providing a non-conforming service (§ 37 Abs. 1 Nr. 8) up to €100,000; information failures toward the authority up to €10,000; intent and negligence ([§ 37 BFSG](https://www.gesetze-im-internet.de/bfsg/__37.html)). Final step: order to stop the service ([BMAS Leitlinien, p. 12](https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf)).
- Consumers and associations (§ 32) can ask the MLBF to act and sue it if it does not (BMAS Leitlinien, p. 13).
- **[UNVERIFIED]** Competitor warning letters under UWG for BFSG breaches: not checked in primary sources.
- Transition (§ 38): contracts concluded before 28 June 2025 may run on unchanged until 27 June 2030 at most; irrelevant for a launch after that date ([§ 38 BFSG](https://www.gesetze-im-internet.de/bfsg/__38.html)).

### F8. Open points
- **[OPEN]** Whether the app used after conclusion of the Subscription is part of the "Dienstleistung im elektronischen Geschäftsverkehr" (definition: "im Hinblick auf den Abschluss eines Verbrauchervertrags"), or only the pages leading to and administering the contract (landing page, registration, checkout, cancel/withdraw). BMAS says "gesamte Webseite"; no source read addresses SaaS.
- **[OPEN]** Stripe-hosted checkout: § 19 Nr. 3 BFSGV covers payment services "wenn diese bereitgestellt werden"; whether Stripe's page is third-party content outside the Operator's control (§ 1 Abs. 4 Nr. 4 BFSG) is not answered.
- Neither matters while the exemption holds.

## Sources

- BFSG: [§ 1](https://www.gesetze-im-internet.de/bfsg/__1.html), [§ 2](https://www.gesetze-im-internet.de/bfsg/__2.html), [§ 3](https://www.gesetze-im-internet.de/bfsg/__3.html), [§ 4](https://www.gesetze-im-internet.de/bfsg/__4.html), [§ 14](https://www.gesetze-im-internet.de/bfsg/__14.html), [§ 37](https://www.gesetze-im-internet.de/bfsg/__37.html), [§ 38](https://www.gesetze-im-internet.de/bfsg/__38.html), [Anlage 3](https://www.gesetze-im-internet.de/bfsg/anlage_3.html)
- BFSGV: [§ 3](https://www.gesetze-im-internet.de/bfsgv/__3.html), [§ 12](https://www.gesetze-im-internet.de/bfsgv/__12.html), [§ 19](https://www.gesetze-im-internet.de/bfsgv/__19.html)
- [DDG § 1](https://www.gesetze-im-internet.de/ddg/__1.html)
- [Directive (EU) 2019/882](https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng): Art. 2(2)(f), 3(23), 3(30), 4(5); recitals 42, 43, 53, 70 (text read via the Publications Office, CELEX 32019L0882)
- [Commission Recommendation 2003/361/EC](https://eur-lex.europa.eu/eli/reco/2003/361/oj/eng), Annex Art. 2–6 (read via the Publications Office, CELEX 32003H0361)
- [BMAS, Leitlinien für die Anwendung des BFSG](https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf) (2022)
- MLBF: [FAQ](https://www.mlbf-barrierefrei.de/Fragen-und-Antworten-zum-Barrierefreiheitsst%C3%A4rkungsgesetz/), [Informationen für Unternehmen](https://www.mlbf-barrierefrei.de/Informationen-f%C3%BCr-Unternehmen/)
- Not read directly: Bundesfachstelle Barrierefreiheit pages (search returned only chamber pages citing it).
