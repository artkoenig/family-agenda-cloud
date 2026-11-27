/**
 * The contract pages the Routing module serves (#214): `/cancel` and `/withdraw` with the receipt
 * each shows once its declaration came in, and `/delete`; the English ones under `/en`
 * (`CONTRACT_PATHS`), each in its language: the English buttons read what § 312k and § 356a BGB
 * have in German. In the landing page's design system, like the sign-in pages.
 *
 * The `/cancel` page holds nothing but the fields § 312k BGB asks for, the end date to choose and
 * the button (BGH I ZR 200/25), and like every page here the legal footer. Every other page leads
 * back to the Family. Receipts acknowledge receipt only. Every value is escaped. The forms post to the page's own address, each with the
 * session's token in a hidden field (#229). No page has an inline handler: the print button and
 * `/delete`'s checkbox work by `SCRIPT_PATH`, which only their pages load. No I/O.
 */
import { BILLING, CONTRACT_LINKS, CONTRACT_PATHS, cancelledLine, dateOf, holderLine, timeOf, type Contract, type Language, type Person } from "./contract-wording";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "./legal-footer";
import { DESIGN_PATH, SUPPORT_LINK } from "./sign-in-pages";

/** The holder's `/cancel`: `endDates` are the next ends of billing periods to choose from; the earliest is chosen. */
export type CancelPageValues = { holder: Person; contract: Contract; endDates: readonly [Date, ...Date[]]; csrf: string };

/** The holder's `/cancel` while a Cancellation to `endsOn` is pending. */
export type CancelledPageValues = { endsOn: Date; csrf: string };

/** What `/cancel` shows once the Cancellation came in at `receivedAt`, ending the contract on `endsOn`. */
export type CancelReceiptValues = { holder: Person; contract: Contract; receivedAt: Date; endsOn: Date };

/** The holder's `/withdraw`. */
export type WithdrawPageValues = { holder: Person; contract: Contract; csrf: string };

/** What `/withdraw` shows once the Withdrawal came in at `receivedAt`. */
export type WithdrawReceiptValues = { holder: Person; contract: Contract; receivedAt: Date };

/**
 * `/delete` for the one Admin who may delete the Family; `exportHref` downloads its Export.
 * `subscription` if one is running, with the end of its withdrawal period while that lasts.
 */
export type DeletePageValues = { exportHref: string; subscription: { withdrawalPeriodEndsOn: Date | null } | null; csrf: string };

/** The name of the end date `/cancel` posts, as an ISO 8601 instant. */
export const END_DATE_FIELD = "end";

/** The name of the field the button taking a Cancellation back posts. */
export const UNDO_FIELD = "undo";

/** The name of the hidden field every form posts the session's token in. */
export const CSRF_FIELD = "csrf";

/** The script behind the print button and `/delete`'s checkbox: `site/contract.js`, served with the design system. */
export const SCRIPT_PATH = `${DESIGN_PATH}/contract.js`;

/** The name of `/delete`'s checkbox, `on` once ticked. */
export const UNDERSTOOD_FIELD = "understood";

/** A row of a page's fields: its label and its value, both text. */
type Row = readonly [string, string];

