import { describe, expect, it } from "vitest";
import { confirmationMail, type ConfirmationMailValues, type LegalImprint } from "../../src/confirmation-mail";
import type { Billing, Language } from "../../src/contract-wording";
import { confirmationLegalTexts } from "../../src/legal-site";

const imprint: LegalImprint = { name: "Erika Betreiberin", postalAddress: "Postfach 12, 10115 Berlin", stand: "1. Dezember 2026" };

/** Ordered at 23:30 Berlin time on 5 March, the last day of the withdrawal period the 19th. */
const values = (billing: Billing): ConfirmationMailValues => ({
  holder: { name: "Erika Muster", email: "erika@example.org" },
  contract: { billing, familyName: "Muster", orderedOn: new Date("2026-03-05T22:30:00Z") },
  firstPaymentAt: new Date("2026-03-07T22:30:00Z"),
});

/** Stand-ins for the legal texts, attached as PDFs. */
const legal = {
  agb: "# Allgemeine Geschäftsbedingungen\n\nStand: {{STAND}}\n\n## § 1 Anbieter\n\n**{{NAME}}**, {{POSTFLEX_ADDRESS}}\n",
  withdrawal: "# Widerrufsbelehrung\n\n## Muster-Widerrufsformular\n\n– An {{NAME}}, {{POSTFLEX_ADDRESS}}\n\n(\\*) Unzutreffendes streichen.\n",
};

/** Whether `content` is a whole PDF file. */
const isPdf = (content: Buffer) => content.subarray(0, 5).toString("latin1") === "%PDF-" && content.toString("latin1").trimEnd().endsWith("%%EOF");

/** The signature separator mail programs know, with its trailing space. */
const SEPARATOR = "-- ";

const FOOTER: Record<Language, string> = {
  de: `${SEPARATOR}
Family Agenda Cloud · Erika Betreiberin · Postfach 12, 10115 Berlin
Impressum: https://family-agenda.cloud/impressum
Support: support@family-agenda.cloud
`,
  en: `${SEPARATOR}
Family Agenda Cloud · Erika Betreiberin · Postfach 12, 10115 Berlin
Imprint: https://family-agenda.cloud/en/imprint
Support: support@family-agenda.cloud
`,
};

