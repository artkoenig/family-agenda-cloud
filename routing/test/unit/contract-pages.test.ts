import { describe, expect, it } from "vitest";
import {
  cancelFailedPage,
  cancelHolderPage,
  cancelledPage,
  cancelPage,
  cancelReceiptPage,
  deletePage,
  END_DATE_FIELD,
  escape,
  nothingToCancelPage,
  nothingToWithdrawPage,
  noWithdrawHolderPage,
  UNDERSTOOD_FIELD,
  withdrawFailedPage,
  withdrawHolderPage,
  withdrawPage,
  withdrawReceiptPage,
} from "../../src/contract-pages";
import type { Contract } from "../../src/contract-wording";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "../../src/legal-footer";

const erika = { name: "Erika Muster", email: "erika@example.org" };
const monthly: Contract = { billing: "monthly", orderedOn: new Date("2026-03-05T09:05:00Z") };
const ends = [new Date("2026-05-05T08:05:00Z"), new Date("2026-04-05T08:05:00Z"), new Date("2026-06-05T08:05:00Z")] as const;

const csrf = "tok-en_1";
const token = '<form method="post">\n<input type="hidden" name="csrf" value="tok-en_1">\n';
const script = '<script src="/design/contract.js" defer></script>';

/** The part of the page between two tags. */
function between(html: string, open: string, close: string): string {
  const start = html.indexOf(open);
  const end = html.indexOf(close, start);
  expect(start, open).toBeGreaterThanOrEqual(0);
  return html.slice(start + open.length, end);
}

/** What a reader sees of the page's card, line by line. */
function linesOf(html: string): string[] {
  return between(html, '<main class="card">', "</main>")
    .replace(/<option[^>]*>[^<]*<\/option>/g, (option) => `[${option.replace(/<[^>]+>/g, "")}]`)
    .split("\n")
    .map((line) =>
      line
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim(),
    )
    .filter((line) => line !== "");
}

/** The tags in the card, e.g. `form`, `dl`, `button`. */
function tagsOf(html: string): string[] {
  return [...between(html, '<main class="card">', "</main>").matchAll(/<([a-z0-9]+)/g)].map((match) => match[1]!);
}

describe("the /cancel page", () => {
  const values = { holder: erika, contract: monthly, endDates: ends, csrf };

  it("shows the § 312k fields, the end dates with the earliest chosen, and „jetzt kündigen“, in German", () => {
    const html = cancelPage("de", "f-1", values);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("<title>Kündigung · Family Agenda Cloud</title>");
    expect(linesOf(html)).toEqual([
      "Kündigung",
      "Art der Kündigung ordentliche Kündigung",
      "Name Erika Muster",
      "E-Mail für die Bestätigung erika@example.org",
      "Vertrag Family Agenda Cloud, monatlich",
      "Bestellt am 05.03.2026",
      "Kündigen zum [05.04.2026][05.05.2026][05.06.2026]",
      "jetzt kündigen Abbrechen",
    ]);
    expect(html).toContain(
      `<select id="${END_DATE_FIELD}" name="end"><option value="2026-04-05T08:05:00.000Z" selected>05.04.2026</option><option value="2026-05-05T08:05:00.000Z">05.05.2026</option>`,
    );
    expect(html).toContain('<dt><label for="end">Kündigen zum</label></dt>');
    expect(html).toContain(`${token}<dl class="fields">`);
    expect(html).toContain('<p class="action actions"><button class="fam-button fam-button--primary" type="submit">jetzt kündigen</button> <a class="fam-button fam-button--secondary" href="/f-1/">Abbrechen</a></p>');
  });

  it("names its fields and its button in English on the English page", () => {
    const html = cancelPage("en", "f-1", values);
    expect(html).toContain('<html lang="en">');
    expect(linesOf(html)).toEqual([
      "Cancellation",
      "Type of cancellation ordinary cancellation",
      "Name Erika Muster",
      "Email for the confirmation erika@example.org",
      "Contract Family Agenda Cloud, monthly",
      "Ordered on 5 March 2026",
      "Cancel with effect from [5 April 2026][5 May 2026][5 June 2026]",
      "Cancel now Go back",
    ]);
  });

  it("holds nothing beyond its fields, the button, the way back and the legal footer: no offer or explanation", () => {
    for (const language of ["de", "en"] as const) {
      const html = cancelPage(language, "f-1", values);
      expect(tagsOf(html)).toEqual(["h1", "form", "input", "dl", ...Array<string[]>(5).fill(["div", "dt", "dd"]).flat(), "div", "dt", "label", "dd", "select", "option", "option", "option", "p", "button", "a"]);
      expect(between(html, "<body", "</body>").match(/<a /g)).toHaveLength(4);
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).not.toContain("<script");
    }
    expect(between(cancelPage("de", "f-1", values), "</main>", "</body>").trim()).toBe(
      '<footer class="legal" aria-label="Rechtliches"><a href="https://family-agenda.cloud/impressum">Impressum</a> · <a href="https://family-agenda.cloud/datenschutz">Datenschutz</a> · <a href="https://family-agenda.cloud/agb">AGB</a></footer>',
    );
    expect(between(cancelPage("en", "f-1", values), "</main>", "</body>").trim()).toBe(
      '<footer class="legal" aria-label="Legal"><a href="https://family-agenda.cloud/en/imprint">Imprint</a> · <a href="https://family-agenda.cloud/en/privacy">Privacy</a> · <a href="https://family-agenda.cloud/en/terms">Terms</a></footer>',
    );
  });

  it("is in the landing page's design system and not indexed", () => {
    const html = cancelPage("de", "f-1", values);
    expect(html).toContain('<link rel="stylesheet" href="/design/tokens.css">');
    expect(html).toContain('<link rel="stylesheet" href="/design/design.css">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<body class="fam-page">');
  });
});