type Words = {
  cancel: {
    title: string;
    kind: Row;
    name: string;
    email: string;
    endDate: string;
    button: string;
    receipt: { title: string; ends: string; mail: (email: string) => string };
    nothing: string;
    failed: { title: string; line: string };
  };
  withdraw: {
    title: string;
    name: string;
    email: string;
    button: string;
    receipt: { title: string; kind: Row; mail: (email: string) => string };
    nothing: string;
    noHolder: string;
    failed: { title: string; line: string };
  };
  contract: { contract: string; orderedOn: string };
  receipt: { receivedAt: string; by: string };
  support: string;
  print: string;
  toFamily: string;
  abort: string;
  delete: {
    title: string;
    intro: string;
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
      kind: ["Art der Kündigung", "ordentliche Kündigung"],
      name: "Name",
      email: "E-Mail für die Bestätigung",
      endDate: "Kündigen zum",
      button: "jetzt kündigen",
      receipt: {
        title: "Deine Kündigung ist bei uns eingegangen.",
        ends: "Vertragsende",
        mail: (email) => `Eine Bestätigung geht an ${email}.`,
      },
      nothing: "Für diese Familie läuft kein Abonnement, das gekündigt werden kann.",
      failed: {
        title: "Das hat gerade nicht geklappt",
        line: "Deine Erklärung konnte gerade nicht entgegengenommen werden. Es wurde nichts geändert. Bitte versuch es in einigen Minuten erneut.",
      },
    },
    withdraw: {
      title: "Vertrag widerrufen",
      name: "Name",
      email: "E-Mail für die Eingangsbestätigung",
      button: "Widerruf bestätigen",
      receipt: {
        title: "Dein Widerruf ist bei uns eingegangen.",
        kind: ["Erklärung", "Widerruf des Vertrags"],
        mail: (email) => `Eine Eingangsbestätigung geht an ${email}.`,
      },
      nothing: "Für diese Familie gibt es kein Abonnement, das widerrufen werden kann.",
      noHolder: "Für diese Familie ist nicht hinterlegt, wer den Vertrag widerrufen kann.",
      failed: {
        title: "Das hat gerade nicht geklappt",
        line: "Deine Erklärung konnte gerade nicht entgegengenommen werden. Bitte versuch es in einigen Minuten erneut.",
      },
    },
    contract: { contract: "Vertrag", orderedOn: "Bestellt am" },
    receipt: { receivedAt: "Eingegangen am", by: "Erklärt von" },
    support: "Fragen? Schreib uns:",
    print: "Drucken / als PDF speichern",
    toFamily: "Zur Familie",
    abort: "Abbrechen",
    delete: {
      title: "Familie löschen",
      intro: "Wenn du deine Familie löschst, wird sie sofort für alle Mitglieder gelöscht. Das lässt sich nicht rückgängig machen.",
      when: "Was wann gelöscht wird:",
      stages: [
        "sofort: alle Agenden, Einträge, Quellen und ihre Zugangsdaten, gespeicherte Dateien und die Konten aller Admins",
        "nach spätestens 14 Tagen: die letzten Kopien in unseren Sicherungen",
        "nach 8 Jahren: Rechnungen, die wir aus steuerlichen Gründen aufbewahren müssen",
      ],
      exportFirst: "Lade vorher den Export herunter, wenn du deine Daten behalten möchtest.",
      exportButton: "Export herunterladen",
      subscription: "Das Löschen kündigt zugleich dein Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts.",
      withdrawInstead: (periodEnd) => `Du kannst stattdessen bis zum ${periodEnd} den Vertrag widerrufen und erhältst dann alles Gezahlte zurück:`,
      understood: "Ich verstehe, dass alle Daten der Familie endgültig gelöscht werden.",
      button: "Familie endgültig löschen",
    },
  },
  en: {
    cancel: {
      title: "Cancellation",
      kind: ["Type of cancellation", "ordinary cancellation"],
      name: "Name",
      email: "Email for the confirmation",
      endDate: "Cancel with effect from",
      button: "Cancel now",
      receipt: {
        title: "We have received your cancellation.",
        ends: "Contract ends on",
        mail: (email) => `A confirmation is on its way to ${email}.`,
      },
      nothing: "This family has no running subscription that could be cancelled.",
      failed: {
        title: "That did not work just now",
        line: "We could not take your declaration just now. Nothing was changed. Please try again in a few minutes.",
      },
    },
    withdraw: {
      title: "Withdraw from contract",
      name: "Name",
      email: "Email for the acknowledgement",
      button: "Confirm withdrawal",
      receipt: {
        title: "We have received your withdrawal.",
        kind: ["Declaration", "Withdrawal from the contract"],
        mail: (email) => `An acknowledgement is on its way to ${email}.`,
      },
      nothing: "This family has no subscription that could be withdrawn from.",
      noHolder: "There is no record of who can withdraw from the contract for this family.",
      failed: {
        title: "That did not work just now",
        line: "We could not take your declaration just now. Please try again in a few minutes.",
      },
    },
    contract: { contract: "Contract", orderedOn: "Ordered on" },
    receipt: { receivedAt: "Received on", by: "Declared by" },
    support: "Questions? Write to us:",
    print: "Print / save as PDF",
    toFamily: "Back to the family",
    abort: "Go back",
    delete: {
      title: "Delete family",
      intro: "If you delete your family, it is deleted immediately for all members. This cannot be undone.",
      when: "What is deleted when:",
      stages: [
        "immediately: all agendas, entries, sources and their credentials, stored files and the accounts of all Admins",
        "after 14 days at the latest: the last copies in our backups",
        "after 8 years: invoices we must keep for tax reasons",
      ],
      exportFirst: "Download the export first if you want to keep your data.",
      exportButton: "Download export",
      subscription: "Deleting also cancels your subscription at the earliest possible date. We refund nothing beyond that.",
      withdrawInstead: (periodEnd) => `Instead, you can withdraw from the contract until ${periodEnd} and get everything you paid back:`,
      understood: "I understand that all of the family's data will be permanently deleted.",
      button: "Delete family permanently",
    },
  },
};

