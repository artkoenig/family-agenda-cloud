import { describe, expect, it } from "vitest";
import {
  cancellationMail,
  familyDeletedMail,
  familyDeletedNoticeMail,
  MAIL_FROM,
  MAIL_REPLY_TO,
  withdrawalMail,
  type ContractMail,
} from "../../src/contract-mails";
import type { Contract, Language } from "../../src/contract-wording";

const erika = { name: "Erika Muster", email: "erika@example.org" };
const max = { name: "Max Muster", email: "max@example.org" };
const monthly: Contract = { billing: "monthly", familyName: "Muster", orderedOn: new Date("2026-03-05T09:05:00Z") };
const yearlyInYearOne: Contract = { ...monthly, billing: "yearly" };
const yearlyAfterYearOne: Contract = { ...monthly, billing: "yearly", orderedOn: new Date("2025-03-05T09:05:00Z") };

/** The signature separator mail programs know, with its trailing space. */
const SEPARATOR = "-- ";

const FOOTER: Record<Language, string> = {
  de: `${SEPARATOR}
Family Agenda · {{NAME}} · {{POSTFLEX_ADDRESS}}
Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie an support@family-agenda.cloud.
Impressum: https://family-agenda.cloud/impressum
`,
  en: `${SEPARATOR}
Family Agenda · {{NAME}} · {{POSTFLEX_ADDRESS}}
Questions? Just reply to this mail or write to support@family-agenda.cloud.
Imprint: https://family-agenda.cloud/en/imprint
`,
};

/** The mail's headers and its text, the footer apart. */
function parts({ text, ...headers }: ContractMail, language: Language) {
  expect(text.endsWith(`\n\n${FOOTER[language]}`), text).toBe(true);
  return { ...headers, text: text.slice(0, -FOOTER[language].length - 2) };
}

