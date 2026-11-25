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
  UNDERSTOOD_FIELD,
  withdrawPage,
  withdrawReceiptPage,
} from "../../src/contract-pages";
import type { Contract } from "../../src/contract-wording";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "../../src/legal-footer";

const erika = { name: "Erika Muster", email: "erika@example.org" };
const monthly: Contract = { billing: "monthly", familyName: "Muster", orderedOn: new Date("2026-03-05T09:05:00Z") };
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
    const html = cancelPage("de", values);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("<title>Kündigung · Family Agenda</title>");
    expect(linesOf(html)).toEqual([
      "Kündigung",
      "Art der Kündigung: ordentliche Kündigung",
      "Name: Erika Muster",
      "E-Mail für die Bestätigung: erika@example.org",
      "Vertrag: Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026",
      "Kündigen zum: [05.04.2026][05.05.2026][05.06.2026]",
      "jetzt kündigen",
    ]);
    expect(html).toContain(
      `<select id="${END_DATE_FIELD}" name="end"><option value="2026-04-05T08:05:00.000Z" selected>05.04.2026</option><option value="2026-05-05T08:05:00.000Z">05.05.2026</option>`,
    );
    expect(html).toContain('<label for="end">Kündigen zum:</label>');
    expect(html).toContain(`${token}<dl class="fields">`);
    expect(html).toContain('<button class="fam-button fam-button--primary" type="submit">jetzt kündigen</button></p>');
  });

  it("keeps the German button on the English page and says what it means", () => {
    const html = cancelPage("en", values);
    expect(html).toContain('<html lang="en">');
    expect(linesOf(html)).toEqual([
      "Cancellation",
      "Type of cancellation: ordinary cancellation",
      "Name: Erika Muster",
      "Email for the confirmation: erika@example.org",
      "Contract: Family Agenda, monthly, family Muster, ordered on 5 March 2026",
      "Cancel with effect from: [5 April 2026][5 May 2026][5 June 2026]",
      'jetzt kündigen (German for "cancel now")',
    ]);
  });

  it("holds nothing beyond its fields, the button and the legal footer: no link, offer or explanation", () => {
    for (const language of ["de", "en"] as const) {
      const html = cancelPage(language, values);
      expect(tagsOf(html)).toEqual(["h1", "form", "input", "dl", ...Array<string[]>(4).fill(["div", "dt", "dd"]).flat(), "div", "dt", "label", "dd", "select", "option", "option", "option", "p", "button", ...(language === "en" ? ["span"] : [])]);
      expect(between(html, "<body", "</body>").match(/<a /g)).toHaveLength(3);
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).not.toContain("<script");
    }
    expect(between(cancelPage("de", values), "</main>", "</body>").trim()).toBe(
      '<footer class="legal" aria-label="Rechtliches"><a href="https://family-agenda.cloud/impressum">Impressum</a> · <a href="https://family-agenda.cloud/datenschutz">Datenschutz</a> · <a href="https://family-agenda.cloud/agb">AGB</a></footer>',
    );
    expect(between(cancelPage("en", values), "</main>", "</body>").trim()).toBe(
      '<footer class="legal" aria-label="Legal"><a href="https://family-agenda.cloud/en/imprint">Imprint</a> · <a href="https://family-agenda.cloud/en/privacy">Privacy</a> · <a href="https://family-agenda.cloud/en/terms">Terms</a></footer>',
    );
  });

  it("is in the landing page's design system and not indexed", () => {
    const html = cancelPage("de", values);
    expect(html).toContain('<link rel="stylesheet" href="/design/tokens.css">');
    expect(html).toContain('<link rel="stylesheet" href="/design/design.css">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<body class="fam-page">');
  });
});

describe("the /cancel receipt", () => {
  const values = { holder: erika, contract: monthly, receivedAt: new Date("2026-03-10T17:42:00Z"), endsOn: new Date("2026-04-05T08:05:00Z") };

  it("acknowledges the Cancellation, to print or save as PDF", () => {
    expect(linesOf(cancelReceiptPage("de", values))).toEqual([
      "Ihre Kündigung ist bei uns eingegangen.",
      "Eingegangen am 10.03.2026 um 18:42 Uhr.",
      "Inhalt: Ordentliche Kündigung des Vertrags Family Agenda, monatlich, Familie Muster, durch Erika Muster, zum 05.04.2026.",
      "Der Vertrag endet am 05.04.2026.",
      "Eine Bestätigung geht an erika@example.org.",
      "Drucken / als PDF speichern",
    ]);
    expect(linesOf(cancelReceiptPage("en", values))).toEqual([
      "We have received your cancellation.",
      "Received on 10 March 2026 at 18:42 (Berlin time).",
      "Content: ordinary cancellation of the contract Family Agenda, monthly, family Muster, by Erika Muster, with effect from 5 April 2026.",
      "The contract ends on 5 April 2026.",
      "A confirmation is on its way to erika@example.org.",
      "Print / save as PDF",
    ]);
    expect(cancelReceiptPage("de", values)).toContain(
      '<p class="action no-print"><button class="fam-button fam-button--secondary" type="button" data-print>Drucken / als PDF speichern</button></p>',
    );
    expect(cancelReceiptPage("de", values)).toContain(`</style>\n${script}\n</head>`);
    expect(cancelReceiptPage("en", values)).toContain("<title>We have received your cancellation. · Family Agenda</title>");
    // On paper, without the button and the footer.
    expect(cancelReceiptPage("de", values)).toContain("@media print{.no-print{display:none}");
    expect(cancelReceiptPage("de", values)).toContain("@media print{.legal{display:none}}");
  });
});