/** The rows that name the contract: the Tariff with its billing, and the day it was ordered. */
function contractRows({ billing, orderedOn }: Contract, language: Language): Row[] {
  const words = WORDS[language].contract;
  return [
    [words.contract, `Family Agenda Cloud, ${BILLING[language][billing]}`],
    [words.orderedOn, dateOf(orderedOn, language)],
  ];
}

/** `/cancel`: the § 312k fields, the end date to choose, „jetzt kündigen“ and the way back to the Family; nothing else. */
export function cancelPage(language: Language, familyId: string, { holder, contract, endDates, csrf }: CancelPageValues): string {
  const { cancel } = WORDS[language];
  const options = [...endDates]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((end, index) => `<option value="${end.toISOString()}"${index === 0 ? " selected" : ""}>${escape(dateOf(end, language))}</option>`)
    .join("");
  const endDate = `<select id="${END_DATE_FIELD}" name="${END_DATE_FIELD}">${options}</select>`;
  const rows = fields([
    ...texts([cancel.kind, [cancel.name, holder.name], [cancel.email, holder.email], ...contractRows(contract, language)]),
    [`<label for="${END_DATE_FIELD}">${escape(cancel.endDate)}</label>`, endDate],
  ]);
  return page(language, cancel.title, form(csrf, `${rows}\n${submitOrAbort(language, familyId, cancel.button)}`));
}

/** `/cancel` while a Cancellation is pending: when the contract ends, the button that takes the Cancellation back, and the way back. */
export function cancelledPage(language: Language, familyId: string, { endsOn, csrf }: CancelledPageValues): string {
  const { status, undo } = cancelledLine(endsOn, language);
  return page(language, WORDS[language].cancel.title, `${paragraphs([status])}\n${form(csrf, submit(undo, UNDO_FIELD))}\n${toFamily(language, familyId)}`);
}

/** `/cancel` for an Admin who is not the contract's holder: who is, and no form. */
export function cancelHolderPage(language: Language, familyId: string, holderName: string): string {
  return page(language, WORDS[language].cancel.title, `${paragraphs([holderLine(holderName, language)])}\n${toFamily(language, familyId)}`);
}

/** `/cancel` of a Family no Subscription runs for. */
export function nothingToCancelPage(language: Language, familyId: string): string {
  const { title, nothing } = WORDS[language].cancel;
  return page(language, title, `${paragraphs([nothing])}\n${toFamily(language, familyId)}`);
}

/** What `/cancel` shows if the declaration could not be taken: nothing changed, and the support is another way. */
export function cancelFailedPage(language: Language, familyId?: string): string {
  const { title, line } = WORDS[language].cancel.failed;
  return page(language, title, `${paragraphs([line])}\n${support(language)}${familyId === undefined ? "" : `\n${toFamily(language, familyId)}`}`);
}

/** What `/cancel` shows once the Cancellation came in. */
export function cancelReceiptPage(language: Language, familyId: string, { holder, contract, receivedAt, endsOn }: CancelReceiptValues): string {
  const words = WORDS[language];
  const { cancel } = words;
  const rows: Row[] = [received(language, receivedAt), cancel.kind, ...contractRows(contract, language), [words.receipt.by, holder.name], [cancel.receipt.ends, dateOf(endsOn, language)]];
  return receiptPage(language, familyId, cancel.receipt.title, rows, cancel.receipt.mail(holder.email));
}