describe("cancellationMail", () => {
  const monthlyCancellation = {
    recipient: erika,
    contract: monthly,
    receivedAt: new Date("2026-03-10T17:42:00Z"),
    endsOn: new Date("2026-04-05T09:05:00Z"),
    settlement: { case: "plain" },
  } as const;

  it("acknowledges a monthly Subscription's Cancellation, from support with Reply-To support, in German", () => {
    expect(parts(cancellationMail("de", monthlyCancellation), "de")).toEqual({
      from: "Family Agenda <support@family-agenda.cloud>",
      replyTo: "support@family-agenda.cloud",
      to: "erika@example.org",
      subject: "Eingangsbestätigung Ihrer Kündigung – Family Agenda",
      text: `Guten Tag Erika Muster,

Ihre Kündigung ist am 10.03.2026 um 18:42 Uhr bei uns eingegangen.

Inhalt: Ordentliche Kündigung des Vertrags Family Agenda, monatlich, Familie Muster, zum 05.04.2026.

Der Vertrag endet am 05.04.2026. Bis dahin können alle Family Agenda wie gewohnt nutzen.

Ab dem 05.04.2026 ist Ihre Familie gesperrt. Admins können bis dahin und während der Sperre im Admin-Bereich einen Export herunterladen. Am 05.05.2026 löschen wir die Familie mit allen Daten.

Sie können die Kündigung bis zum 05.04.2026 im Admin-Bereich zurücknehmen.`,
    });
  });

  it("acknowledges a monthly Subscription's Cancellation in English", () => {
    expect(parts(cancellationMail("en", monthlyCancellation), "en")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Your cancellation has been received – Family Agenda",
      text: `Hello Erika Muster,

We received your cancellation on 10 March 2026 at 18:42 (Berlin time).

Content: ordinary cancellation of the contract Family Agenda, monthly, family Muster, as of 5 April 2026.

The contract ends on 5 April 2026. Until then everyone can use Family Agenda as usual.

From 5 April 2026 your family is locked. Admins can download an export in the Admin area until then and while the family is locked. On 5 May 2026 we delete the family with all its data.

You can undo the cancellation in the Admin area until 5 April 2026.`,
    });
  });

  it("says nothing of money for a yearly Subscription in year one", () => {
    const values = { ...monthlyCancellation, contract: yearlyInYearOne, endsOn: new Date("2027-03-05T09:05:00Z") };
    expect(parts(cancellationMail("de", values), "de").text).toContain(
      "Inhalt: Ordentliche Kündigung des Vertrags Family Agenda, jährlich, Familie Muster, zum 05.03.2027.\n\nDer Vertrag endet am 05.03.2027. Bis dahin können alle Family Agenda wie gewohnt nutzen.\n\nAb dem 05.03.2027",
    );
    expect(parts(cancellationMail("en", values), "en").text).toContain(
      "family Muster, as of 5 March 2027.\n\nThe contract ends on 5 March 2027. Until then everyone can use Family Agenda as usual.\n\nFrom 5 March 2027 your family is locked.",
    );
    for (const language of ["de", "en"] as const) {
      expect(cancellationMail(language, values).text).not.toMatch(/€|erstatten|refund|berechnet|charged/);
    }
  });

  it("refunds the unused part of a yearly fee after year one", () => {
    const values = {
      ...monthlyCancellation,
      contract: yearlyAfterYearOne,
      receivedAt: new Date("2026-06-10T08:00:00Z"),
      endsOn: new Date("2026-07-05T08:05:00Z"),
      settlement: { case: "yearly-after-year-one", refundCents: 6667 },
    } as const;
    expect(parts(cancellationMail("de", values), "de").text).toBe(`Guten Tag Erika Muster,

Ihre Kündigung ist am 10.06.2026 um 10:00 Uhr bei uns eingegangen.

Inhalt: Ordentliche Kündigung des Vertrags Family Agenda, jährlich, Familie Muster, zum 05.07.2026.

Der Vertrag endet am 05.07.2026. Bis dahin können alle Family Agenda wie gewohnt nutzen.
Den nicht genutzten Teil Ihres Jahresbeitrags, 66,67 €, erstatten wir mit dem Vertragsende auf Ihr Zahlungsmittel.

Ab dem 05.07.2026 ist Ihre Familie gesperrt. Admins können bis dahin und während der Sperre im Admin-Bereich einen Export herunterladen. Am 04.08.2026 löschen wir die Familie mit allen Daten.

Sie können die Kündigung bis zum 05.07.2026 im Admin-Bereich zurücknehmen.`);
    expect(parts(cancellationMail("en", values), "en").text).toContain(
      "The contract ends on 5 July 2026. Until then everyone can use Family Agenda as usual.\nWe will refund the unused part of your yearly fee, €66.67, to your payment method when the contract ends.\n\nFrom 5 July 2026",
    );
  });

  it("charges nothing for an order during the Trial", () => {
    const values = {
      ...monthlyCancellation,
      receivedAt: new Date("2026-03-07T09:00:00Z"),
      endsOn: new Date("2026-03-12T09:05:00Z"),
      settlement: { case: "ordered-during-trial" },
    } as const;
    expect(parts(cancellationMail("de", values), "de").text).toContain(
      "Der Vertrag endet am 12.03.2026. Bis dahin können alle Family Agenda wie gewohnt nutzen.\nEs wird nichts berechnet.\n\nAb dem 12.03.2026 ist Ihre Familie gesperrt. Admins können bis dahin und während der Sperre im Admin-Bereich einen Export herunterladen. Am 11.04.2026 löschen wir",
    );
    expect(parts(cancellationMail("en", values), "en").text).toContain(
      "The contract ends on 12 March 2026. Until then everyone can use Family Agenda as usual.\nNothing will be charged.\n\nFrom 12 March 2026",
    );
    expect(cancellationMail("de", values).text).not.toContain("erstatten");
  });
});

