/**
 * The pages of central sign-in (#154): German or English by the browser's Accept-Language,
 * German unless it prefers English. In the landing page's colors and font, inline: the Router
 * serves no files, and the landing page's stylesheets are not public before launch. No I/O.
 */

export type Language = "de" | "en";

/** A page central sign-in shows instead of sending the person into a Family. */
export type SignInPage = "preparing" | "unavailable" | "several" | "failed";

/** Where the waiting page asks again. */
export const WAITING_PATH = "/sign-in/waiting";

/** How often the waiting page asks again, in seconds. */
const ASK_AGAIN_SECONDS = 5;

type Text = { title: string; lines: string[]; link?: { href: string; label: string } };

const TEXTS: Record<Language, Record<SignInPage, Text>> = {
  de: {
    preparing: {
      title: "Deine Family wird vorbereitet",
      lines: ["Das dauert meist nur einen Moment.", "Diese Seite geht von selbst weiter, sobald deine Family bereit ist."],
    },
    unavailable: { title: "Family nicht verfügbar", lines: ["Diese Family ist zurzeit nicht verfügbar."] },
    several: { title: "Anmeldung nicht möglich", lines: ["Dein Konto gehört zu mehr als einer Family. Bitte wende dich an den Support."] },
    failed: {
      title: "Anmeldung fehlgeschlagen",
      lines: ["Die Anmeldung konnte nicht abgeschlossen werden."],
      link: { href: "/sign-in", label: "Erneut anmelden" },
    },
  },
  en: {
    preparing: {
      title: "Your Family is being prepared",
      lines: ["This usually takes only a moment.", "This page moves on by itself as soon as your Family is ready."],
    },
    unavailable: { title: "Family not available", lines: ["This Family is not available at the moment."] },
    several: { title: "Sign-in not possible", lines: ["Your account belongs to more than one Family. Please contact support."] },
    failed: { title: "Sign-in failed", lines: ["Sign-in could not be completed."], link: { href: "/sign-in", label: "Sign in again" } },
  },
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

/** The page, as a whole HTML document. */
export function signInPage(page: SignInPage, language: Language): string {
  const { title, lines, link } = TEXTS[language][page];
  const refresh = page === "preparing" ? `\n<meta http-equiv="refresh" content="${ASK_AGAIN_SECONDS};url=${WAITING_PATH}">` : "";
  const paragraphs = lines.map((line) => `<p>${line}</p>`).join("\n");
  const action = link ? `\n<p><a class="button" href="${link.href}">${link.label}</a></p>` : "";
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${refresh}
<title>${title} · Family Agenda</title>
<style>${STYLE}</style>
</head>
<body>
<main class="card">
<p class="brand">Family Agenda</p>
<h1>${title}</h1>
${paragraphs}${action}
</main>
</body>
</html>
`;
}

/** The landing page's tokens (site/tokens.css), light and dark, as far as these pages use them. */
const STYLE = `
:root{color-scheme:light;--surface:#faf6f0;--surface-raised:#fffdf9;--line:#e6dccd;--ink:#2b221b;--ink-muted:#6b5c4e;--hearth:#bb4f29;--on-hearth:#fff;--shadow:0 1px 2px rgba(74,52,30,.08),0 4px 12px rgba(74,52,30,.06)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--surface:#1c1814;--surface-raised:#262019;--line:#3a3129;--ink:#f5eee5;--ink-muted:#b8a999;--hearth:#e8875f;--on-hearth:#1c1814;--shadow:0 1px 2px rgba(0,0,0,.5),0 4px 12px rgba(0,0,0,.3)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--surface);color:var(--ink);font:16px/1.55 'Atkinson Hyperlegible Next',system-ui,sans-serif}
.card{max-width:480px;width:100%;padding:28px;background:var(--surface-raised);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.brand{margin:0 0 16px;font-weight:700;color:var(--hearth)}
h1{margin:0 0 12px;font-size:1.5rem;line-height:1.25}
p{margin:0 0 8px;color:var(--ink-muted)}
.button{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:999px;background:var(--hearth);color:var(--on-hearth);font-weight:700;text-decoration:none}
`;
