/**
 * The legal footer of every page the Routing module serves itself (#232): the contract pages, central
 * sign-in's pages, and the Locked and order pages to come (#228, #226). It links Impressum, privacy
 * policy and AGB on the apex in the page's language, absolutely, since these pages are served on
 * the app's host, where the Router answers the apex's paths with 404 (§ 5 DDG, #194). The paths and
 * labels are the apex footer's (legal-pages.ts). Hidden in print. No I/O.
 */
import { LEGAL_PAGES, type Language } from "./legal-pages";
import { SITE_URL } from "./legal-texts";

/** The legal pages the footer links; it keeps the apex footer's order. */
const LINKED: readonly string[] = ["impressum", "datenschutz", "agb"];

const LABEL: Record<Language, string> = { de: "Rechtliches", en: "Legal" };

/** The footer of a page in `language`, one line of links. */
export function legalFooterHtml(language: Language): string {
  const links = LEGAL_PAGES.filter((page) => LINKED.includes(page.name)).map((page) => `<a href="${SITE_URL}${page.paths[language]}">${page.labels[language]}</a>`);
  return `<footer class="legal" aria-label="${LABEL[language]}">${links.join(" · ")}</footer>`;
}

/** The footer's style: small and muted, not on paper. */
export const LEGAL_FOOTER_STYLE = `.legal{font-size:14px;color:var(--ink-muted)}
.legal a{color:inherit}
@media print{.legal{display:none}}`;
