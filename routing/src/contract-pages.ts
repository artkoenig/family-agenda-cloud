/**
 * The contract pages the Routing module serves (#214): `/cancel` and `/withdraw` with the receipt
 * each shows once its declaration came in, and `/delete`; the English ones under `/en`
 * (`CONTRACT_PATHS`). Their buttons' labels stay German on the English pages, which say in English
 * beside them what they mean. In the landing page's design system, like the sign-in pages.
 *
 * The `/cancel` page holds nothing but the fields § 312k BGB asks for, the end date to choose and
 * the button (BGH I ZR 200/25), and like every page here the legal footer. Receipts acknowledge
 * receipt only. Every value is escaped. The forms post to the page's own address. No I/O.
 */
import { CONTRACT_PATHS, dateOf, orderedContractOf, contractOf, timeOf, type Contract, type Language, type Person } from "./contract-wording";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "./legal-footer";
import { DESIGN_PATH } from "./sign-in-pages";

/** The holder's `/cancel`: `endDates` are the next ends of billing periods to choose from; the earliest is chosen. */
export type CancelPageValues = { holder: Person; contract: Contract; endDates: readonly [Date, ...Date[]] };

/** What `/cancel` shows once the Cancellation came in at `receivedAt`, ending the contract on `endsOn`. */
export type CancelReceiptValues = { holder: Person; contract: Contract; receivedAt: Date; endsOn: Date };

/** The holder's `/withdraw`. */
export type WithdrawPageValues = { holder: Person; contract: Contract };

/** What `/withdraw` shows once the Withdrawal came in at `receivedAt`. */
export type WithdrawReceiptValues = { holder: Person; contract: Contract; receivedAt: Date };

/**
 * `/delete` for the one Admin who may delete the Family; `exportHref` downloads its Export.
 * `subscription` if one is running, with the end of its withdrawal period while that lasts.
 */
export type DeletePageValues = { familyName: string; exportHref: string; subscription: { withdrawalPeriodEndsOn: Date | null } | null };

/** The name of the end date `/cancel` posts, as an ISO 8601 instant. */
export const END_DATE_FIELD = "end";

/** The name of `/delete`'s checkbox, `on` once ticked. */
export const UNDERSTOOD_FIELD = "understood";

/** A German button label and, on English pages, what it means. */
type Button = { label: string; note: string | null };

type Words = {
  cancel: {
    title: string;
    kind: [string, string];
    name: string;
    email: string;
    contract: string;
    endDate: string;
    button: Button;
    receipt: { title: string; content: (contract: string, name: string, end: string) => string; ends: (end: string) => string; mail: (email: string) => string };
  };
  withdraw: {
    title: string;
    name: string;
    email: string;
    contract: string;
    button: Button;
    receipt: { title: string; content: (orderedContract: string, name: string) => string; mail: (email: string) => string };
  };
  received: (date: string, time: string) => string;
  print: string;
  delete: {
    title: string;
    intro: (familyName: string) => string;
    when: string;
    stages: readonly string[];
    exportFirst: string;
    exportButton: string;
    subscription: string;
    withdrawInstead: (periodEnd: string) => string;
    understood: string;
    button: string;
  };
};