describe("withdrawalMail", () => {
  const receivedAt = new Date("2026-03-10T17:42:00Z");

  it("acknowledges a Withdrawal within the period: ends at once, refunds everything", () => {
    const values = { recipient: erika, contract: monthly, receivedAt, period: { case: "within", refundCents: 1299 } } as const;
    expect(parts(withdrawalMail("de", values), "de")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Eingangsbestätigung Ihres Widerrufs – Family Agenda",
      text: `Guten Tag Erika Muster,

Ihr Widerruf ist am 10.03.2026 um 18:42 Uhr bei uns eingegangen.

Inhalt: Widerruf des Vertrags Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026.

Das Abonnement endet damit sofort, und Ihre Familie ist gesperrt. Bereits gezahlte Beträge, insgesamt 12,99 €, erstatten wir innerhalb von 14 Tagen auf Ihr Zahlungsmittel.

Admins können im Admin-Bereich weiterhin einen Export herunterladen. Am 09.04.2026 löschen wir die Familie mit allen Daten. Möchten Sie weitermachen, können Sie bis dahin im Admin-Bereich neu bestellen.`,
    });
    expect(parts(withdrawalMail("en", values), "en")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Acknowledgement of your withdrawal – Family Agenda",
      text: `Hello Erika Muster,

We received your withdrawal on 10 March 2026 at 18:42 (Berlin time).

Content: withdrawal from the contract Family Agenda, monthly, family Muster, ordered on 5 March 2026.

The subscription therefore ends at once, and your family is locked. We will refund all amounts paid, €12.99 in total, to your payment method within 14 days.

Admins can still download an export in the Admin area. On 9 April 2026 we delete the family with all its data. If you want to continue, you can order again in the Admin area until then.`,
    });
  });

  it("treats a Withdrawal after the period as a Cancellation at the earliest date", () => {
    const values = {
      recipient: erika,
      contract: monthly,
      receivedAt: new Date("2026-03-25T07:15:00Z"),
      period: { case: "after", endedOn: new Date("2026-03-19T09:05:00Z"), endsOn: new Date("2026-04-05T09:05:00Z"), settlement: { case: "plain" } },
    } as const;
    expect(parts(withdrawalMail("de", values), "de")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Eingangsbestätigung Ihres Widerrufs – Family Agenda",
      text: `Guten Tag Erika Muster,

Ihre Erklärung ist am 25.03.2026 um 08:15 Uhr bei uns eingegangen.

Inhalt: Widerruf des Vertrags Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026.

Die Widerrufsfrist von 14 Tagen ist am 19.03.2026 abgelaufen. Wir behandeln Ihre Erklärung deshalb als ordentliche Kündigung zum frühestmöglichen Zeitpunkt: Der Vertrag endet am 05.04.2026. Bis dahin können alle Family Agenda wie gewohnt nutzen.

Ab dem 05.04.2026 ist Ihre Familie gesperrt. Admins können bis dahin und während der Sperre im Admin-Bereich einen Export herunterladen. Am 05.05.2026 löschen wir die Familie mit allen Daten.

Sie können die Kündigung bis zum 05.04.2026 im Admin-Bereich zurücknehmen.`,
    });
    expect(parts(withdrawalMail("en", values), "en")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Acknowledgement of your withdrawal – Family Agenda",
      text: `Hello Erika Muster,

We received your statement on 25 March 2026 at 08:15 (Berlin time).

Content: withdrawal from the contract Family Agenda, monthly, family Muster, ordered on 5 March 2026.

The 14-day withdrawal period ended on 19 March 2026. We therefore treat your statement as an ordinary cancellation at the earliest possible date: the contract ends on 5 April 2026. Until then everyone can use Family Agenda as usual.

From 5 April 2026 your family is locked. Admins can download an export in the Admin area until then and while the family is locked. On 5 May 2026 we delete the family with all its data.

You can undo the cancellation in the Admin area until 5 April 2026.`,
    });
  });

  it("refunds the unused part of a yearly fee after year one when a late Withdrawal cancels it", () => {
    const values = {
      recipient: erika,
      contract: yearlyAfterYearOne,
      receivedAt,
      period: {
        case: "after",
        endedOn: new Date("2025-03-19T09:05:00Z"),
        endsOn: new Date("2026-04-05T09:05:00Z"),
        settlement: { case: "yearly-after-year-one", refundCents: 123_456 },
      },
    } as const;
    expect(withdrawalMail("de", values).text).toContain(
      "Der Vertrag endet am 05.04.2026. Bis dahin können alle Family Agenda wie gewohnt nutzen.\nDen nicht genutzten Teil Ihres Jahresbeitrags, 1.234,56 €, erstatten wir mit dem Vertragsende auf Ihr Zahlungsmittel.\n\n",
    );
    expect(withdrawalMail("en", values).text).toContain("€1,234.56");
  });
});

