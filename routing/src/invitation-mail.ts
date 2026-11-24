/**
 * The mail that invites a person to register a Family of their own while registration is closed
 * (`routing invite`), in Family Agenda's look and in plain text, for the outbox to send. No I/O.
 */
import { MAIL_FROM, MAIL_REPLY_TO } from "./contract-mails";
import { FOOTER, mailCard, type Language } from "./mail-card";
import type { OutboxMail } from "./outbox";

/** Days an invitation link works, as the mail says. */
export const INVITATION_DAYS = 7;

/** What the mail says, the same in HTML and plain text; `open` leads to the link in plain text, in place of the button. */
type Words = { subject: string; heading: string; intro: string; open: string; button: string; note: string; fallback: string; more: readonly string[] };

const WORDS: Record<Language, Words> = {
  de: {
    subject: "Einladung zum Testbetrieb von Family Agenda",
    heading: "Du bist eingeladen",
    intro: "Du bist eingeladen, Family Agenda mit deiner Familie zu testen. Nimm die Einladung an, um dein Konto und deine eigene Familie anzulegen.",
    open: "Öffne dazu diesen Link:",
    button: "Einladung annehmen",
    note: `Der Link gilt ${INVITATION_DAYS} Tage und funktioniert einmal. Brich das Anlegen nicht ab: Dann brauchst du einen neuen Link.`,
    fallback: "Klappt der Button nicht, kopiere diese Adresse in den Browser:",
    more: [
      "Family Agenda ist noch im Testbetrieb. Es kann noch etwas fehlen oder nicht funktionieren.",
      "Fragen oder Fehler gefunden? Antworte einfach auf diese Mail. Du kennst uns nicht? Dann ignoriere sie.",
    ],
  },
  en: {
    subject: "Invitation to the Family Agenda trial run",
    heading: "You are invited",
    intro: "You are invited to try Family Agenda with your family. Accept the invitation to create your account and your own Family.",
    open: "Open this link:",
    button: "Accept invitation",
    note: `The link works once and expires in ${INVITATION_DAYS} days. Please finish signing up: if you cancel, you need a new link.`,
    fallback: "If the button does not work, copy this address into your browser:",
    more: [
      "Family Agenda is still in its trial run. Some things may be missing or not work yet.",
      "Questions, or found a bug? Just reply to this email. You don't know us? Then ignore it.",
    ],
  },
};

/** The mail inviting `email` with `link`, in `language`. */
export function invitationMail(language: Language, email: string, link: string): OutboxMail {
  const { open, ...words } = WORDS[language];
  const { subject, intro, note, more } = words;
  const text = `${[intro, open, link, note, ...more, FOOTER[language]].join("\n\n")}\n`;
  return { from: MAIL_FROM, replyTo: MAIL_REPLY_TO, to: email, subject, text, html: mailCard({ ...words, shows: "link", link }, language) };
}