const WORDS: Record<Language, Words> = {
  de: {
    cancel: {
      title: "Kündigung",
      kind: ["Art der Kündigung:", "ordentliche Kündigung"],
      name: "Name:",
      email: "E-Mail für die Bestätigung:",
      contract: "Vertrag:",
      endDate: "Kündigen zum:",
      button: { label: "jetzt kündigen", note: null },
      receipt: {
        title: "Ihre Kündigung ist bei uns eingegangen.",
        content: (contract, name, end) => `Inhalt: Ordentliche Kündigung des Vertrags ${contract}, durch ${name}, zum ${end}.`,
        ends: (end) => `Der Vertrag endet am ${end}.`,
        mail: (email) => `Eine Bestätigung geht an ${email}.`,
      },
    },
    withdraw: {
      title: "Vertrag widerrufen",
      name: "Name:",
      email: "E-Mail für die Eingangsbestätigung:",
      contract: "Vertrag:",
      button: { label: "Widerruf bestätigen", note: null },
      receipt: {
        title: "Ihr Widerruf ist bei uns eingegangen.",
        content: (orderedContract, name) => `Inhalt: Widerruf des Vertrags ${orderedContract}, durch ${name}.`,
        mail: (email) => `Eine Eingangsbestätigung geht an ${email}.`,
      },
    },
    received: (date, time) => `Eingegangen am ${date} um ${time}.`,
    print: "Drucken / als PDF speichern",
    delete: {
      title: "Familie löschen",
      intro: (familyName) => `Wenn Sie die Familie ${familyName} löschen, ist sie sofort weg, für alle Mitglieder. Das lässt sich nicht rückgängig machen.`,
      when: "Was wann gelöscht wird:",
      stages: [
        "sofort: alle Agenden, Einträge, Quellen und ihre Zugangsdaten, gespeicherte Dateien und die Konten aller Admins",
        "nach spätestens 14 Tagen: die letzten Kopien in unseren Sicherungen",
        "nach 8 Jahren: Rechnungen, die wir aus steuerlichen Gründen aufbewahren müssen",
      ],
      exportFirst: "Laden Sie vorher den Export herunter, wenn Sie Ihre Daten behalten möchten.",
      exportButton: "Export herunterladen",
      subscription: "Das Löschen kündigt zugleich Ihr Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts.",
      withdrawInstead: (periodEnd) => `Sie können stattdessen bis zum ${periodEnd} den Vertrag widerrufen und erhalten dann alles Gezahlte zurück:`,
      understood: "Ich verstehe, dass alle Daten der Familie endgültig gelöscht werden.",
      button: "Familie endgültig löschen",
    },
  },
  en: {
    cancel: {
      title: "Cancellation",
      kind: ["Type of cancellation:", "ordinary cancellation"],
      name: "Name:",
      email: "Email for the confirmation:",
      contract: "Contract:",
      endDate: "Cancel as of:",
      button: { label: "jetzt kündigen", note: '(German for "cancel now")' },
      receipt: {
        title: "We have received your cancellation.",
        content: (contract, name, end) => `Content: ordinary cancellation of the contract ${contract}, by ${name}, as of ${end}.`,
        ends: (end) => `The contract ends on ${end}.`,
        mail: (email) => `A confirmation is on its way to ${email}.`,
      },
    },
    withdraw: {
      title: "Withdraw from the contract",
      name: "Name:",
      email: "Email for the acknowledgement:",
      contract: "Contract:",
      button: { label: "Widerruf bestätigen", note: '(German for "confirm withdrawal")' },
      receipt: {
        title: "We have received your withdrawal.",
        content: (orderedContract, name) => `Content: withdrawal from the contract ${orderedContract}, by ${name}.`,
        mail: (email) => `An acknowledgement is on its way to ${email}.`,
      },
    },
    received: (date, time) => `Received on ${date} at ${time}.`,
    print: "Print / save as PDF",
    delete: {
      title: "Delete family",
      intro: (familyName) => `If you delete the family ${familyName}, it is gone at once, for all members. This cannot be undone.`,
      when: "What is deleted when:",
      stages: [
        "at once: all agendas, entries, sources and their credentials, stored files and the accounts of all Admins",
        "after 14 days at the latest: the last copies in our backups",
        "after 8 years: invoices we must keep for tax reasons",
      ],
      exportFirst: "Download the export first if you want to keep your data.",
      exportButton: "Download export",
      subscription: "Deleting also cancels your subscription at the earliest possible date. We refund nothing beyond that.",
      withdrawInstead: (periodEnd) => `Instead, you can withdraw from the contract until ${periodEnd} and get everything you paid back:`,
      understood: "I understand that all of the family's data will be deleted for good.",
      button: "Delete family for good",
    },
  },
};

/** `/cancel`: the § 312k fields, the end date to choose and „jetzt kündigen“; nothing else. */
export function cancelPage(language: Language, { holder, contract, endDates }: CancelPageValues): string {
  const { cancel } = WORDS[language];
  const options = [...endDates]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((end, index) => `<option value="${end.toISOString()}"${index === 0 ? " selected" : ""}>${escape(dateOf(end, language))}</option>`)
    .join("");
  const endDate = `<select id="${END_DATE_FIELD}" name="${END_DATE_FIELD}">${options}</select>`;
  const rows = fields([
    [escape(cancel.kind[0]), escape(cancel.kind[1])],
    [escape(cancel.name), escape(holder.name)],
    [escape(cancel.email), escape(holder.email)],
    [escape(cancel.contract), escape(orderedContractOf(contract, language))],
    [`<label for="${END_DATE_FIELD}">${escape(cancel.endDate)}</label>`, endDate],
  ]);
  return page(language, cancel.title, `<form method="post">\n${rows}\n${submit(cancel.button)}\n</form>`);
}

/** What `/cancel` shows once the Cancellation came in. */
export function cancelReceiptPage(language: Language, { holder, contract, receivedAt, endsOn }: CancelReceiptValues): string {
  const words = WORDS[language];
  const { receipt } = words.cancel;
  const end = dateOf(endsOn, language);
  const lines = [received(language, receivedAt), receipt.content(contractOf(contract, language), holder.name, end), receipt.ends(end), receipt.mail(holder.email)];
  return page(language, receipt.title, `${paragraphs(lines)}\n${printButton(words.print)}`);
}

/** `/withdraw`: the holder, the contract and „Widerruf bestätigen“. */
export function withdrawPage(language: Language, { holder, contract }: WithdrawPageValues): string {
  const { withdraw } = WORDS[language];
  const rows = fields([
    [escape(withdraw.name), escape(holder.name)],
    [escape(withdraw.email), escape(holder.email)],
    [escape(withdraw.contract), escape(orderedContractOf(contract, language))],
  ]);
  return page(language, withdraw.title, `<form method="post">\n${rows}\n${submit(withdraw.button)}\n</form>`);
}