describe("familyDeletedMail", () => {
  const deletedAt = new Date("2026-06-10T08:00:00Z");

  it("tells the deleting Admin without a Subscription when the last copies are gone", () => {
    const values = { recipient: erika, familyName: "Muster", deletedAt, by: "recipient", subscription: null } as const;
    expect(parts(familyDeletedMail("de", values), "de")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Ihre Familie wurde gelöscht – Family Agenda",
      text: `Guten Tag Erika Muster,

Sie haben die Familie Muster am 10.06.2026 um 10:00 Uhr gelöscht. Alle Daten der Familie sind gelöscht; die letzten Kopien in unseren Sicherungen werden spätestens am 24.06.2026 entfernt.

Danke, dass Sie Family Agenda genutzt haben.`,
    });
    expect(parts(familyDeletedMail("en", values), "en")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "erika@example.org",
      subject: "Your family has been deleted – Family Agenda",
      text: `Hello Erika Muster,

You deleted the family Muster on 10 June 2026 at 10:00 (Berlin time). All of the family's data are deleted; the last copies in our backups are gone on 24 June 2026.

Thank you for using Family Agenda.`,
    });
  });

  it("says the deletion cancelled a running Subscription, refunding a yearly one after year one", () => {
    const endsOn = new Date("2026-07-05T08:05:00Z");
    const yearly = { recipient: erika, familyName: "Muster", deletedAt, by: "recipient", subscription: { endsOn, settlement: { case: "yearly-after-year-one", refundCents: 6667 } } } as const;
    expect(parts(familyDeletedMail("de", yearly), "de").text).toBe(`Guten Tag Erika Muster,

Sie haben die Familie Muster am 10.06.2026 um 10:00 Uhr gelöscht. Alle Daten der Familie sind gelöscht; die letzten Kopien in unseren Sicherungen werden spätestens am 24.06.2026 entfernt.
Ihr Abonnement ist zum 05.07.2026 gekündigt. Den nicht genutzten Teil, 66,67 €, erstatten wir auf Ihr Zahlungsmittel.

Danke, dass Sie Family Agenda genutzt haben.`);
    expect(parts(familyDeletedMail("en", yearly), "en").text).toBe(`Hello Erika Muster,

You deleted the family Muster on 10 June 2026 at 10:00 (Berlin time). All of the family's data are deleted; the last copies in our backups are gone on 24 June 2026.
Your subscription is cancelled as of 5 July 2026. We will refund the unused part, €66.67, to your payment method.

Thank you for using Family Agenda.`);

    for (const settlement of [{ case: "plain" }, { case: "ordered-during-trial" }] as const) {
      const values = { ...yearly, subscription: { endsOn, settlement } };
      expect(familyDeletedMail("de", values).text).toContain("entfernt.\nIhr Abonnement ist zum 05.07.2026 gekündigt.\n\nDanke");
      expect(familyDeletedMail("en", values).text).toContain("24 June 2026.\nYour subscription is cancelled as of 5 July 2026.\n\nThank you");
    }
  });

  it("announces the automatic deletion 30 days after Locked", () => {
    const values = { recipient: erika, familyName: "Muster", deletedAt, by: "automatic", subscription: null } as const;
    expect(parts(familyDeletedMail("de", values), "de")).toMatchObject({
      subject: "Ihre Familie wurde gelöscht – Family Agenda",
      text: `Guten Tag Erika Muster,

Wie angekündigt haben wir die Familie Muster am 10.06.2026, 30 Tage nach der Sperre, gelöscht. Alle Daten der Familie sind gelöscht; die letzten Kopien in unseren Sicherungen werden spätestens am 24.06.2026 entfernt.

Danke, dass Sie Family Agenda genutzt haben.`,
    });
    expect(parts(familyDeletedMail("en", values), "en")).toMatchObject({
      subject: "Your family has been deleted – Family Agenda",
      text: `Hello Erika Muster,

As announced, we deleted the family Muster on 10 June 2026, 30 days after it was locked. All of the family's data are deleted; the last copies in our backups are gone on 24 June 2026.

Thank you for using Family Agenda.`,
    });
  });
});

