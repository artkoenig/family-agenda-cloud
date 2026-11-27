/**
 * The contract confirmation mail of § 312f BGB (#215), which the `checkout.session.completed`
 * webhook sends to the Contract holder once per Subscription: thanks for the order, the contract's
 * terms, buttons to cancel and withdraw, in Family Agenda's look and in plain text; the German AGB
 * and Widerrufsbelehrung with the Muster-Widerrufsformular, binding in either language, as PDF
 * attachments. The legal texts come in as Markdown, read at send time (`confirmationLegalTexts` in
 * legal-site.ts), so the mail carries the current ones. No I/O.
 */
import { MAIL_FROM, MAIL_REPLY_TO, type Imprint } from "./contract-mails";
import { amountOf, CONTRACT_PATHS, dateAfter, dateOf, PRICE_CENTS, timeOf, type Billing, type Contract, type Language, type Person } from "./contract-wording";
import { APP_URL } from "./legal-pages";
import { legalPdf } from "./legal-pdf";
import { escapeHtml, SITE_URL } from "./legal-texts";
import { ACCENT_INK, mailButton, mailDocument, MUTED, SUNKEN } from "./mail-card";
import type { MailAttachment, OutboxMail } from "./outbox";

/** The Markdown of `site/legal/agb.de.md` and `site/legal/widerrufsbelehrung.de.md`. */
export type ConfirmationLegalTexts = { agb: string; withdrawal: string };

/** The Operator's imprint and the AGB's date (`Stand`), for the placeholders of the legal texts and the footer. */
export type LegalImprint = Imprint & { stand: string };

/** A Subscription ordered at `contract.orderedOn` by `holder`, first paid at `firstPaymentAt`. */
export type ConfirmationMailValues = { holder: Person; contract: Contract; firstPaymentAt: Date };

/** The facts of the contract, formatted. */
type Facts = { holder: Person; billing: Billing; price: string; ordered: { date: string; time: string }; firstPayment: string; withdrawUntil: string };

/** A row of the contract's facts: its label and its value. */
type Fact = readonly [label: string, value: string];

type Words = {
  subject: string;
  heading: string;
  greeting: (name: string) => string;
  thanks: string;
  confirms: string;
  facts: (facts: Facts) => readonly Fact[];
  online: string;
  cancel: { label: string; path: string };
  withdraw: { label: string; path: string };
  payment: string;
  attached: string;
  /** For the plain text only: where the translations are, after `attached`. */
  translations?: string;
  questions: string;
  regards: string;
  imprint: { label: string; url: string };
};

const BILLING: Record<Language, Record<Billing, { name: string; price: (price: string) => string; term: string }>> = {
  de: {
    monthly: { name: "Monatsabo", price: (price) => `${price} pro Monat`, term: "ein Monat, verlängert sich jeweils um einen Monat, jederzeit zum Monatsende kündbar." },
    yearly: {
      name: "Jahresabo",
      price: (price) => `${price} pro Jahr`,
      term: "ein Jahr, verlängert sich jeweils um ein Jahr; kündbar zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung.",
    },
  },
  en: {
    monthly: { name: "monthly subscription", price: (price) => `${price} per month`, term: "one month, renewing for one month at a time, cancellable any time with effect from the end of the month." },
    yearly: {
      name: "yearly subscription",
      price: (price) => `${price} per year`,
      term: "one year, renewing for one year at a time; cancellable with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund.",
    },
  },
};

