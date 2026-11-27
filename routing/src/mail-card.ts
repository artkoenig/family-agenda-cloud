/**
 * The look of Family Agenda's mails: one card with the logo, a heading, the code or a button, and a
 * note. For the mails Logto sends (`mail-templates.ts`) and the invitation to a Family of one's own
 * (`invitation-mail.ts`). No I/O.
 */
import { escapeHtml } from "./legal-texts";

export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The logo, a PNG: many mail programs show no SVG. The landing page serves it (site/). */
export const LOGO_URL = "https://family-agenda.cloud/mail-logo.png";

/** What one mail says; `code` mails show Logto's `{{code}}`, `link` mails a button to `link`, and after the note `more`. */
export type CardMail = { subject: string; heading: string; intro: string; note: string } & (
  | { shows: "code" }
  | { shows: "link"; link: string; button: string; fallback: string; more?: readonly string[] }
);

/** The line under every mail. */
export const FOOTER: Record<Language, string> = {
  de: "Family Agenda Cloud · betrieben in Deutschland · family-agenda.cloud",
  en: "Family Agenda Cloud · run in Germany · family-agenda.cloud",
};

// Mail programs keep little CSS: tables, inline styles, and fonts that fall back to Arial.
export const FONT = "'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif";
const MONO = "'Atkinson Hyperlegible Mono',Menlo,Consolas,monospace";
export const INK = "#2b221b";
export const MUTED = "#6b5c4e";
export const SUNKEN = "#f1e9de";
const ACCENT = "#bb4f29";
export const ACCENT_INK = "#a6421d";

/** The mail as one HTML document in Family Agenda's look. The texts are HTML; only the link is escaped. */
export function mailCard(mail: CardMail, language: Language): string {
  return mailDocument(language, { subject: mail.subject, preview: mail.intro, heading: mail.heading, content: `<p style="margin:0 0 18px;">${mail.intro}</p>\n${action(mail)}` });
}

/** What a mail in Family Agenda's look holds, as HTML: `preview` is what mail programs show next to the subject; `footer` defaults to FOOTER. */
export type MailPage = { subject: string; preview: string; heading: string; content: string; footer?: string };

/** One HTML document: the card with the logo, `heading` and `content`, and the footer under it. */
export function mailDocument(language: Language, page: MailPage): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${page.subject}</title>
</head>
<body style="margin:0;padding:0;background:${SUNKEN};">
<div style="display:none;max-height:0;overflow:hidden;">${page.preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SUNKEN};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#fffdf9;border:1px solid #e6dccd;border-radius:14px;">
<tr><td style="padding:28px 28px 24px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="${LOGO_URL}" width="26" height="26" alt="" style="display:block;border:0;border-radius:6px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK};">Family Agenda Cloud</td>
</tr></table>
<h1 style="margin:24px 0 8px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:700;color:${INK};">${page.heading}</h1>
${page.content}
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${MUTED};">${page.footer ?? FOOTER[language]}</p>
</td></tr>
</table>
</body>
</html>`;
}

/** A button to `link`; `outlined` for one that is no main action. `link` is escaped, `label` is HTML. */
export function mailButton(link: string, label: string, outlined = false): string {
  const colors = outlined ? `background:#fffdf9;border:1.5px solid ${ACCENT};color:${ACCENT_INK};` : `background:${ACCENT};color:#ffffff;`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 10px 0;"><tr>
<td bgcolor="${outlined ? "#fffdf9" : ACCENT}" style="border-radius:10px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:15px;font-weight:700;${colors}text-decoration:none;border-radius:10px;">${label}</a></td>
</tr></table>`;
}

/** The code, or the button with its note and the link written out. */
function action(mail: CardMail): string {
  const note = (text: string) => `<p style="margin:18px 0 0;font-size:13.5px;line-height:1.5;color:${MUTED};">${text}</p>`;
  if (mail.shows === "code") {
    return `<div style="background:#f8e3d8;color:#a6421d;border-radius:10px;padding:16px 0 16px 0.28em;text-align:center;font-family:${MONO};font-size:32px;font-weight:600;letter-spacing:0.28em;">{{code}}</div>
${note(mail.note)}`;
  }
  const link = escapeHtml(mail.link);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#bb4f29" style="border-radius:10px;"><a href="${link}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${mail.button}</a></td>
</tr></table>
${note(`${mail.note} ${mail.fallback}<br><a href="${link}" style="color:${ACCENT_INK};word-break:break-all;">${link}</a>`)}${(mail.more ?? []).map(note).join("")}`;
}