describe("the /withdraw page", () => {
  const values = { holder: erika, contract: { ...monthly, billing: "yearly" } as const, csrf };

  it("shows the holder, the contract and „Widerruf bestätigen“", () => {
    expect(linesOf(withdrawPage("de", values))).toEqual([
      "Vertrag widerrufen",
      "Name: Erika Muster",
      "E-Mail für die Eingangsbestätigung: erika@example.org",
      "Vertrag: Family Agenda, jährlich, Familie Muster, bestellt am 05.03.2026",
      "Widerruf bestätigen",
    ]);
    expect(linesOf(withdrawPage("en", values))).toEqual([
      "Withdraw from the contract",
      "Name: Erika Muster",
      "Email for the acknowledgement: erika@example.org",
      "Contract: Family Agenda, yearly, family Muster, ordered on 5 March 2026",
      'Widerruf bestätigen (German for "confirm withdrawal")',
    ]);
    expect(withdrawPage("de", values)).toContain(`${token}<dl class="fields">`);
    expect(withdrawPage("de", values)).not.toContain("<script");
    expect(withdrawPage("de", values)).toContain('<button class="fam-button fam-button--primary" type="submit">Widerruf bestätigen</button></p>');
    expect(withdrawPage("en", values)).toContain('<span class="note">(German for &quot;confirm withdrawal&quot;)</span>');
  });
});

describe("the /withdraw receipt", () => {
  const values = { holder: erika, contract: monthly, receivedAt: new Date("2026-03-10T17:42:00Z") };

  it("acknowledges the Withdrawal, to print or save as PDF", () => {
    expect(linesOf(withdrawReceiptPage("de", values))).toEqual([
      "Ihr Widerruf ist bei uns eingegangen.",
      "Eingegangen am 10.03.2026 um 18:42 Uhr.",
      "Inhalt: Widerruf des Vertrags Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026, durch Erika Muster.",
      "Eine Eingangsbestätigung geht an erika@example.org.",
      "Drucken / als PDF speichern",
    ]);
    expect(linesOf(withdrawReceiptPage("en", values))).toEqual([
      "We have received your withdrawal.",
      "Received on 10 March 2026 at 18:42 (Berlin time).",
      "Content: withdrawal from the contract Family Agenda, monthly, family Muster, ordered on 5 March 2026, by Erika Muster.",
      "An acknowledgement is on its way to erika@example.org.",
      "Print / save as PDF",
    ]);
  });
});

describe("the receipts", () => {
  it("acknowledge receipt only, never that a declaration was confirmed or is valid", () => {
    const receivedAt = new Date();
    for (const language of ["de", "en"] as const) {
      const pages = [
        cancelReceiptPage(language, { holder: erika, contract: monthly, receivedAt, endsOn: receivedAt }),
        withdrawReceiptPage(language, { holder: erika, contract: monthly, receivedAt }),
      ];
      for (const html of pages) expect(linesOf(html).join("\n")).not.toMatch(/bestätigt|wirksam|gültig|confirmed|valid/i);
    }
  });
});

describe("the /delete page", () => {
  const values = { familyName: "Muster", exportHref: "/f-1/admin/export", subscription: null, csrf };

  const deleteLines = {
    de: [
      "Familie löschen",
      "Wenn Sie die Familie Muster löschen, wird sie sofort für alle Mitglieder gelöscht. Das lässt sich nicht rückgängig machen.",
      "Was wann gelöscht wird:",
      "sofort: alle Agenden, Einträge, Quellen und ihre Zugangsdaten, gespeicherte Dateien und die Konten aller Admins",
      "nach spätestens 14 Tagen: die letzten Kopien in unseren Sicherungen",
      "nach 8 Jahren: Rechnungen, die wir aus steuerlichen Gründen aufbewahren müssen",
      "Laden Sie vorher den Export herunter, wenn Sie Ihre Daten behalten möchten.",
      "Export herunterladen",
    ],
    en: [
      "Delete family",
      "If you delete the family Muster, it is deleted immediately for all members. This cannot be undone.",
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
      "Das Löschen kündigt zugleich Ihr Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts.",
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
      "Das Löschen kündigt zugleich Ihr Abonnement zum frühestmöglichen Zeitpunkt. Darüber hinaus erstatten wir nichts. Sie können stattdessen bis zum 19.03.2026 den Vertrag widerrufen und erhalten dann alles Gezahlte zurück: Vertrag widerrufen.",
      ...confirm.de,
    ]);
    expect(linesOf(deletePage("en", withdrawable))).toEqual([
      ...deleteLines.en,
      "Deleting also cancels your subscription at the earliest possible date. We refund nothing beyond that. Instead, you can withdraw from the contract until 19 March 2026 and get everything you paid back: Vertrag widerrufen.",
      ...confirm.en,
    ]);
    expect(deletePage("de", withdrawable)).toContain('<a href="/withdraw">Vertrag widerrufen</a>.</p>');
    expect(deletePage("en", withdrawable)).toContain('<a href="/en/withdraw">Vertrag widerrufen</a>.</p>');
  });
});