/** `/withdraw`: the holder, the contract, „Widerruf bestätigen“ and the way back to the Family. */
export function withdrawPage(language: Language, familyId: string, { holder, contract, csrf }: WithdrawPageValues): string {
  const { withdraw } = WORDS[language];
  const rows = fields(texts([[withdraw.name, holder.name], [withdraw.email, holder.email], ...contractRows(contract, language)]));
  return page(language, withdraw.title, form(csrf, `${rows}\n${submitOrAbort(language, familyId, withdraw.button)}`));
}

/** `/withdraw` for an Admin who is not the contract's holder: who is, and no form. */
export function withdrawHolderPage(language: Language, familyId: string, holderName: string): string {
  return page(language, WORDS[language].withdraw.title, `${paragraphs([holderLine(holderName, language)])}\n${toFamily(language, familyId)}`);
}

/** `/withdraw` of a Family that has no Subscription to withdraw from. */
export function nothingToWithdrawPage(language: Language, familyId: string): string {
  const { title, nothing } = WORDS[language].withdraw;
  return page(language, title, `${paragraphs([nothing])}\n${toFamily(language, familyId)}`);
}

/** `/withdraw` of a Family no founder is recorded for: nobody gets the form, and the support says how it goes on. */
export function noWithdrawHolderPage(language: Language, familyId: string): string {
  const { withdraw } = WORDS[language];
  return page(language, withdraw.title, `${paragraphs([withdraw.noHolder])}\n${support(language)}\n${toFamily(language, familyId)}`);
}

/** What `/withdraw` shows if the declaration could not be taken: to try again, and the support is another way. */
export function withdrawFailedPage(language: Language, familyId?: string): string {
  const { title, line } = WORDS[language].withdraw.failed;
  return page(language, title, `${paragraphs([line])}\n${support(language)}${familyId === undefined ? "" : `\n${toFamily(language, familyId)}`}`);
}

/** What `/withdraw` shows once the Withdrawal came in. */
export function withdrawReceiptPage(language: Language, familyId: string, { holder, contract, receivedAt }: WithdrawReceiptValues): string {
  const words = WORDS[language];
  const { receipt } = words.withdraw;
  const rows: Row[] = [received(language, receivedAt), receipt.kind, ...contractRows(contract, language), [words.receipt.by, holder.name]];
  return receiptPage(language, familyId, receipt.title, rows, receipt.mail(holder.email));
}

/** A receipt: what came in when as rows, where its confirmation goes, and the buttons to print it and to go back. */
function receiptPage(language: Language, familyId: string, title: string, rows: readonly Row[], mail: string): string {
  const words = WORDS[language];
  const actions = `<p class="action actions no-print">${printButton(words.print)} ${familyButton(language, familyId)}</p>`;
  return page(language, title, `${fields(texts(rows))}\n${paragraphs([mail])}\n${actions}`, "", true);
}

/** `/delete`: what goes when, the Export first, and „Familie endgültig löschen“, active only once the checkbox is ticked. */
export function deletePage(language: Language, { exportHref, subscription, csrf }: DeletePageValues): string {
  const words = WORDS[language].delete;
  const stages = words.stages.map((stage) => `<li>${escape(stage)}</li>`).join("\n");
  const body = [
    `<p>${escape(words.intro)}</p>`,
    `<p>${escape(words.when)}</p>\n<ul>\n${stages}\n</ul>`,
    `<p>${escape(words.exportFirst)}</p>\n<p class="action"><a class="fam-button fam-button--secondary" href="${escape(exportHref)}">${escape(words.exportButton)}</a></p>`,
    subscriptionNote(language, subscription),
    form(
      csrf,
      `<p class="understood"><input type="checkbox" id="${UNDERSTOOD_FIELD}" name="${UNDERSTOOD_FIELD}" required data-enables="delete"> <label for="${UNDERSTOOD_FIELD}">${escape(words.understood)}</label></p>
<p class="action"><button class="fam-button fam-button--danger" type="submit" name="delete" disabled>${escape(words.button)}</button></p>`,
    ),
  ];
  return page(language, words.title, body.filter((part) => part !== null).join("\n"), "", true);
}

/** What deleting does to a running Subscription, and while it can still be withdrawn, the way to. */
function subscriptionNote(language: Language, subscription: DeletePageValues["subscription"]): string | null {
  if (subscription === null) return null;
  const words = WORDS[language].delete;
  const periodEnd = subscription.withdrawalPeriodEndsOn;
  if (periodEnd === null) return `<p>${escape(words.subscription)}</p>`;
  const link = `<a href="${CONTRACT_PATHS.withdraw[language]}">${escape(CONTRACT_LINKS[language].withdraw)}</a>`;
  return `<p>${escape(words.subscription)} ${escape(words.withdrawInstead(dateOf(periodEnd, language)))} ${link}.</p>`;
}