describe("familyDeletedNoticeMail", () => {
  const deletedAt = new Date("2026-06-10T08:00:00Z");

  it("tells every other Admin who deleted the Family", () => {
    const values = { recipient: max, familyName: "Muster", deletedAt, by: { admin: "Erika Muster" } } as const;
    expect(parts(familyDeletedNoticeMail("de", values), "de")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "max@example.org",
      subject: "Die Familie Muster wurde gelöscht – Family Agenda",
      text: `Guten Tag Max Muster,

Erika Muster hat die Familie Muster am 10.06.2026 gelöscht. Ihr Zugang und alle Daten der Familie sind damit gelöscht.`,
    });
    expect(parts(familyDeletedNoticeMail("en", values), "en")).toEqual({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: "max@example.org",
      subject: "The family Muster has been deleted – Family Agenda",
      text: `Hello Max Muster,

Erika Muster deleted the family Muster on 10 June 2026. Your access and all of the family's data are deleted with it.`,
    });
  });

  it("tells every other Admin of the automatic deletion", () => {
    const values = { recipient: max, familyName: "Muster", deletedAt, by: "automatic" } as const;
    expect(parts(familyDeletedNoticeMail("de", values), "de").text).toBe(`Guten Tag Max Muster,

Wie angekündigt haben wir die Familie Muster am 10.06.2026, 30 Tage nach der Sperre, gelöscht. Ihr Zugang und alle Daten der Familie sind damit gelöscht.`);
    expect(parts(familyDeletedNoticeMail("en", values), "en").text).toBe(`Hello Max Muster,

As announced, we deleted the family Muster on 10 June 2026, 30 days after it was locked. Your access and all of the family's data are deleted with it.`);
  });
});

describe("every mail", () => {
  const mails = (language: Language) => [
    cancellationMail(language, { recipient: erika, contract: monthly, receivedAt: new Date(), endsOn: new Date(), settlement: { case: "plain" } }),
    withdrawalMail(language, { recipient: erika, contract: monthly, receivedAt: new Date(), period: { case: "within", refundCents: 100 } }),
    familyDeletedMail(language, { recipient: erika, familyName: "Muster", deletedAt: new Date(), by: "recipient", subscription: null }),
    familyDeletedNoticeMail(language, { recipient: max, familyName: "Muster", deletedAt: new Date(), by: "automatic" }),
  ];

  it("fills the footer's placeholders with the Operator's imprint when given, even with $ in it", () => {
    const imprint = { name: "Art $& Koenig", postalAddress: "Postfach 1, 10115 Berlin" };
    const de = familyDeletedNoticeMail("de", { recipient: max, familyName: "Muster", deletedAt: new Date(), by: "automatic" }, imprint);
    expect(de.text).toContain("\n\n-- \nFamily Agenda · Art $& Koenig · Postfach 1, 10115 Berlin\nFragen? Antworten Sie");
    const en = cancellationMail(
      "en",
      { recipient: erika, contract: monthly, receivedAt: new Date(), endsOn: new Date(), settlement: { case: "plain" } },
      imprint,
    );
    expect(en.text).toContain("\n\n-- \nFamily Agenda · Art $& Koenig · Postfach 1, 10115 Berlin\nQuestions? Just reply");
    expect(withdrawalMail("de", { recipient: erika, contract: monthly, receivedAt: new Date(), period: { case: "within", refundCents: 1 } }, imprint).text).not.toContain("{{");
    expect(familyDeletedMail("en", { recipient: erika, familyName: "M", deletedAt: new Date(), by: "recipient", subscription: null }, imprint).text).not.toContain("{{");
  });

  it("acknowledges receipt only, never that a declaration was confirmed or is valid", () => {
    for (const mail of [...mails("de"), ...mails("en")]) {
      expect(`${mail.subject}\n${mail.text}`).not.toMatch(/bestätigt|wirksam|gültig|confirmed|valid/i);
    }
  });
});