describe("the legal footer", () => {
  const pages = {
    "/cancel": (language: "de" | "en") => cancelPage(language, { holder: erika, contract: monthly, endDates: ends, csrf }),
    "/cancel cancelled": (language: "de" | "en") => cancelledPage(language, { endsOn: new Date(), csrf }),
    "/cancel holder": (language: "de" | "en") => cancelHolderPage(language, "Erika Muster"),
    "/cancel nothing": (language: "de" | "en") => nothingToCancelPage(language),
    "/cancel failed": (language: "de" | "en") => cancelFailedPage(language),
    "/cancel receipt": (language: "de" | "en") => cancelReceiptPage(language, { holder: erika, contract: monthly, receivedAt: new Date(), endsOn: new Date() }),
    "/withdraw": (language: "de" | "en") => withdrawPage(language, { holder: erika, contract: monthly, csrf }),
    "/withdraw receipt": (language: "de" | "en") => withdrawReceiptPage(language, { holder: erika, contract: monthly, receivedAt: new Date() }),
    "/delete": (language: "de" | "en") => deletePage(language, { familyName: "Muster", exportHref: "/f-1/admin/export", subscription: null, csrf }),
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
    const contract = { ...monthly, familyName: evil };
    const pages = [
      cancelPage("de", { holder, contract, endDates: ends, csrf: evil }),
      cancelHolderPage("en", evil),
      cancelReceiptPage("en", { holder, contract, receivedAt: new Date(), endsOn: new Date() }),
      withdrawPage("en", { holder, contract, csrf: evil }),
      withdrawReceiptPage("de", { holder, contract, receivedAt: new Date() }),
      deletePage("de", { familyName: evil, exportHref: evil, subscription: { withdrawalPeriodEndsOn: new Date() }, csrf: evil }),
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
    expect(linesOf(cancelledPage("de", { endsOn, csrf }))).toEqual(["Kündigung", "Gekündigt zum 05.04.2026", "Kündigung zurücknehmen"]);
    expect(linesOf(cancelledPage("en", { endsOn, csrf }))).toEqual(["Cancellation", "Cancelled with effect from 5 April 2026", "Kündigung zurücknehmen (undo cancellation)"]);
    expect(cancelledPage("de", { endsOn, csrf })).toContain(`${token}<p class="action"><button class="fam-button fam-button--primary" type="submit" name="undo" value="1">Kündigung zurücknehmen</button></p>\n</form>`);
  });

  it("is the holder's name for another Admin, and no form", () => {
    expect(linesOf(cancelHolderPage("de", "Erika Muster"))).toEqual(["Kündigung", "Vertragsinhaber: Erika Muster"]);
    expect(linesOf(cancelHolderPage("en", "Erika Muster"))).toEqual(["Cancellation", "Contract holder: Erika Muster"]);
    expect(cancelHolderPage("de", "Erika Muster")).not.toMatch(/<form|<button/);
  });

  it("says so if no Subscription runs", () => {
    expect(linesOf(nothingToCancelPage("de"))).toEqual(["Kündigung", "Für diese Familie läuft kein Abonnement, das gekündigt werden kann."]);
    expect(linesOf(nothingToCancelPage("en"))).toEqual(["Cancellation", "This family has no running subscription that could be cancelled."]);
  });

  it("says that nothing changed if the declaration could not be taken, and how to reach us", () => {
    expect(linesOf(cancelFailedPage("de"))).toEqual([
      "Das hat gerade nicht geklappt",
      "Ihre Erklärung konnte gerade nicht entgegengenommen werden. Es wurde nichts geändert. Bitte versuchen Sie es in einigen Minuten erneut.",
      "Fragen? Schreiben Sie uns: support@family-agenda.cloud",
    ]);
    expect(linesOf(cancelFailedPage("en"))[1]).toBe("We could not take your declaration just now. Nothing was changed. Please try again in a few minutes.");
    expect(cancelFailedPage("en")).toContain('<a href="mailto:');
  });
});