const WORDS: Record<Language, Words> = {
  de: {
    subject: "Danke für deine Bestellung – deine Vertragsbestätigung von Family Agenda Cloud",
    heading: "Schön, dass du dabei bist!",
    greeting: (name) => `Hallo ${name},`,
    thanks:
      "herzlichen Dank für deine Bestellung! Wir freuen uns sehr, dass Family Agenda Cloud deiner Familie den Alltag ein Stück leichter machen darf. Mit deinem Abo unterstützt du direkt, dass Family Agenda Cloud weiter wächst und besser wird.",
    confirms: "Hiermit bestätigen wir deinen Vertrag:",
    facts: ({ holder, billing, price, ordered, firstPayment, withdrawUntil }) => [
      ["Vertragsinhaber", `${holder.name}, ${holder.email}`],
      ["Tarif", `Family Agenda Cloud, ${BILLING.de[billing].name}`],
      ["Preis", `${BILLING.de[billing].price(price)} inkl. USt.`],
      ["Bestellt am", `${ordered.date} um ${ordered.time}`],
      ["Erste Zahlung am", firstPayment],
      ["Laufzeit und Kündigung", BILLING.de[billing].term],
      ["Widerrufsfrist", `bis einschließlich ${withdrawUntil}`],
    ],
    online: "Du bleibst flexibel: Kündigen kannst du jederzeit, widerrufen innerhalb der Widerrufsfrist – beides ganz einfach online.",
    cancel: { label: "Verträge hier kündigen", path: CONTRACT_PATHS.cancel.de },
    withdraw: { label: "Vertrag widerrufen", path: CONTRACT_PATHS.withdraw.de },
    payment: "Zahlungsart und Rechnungen findest du im Admin-Bereich unter „Abonnement“.",
    attached: "Im Anhang findest du unsere AGB sowie die Widerrufsbelehrung mit dem Muster-Widerrufsformular als PDF. Bitte bewahre diese E-Mail auf.",
    questions: "Hast du Fragen, Wünsche oder Ideen? Antworte einfach auf diese E-Mail – ich lese jede Nachricht persönlich.",
    regards: "Herzliche Grüße",
    imprint: { label: "Impressum", url: `${SITE_URL}/impressum` },
  },
  en: {
    subject: "Thank you for your order – your Family Agenda Cloud contract confirmation",
    heading: "Great to have you with us!",
    greeting: (name) => `Hello ${name},`,
    thanks:
      "thank you so much for your order! We are delighted that Family Agenda Cloud gets to make your family's everyday life a little easier. Your subscription directly helps Family Agenda Cloud grow and get better.",
    confirms: "This email confirms your contract:",
    facts: ({ holder, billing, price, ordered, firstPayment, withdrawUntil }) => [
      ["Contract holder", `${holder.name}, ${holder.email}`],
      ["Plan", `Family Agenda Cloud, ${BILLING.en[billing].name}`],
      ["Price", `${BILLING.en[billing].price(price)}, VAT included`],
      ["Ordered on", `${ordered.date} at ${ordered.time}`],
      ["First payment on", firstPayment],
      ["Term and cancellation", BILLING.en[billing].term],
      ["Withdrawal period", `until and including ${withdrawUntil}`],
    ],
    online: "You stay flexible: you can cancel at any time and withdraw within the withdrawal period – both easily online.",
    cancel: { label: "Cancel contracts here", path: CONTRACT_PATHS.cancel.en },
    withdraw: { label: "Withdraw from contract", path: CONTRACT_PATHS.withdraw.en },
    payment: 'Your payment method and invoices are in the Admin area under "Subscription".',
    attached:
      "Attached as PDFs are our terms and the withdrawal policy with the model withdrawal form. The contract language is German, so these are the binding German texts. Please keep this email.",
    translations: "English translations: https://family-agenda.cloud/en/terms and https://family-agenda.cloud/en/withdrawal",
    questions: "Any questions, wishes or ideas? Just reply to this email – I read every message personally.",
    regards: "Warm regards,",
    imprint: { label: "Imprint", url: `${SITE_URL}/en/imprint` },
  },
};

const BRAND = "Family Agenda Cloud";
const SUPPORT = "support@family-agenda.cloud";

/** The attachments' names, as mail programs show them. */
export const ATTACHMENTS = { agb: "Family-Agenda-Cloud-AGB.pdf", withdrawal: "Family-Agenda-Cloud-Widerrufsbelehrung.pdf" } as const;