describe("confirmationMail", () => {
  it("thanks the Contract holder for a monthly Subscription and confirms it, from support with Reply-To support, in German, by du", async () => {
    const { html, attachments, ...mail } = await confirmationMail("de", values("monthly"), legal, imprint);

    expect(mail).toEqual({
      from: "Family Agenda Cloud <support@family-agenda.cloud>",
      replyTo: "support@family-agenda.cloud",
      to: "erika@example.org",
      subject: "Danke für deine Bestellung – deine Vertragsbestätigung von Family Agenda Cloud",
      text: `Hallo Erika Muster,

herzlichen Dank für deine Bestellung! Wir freuen uns sehr, dass Family Agenda Cloud deiner Familie den Alltag ein Stück leichter machen darf. Mit deinem Abo unterstützt du direkt, dass Family Agenda Cloud weiter wächst und besser wird.

Hiermit bestätigen wir deinen Vertrag:

Vertragsinhaber: Erika Muster, erika@example.org
Tarif: Family Agenda Cloud, Monatsabo
Preis: 4,99 € pro Monat inkl. USt.
Bestellt am: 05.03.2026 um 23:30 Uhr
Erste Zahlung am: 07.03.2026
Laufzeit und Kündigung: ein Monat, verlängert sich jeweils um einen Monat, jederzeit zum Monatsende kündbar.
Widerrufsfrist: bis einschließlich 19.03.2026

Du bleibst flexibel: Kündigen kannst du jederzeit, widerrufen innerhalb der Widerrufsfrist – beides ganz einfach online.
Verträge hier kündigen: https://app.family-agenda.cloud/cancel
Vertrag widerrufen: https://app.family-agenda.cloud/withdraw
Zahlungsart und Rechnungen findest du im Admin-Bereich unter „Abonnement“.

Im Anhang findest du unsere AGB sowie die Widerrufsbelehrung mit dem Muster-Widerrufsformular als PDF. Bitte bewahre diese E-Mail auf.

Hast du Fragen, Wünsche oder Ideen? Antworte einfach auf diese E-Mail – ich lese jede Nachricht persönlich.

Herzliche Grüße
Erika Betreiberin
Family Agenda Cloud

${FOOTER.de}`,
    });
    expect(html).toBeDefined();
    expect(attachments).toHaveLength(2);
  });

  it("words a yearly Subscription's tariff, price and term in German", async () => {
    const { text } = await confirmationMail("de", values("yearly"), legal, imprint);

    expect(text).toContain(`Tarif: Family Agenda Cloud, Jahresabo
Preis: 49,90 € pro Jahr inkl. USt.
Bestellt am: 05.03.2026 um 23:30 Uhr
Erste Zahlung am: 07.03.2026
Laufzeit und Kündigung: ein Jahr, verlängert sich jeweils um ein Jahr; kündbar zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung.
Widerrufsfrist: bis einschließlich 19.03.2026
`);
  });

  it("thanks and confirms in English, naming the German texts attached binding and where their translations are", async () => {
    const { html, attachments, ...mail } = await confirmationMail("en", values("monthly"), legal, imprint);

    expect(mail).toEqual({
      from: "Family Agenda Cloud <support@family-agenda.cloud>",
      replyTo: "support@family-agenda.cloud",
      to: "erika@example.org",
      subject: "Thank you for your order – your Family Agenda Cloud contract confirmation",
      text: `Hello Erika Muster,

thank you so much for your order! We are delighted that Family Agenda Cloud gets to make your family's everyday life a little easier. Your subscription directly helps Family Agenda Cloud grow and get better.

This email confirms your contract:

Contract holder: Erika Muster, erika@example.org
Plan: Family Agenda Cloud, monthly subscription
Price: €4.99 per month, VAT included
Ordered on: 5 March 2026 at 23:30 (Berlin time)
First payment on: 7 March 2026
Term and cancellation: one month, renewing for one month at a time, cancellable any time with effect from the end of the month.
Withdrawal period: until and including 19 March 2026

You stay flexible: you can cancel at any time and withdraw within the withdrawal period – both easily online.
Cancel contracts here: https://app.family-agenda.cloud/en/cancel
Withdraw from contract: https://app.family-agenda.cloud/en/withdraw
Your payment method and invoices are in the Admin area under "Subscription".

Attached as PDFs are our terms and the withdrawal policy with the model withdrawal form. The contract language is German, so these are the binding German texts. Please keep this email.
English translations: https://family-agenda.cloud/en/terms and https://family-agenda.cloud/en/withdrawal

Any questions, wishes or ideas? Just reply to this email – I read every message personally.

Warm regards,
Erika Betreiberin
Family Agenda Cloud

${FOOTER.en}`,
    });
    expect(html).toBeDefined();
    expect(attachments).toHaveLength(2);
  });

  it("words a yearly Subscription's plan, price and term in English", async () => {
    const { text } = await confirmationMail("en", values("yearly"), legal, imprint);

    expect(text).toContain(`Plan: Family Agenda Cloud, yearly subscription
Price: €49.90 per year, VAT included
Ordered on: 5 March 2026 at 23:30 (Berlin time)
First payment on: 7 March 2026
Term and cancellation: one year, renewing for one year at a time; cancellable with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund.
Withdrawal period: until and including 19 March 2026
`);
  });

  it.each([
    ["de", "https://app.family-agenda.cloud/cancel", "Verträge hier kündigen", "https://app.family-agenda.cloud/withdraw", "Vertrag widerrufen"],
    ["en", "https://app.family-agenda.cloud/en/cancel", "Cancel contracts here", "https://app.family-agenda.cloud/en/withdraw", "Withdraw from contract"],
  ] as const)("shows the contract in Family Agenda's look in %s, cancelling and withdrawing as buttons", async (language, cancel, cancelLabel, withdraw, withdrawLabel) => {
    const { html } = await confirmationMail(language, values("monthly"), legal, imprint);
    const buttons = [...(html ?? "").matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => [href, label?.trim()]);

    expect(html).toMatch(new RegExp(`^<!doctype html>\\s*<html lang="${language}">`, "i"));
    expect(buttons).toEqual(expect.arrayContaining([[cancel, cancelLabel], [withdraw, withdrawLabel]]));
    expect(html).toContain("Erika Muster, erika@example.org");
  });

  it("names no Family in either text: its id tells the holder nothing", async () => {
    const mail = await confirmationMail("de", { ...values("monthly"), contract: { ...values("monthly").contract, familyName: "fam-7x2k" } }, legal, imprint);

    expect(mail.text).not.toContain("fam-7x2k");
    expect(mail.html).not.toContain("fam-7x2k");
  });

  it("escapes the names it shows in its HTML", async () => {
    const holder = { name: "Erika <b>Muster</b> & Co", email: "erika@example.org" };
    const { html } = await confirmationMail("de", { ...values("monthly"), holder }, legal, { ...imprint, name: "Erika <i>Betreiberin</i>" });

    expect(html).toContain("Erika &lt;b&gt;Muster&lt;/b&gt; &amp; Co");
    expect(html).toContain("Erika &lt;i&gt;Betreiberin&lt;/i&gt;");
    expect(html).not.toMatch(/<b>|<i>/);
  });

  it.each(["de", "en"] as const)("attaches the German AGB and Widerrufsbelehrung as PDFs to the %s mail", async (language) => {
    const { attachments } = await confirmationMail(language, values("monthly"), legal, imprint);

    expect(attachments?.map(({ filename, contentType }) => [filename, contentType])).toEqual([
      ["Family-Agenda-Cloud-AGB.pdf", "application/pdf"],
      ["Family-Agenda-Cloud-Widerrufsbelehrung.pdf", "application/pdf"],
    ]);
    for (const { content } of attachments ?? []) expect(isPdf(content)).toBe(true);
  });

  it("refuses a legal text whose placeholder the imprint has no value for", async () => {
    await expect(confirmationMail("de", values("monthly"), { ...legal, agb: "# AGB\n\n{{GERICHTSSTAND}}\n" }, imprint)).rejects.toThrow("GERICHTSSTAND");
  });
});

describe("confirmationMail with the legal texts of site/legal/", () => {
  it.each(["de", "en"] as const)("fills every placeholder of the AGB and Widerrufsbelehrung for the %s mail's PDFs", async (language) => {
    const { attachments } = await confirmationMail(language, values("monthly"), confirmationLegalTexts(), imprint);

    expect(attachments).toHaveLength(2);
    for (const { content } of attachments ?? []) expect(isPdf(content)).toBe(true);
  });
});
