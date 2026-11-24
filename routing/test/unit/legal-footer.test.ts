import { describe, expect, it } from "vitest";
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "../../src/legal-footer";

describe("legalFooterHtml", () => {
  it("links Impressum, privacy policy and AGB on the apex, absolutely, on German pages", () => {
    expect(legalFooterHtml("de")).toBe(
      '<footer class="legal" aria-label="Rechtliches"><a href="https://family-agenda.cloud/impressum">Impressum</a> · <a href="https://family-agenda.cloud/datenschutz">Datenschutz</a> · <a href="https://family-agenda.cloud/agb">AGB</a></footer>',
    );
  });

  it("links their English translations on English pages", () => {
    expect(legalFooterHtml("en")).toBe(
      '<footer class="legal" aria-label="Legal"><a href="https://family-agenda.cloud/en/imprint">Imprint</a> · <a href="https://family-agenda.cloud/en/privacy">Privacy</a> · <a href="https://family-agenda.cloud/en/terms">Terms</a></footer>',
    );
  });
});

describe("LEGAL_FOOTER_STYLE", () => {
  it("keeps the footer small and muted, and off paper", () => {
    expect(LEGAL_FOOTER_STYLE).toBe(".legal{font-size:14px;color:var(--ink-muted)}\n.legal a{color:inherit}\n@media print{.legal{display:none}}");
  });
});
