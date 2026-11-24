import { describe, expect, it } from "vitest";
import { buildSite, footerHtml, LEGAL_PAGES, legalPageHtml, withFooter, type LegalPage } from "../../src/legal-pages";

const page: LegalPage = { name: "test", paths: { de: "/test", en: "/en/test" }, labels: { de: "Test", en: "Test" }, text: true };

const landing = (footer: string) => `<body>\n  <main></main>\n\n${footer}\n\n  <script></script>\n</body>\n`;

describe("footerHtml", () => {
  it("links the German legal pages and the app's German cancel and withdraw pages as buttons", () => {
    expect(footerHtml("de", "en/")).toBe(`  <footer class="lp-footer">
    <nav class="lp-footer__contracts" aria-label="Verträge">
      <a class="fam-button lp-footer__button" href="https://app.family-agenda.cloud/cancel">Verträge hier kündigen</a>
      <a class="fam-button lp-footer__button" href="https://app.family-agenda.cloud/withdraw">Vertrag widerrufen</a>
    </nav>
    <span>Mit Liebe (und zu wenig Schlaf) von Eltern gemacht.</span>
    <nav class="lp-footer__links" aria-label="Rechtliches">
      <a href="/impressum">Impressum</a>
      <a href="/datenschutz">Datenschutz</a>
      <a href="/agb">AGB</a>
      <a href="/widerrufsbelehrung">Widerrufsbelehrung</a>
      <a href="en/" lang="en" hreflang="en" data-lang="en">English</a>
    </nav>
  </footer>`);
  });

  it("links the English pages, keeping the buttons' German labels with an English gloss", () => {
    expect(footerHtml("en", "/impressum")).toBe(`  <footer class="lp-footer">
    <nav class="lp-footer__contracts" aria-label="Contracts">
      <a class="fam-button lp-footer__button" href="https://app.family-agenda.cloud/en/cancel"><span lang="de">Verträge hier kündigen</span> <span class="lp-footer__gloss">(cancel contracts here)</span></a>
      <a class="fam-button lp-footer__button" href="https://app.family-agenda.cloud/en/withdraw"><span lang="de">Vertrag widerrufen</span> <span class="lp-footer__gloss">(withdraw from contract)</span></a>
    </nav>
    <span>Made with love (and too little sleep) by parents.</span>
    <nav class="lp-footer__links" aria-label="Legal">
      <a href="/en/imprint">Imprint</a>
      <a href="/en/privacy">Privacy</a>
      <a href="/en/terms">Terms</a>
      <a href="/en/withdrawal">Withdrawal policy</a>
      <a href="/impressum" lang="de" hreflang="de" data-lang="de">Deutsch</a>
    </nav>
  </footer>`);
  });
});

describe("withFooter", () => {
  it("replaces a landing page's footer, and only it", () => {
    const old = `  <footer class="lp-footer">\n    <a href="/widerruf">Widerruf</a>\n  </footer>`;

    expect(withFooter(landing(old), "  <footer>new</footer>")).toBe(landing("  <footer>new</footer>"));
  });

  it.each([
    ["none", landing("")],
    ["two", landing(`  <footer class="lp-footer">\n  </footer>\n  <footer class="lp-footer">\n  </footer>`)],
    ["one that does not end its first line", landing(`  <footer class="lp-footer">x\n  </footer>`)],
    ["one that does not end its last line", landing(`  <footer class="lp-footer">\n  </footer>x`)],
    ["one indented otherwise", landing(`   <footer class="lp-footer">\n  </footer>`)],
    ["one whose end is indented otherwise", landing(`  <footer class="lp-footer">\n   </footer>`)],
  ])("refuses a landing page with %s", (_, html) => {
    expect(() => withFooter(html, "")).toThrow('A landing page has one footer, from "  <footer class="lp-footer">" to "  </footer>"');
  });
});

