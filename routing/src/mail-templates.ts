/**
 * The mails Logto sends, in Family Agenda's look (`mailCard`). Logto keeps them per template type and
 * language (`PUT /api/email-templates`)
 * and picks the one of the reader's language, else of the sign-in experience's fallback language;
 * the SMTP connector's own template only when neither exists. Logto fills `{{code}}` and `{{link}}`.
 *
 * What the texts promise is what Logto and the core do: a code expires after Logto's 10 minutes; an
 * invitation link, the core's, works once and for 7 days. An invitation names neither who invites
 * nor the Organization, whose name is the same for every Family.
 */
import { LANGUAGES, mailCard, type CardMail, type Language } from "./mail-card";
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

/** One entry of Logto's email templates. */
export type EmailTemplate = {
  languageTag: Language;
  templateType: TemplateType;
  details: { subject: string; content: string; contentType: "text/html" };
};

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
      unasked: "Wasn't you? Ignore this email; we recommend changing your password.",
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
      unasked: "Wasn't you? Just ignore this email.",
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
      unasked: "You did not sign in? We recommend changing your password.",
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
      unasked: "Wasn't you? Ignore this email; we recommend changing your password.",
    },
  },
};

const INVITATION: Record<Language, CardMail> = {
  de: {
    subject: "Einladung: Verwalte eine Family Agenda mit",
    heading: "Du bist eingeladen",
    intro: "Du wurdest eingeladen, eine Family Agenda als Admin zu verwalten. Nimm die Einladung an, um dich anzumelden oder dein Konto anzulegen:",
    shows: "link",
    link: "{{link}}",
    button: "Einladung annehmen",
    note: "Der Link gilt 7 Tage und funktioniert einmal.",
    fallback: "Klappt der Button nicht, kopiere diese Adresse in den Browser:",
  },
  en: {
    subject: "You are invited to manage a Family Agenda",
    heading: "You are invited",
    intro: "You are invited to manage a Family Agenda as an Admin. Accept the invitation to sign in, or to create your account:",
    shows: "link",
    link: "{{link}}",
    button: "Accept invitation",
    note: "The link works once and expires in 7 days.",
    fallback: "If the button does not work, copy this address into your browser:",
  },
};

/** Every template type in every language. */
export function mailTemplates(): EmailTemplate[] {
  return LANGUAGES.flatMap((language) =>
    TEMPLATE_TYPES.map((templateType) => {
      const mail = mailOf(templateType, language);
      return { languageTag: language, templateType, details: { subject: mail.subject, content: mailCard(mail, language), contentType: "text/html" } };
    }),
  );
}

function mailOf(templateType: TemplateType, language: Language): CardMail {
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
