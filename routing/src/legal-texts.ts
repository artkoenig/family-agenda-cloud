/**
 * The legal texts of site/legal/ (`<name>.de.md`, `<name>.en.md`), rendered from their Markdown:
 * to HTML for the static pages of the apex (legal-pages.ts), and to plain text for a mail that
 * embeds a text (#215). Single newlines are line breaks, as in an address.
 *
 * A text holds placeholders like `{{NAME}}`, which the Operator fills before go-live. Without
 * values they stay as they are; with values, every placeholder of the text must have one. No I/O.
 */
import { Marked, type RendererObject, type Token } from "marked";

/** The apex, against which a text's links to its pages resolve in plain text. */
export const SITE_URL = "https://family-agenda.cloud";

/** The values of a text's placeholders, by name: `{ NAME: "…" }` fills `{{NAME}}`. */
export type Placeholders = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * What a legal text may use: headings, paragraphs, quotes, lists, bold, italics, links and code.
 * Anything else (raw HTML, tables, images, code blocks, rules) is refused, so both renderings show
 * all of a text.
 */
const SUPPORTED = new Set(["space", "heading", "paragraph", "blockquote", "list", "list_item", "text", "strong", "em", "link", "br", "escape", "codespan"]);

function refuseUnsupported(token: Token): void {
  if (!SUPPORTED.has(token.type)) throw new Error(`A legal text cannot use Markdown of type "${token.type}"`);
}

const OPTIONS = { gfm: true, breaks: true, async: false, walkTokens: refuseUnsupported } as const;

const inline = (parser: { parseInline(tokens: Token[]): string }, tokens: Token[]) => parser.parseInline(tokens);

const plainText: RendererObject = {
  heading({ tokens }) {
    return `${inline(this.parser, tokens)}\n\n`;
  },
  paragraph({ tokens }) {
    return `${inline(this.parser, tokens)}\n\n`;
  },
  blockquote({ tokens }) {
    return this.parser.parse(tokens);
  },
  list({ items, ordered, start }) {
    const first = Number(start);
    const lines = items.map((item, index) => {
      const marker = ordered ? `${first + index}. ` : "- ";
      return marker + this.parser.parse(item.tokens).trim().replace(/\n(?=.)/g, `\n${" ".repeat(marker.length)}`);
    });
    return `${lines.join("\n")}\n\n`;
  },
  text(token) {
    return "tokens" in token ? inline(this.parser, token.tokens) : token.text;
  },
  strong({ tokens }) {
    return inline(this.parser, tokens);
  },
  em({ tokens }) {
    return inline(this.parser, tokens);
  },
  codespan: ({ text }) => text,
  br: () => "\n",
  link({ href, tokens, autolink }) {
    const text = inline(this.parser, tokens);
    return autolink === true ? text : `${text} (${new URL(href, SITE_URL).href})`;
  },
};

const toHtml = new Marked(OPTIONS);
const toText = new Marked({ ...OPTIONS, renderer: plainText });

/** Synchronous by OPTIONS. */
const render = (marked: Marked, markdown: string) => marked.parse(markdown) as string;

/** The names of the placeholders a text holds, each once, in the order they first appear. */
export function placeholdersIn(markdown: string): string[] {
  return [...new Set(Array.from(markdown.matchAll(PLACEHOLDER), ([placeholder]) => placeholder.slice(2, -2)))];
}

function fill(rendered: string, markdown: string, values: Placeholders | undefined, encode: (value: string) => string): string {
  if (values === undefined) return rendered;
  const missing = placeholdersIn(markdown).filter((name) => !Object.hasOwn(values, name));
  if (missing.length > 0) throw new Error(`No value for the placeholders ${missing.join(", ")}`);
  return rendered.replace(PLACEHOLDER, (match, name: string) => encode(values[name] ?? match));
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "\n": "<br>\n" };

/** A value as HTML text: escaped, its line breaks kept. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'\n]/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** The text as HTML, its placeholders filled with `values` if given. */
export function legalHtml(markdown: string, values?: Placeholders): string {
  return fill(render(toHtml, markdown), markdown, values, escapeHtml);
}

/** The text as plain text, without Markdown, ending in one newline (links show their address); its placeholders filled with `values` if given. */
export function legalText(markdown: string, values?: Placeholders): string {
  const text = render(toText, markdown).trim();
  return `${fill(text, markdown, values, (value) => value)}\n`;
}

/** The title of a text: its first block, which must be a heading of level 1. */
export function legalTitle(markdown: string): string {
  const [first] = toHtml.lexer(markdown).filter((token) => token.type !== "space");
  if (first?.type !== "heading" || first.depth !== 1) throw new Error("A legal text starts with a heading of level 1");
  return legalText(`# ${first.text}`).trimEnd();
}
