import { describe, expect, it } from "vitest";
import { escapeHtml, legalHtml, legalText, legalTitle, placeholdersIn } from "../../src/legal-texts";

/** Every kind of Markdown a legal text may use. */
const EVERYTHING = `# Title with *style*

> This is a translation of the [German text](/impressum).

{{NAME}}
Family Agenda
{{POSTFLEX_ADDRESS}}

**Contact**
Mail: support@family-agenda.cloud

## § 1 Scope \\* \`code<\`

- one _em_
- two
  continued

3. third
4. fourth

- loose

  second paragraph
- tight
`;

describe("legalHtml", () => {
  it("renders every kind of Markdown a legal text uses, single newlines as line breaks", () => {
    expect(legalHtml(EVERYTHING)).toBe(`<h1>Title with <em>style</em></h1>
<blockquote>
<p>This is a translation of the <a href="/impressum">German text</a>.</p>
</blockquote>
<p>{{NAME}}<br>Family Agenda<br>{{POSTFLEX_ADDRESS}}</p>
<p><strong>Contact</strong><br>Mail: <a href="mailto:support@family-agenda.cloud">support@family-agenda.cloud</a></p>
<h2>§ 1 Scope * <code>code&lt;</code></h2>
<ul>
<li>one <em>em</em></li>
<li>two<br>continued</li>
</ul>
<ol start="3">
<li>third</li>
<li>fourth</li>
</ol>
<ul>
<li><p>loose</p>
<p>second paragraph</p>
</li>
<li><p>tight</p>
</li>
</ul>
`);
  });

  it("keeps the placeholders without values", () => {
    expect(legalHtml("{{UST_IDNR}}")).toBe("<p>{{UST_IDNR}}</p>\n");
  });

  it("fills the placeholders with escaped values, keeping their line breaks", () => {
    expect(legalHtml("{{NAME}}, {{NAME}}\n{{POSTFLEX_ADDRESS}}", { NAME: "A & B", POSTFLEX_ADDRESS: "Street 1\n12345 <Town>" })).toBe(
      "<p>A &amp; B, A &amp; B<br>Street 1<br>\n12345 &lt;Town&gt;</p>\n",
    );
  });

  it("refuses values that leave a placeholder unfilled", () => {
    expect(() => legalHtml("{{NAME}} {{STAND}} {{UST_IDNR}}", { STAND: "1" })).toThrow("No value for the placeholders NAME, UST_IDNR");
  });

  it.each([
    ["raw HTML", "<b>bold</b>", "html"],
    ["a table", "| a |\n|---|\n| b |", "table"],
    ["an image", "![logo](/logo.png)", "image"],
    ["a code block", "```\ncode\n```", "code"],
    ["a rule", "a\n\n---\n\nb", "hr"],
    ["struck text", "~~gone~~", "del"],
  ])("refuses %s, in both renderings", (_, markdown, type) => {
    const message = `A legal text cannot use Markdown of type "${type}"`;
    expect(() => legalHtml(markdown)).toThrow(message);
    expect(() => legalText(markdown)).toThrow(message);
  });
});

describe("legalText", () => {
  it("renders every kind of Markdown a legal text uses as plain text, links with their address", () => {
    expect(legalText(EVERYTHING)).toBe(`Title with style

This is a translation of the German text (https://family-agenda.cloud/impressum).

{{NAME}}
Family Agenda
{{POSTFLEX_ADDRESS}}

Contact
Mail: support@family-agenda.cloud

§ 1 Scope * code<

- one em
- two
  continued

3. third
4. fourth

- loose

  second paragraph
- tight
`);
  });

  it("numbers an ordered list from 1 unless it says otherwise, and indents what follows a marker by its width", () => {
    expect(legalText("1. a\n1. b\n1. c\n1. d\n1. e\n1. f\n1. g\n1. h\n1. i\n1. j\n   more")).toBe(
      "1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g\n8. h\n9. i\n10. j\n    more\n",
    );
  });

  it("keeps the address of an absolute link", () => {
    expect(legalText("See [the AGB](https://family-agenda.cloud/agb).")).toBe("See the AGB (https://family-agenda.cloud/agb).\n");
  });

  it("fills the placeholders with the values as they are", () => {
    expect(legalText("# T\n\nStand: {{STAND}}, {{NAME}}", { STAND: "1. Dezember 2026", NAME: "A & <B>" })).toBe("T\n\nStand: 1. Dezember 2026, A & <B>\n");
  });

  it("keeps the placeholders without values", () => {
    expect(legalText("{{STAND}}")).toBe("{{STAND}}\n");
  });

  it("refuses values that leave a placeholder unfilled", () => {
    expect(() => legalText("{{AUFSICHTSBEHOERDE}}", {})).toThrow("No value for the placeholders AUFSICHTSBEHOERDE");
  });

  it("does not take an inherited property for a value", () => {
    expect(() => legalText("{{NAME}}", Object.create({ NAME: "inherited" }) as Record<string, string>)).toThrow("NAME");
  });
});

describe("placeholdersIn", () => {
  it("names each placeholder once, in the order they first appear", () => {
    expect(placeholdersIn("{{NAME}} {{UST_IDNR}} {{NAME}} {{A1}}")).toEqual(["NAME", "UST_IDNR", "A1"]);
  });

  it("takes only upper-case names in double braces for placeholders", () => {
    expect(placeholdersIn("{{name}} {NAME} {{1A}} {{ NAME }} {{_A}}")).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapes what HTML text must not hold and makes line breaks <br>", () => {
    expect(escapeHtml(`a&b<c>d"e'f\ng`)).toBe("a&amp;b&lt;c&gt;d&quot;e&#39;f<br>\ng");
  });
});

describe("legalTitle", () => {
  it("is the text of the heading the text starts with", () => {
    expect(legalTitle("\n\n# Impressum *of* `x`\n\nText")).toBe("Impressum of x");
  });

  it.each([
    ["a paragraph", "Text\n\n# Title"],
    ["a heading of level 2", "## Title"],
    ["nothing", ""],
  ])("refuses a text that starts with %s", (_, markdown) => {
    expect(() => legalTitle(markdown)).toThrow("A legal text starts with a heading of level 1");
  });
});