describe("the /cancel receipt", () => {
  const values = { holder: erika, contract: monthly, receivedAt: new Date("2026-03-10T17:42:00Z"), endsOn: new Date("2026-04-05T08:05:00Z") };

  it("acknowledges the Cancellation, to print or save as PDF", () => {
    expect(linesOf(cancelReceiptPage("de", "f-1", values))).toEqual([
      "Deine Kündigung ist bei uns eingegangen.",
      "Eingegangen am 10.03.2026, 18:42 Uhr",
      "Art der Kündigung ordentliche Kündigung",
      "Vertrag Family Agenda Cloud, monatlich",
      "Bestellt am 05.03.2026",
      "Erklärt von Erika Muster",
      "Vertragsende 05.04.2026",
      "Eine Bestätigung geht an erika@example.org.",
      "Drucken / als PDF speichern Zur Familie",
    ]);
    expect(linesOf(cancelReceiptPage("en", "f-1", values))).toEqual([
      "We have received your cancellation.",
      "Received on 10 March 2026, 18:42 (Berlin time)",
      "Type of cancellation ordinary cancellation",
      "Contract Family Agenda Cloud, monthly",
      "Ordered on 5 March 2026",
      "Declared by Erika Muster",
      "Contract ends on 5 April 2026",
      "A confirmation is on its way to erika@example.org.",
      "Print / save as PDF Back to the family",
    ]);
    expect(cancelReceiptPage("de", "f-1", values)).toContain(
      '<p class="action actions no-print"><button class="fam-button fam-button--secondary" type="button" data-print>Drucken / als PDF speichern</button> <a class="fam-button fam-button--secondary" href="/f-1/">Zur Familie</a></p>',
    );
    expect(cancelReceiptPage("de", "f-1", values)).toContain(`</style>\n${script}\n</head>`);
    expect(cancelReceiptPage("en", "f-1", values)).toContain("<title>We have received your cancellation. · Family Agenda Cloud</title>");
    // On paper, without the button and the footer.
    expect(cancelReceiptPage("de", "f-1", values)).toContain("@media print{body{min-height:0}.no-print{display:none}");
    expect(cancelReceiptPage("de", "f-1", values)).toContain("body{box-sizing:border-box;");
    expect(cancelReceiptPage("de", "f-1", values)).toContain("@media print{.legal{display:none}}");
  });
});

