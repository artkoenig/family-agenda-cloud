/**
 * The pages of central sign-in (#154): German or English by the browser's Accept-Language,
 * German unless it prefers English. In the landing page's design system: its tokens.css and
 * design.css, which Caddy serves at DESIGN_PATH (cube/Caddyfile), since the Router serves no files.
 * Like every page the Routing module serves, they carry the legal footer (legal-footer.ts). No I/O.
 */
import { LEGAL_FOOTER_STYLE, legalFooterHtml } from "./legal-footer";

export type Language = "de" | "en";

/** A page central sign-in shows instead of sending the person into a Family. */
export type SignInPage = "preparing" | "unavailable" | "several" | "failed";

/** Where Caddy serves the landing page's tokens.css, design.css and fonts on the Router's host. */
export const DESIGN_PATH = "/design";

/** Where the waiting page asks again. */
export const WAITING_PATH = "/sign-in/waiting";

/** Abmelden: ends Logto's session, back to the landing page. */
export const SIGN_OUT_PATH = "/sign-in/out";

/** How often the waiting page asks again, in seconds. */
const ASK_AGAIN_SECONDS = 5;

/** The support contact these pages give a person who cannot get in (#173). */
const SUPPORT_EMAIL = "support@family-agenda.cloud";
const SUPPORT_LINK = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;

type Action = { href: string; label: string };

const SIGN_OUT: Record<Language, Action> = { de: { href: SIGN_OUT_PATH, label: "Abmelden" }, en: { href: SIGN_OUT_PATH, label: "Sign out" } };

/** A page's text; lines may hold the support link, so they are HTML. */
type Text = { title: string; lines: string[]; actions: Action[] };

const TEXTS: Record<Language, Record<SignInPage, Text>> = {
  de: {
    preparing: {
      title: "Deine Familie wird vorbereitet",
      lines: ["Das dauert meist nur einen Moment.", "Du wirst automatisch weitergeleitet, sobald deine Familie bereit ist."],
      actions: [],
    },
    unavailable: {
      title: "Familie nicht verfügbar",
      lines: ["Diese Familie ist zurzeit nicht verfügbar.", `Fragen? Schreib uns: ${SUPPORT_LINK}`],
      actions: [SIGN_OUT.de],
    },
    several: {
      title: "Anmeldung nicht möglich",
      lines: ["Dein Konto gehört zu mehr als einer Familie.", `Bitte schreib uns: ${SUPPORT_LINK}`],
      actions: [SIGN_OUT.de],
    },
    failed: {
      title: "Anmeldung fehlgeschlagen",
      lines: ["Die Anmeldung konnte nicht abgeschlossen werden."],
      actions: [{ href: "/sign-in", label: "Erneut anmelden" }],
    },
  },
  en: {
    preparing: {
      title: "Your family is being prepared",
      lines: ["This usually takes only a moment.", "You'll be redirected automatically as soon as your family is ready."],
      actions: [],
    },
    unavailable: {
      title: "Family not available",
      lines: ["This family is not available at the moment.", `Questions? Write to us: ${SUPPORT_LINK}`],
      actions: [SIGN_OUT.en],
    },
    several: {
      title: "Sign-in not possible",
      lines: ["Your account belongs to more than one family.", `Please write to us: ${SUPPORT_LINK}`],
      actions: [SIGN_OUT.en],
    },
    failed: { title: "Sign-in failed", lines: ["Sign-in could not be completed."], actions: [{ href: "/sign-in", label: "Sign in again" }] },
  },
};

/** What the waiting page adds after 2 minutes of waiting. */
const LONG_WAIT: Record<Language, Pick<Text, "lines" | "actions">> = {
  de: { lines: [`Dauert es länger? Schreib uns: ${SUPPORT_LINK}`], actions: [SIGN_OUT.de] },
  en: { lines: [`Taking longer? Write to us: ${SUPPORT_LINK}`], actions: [SIGN_OUT.en] },
};

/** The language of the pages for this Accept-Language: the first of German and English the browser prefers, German if neither. */
export function languageOf(acceptLanguage: string | undefined): Language {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.trim().toLowerCase().split(";");
      const quality = parameters.map((parameter) => /^\s*q=([\d.]+)\s*$/.exec(parameter)?.[1]).find((value) => value !== undefined);
      return { primary: tag.split("-")[0], quality: quality === undefined ? 1 : Number(quality) };
    })
    .filter(({ primary, quality }) => (primary === "de" || primary === "en") && quality > 0)
    .sort((a, b) => b.quality - a.quality);
  return ranked[0]?.primary === "en" ? "en" : "de";
}

/** The page, as a whole HTML document; the waiting page after 2 minutes if `waitedLong`. */
export function signInPage(page: SignInPage, language: Language, waitedLong = false): string {
  const text = TEXTS[language][page];
  const more = page === "preparing" && waitedLong ? LONG_WAIT[language] : { lines: [], actions: [] };
  const { title } = text;
  const lines = [...text.lines, ...more.lines];
  const actions = [...text.actions, ...more.actions];
  const refresh = page === "preparing" ? `\n<meta http-equiv="refresh" content="${ASK_AGAIN_SECONDS};url=${WAITING_PATH}">` : "";
  const paragraphs = lines.map((line) => `<p>${line}</p>`).join("\n");
  const action = actions.map(({ href, label }) => `\n<p class="action"><a class="fam-button fam-button--primary" href="${href}">${label}</a></p>`).join("");
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${refresh}
<title>${title} · Family Agenda</title>
<link rel="stylesheet" href="${DESIGN_PATH}/tokens.css">
<link rel="stylesheet" href="${DESIGN_PATH}/design.css">
<style>${STYLE}</style>
</head>
<body class="fam-page">
<main class="card">
<p class="brand">Family Agenda</p>
<h1>${title}</h1>
${paragraphs}${action}
</main>
${legalFooterHtml(language)}
</body>
</html>
`;
}

/** The card around a page and the footer below it; everything else comes from the design system. */
const STYLE = `
body{display:grid;place-items:center;gap:16px;padding:24px 16px}
.card{max-width:480px;width:100%;padding:28px;background:var(--surface-raised);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-raised)}
.brand{margin:0 0 16px;font-weight:800;color:var(--ink)}
h1{margin:0 0 12px;font-size:26px;line-height:32px}
p{margin:0 0 8px;color:var(--ink-muted)}
.action{margin-top:20px}
${LEGAL_FOOTER_STYLE}
`;