describe("legalPageHtml", () => {
  it("is a page in the text's language with its title, the text, a link to its other language and the footer", () => {
    const html = legalPageHtml(page, "en", "# Terms & more\n\n> This is a translation.\n");

    expect(html).toMatch(/^<!doctype html>\n<html lang="en">\n/);
    expect(html).toContain("<title>Terms &amp; more · Family Agenda Cloud</title>");
    expect(html).toContain('<link rel="canonical" href="https://family-agenda.cloud/en/test">');
    expect(html).toContain('<link rel="alternate" hreflang="de" href="https://family-agenda.cloud/test">');
    expect(html).toContain('<a class="lp-brand" href="/en/"');
    expect(html).toContain('href="/test" lang="de" hreflang="de" data-lang="de" aria-label="Deutsch" title="Deutsch">DE</a>');
    expect(html).toContain('<main class="lp-legal">\n<h1>Terms &amp; more</h1>\n<blockquote>\n<p>This is a translation.</p>\n</blockquote>\n  </main>');
    expect(html).toContain(footerHtml("en", "/test"));
    expect(html).toMatch(/<\/html>\n$/);
  });

  it("links the German page home and to its English version", () => {
    const html = legalPageHtml(page, "de", "# Test\n");

    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<a class="lp-brand" href="/"');
    expect(html).toContain('href="/en/test" lang="en" hreflang="en" data-lang="en" aria-label="English" title="English">EN</a>');
    expect(html).toContain(footerHtml("de", "/en/test"));
  });
});

describe("buildSite", () => {
  const files: Record<string, string> = {
    "legal/impressum.de.md": "# Impressum\n",
    "legal/impressum.en.md": "# Imprint\n",
    "legal/datenschutz.de.md": "# Datenschutzerklärung\n",
    "legal/datenschutz.en.md": "# Privacy Policy\n",
    "legal/agb.de.md": "# AGB\n",
    "legal/agb.en.md": "# Terms\n",
    "legal/widerrufsbelehrung.de.md": "# Widerrufsbelehrung\n",
    "legal/widerrufsbelehrung.en.md": "# Withdrawal Policy\n",
    "index.html": landing(`  <footer class="lp-footer">\n  </footer>`),
    "en/index.html": landing(`  <footer class="lp-footer">\n  </footer>`),
  };
  const read = (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no ${path}`);
    return content;
  };

  it("builds the legal pages that have a text, and writes the footer into both landing pages", () => {
    expect(buildSite(read)).toEqual([
      { path: "impressum.html", content: legalPageHtml(LEGAL_PAGES[0]!, "de", "# Impressum\n") },
      { path: "en/imprint.html", content: legalPageHtml(LEGAL_PAGES[0]!, "en", "# Imprint\n") },
      { path: "datenschutz.html", content: legalPageHtml(LEGAL_PAGES[1]!, "de", "# Datenschutzerklärung\n") },
      { path: "en/privacy.html", content: legalPageHtml(LEGAL_PAGES[1]!, "en", "# Privacy Policy\n") },
      { path: "agb.html", content: legalPageHtml(LEGAL_PAGES[2]!, "de", "# AGB\n") },
      { path: "en/terms.html", content: legalPageHtml(LEGAL_PAGES[2]!, "en", "# Terms\n") },
      { path: "widerrufsbelehrung.html", content: legalPageHtml(LEGAL_PAGES[3]!, "de", "# Widerrufsbelehrung\n") },
      { path: "en/withdrawal.html", content: legalPageHtml(LEGAL_PAGES[3]!, "en", "# Withdrawal Policy\n") },
      { path: "index.html", content: landing(footerHtml("de", "en/")) },
      { path: "en/index.html", content: landing(footerHtml("en", "../")) },
    ]);
  });
});

describe("LEGAL_PAGES", () => {
  it("are the decided paths (#206)", () => {
    expect(LEGAL_PAGES.map(({ name, paths }) => [name, paths.de, paths.en])).toEqual([
      ["impressum", "/impressum", "/en/imprint"],
      ["datenschutz", "/datenschutz", "/en/privacy"],
      ["agb", "/agb", "/en/terms"],
      ["widerrufsbelehrung", "/widerrufsbelehrung", "/en/withdrawal"],
    ]);
  });
});
