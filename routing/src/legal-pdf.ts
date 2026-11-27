/**
 * A legal text of site/legal/ as a PDF, for a mail to attach (the confirmation, #215): A4, in
 * Helvetica, its headings, paragraphs, lists and quotes laid out, bold and italics kept, links
 * clickable. Its placeholders are filled as `legalText` fills them. No I/O.
 */
import { Marked, type Token, type Tokens } from "marked";
import PDFDocument from "pdfkit";
import { placeholdersIn, SITE_URL, type Placeholders } from "./legal-texts";

const lexer = new Marked({ gfm: true, breaks: true, async: false });

/** A piece of a line in one style. */
type Run = { text: string; bold: boolean; italic: boolean; link?: string };

const MARGIN = 62;
const BODY = 10.5;
const SIZES: Record<number, number> = { 1: 19, 2: 13, 3: 11.5 };
const INK = "#2b221b";
const LINK = "#a6421d";
const INDENT = 16;

/** Marks Markdown would read in a placeholder's value as plain characters. */
const literal = (value: string) => value.replace(/[\\`*_[\]<>#|~]/g, (character) => `\\${character}`);

function filled(markdown: string, values: Placeholders): string {
  const missing = placeholdersIn(markdown).filter((name) => !Object.hasOwn(values, name));
  if (missing.length > 0) throw new Error(`No value for the placeholders ${missing.join(", ")}`);
  return markdown.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (match, name: string) => literal(values[name] ?? match));
}

/** The runs of inline tokens, styled as their parents say. */
function runsOf(tokens: readonly Token[], style: Omit<Run, "text"> = { bold: false, italic: false }): Run[] {
  return tokens.flatMap((token): Run[] => {
    switch (token.type) {
      case "strong":
        return runsOf((token as Tokens.Strong).tokens, { ...style, bold: true });
      case "em":
        return runsOf((token as Tokens.Em).tokens, { ...style, italic: true });
      case "link": {
        const { href, tokens: inner } = token as Tokens.Link;
        return runsOf(inner, { ...style, link: new URL(href, SITE_URL).href });
      }
      case "br":
        return [{ ...style, text: "\n" }];
      case "text":
        return "tokens" in token ? runsOf(token.tokens, style) : [{ ...style, text: decoded((token as Tokens.Text).text) }];
      default:
        return [{ ...style, text: decoded("text" in token ? String(token.text) : token.raw) }];
    }
  });
}

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decoded = (text: string) => text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

const fontOf = ({ bold, italic }: Run) => `Helvetica${bold || italic ? "-" : ""}${bold ? "Bold" : ""}${italic ? "Oblique" : ""}`;

/** Writes `runs` as one block at `x`, `width` wide. */
function write(doc: PDFKit.PDFDocument, runs: readonly Run[], x: number, width: number, size: number) {
  doc.fontSize(size);
  const last = runs.length - 1;
  runs.forEach((run, index) => {
    doc.font(fontOf(run)).fillColor(run.link ? LINK : INK);
    const options = { width, continued: index < last, lineGap: size * 0.28, link: run.link ?? null, underline: run.link !== undefined };
    if (index === 0) doc.text(run.text, x, doc.y, options);
    else doc.text(run.text, options);
  });
  doc.fillColor(INK);
}

/** Lays out block tokens from `x` on. */
function layout(doc: PDFKit.PDFDocument, tokens: readonly Token[], x: number) {
  const width = doc.page.width - MARGIN - x;
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const { depth, tokens: inner } = token as Tokens.Heading;
        doc.moveDown(depth === 1 ? 0 : 0.6);
        write(doc, runsOf(inner, { bold: true, italic: false }), x, width, SIZES[depth] ?? BODY);
        doc.moveDown(depth === 1 ? 0.7 : 0.35);
        break;
      }
      case "paragraph":
        write(doc, runsOf((token as Tokens.Paragraph).tokens), x, width, BODY);
        doc.moveDown(0.6);
        break;
      case "text":
        write(doc, runsOf([token]), x, width, BODY);
        break;
      case "blockquote":
        layout(doc, (token as Tokens.Blockquote).tokens, x + INDENT);
        break;
      case "list":
        list(doc, token as Tokens.List, x);
        doc.moveDown(0.6);
        break;
      default:
        break;
    }
  }
}

function list(doc: PDFKit.PDFDocument, { items, ordered, start }: Tokens.List, x: number) {
  const first = start === "" ? 1 : start;
  items.forEach((item, index) => {
    const top = doc.y;
    doc.font("Helvetica").fontSize(BODY).fillColor(INK).text(ordered ? `${first + index}.` : "•", x, top, { width: INDENT, lineBreak: false });
    doc.y = top;
    layout(doc, item.tokens, x + INDENT);
    doc.moveDown(0.15);
  });
}

/** The text as a PDF titled `title`, its placeholders filled with `values`. */
export function legalPdf(markdown: string, values: Placeholders, title: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: title, Author: "Family Agenda Cloud" }, lang: "de-DE", displayTitle: true });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });
  layout(doc, lexer.lexer(filled(markdown, values)), MARGIN);
  doc.end();
  return done;
}