function received(language: Language, receivedAt: Date): Row {
  return [WORDS[language].receipt.receivedAt, `${dateOf(receivedAt, language)}, ${timeOf(receivedAt, language)}`];
}

/** Rows of text as HTML. */
function texts(rows: readonly Row[]): (readonly [string, string])[] {
  return rows.map(([label, value]) => [escape(label), escape(value)] as const);
}

/** Label and value per row, both HTML. */
function fields(rows: readonly (readonly [string, string])[]): string {
  return `<dl class="fields">\n${rows.map(([label, value]) => `<div><dt>${label}</dt> <dd>${value}</dd></div>`).join("\n")}\n</dl>`;
}

export function paragraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escape(line)}</p>`).join("\n");
}

/** The button that posts its form; `name` if the form's answer depends on it. */
export function submit(label: string, name?: string): string {
  const named = name === undefined ? "" : ` name="${name}" value="1"`;
  return `<p class="action"><button class="fam-button fam-button--primary" type="submit"${named}>${escape(label)}</button></p>`;
}

/** Where to write with questions. */
export function support(language: Language): string {
  return `<p>${escape(WORDS[language].support)} ${SUPPORT_LINK}</p>`;
}

/** The way back to the Family's Agenda, as a secondary button. */
export function toFamily(language: Language, familyId: string): string {
  return `<p class="action">${familyButton(language, familyId)}</p>`;
}

function familyButton(language: Language, familyId: string, label = WORDS[language].toFamily): string {
  return `<a class="fam-button fam-button--secondary" href="/${escape(familyId)}/">${escape(label)}</a>`;
}

/** A form's button beside „Abbrechen“, which leaves the form back to the Family's Agenda. */
function submitOrAbort(language: Language, familyId: string, label: string): string {
  return `<p class="action actions"><button class="fam-button fam-button--primary" type="submit">${escape(label)}</button> ${familyButton(language, familyId, WORDS[language].abort)}</p>`;
}

/** A form that posts to the page's own address, with the session's token. */
export function form(csrf: string, content: string): string {
  return `<form method="post">\n<input type="hidden" name="${CSRF_FIELD}" value="${escape(csrf)}">\n${content}\n</form>`;
}

function printButton(label: string): string {
  return `<button class="fam-button fam-button--secondary" type="button" data-print>${escape(label)}</button>`;
}

/**
 * The whole HTML document: the title, the body and the legal footer; `style` adds a page's own
 * rules, and `scripted` loads `SCRIPT_PATH` for a page with a print button or `/delete`'s checkbox.
 */
export function page(language: Language, title: string, body: string, style = "", scripted = false): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · Family Agenda Cloud</title>
<link rel="stylesheet" href="${DESIGN_PATH}/tokens.css">
<link rel="stylesheet" href="${DESIGN_PATH}/design.css">
<style>${STYLE}${style}</style>${scripted ? `\n<script src="${SCRIPT_PATH}" defer></script>` : ""}
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
body{box-sizing:border-box;display:grid;place-items:center;gap:16px;padding:24px 16px}
.card{max-width:560px;width:100%;padding:28px;background:var(--surface-raised);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-raised)}
h1{margin:0 0 16px;font-size:26px;line-height:32px}
p,li{margin:0 0 8px;color:var(--ink-muted)}
.fields{display:grid;margin:0 0 16px;border-top:1px solid var(--line)}
.fields div{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:4px 16px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.fields dt,.fields dd{margin:0}
.fields dt{color:var(--ink-muted)}
.fields dd{color:var(--ink);font-weight:600;overflow-wrap:anywhere}
.fields select{box-sizing:border-box;width:100%;min-height:var(--control-height);padding:8px 12px;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:var(--surface-raised);color:inherit;font:inherit}
@media (max-width:480px){.fields div{grid-template-columns:1fr}}
.action{margin-top:20px}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.understood{margin-top:20px}
@media print{body{min-height:0}.no-print{display:none}.card{border:0;box-shadow:none}}
${LEGAL_FOOTER_STYLE}
`;
