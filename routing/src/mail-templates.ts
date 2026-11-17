/**
 * The mails Logto sends, in Family Agenda's look: one card with the logo, a heading, the code or a
 * button, and a note. Logto keeps them per template type and language (`PUT /api/email-templates`)
 * and picks the one of the reader's language, else of the sign-in experience's fallback language;
 * the SMTP connector's own template only when neither exists. Logto fills `{{code}}` and `{{link}}`.
 *
 * What the texts promise is what Logto and the core do: a code expires after Logto's 10 minutes; an
 * invitation link, the core's, works once and for 7 days. An invitation names neither who invites
 * nor the Organization, whose name is the same for every Family.
 */
import { managementFetch, type IdpManagement } from "./logto-management";

/** The template types of Logto 1.46's connector kit. */
export const TEMPLATE_TYPES = [
  "SignIn",
  "Register",
  "ForgotPassword",
  "OrganizationInvitation",
  "Generic",
  "UserPermissionValidation",
  "BindNewIdentifier",
  "MfaVerification",
  "BindMfa",
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** One entry of Logto's email templates. */
export type EmailTemplate = {
  languageTag: Language;
  templateType: TemplateType;
  details: { subject: string; content: string; contentType: "text/html" };
};

/** The logo, a PNG: many mail programs show no SVG. The landing page serves it (site/). */
export const LOGO_URL = "https://family-agenda.cloud/mail-logo.png";

/** What one mail says; `code` mails show `{{code}}`, `link` mails a button to `{{link}}`. */
type Mail = { subject: string; heading: string; intro: string; note: string } & ({ shows: "code" } | { shows: "link"; button: string; fallback: string });

/** Every mail but the invitation shows a code; they differ in why it came and what to do if unasked. */
type CodeMail = { subject: string; heading: string; intro: string; unasked: string };

const CODE_EXPIRY: Record<Language, string> = { de: "Der Code gilt 10 Minuten.", en: "The code expires in 10 minutes." };

const CODE_MAILS: Record<Exclude<TemplateType, "OrganizationInvitation">, Record<Language, CodeMail>> = {
  Register: {
    de: {
      subject: "Dein Code für Family Agenda: {{code}}",
      heading: "Bestätige deine Mail-Adresse",
      intro: "Gib diesen Code im Browser ein, um dein Konto anzulegen:",
      unasked: "Du hast dich nicht registriert? Dann ignoriere diese Mail einfach, es passiert nichts.",
    },
    en: {
      subject: "Your Family Agenda code: {{code}}",
      heading: "Confirm your email address",
      intro: "Enter this code in your browser to create your account:",
      unasked: "You did not sign up? Just ignore this email, nothing will happen.",
    },
  },
  ForgotPassword: {
    de: {
      subject: "Passwort zurücksetzen: dein Code {{code}}",
      heading: "Neues Passwort festlegen",
      intro: "Gib diesen Code im Browser ein, um ein neues Passwort festzulegen:",
      unasked: "Du hast kein neues Passwort angefordert? Dann ignoriere diese Mail, dein Passwort bleibt, wie es ist.",
    },
    en: {
      subject: "Reset your password: your code {{code}}",
      heading: "Set a new password",
      intro: "Enter this code in your browser to set a new password:",
      unasked: "You did not ask for a new password? Just ignore this email, your password stays as it is.",
    },
  },
  SignIn: {
    de: {
      subject: "Dein Anmeldecode für Family Agenda: {{code}}",
      heading: "Anmelden",
      intro: "Gib diesen Code im Browser ein, um dich anzumelden:",
      unasked: "Du wolltest dich nicht anmelden? Dann ignoriere diese Mail einfach.",
    },
    en: {
      subject: "Your Family Agenda sign-in code: {{code}}",
      heading: "Sign in",
      intro: "Enter this code in your browser to sign in:",
      unasked: "You did not try to sign in? Just ignore this email.",
    },
  },
  Generic: {
    de: {
      subject: "Dein Code für Family Agenda: {{code}}",
      heading: "Dein Bestätigungscode",
      intro: "Gib diesen Code im Browser ein:",
      unasked: "Du hast keinen Code angefordert? Dann ignoriere diese Mail einfach.",
    },
    en: {
      subject: "Your Family Agenda code: {{code}}",
      heading: "Your verification code",
      intro: "Enter this code in your browser:",
      unasked: "You did not ask for a code? Just ignore this email.",
    },
  },
  UserPermissionValidation: {
    de: {
      subject: "Bestätige die Änderung: dein Code {{code}}",
      heading: "Bestätige, dass du es bist",
      intro: "Gib diesen Code ein, um die Änderung an deinem Konto zu bestätigen:",
      unasked: "Das warst du nicht? Dann ignoriere diese Mail und ändere am besten dein Passwort.",
    },
    en: {
      subject: "Confirm the change: your code {{code}}",
      heading: "Confirm it is you",
      intro: "Enter this code to confirm the change to your account:",
      unasked: "This was not you? Ignore this email, and best change your password.",
    },
  },
  BindNewIdentifier: {
    de: {
      subject: "Bestätige deine neue Mail-Adresse: dein Code {{code}}",
      heading: "Bestätige deine neue Mail-Adresse",
      intro: "Gib diesen Code ein, um diese Mail-Adresse mit deinem Konto zu verknüpfen:",
      unasked: "Das warst du nicht? Dann ignoriere diese Mail einfach.",
    },
    en: {
      subject: "Confirm your new email address: your code {{code}}",
      heading: "Confirm your new email address",
      intro: "Enter this code to link this email address to your account:",
      unasked: "This was not you? Just ignore this email.",
    },
  },
  MfaVerification: {
    de: {
      subject: "Dein Bestätigungscode für Family Agenda: {{code}}",
      heading: "Bestätige deine Anmeldung",
      intro: "Gib diesen Code ein, um deine Anmeldung zu bestätigen:",
      unasked: "Du hast dich nicht angemeldet? Dann ändere am besten dein Passwort.",
    },
    en: {
      subject: "Your Family Agenda verification code: {{code}}",
      heading: "Confirm your sign-in",
      intro: "Enter this code to confirm your sign-in:",
      unasked: "You did not sign in? Best change your password.",
    },
  },
  BindMfa: {
    de: {
      subject: "Zweiten Faktor einrichten: dein Code {{code}}",
      heading: "Zweiten Faktor einrichten",
      intro: "Gib diesen Code ein, um diese Mail-Adresse als zweiten Faktor einzurichten:",
      unasked: "Das warst du nicht? Dann ignoriere diese Mail und ändere am besten dein Passwort.",
    },
    en: {
      subject: "Set up a second factor: your code {{code}}",
      heading: "Set up a second factor",
      intro: "Enter this code to set up this email address as a second factor:",
      unasked: "This was not you? Ignore this email, and best change your password.",
    },
  },
};

const INVITATION: Record<Language, Mail> = {
  de: {
    subject: "Einladung: verwalte eine Family Agenda",
    heading: "Du bist eingeladen",
    intro: "Du wurdest eingeladen, eine Family Agenda als Admin zu verwalten. Nimm die Einladung an, um dich anzumelden oder dein Konto anzulegen:",
    shows: "link",
    button: "Einladung annehmen",
    note: "Der Link gilt 7 Tage und funktioniert einmal.",
    fallback: "Klappt der Button nicht, kopiere diese Adresse in den Browser:",
  },
  en: {
    subject: "You are invited to manage a Family Agenda",
    heading: "You are invited",
    intro: "You are invited to manage a Family Agenda as an Admin. Accept the invitation to sign in, or to create your account:",
    shows: "link",
    button: "Accept invitation",
    note: "The link works once and expires in 7 days.",
    fallback: "If the button does not work, copy this address into your browser:",
  },
};

const FOOTER: Record<Language, string> = {
  de: "Family Agenda Cloud · betrieben in Deutschland · family-agenda.cloud",
  en: "Family Agenda Cloud · run in Germany · family-agenda.cloud",
};

/** Every template type in every language. */
export function mailTemplates(): EmailTemplate[] {
  return LANGUAGES.flatMap((language) =>
    TEMPLATE_TYPES.map((templateType) => {
      const mail = mailOf(templateType, language);
      return { languageTag: language, templateType, details: { subject: mail.subject, content: html(mail, language), contentType: "text/html" } };
    }),
  );
}

function mailOf(templateType: TemplateType, language: Language): Mail {
  if (templateType === "OrganizationInvitation") return INVITATION[language];
  const { unasked, ...mail } = CODE_MAILS[templateType][language];
  return { ...mail, shows: "code", note: `${CODE_EXPIRY[language]} ${unasked}` };
}

/** Puts every template into Logto, replacing those of the same type and language. */
export async function putMailTemplates(idp: IdpManagement, templates: EmailTemplate[]): Promise<void> {
  const response = await managementFetch(idp, "/api/email-templates", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templates }),
  });
  if (!response.ok) throw new Error(`Logto's Management API answered putting the email templates with ${response.status}`);
}