/** The confirmation mail to the Contract holder, in `language`, with the German legal texts as PDFs, their placeholders filled from `imprint`. */
export async function confirmationMail(language: Language, values: ConfirmationMailValues, legal: ConfirmationLegalTexts, imprint: LegalImprint): Promise<OutboxMail> {
  const words = WORDS[language];
  const { holder, contract, firstPaymentAt } = values;
  const { orderedOn, billing } = contract;
  const facts = words.facts({
    holder,
    billing,
    price: amountOf(PRICE_CENTS[billing], language),
    ordered: { date: dateOf(orderedOn, language), time: timeOf(orderedOn, language) },
    firstPayment: dateOf(firstPaymentAt, language),
    withdrawUntil: dateAfter(orderedOn, 14, language),
  });
  const paragraphs = [
    [words.greeting(holder.name)],
    [words.thanks],
    [words.confirms],
    facts.map(([label, value]) => `${label}: ${value}`),
    [words.online, `${words.cancel.label}: ${APP_URL}${words.cancel.path}`, `${words.withdraw.label}: ${APP_URL}${words.withdraw.path}`, words.payment],
    words.translations === undefined ? [words.attached] : [words.attached, words.translations],
    [words.questions],
    [words.regards, imprint.name, BRAND],
    ["-- ", `${BRAND} · ${imprint.name} · ${imprint.postalAddress}`, `${words.imprint.label}: ${words.imprint.url}`, `Support: ${SUPPORT}`],
  ];
  const text = { from: MAIL_FROM, replyTo: MAIL_REPLY_TO, to: holder.email, subject: words.subject, text: `${paragraphs.map((lines) => lines.join("\n")).join("\n\n")}\n` };
  return { ...text, html: html(language, words, holder, facts, imprint), attachments: await attachments(legal, imprint) };
}

function html(language: Language, words: Words, holder: Person, facts: readonly Fact[], imprint: LegalImprint): string {
  const paragraph = (content: string, style = "") => `<p style="margin:0 0 14px;${style}">${content}</p>`;
  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;border-top:1px solid #e6dccd;font-size:13px;line-height:1.45;color:${MUTED};">${escapeHtml(label)}</td></tr>
<tr><td style="padding:0 0 6px;font-size:14.5px;line-height:1.45;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("\n");
  const content = [
    paragraph(escapeHtml(words.greeting(holder.name))),
    paragraph(escapeHtml(words.thanks)),
    paragraph(escapeHtml(words.confirms), "margin-bottom:10px;"),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${SUNKEN};border-radius:10px;"><tr><td style="padding:8px 16px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
</table></td></tr></table>`,
    paragraph(escapeHtml(words.online), "margin-bottom:12px;"),
    `<div style="margin:0 0 6px;">${mailButton(`${APP_URL}${words.cancel.path}`, escapeHtml(words.cancel.label), true)}${mailButton(`${APP_URL}${words.withdraw.path}`, escapeHtml(words.withdraw.label), true)}</div>`,
    paragraph(escapeHtml(words.payment)),
    paragraph(`📎 ${escapeHtml(words.attached)}`, `font-size:13.5px;line-height:1.5;color:${MUTED};`),
    paragraph(escapeHtml(words.questions)),
    paragraph(`${escapeHtml(words.regards)}<br><strong>${escapeHtml(imprint.name)}</strong><br>${BRAND}`, "margin:0;"),
  ].join("\n");
  const footer = `${BRAND} · ${escapeHtml(imprint.name)} · ${escapeHtml(imprint.postalAddress)}<br><a href="${words.imprint.url}" style="color:${ACCENT_INK};">${words.imprint.label}</a> · <a href="mailto:${SUPPORT}" style="color:${ACCENT_INK};">${SUPPORT}</a>`;
  return mailDocument(language, { subject: escapeHtml(words.subject), preview: escapeHtml(`${words.greeting(holder.name)} ${words.thanks}`), heading: escapeHtml(words.heading), content, footer });
}

async function attachments(legal: ConfirmationLegalTexts, imprint: LegalImprint): Promise<MailAttachment[]> {
  const values = { NAME: imprint.name, POSTFLEX_ADDRESS: imprint.postalAddress, STAND: imprint.stand };
  const pdf = async (filename: string, markdown: string, title: string) => ({ filename, contentType: "application/pdf", content: await legalPdf(markdown, values, title) });
  return [await pdf(ATTACHMENTS.agb, legal.agb, "Allgemeine Geschäftsbedingungen"), await pdf(ATTACHMENTS.withdrawal, legal.withdrawal, "Widerrufsbelehrung")];
}