describe("the /withdraw page", () => {
  const values = { holder: erika, contract: { ...monthly, billing: "yearly" } as const, csrf };

  it("shows the holder, the contract, „Widerruf bestätigen“ and „Abbrechen“ back to the Family", () => {
    expect(linesOf(withdrawPage("de", "f-1", values))).toEqual([
      "Vertrag widerrufen",
      "Name Erika Muster",
      "E-Mail für die Eingangsbestätigung erika@example.org",
      "Vertrag Family Agenda Cloud, jährlich",
      "Bestellt am 05.03.2026",
      "Widerruf bestätigen Abbrechen",
    ]);
    expect(linesOf(withdrawPage("en", "f-1", values))).toEqual([
      "Withdraw from contract",
      "Name Erika Muster",
      "Email for the acknowledgement erika@example.org",
      "Contract Family Agenda Cloud, yearly",
      "Ordered on 5 March 2026",
      "Confirm withdrawal Go back",
    ]);
    expect(withdrawPage("de", "f-1", values)).toContain(`${token}<dl class="fields">`);
    expect(withdrawPage("de", "f-1", values)).not.toContain("<script");
    expect(withdrawPage("de", "f-1", values)).toContain('<p class="action actions"><button class="fam-button fam-button--primary" type="submit">Widerruf bestätigen</button> <a class="fam-button fam-button--secondary" href="/f-1/">Abbrechen</a></p>\n</form>');
  });
});

describe("the /withdraw receipt", () => {
  const values = { holder: erika, contract: monthly, receivedAt: new Date("2026-03-10T17:42:00Z") };

  it("acknowledges the Withdrawal, to print or save as PDF", () => {
    expect(linesOf(withdrawReceiptPage("de", "f-1", values))).toEqual([
      "Dein Widerruf ist bei uns eingegangen.",
      "Eingegangen am 10.03.2026, 18:42 Uhr",
      "Erklärung Widerruf des Vertrags",
      "Vertrag Family Agenda Cloud, monatlich",
      "Bestellt am 05.03.2026",
      "Erklärt von Erika Muster",
      "Eine Eingangsbestätigung geht an erika@example.org.",
      "Drucken / als PDF speichern Zur Familie",
    ]);
    expect(linesOf(withdrawReceiptPage("en", "f-1", values))).toEqual([
      "We have received your withdrawal.",
      "Received on 10 March 2026, 18:42 (Berlin time)",
      "Declaration Withdrawal from the contract",
      "Contract Family Agenda Cloud, monthly",
      "Ordered on 5 March 2026",
      "Declared by Erika Muster",
      "An acknowledgement is on its way to erika@example.org.",
      "Print / save as PDF Back to the family",
    ]);
  });
});

describe("the receipts", () => {
  it("acknowledge receipt only, never that a declaration was confirmed or is valid", () => {
    const receivedAt = new Date();
    for (const language of ["de", "en"] as const) {
      const pages = [
        cancelReceiptPage(language, "f-1", { holder: erika, contract: monthly, receivedAt, endsOn: receivedAt }),
        withdrawReceiptPage(language, "f-1", { holder: erika, contract: monthly, receivedAt }),
        withdrawPage(language, "f-1", { holder: erika, contract: monthly, csrf }),
        withdrawHolderPage(language, "f-1", "Erika Muster"),
        nothingToWithdrawPage(language, "f-1"),
        noWithdrawHolderPage(language, "f-1"),
        withdrawFailedPage(language),
      ];
      for (const html of pages) expect(linesOf(html).join("\n")).not.toMatch(/bestätigt|wirksam|gültig|confirmed|valid/i);
    }
  });
});

