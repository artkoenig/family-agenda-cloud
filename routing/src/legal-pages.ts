/**
 * The legal pages of the apex and the footer every page of site/ carries (#216): the pages are
 * built from their texts in site/legal/ (legal-texts.ts), the footer is written into the two landing
 * pages too, between their `<footer class="lp-footer">` and `</footer>`. The pages keep their
 * placeholders; the Operator fills them before go-live. No I/O: the files of site/ are read
 * through `read`; legal-site.ts writes what `buildSite` returns.
 */
import { escapeHtml, legalHtml, legalTitle, SITE_URL } from "./legal-texts";

export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Where the cancel and withdraw pages are (#190). */
export const APP_URL = "https://app.family-agenda.cloud";

/**
 * A legal page: its path on the apex and its label in the footer, per language. With `text: true`,
 * its texts are `site/legal/<name>.de.md` and `<name>.en.md`, and the page is built to
 * `site/<path>.html`; Caddy serves it at the path without `.html` (cube/Caddyfile).
 */
export type LegalPage = {
  name: string;
  paths: Readonly<Record<Language, string>>;
  labels: Readonly<Record<Language, string>>;
  text: boolean;
};

/** Every legal page, in the footer's order. To publish one, write its two texts and set `text: true`. */
export const LEGAL_PAGES: readonly LegalPage[] = [
  { name: "impressum", paths: { de: "/impressum", en: "/en/imprint" }, labels: { de: "Impressum", en: "Imprint" }, text: true },
  { name: "datenschutz", paths: { de: "/datenschutz", en: "/en/privacy" }, labels: { de: "Datenschutz", en: "Privacy" }, text: true },
  { name: "agb", paths: { de: "/agb", en: "/en/terms" }, labels: { de: "AGB", en: "Terms" }, text: true },
  {
    name: "widerrufsbelehrung",
    paths: { de: "/widerrufsbelehrung", en: "/en/withdrawal" },
    labels: { de: "Widerrufsbelehrung", en: "Withdrawal policy" },
    text: true,
  },
];

/**
 * The footer's contract buttons: German labels on English pages too, with a gloss. Disabled until the
 * app's cancel and withdraw pages exist (#229, #230; launch checklist, 13b).
 */
const CONTRACT_LINKS = [
  { label: "Verträge hier kündigen", gloss: "cancel contracts here" },
  { label: "Vertrag widerrufen", gloss: "withdraw from contract" },
] as const;

/** What a page says around its content, per language. */
const WORDS = {
  de: { other: "en", otherName: "English", site: "Seite", legal: "Rechtliches", contracts: "Verträge", home: "/", tagline: "Mit Liebe (und zu wenig Schlaf) von Eltern gemacht." },
  en: { other: "de", otherName: "Deutsch", site: "Page", legal: "Legal", contracts: "Contracts", home: "/en/", tagline: "Made with love (and too little sleep) by parents." },
} as const;

function contractButton(link: (typeof CONTRACT_LINKS)[number], language: Language): string {
  const label = language === "de" ? link.label : `<span lang="de">${link.label}</span> <span class="lp-footer__gloss">(${link.gloss})</span>`;
  return `      <button class="fam-button lp-footer__button" type="button" disabled>${label}</button>`;
}

/** The footer of a page in `language`, whose link to the other language goes to `otherLanguageHref`. */
export function footerHtml(language: Language, otherLanguageHref: string): string {
  const words = WORDS[language];
  return [
    `  <footer class="lp-footer">`,
    `    <nav class="lp-footer__contracts" aria-label="${words.contracts}">`,
    ...CONTRACT_LINKS.map((link) => contractButton(link, language)),
    `    </nav>`,
    `    <span>${words.tagline}</span>`,
    `    <nav class="lp-footer__links" aria-label="${words.legal}">`,
    ...LEGAL_PAGES.map((page) => `      <a href="${page.paths[language]}">${page.labels[language]}</a>`),
    `      <a href="${otherLanguageHref}" lang="${words.other}" hreflang="${words.other}" data-lang="${words.other}">${words.otherName}</a>`,
    `    </nav>`,
    `  </footer>`,
  ].join("\n");
}

const FOOTER = /^ {2}<footer class="lp-footer">$[\s\S]*?^ {2}<\/footer>$/m;

/** A landing page with `footer` in place of its own. */
export function withFooter(html: string, footer: string): string {
  if (html.match(new RegExp(FOOTER, "gm"))?.length !== 1) throw new Error('A landing page has one footer, from "  <footer class="lp-footer">" to "  </footer>"');
  return html.replace(FOOTER, footer);
}

/** The page of a legal text in `language`, its Markdown `markdown`. */
export function legalPageHtml(page: LegalPage, language: Language, markdown: string): string {
  const words = WORDS[language];
  const other = page.paths[words.other];
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(legalTitle(markdown))} · Family Agenda Cloud</title>
  <meta name="theme-color" content="#faf6f0" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1c1814" media="(prefers-color-scheme: dark)">
  <link rel="canonical" href="${SITE_URL}${page.paths[language]}">
  <link rel="alternate" hreflang="de" href="${SITE_URL}${page.paths.de}">
  <link rel="alternate" hreflang="en" href="${SITE_URL}${page.paths.en}">
  <link rel="icon" href="/app-icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/tokens.css">
  <link rel="stylesheet" href="/design.css">
  <link rel="stylesheet" href="/landing.css">
</head>
<body class="fam-page lp">
  <header class="lp-nav">
    <div class="lp-nav__inner">
      <a class="lp-brand" href="${words.home}" aria-label="Family Agenda"><img src="/app-icon.svg" alt="" width="28" height="28"><span class="lp-brand__name">Family Agenda</span></a>
      <nav class="lp-nav__links" aria-label="${words.site}">
        <a class="lp-nav__link lp-nav__lang" href="${other}" lang="${words.other}" hreflang="${words.other}" data-lang="${words.other}" aria-label="${words.otherName}" title="${words.otherName}">${words.other.toUpperCase()}</a>
      </nav>
    </div>
  </header>

  <main class="lp-legal">
${legalHtml(markdown).trimEnd()}
  </main>

${footerHtml(language, other)}

  <script>
    // Remembers a language picked by hand, so the landing page's first-visit choice by browser language does not override it.
    for (const link of document.querySelectorAll("[data-lang]")) {
      link.addEventListener("click", () => { try { localStorage.setItem("lp-lang", link.dataset.lang); } catch {} });
    }
  </script>
</body>
</html>
`;
}

/** A file of site/, by its path relative to site/. */
export type SiteFile = { path: string; content: string };

/** The landing pages, by their path in site/, with the href of their link to the other language. */
const LANDING_PAGES: readonly { path: string; language: Language; otherLanguageHref: string }[] = [
  { path: "index.html", language: "de", otherLanguageHref: "en/" },
  { path: "en/index.html", language: "en", otherLanguageHref: "../" },
];

/** Every file of site/ this module writes: the legal pages with a text, and the landing pages with the footer. */
export function buildSite(read: (path: string) => string): SiteFile[] {
  const legal = LEGAL_PAGES.filter((page) => page.text).flatMap((page) =>
    LANGUAGES.map((language) => ({
      path: `${page.paths[language].slice(1)}.html`,
      content: legalPageHtml(page, language, read(`legal/${page.name}.${language}.md`)),
    })),
  );
  const landing = LANDING_PAGES.map(({ path, language, otherLanguageHref }) => ({
    path,
    content: withFooter(read(path), footerHtml(language, otherLanguageHref)),
  }));
  return [...legal, ...landing];
}
