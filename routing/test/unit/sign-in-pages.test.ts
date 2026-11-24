import { describe, expect, it } from "vitest";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "../../src/legal-footer";
import { signInPage, type SignInPage } from "../../src/sign-in-pages";

const PAGES: readonly SignInPage[] = ["preparing", "unavailable", "several", "failed"];

describe("the legal footer of central sign-in's pages", () => {
  for (const page of PAGES) {
    for (const language of ["de", "en"] as const) {
      it(`ends the ${page} page in ${language}`, () => {
        const html = signInPage(page, language);
        expect(html.slice(html.indexOf("</main>") + "</main>".length, html.indexOf("</body>")).trim()).toBe(legalFooterHtml(language));
        expect(html).toContain(LEGAL_FOOTER_STYLE);
        expect(html).toContain("body{display:grid;place-items:center;gap:16px;padding:24px 16px}");
      });
    }
  }

  it("ends the waiting page after a long wait too", () => {
    expect(signInPage("preparing", "en", true)).toContain(`</main>\n${legalFooterHtml("en")}\n</body>`);
  });
});