describe("the /delete page", () => {
  const values = { exportHref: "/f-1/admin/export", subscription: null, csrf };

  const deleteLines = {
    de: [
      "Familie löschen",
      "Wenn du deine Familie löschst, wird sie sofort für alle Mitglieder gelöscht. Das lässt sich nicht rückgängig machen.",
      "Was wann gelöscht wird:",
      "sofort: alle Agenden, Einträge, Quellen und ihre Zugangsdaten, gespeicherte Dateien und die Konten aller Admins",
      "nach spätestens 14 Tagen: die letzten Kopien in unseren Sicherungen",
      "nach 8 Jahren: Rechnungen, die wir aus steuerlichen Gründen aufbewahren müssen",
      "Lade vorher den Export herunter, wenn du deine Daten behalten möchtest.",
      "Export herunterladen",
    ],
    en: [
      "Delete family",
      "If you delete your family, it is deleted immediately for all members. This cannot be undone.",
      "What is deleted when:",
      "immediately: all agendas, entries, sources and their credentials, stored files and the accounts of all Admins",
      "after 14 days at the latest: the last copies in our backups",
      "after 8 years: invoices we must keep for tax reasons",
      "Download the export first if you want to keep your data.",
      "Download export",
    ],
  };
  const confirm = {
    de: ["Ich verstehe, dass alle Daten der Familie endgültig gelöscht werden.", "Familie endgültig löschen"],
    en: ["I understand that all of the family's data will be permanently deleted.", "Delete family permanently"],
  };

  it("lists what goes when and offers the Export first; without a Subscription, nothing about one", () => {
    expect(linesOf(deletePage("de", values))).toEqual([...deleteLines.de, ...confirm.de]);
    expect(linesOf(deletePage("en", values))).toEqual([...deleteLines.en, ...confirm.en]);
    expect(deletePage("de", values)).toContain(`<a class="fam-button fam-button--secondary" href="/f-1/admin/export">Export herunterladen</a></p>\n${token}<p class="understood">`);
  });

  it("enables „Familie endgültig löschen“ only once the checkbox is ticked", () => {
    const html = deletePage("de", values);
    expect(html).toContain(
      `<input type="checkbox" id="${UNDERSTOOD_FIELD}" name="understood" required data-enables="delete"> <label for="understood">`,
    );
    expect(html).toContain('<button class="fam-button fam-button--danger" type="submit" name="delete" disabled>Familie endgültig löschen</button>');
    expect(html).toContain(`</style>\n${script}\n</head>`);
    expect(html).not.toMatch(/ on[a-z]+=/);
  });

  it("says a running Subscription is cancelled with it", () => {
    const running = { ...values, subscription: { withdrawalPeriodEndsOn: null } };
    expect(linesOf(deletePage("de", running))).toEqual([
      ...deleteLines.de,
      "Das Löschen kündigt zugleich dein Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts.",
      ...confirm.de,
    ]);
    expect(linesOf(deletePage("en", running))).toEqual([
      ...deleteLines.en,
      "Deleting also cancels your subscription at the earliest possible date. We refund nothing beyond that.",
      ...confirm.en,
    ]);
    expect(deletePage("de", running)).not.toContain("/withdraw");
  });

  it("points to the Withdrawal while the withdrawal period lasts", () => {
    const withdrawable = { ...values, subscription: { withdrawalPeriodEndsOn: new Date("2026-03-19T09:05:00Z") } };
    expect(linesOf(deletePage("de", withdrawable))).toEqual([
      ...deleteLines.de,
      "Das Löschen kündigt zugleich dein Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts. Du kannst stattdessen bis zum 19.03.2026 den Vertrag widerrufen und erhältst dann alles Gezahlte zurück: Vertrag widerrufen.",
      ...confirm.de,
    ]);
    expect(linesOf(deletePage("en", withdrawable))).toEqual([
      ...deleteLines.en,
      "Deleting also cancels your subscription at the earliest possible date. We refund nothing beyond that. Instead, you can withdraw from the contract until 19 March 2026 and get everything you paid back: Withdraw from contract.",
      ...confirm.en,
    ]);
    expect(deletePage("de", withdrawable)).toContain('<a href="/withdraw">Vertrag widerrufen</a>.</p>');
    expect(deletePage("en", withdrawable)).toContain('<a href="/en/withdraw">Withdraw from contract</a>.</p>');
  });
});