// Mail programs keep little CSS: tables, inline styles, and fonts that fall back to Arial.
const FONT = "'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif";
const MONO = "'Atkinson Hyperlegible Mono',Menlo,Consolas,monospace";
const INK = "#2b221b";
const MUTED = "#6b5c4e";
const SUNKEN = "#f1e9de";

function html(mail: Mail, language: Language): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${mail.subject}</title>
</head>
<body style="margin:0;padding:0;background:${SUNKEN};">
<div style="display:none;max-height:0;overflow:hidden;">${mail.intro}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SUNKEN};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#fffdf9;border:1px solid #e6dccd;border-radius:14px;">
<tr><td style="padding:28px 28px 24px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="${LOGO_URL}" width="26" height="26" alt="" style="display:block;border:0;border-radius:6px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK};">Family Agenda</td>
</tr></table>
<h1 style="margin:24px 0 8px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:700;color:${INK};">${mail.heading}</h1>
<p style="margin:0 0 18px;">${mail.intro}</p>
${action(mail)}
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${MUTED};">${FOOTER[language]}</p>
</td></tr>
</table>
</body>
</html>`;
}

/** The code, or the button with its note and the link written out. */
function action(mail: Mail): string {
  const note = (text: string) => `<p style="margin:18px 0 0;font-size:13.5px;line-height:1.5;color:${MUTED};">${text}</p>`;
  if (mail.shows === "code") {
    return `<div style="background:#f8e3d8;color:#a6421d;border-radius:10px;padding:16px 0 16px 0.28em;text-align:center;font-family:${MONO};font-size:32px;font-weight:600;letter-spacing:0.28em;">{{code}}</div>
${note(mail.note)}`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#bb4f29" style="border-radius:10px;"><a href="{{link}}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${mail.button}</a></td>
</tr></table>
${note(`${mail.note} ${mail.fallback}<br><a href="{{link}}" style="color:#a6421d;word-break:break-all;">{{link}}</a>`)}`;
}