/** What `/withdraw` shows once the Withdrawal came in. */
export function withdrawReceiptPage(language: Language, { holder, contract, receivedAt }: WithdrawReceiptValues): string {
  const words = WORDS[language];
  const { receipt } = words.withdraw;
  const lines = [received(language, receivedAt), receipt.content(orderedContractOf(contract, language), holder.name), receipt.mail(holder.email)];
  return page(language, receipt.title, `${paragraphs(lines)}\n${printButton(words.print)}`);
}

/** `/delete`: what goes when, the Export first, and „Familie endgültig löschen“, active only once the checkbox is ticked. */
export function deletePage(language: Language, { familyName, exportHref, subscription }: DeletePageValues): string {
  const words = WORDS[language].delete;
  const stages = words.stages.map((stage) => `<li>${escape(stage)}</li>`).join("\n");
  const body = [
    `<p>${escape(words.intro(familyName))}</p>`,
    `<p>${escape(words.when)}</p>\n<ul>\n${stages}\n</ul>`,
    `<p>${escape(words.exportFirst)}</p>\n<p class="action"><a class="fam-button fam-button--secondary" href="${escape(exportHref)}">${escape(words.exportButton)}</a></p>`,
    subscriptionNote(language, subscription),
    `<form method="post">
<p class="understood"><input type="checkbox" id="${UNDERSTOOD_FIELD}" name="${UNDERSTOOD_FIELD}" required onchange="this.form.elements.namedItem('delete').disabled=!this.checked"> <label for="${UNDERSTOOD_FIELD}">${escape(words.understood)}</label></p>
<p class="action"><button class="fam-button fam-button--danger" type="submit" name="delete" disabled>${escape(words.button)}</button></p>
</form>`,
  ];
  return page(language, words.title, body.filter((part) => part !== null).join("\n"));
}

/** What deleting does to a running Subscription, and while it can still be withdrawn, the way to. */
function subscriptionNote(language: Language, subscription: DeletePageValues["subscription"]): string | null {
  if (subscription === null) return null;
  const words = WORDS[language].delete;
  const periodEnd = subscription.withdrawalPeriodEndsOn;
  if (periodEnd === null) return `<p>${escape(words.subscription)}</p>`;
  const link = `<a href="${CONTRACT_PATHS.withdraw[language]}">Vertrag widerrufen</a>`;
  return `<p>${escape(words.subscription)} ${escape(words.withdrawInstead(dateOf(periodEnd, language)))} ${link}.</p>`;
}

function received(language: Language, receivedAt: Date): string {
  return WORDS[language].received(dateOf(receivedAt, language), timeOf(receivedAt, language));
}

/** Label and value per row, both HTML. */
function fields(rows: readonly (readonly [string, string])[]): string {
  return `<dl class="fields">\n${rows.map(([label, value]) => `<div><dt>${label}</dt> <dd>${value}</dd></div>`).join("\n")}\n</dl>`;
}

function paragraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escape(line)}</p>`).join("\n");
}

function submit({ label, note }: Button): string {
  const meaning = note === null ? "" : ` <span class="note">${escape(note)}</span>`;
  return `<p class="action"><button class="fam-button fam-button--primary" type="submit">${escape(label)}</button>${meaning}</p>`;
}

function printButton(label: string): string {
  return `<p class="action no-print"><button class="fam-button fam-button--secondary" type="button" onclick="window.print()">${escape(label)}</button></p>`;
}

/** The whole HTML document: the title, the body and the legal footer. */
function page(language: Language, title: string, body: string): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · Family Agenda</title>
<link rel="stylesheet" href="${DESIGN_PATH}/tokens.css">
<link rel="stylesheet" href="${DESIGN_PATH}/design.css">
<style>${STYLE}</style>
</head>
<body class="fam-page">
<main class="card">
<h1>${escape(title)}</h1>
${body}
</main>
${legalFooterHtml(language)}
</body>
</html>
`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text as HTML, also inside an attribute's quotes. */
export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** The card around a page, the fields as rows, and no buttons on paper; everything else comes from the design system. */
const STYLE = `
body{display:grid;place-items:center;gap:16px;padding:24px 16px}
.card{max-width:560px;width:100%;padding:28px;background:var(--surface-raised);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-raised)}
h1{margin:0 0 16px;font-size:26px;line-height:32px}
p,li{margin:0 0 8px;color:var(--ink-muted)}
.fields{margin:0}
.fields div{margin:0 0 8px}
.fields dt,.fields dd{display:inline;margin:0}
.fields dt{color:var(--ink-muted)}
.fields dd{color:var(--ink);font-weight:600}
.action{margin-top:20px}
.note{margin-left:8px;color:var(--ink-muted)}
.understood{margin-top:20px}
@media print{.no-print{display:none}.card{border:0;box-shadow:none}}
${LEGAL_FOOTER_STYLE}
`;