describe("the legal footer", () => {
  const pages = {
    "/cancel": (language: "de" | "en") => cancelPage(language, "f-1", { holder: erika, contract: monthly, endDates: ends, csrf }),
    "/cancel cancelled": (language: "de" | "en") => cancelledPage(language, "f-1", { endsOn: new Date(), csrf }),
    "/cancel holder": (language: "de" | "en") => cancelHolderPage(language, "f-1", "Erika Muster"),
    "/cancel nothing": (language: "de" | "en") => nothingToCancelPage(language, "f-1"),
    "/cancel failed": (language: "de" | "en") => cancelFailedPage(language),
    "/cancel receipt": (language: "de" | "en") => cancelReceiptPage(language, "f-1", { holder: erika, contract: monthly, receivedAt: new Date(), endsOn: new Date() }),
    "/withdraw": (language: "de" | "en") => withdrawPage(language, "f-1", { holder: erika, contract: monthly, csrf }),
    "/withdraw holder": (language: "de" | "en") => withdrawHolderPage(language, "f-1", "Erika Muster"),
    "/withdraw nothing": (language: "de" | "en") => nothingToWithdrawPage(language, "f-1"),
    "/withdraw no holder": (language: "de" | "en") => noWithdrawHolderPage(language, "f-1"),
    "/withdraw failed": (language: "de" | "en") => withdrawFailedPage(language),
    "/withdraw receipt": (language: "de" | "en") => withdrawReceiptPage(language, "f-1", { holder: erika, contract: monthly, receivedAt: new Date() }),
    "/delete": (language: "de" | "en") => deletePage(language, { exportHref: "/f-1/admin/export", subscription: null, csrf }),
  };
  const footers = { de: legalFooterHtml("de"), en: legalFooterHtml("en") };

  for (const [name, render] of Object.entries(pages)) {
    for (const language of ["de", "en"] as const) {
      it(`ends ${name} in ${language}, with the footer's style`, () => {
        const html = render(language);
        expect(between(html, "</main>", "</body>").trim()).toBe(footers[language]);
        expect(html).toContain(LEGAL_FOOTER_STYLE);
        expect(html).not.toMatch(/href="\/(impressum|datenschutz|agb|en\/)/);
        expect(html).not.toMatch(/ on[a-z]+=/);
      });
    }
  }
});

describe("escaping", () => {
  const evil = `<script>alert("x")</script> & 'y'`;

  it("escapes every character HTML gives a meaning", () => {
    expect(escape(evil)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    expect(escape("Erika Muster")).toBe("Erika Muster");
  });

  it("escapes every value on every page", () => {
    const holder = { name: evil, email: evil };
    const contract = monthly;
    const pages = [
      cancelPage("de", "f-1", { holder, contract, endDates: ends, csrf: evil }),
      cancelHolderPage("en", "f-1", evil),
      cancelReceiptPage("en", "f-1", { holder, contract, receivedAt: new Date(), endsOn: new Date() }),
      withdrawPage("en", "f-1", { holder, contract, csrf: evil }),
      withdrawReceiptPage("de", "f-1", { holder, contract, receivedAt: new Date() }),
      deletePage("de", { exportHref: evil, subscription: { withdrawalPeriodEndsOn: new Date() }, csrf: evil }),
    ];
    expect(pages[5]).toContain(`href="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"`);
    for (const html of pages) {
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    }
  });
});

describe("what /cancel shows instead of its form", () => {
  it("is the pending Cancellation's end and the button that takes it back", () => {
    const endsOn = new Date("2026-04-05T08:05:00Z");
    expect(linesOf(cancelledPage("de", "f-1", { endsOn, csrf }))).toEqual(["Kündigung", "Gekündigt zum 05.04.2026", "Kündigung zurücknehmen", "Zur Familie"]);
    expect(linesOf(cancelledPage("en", "f-1", { endsOn, csrf }))).toEqual(["Cancellation", "Cancelled with effect from 5 April 2026", "Undo cancellation", "Back to the family"]);
    expect(cancelledPage("de", "f-1", { endsOn, csrf })).toContain(`${token}<p class="action"><button class="fam-button fam-button--primary" type="submit" name="undo" value="1">Kündigung zurücknehmen</button></p>\n</form>\n<p class="action"><a class="fam-button fam-button--secondary" href="/f-1/">Zur Familie</a></p>`);
  });

  it("is the holder's name for another Admin, and no form", () => {
    expect(linesOf(cancelHolderPage("de", "f-1", "Erika Muster"))).toEqual(["Kündigung", "Vertragsinhaber: Erika Muster", "Zur Familie"]);
    expect(linesOf(cancelHolderPage("en", "f-1", "Erika Muster"))).toEqual(["Cancellation", "Contract holder: Erika Muster", "Back to the family"]);
    expect(cancelHolderPage("de", "f-1", "Erika Muster")).not.toMatch(/<form|<button/);
  });

  it("says so if no Subscription runs", () => {
    expect(linesOf(nothingToCancelPage("de", "f-1"))).toEqual(["Kündigung", "Für diese Familie läuft kein Abonnement, das gekündigt werden kann.", "Zur Familie"]);
    expect(linesOf(nothingToCancelPage("en", "f-1"))).toEqual(["Cancellation", "This family has no running subscription that could be cancelled.", "Back to the family"]);
  });

  it("says that nothing changed if the declaration could not be taken, and how to reach us", () => {
    expect(linesOf(cancelFailedPage("de"))).toEqual([
      "Das hat gerade nicht geklappt",
      "Deine Erklärung konnte gerade nicht entgegengenommen werden. Es wurde nichts geändert. Bitte versuch es in einigen Minuten erneut.",
      "Fragen? Schreib uns: support@family-agenda.cloud",
    ]);
    expect(linesOf(cancelFailedPage("en"))[1]).toBe("We could not take your declaration just now. Nothing was changed. Please try again in a few minutes.");
    expect(cancelFailedPage("en")).toContain('<a href="mailto:');
  });
});

describe("/withdraw for whom there is no form", () => {
  it("is the holder's name for another Admin, and no form", () => {
    expect(linesOf(withdrawHolderPage("de", "f-1", "Erika Muster"))).toEqual(["Vertrag widerrufen", "Vertragsinhaber: Erika Muster", "Zur Familie"]);
    expect(linesOf(withdrawHolderPage("en", "f-1", "Erika Muster"))).toEqual(["Withdraw from contract", "Contract holder: Erika Muster", "Back to the family"]);
    expect(withdrawHolderPage("de", "f-1", "<b>Erika</b>")).toContain("&lt;b&gt;Erika&lt;/b&gt;");
    expect(withdrawHolderPage("de", "f-1", "Erika Muster")).not.toMatch(/<form|<button/);
  });

  it("says so if there is no Subscription to withdraw from", () => {
    expect(linesOf(nothingToWithdrawPage("de", "f-1"))).toEqual(["Vertrag widerrufen", "Für diese Familie gibt es kein Abonnement, das widerrufen werden kann.", "Zur Familie"]);
    expect(linesOf(nothingToWithdrawPage("en", "f-1"))).toEqual(["Withdraw from contract", "This family has no subscription that could be withdrawn from.", "Back to the family"]);
    expect(nothingToWithdrawPage("de", "f-1")).not.toMatch(/<form|<button/);
  });

  it("gives the support's address where no holder is recorded", () => {
    expect(linesOf(noWithdrawHolderPage("de", "f-1"))).toEqual([
      "Vertrag widerrufen",
      "Für diese Familie ist nicht hinterlegt, wer den Vertrag widerrufen kann.",
      "Fragen? Schreib uns: support@family-agenda.cloud",
      "Zur Familie",
    ]);
    expect(linesOf(noWithdrawHolderPage("en", "f-1"))).toEqual([
      "Withdraw from contract",
      "There is no record of who can withdraw from the contract for this family.",
      "Questions? Write to us: support@family-agenda.cloud",
      "Back to the family",
    ]);
    expect(noWithdrawHolderPage("en", "f-1")).toContain('<a href="mailto:');
    expect(noWithdrawHolderPage("de", "f-1")).not.toMatch(/<form|<button/);
  });

  it("asks to try again if the declaration could not be taken, and says how to reach us", () => {
    expect(linesOf(withdrawFailedPage("de"))).toEqual([
      "Das hat gerade nicht geklappt",
      "Deine Erklärung konnte gerade nicht entgegengenommen werden. Bitte versuch es in einigen Minuten erneut.",
      "Fragen? Schreib uns: support@family-agenda.cloud",
    ]);
    expect(linesOf(withdrawFailedPage("en"))).toEqual([
      "That did not work just now",
      "We could not take your declaration just now. Please try again in a few minutes.",
      "Questions? Write to us: support@family-agenda.cloud",
    ]);
    expect(withdrawFailedPage("en")).toContain('<a href="mailto:');
  });
});
