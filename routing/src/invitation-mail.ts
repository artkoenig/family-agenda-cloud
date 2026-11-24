/**
 * The mail that invites a person to register a Family of their own while registration is closed
 * (`routing invite`), in plain text, for the outbox to send. No I/O.
 */
import { MAIL_FROM, MAIL_REPLY_TO, type ContractMail } from "./contract-mails";
import type { Language } from "./contract-wording";

/** Days an invitation link works, as the mail says. */
export const INVITATION_DAYS = 7;

type Words = { subject: string; lines: (link: string) => string[] };

const WORDS: Record<Language, Words> = {
  de: {
    subject: "Einladung zum Testbetrieb von Family Agenda",
    lines: (link) => [
      "Hallo,",
      "du bist eingeladen, Family Agenda mit deiner Familie zu testen. Öffne diesen Link, um dein Konto und deine eigene Familie anzulegen:",
      link,
      `Der Link gilt ${INVITATION_DAYS} Tage und funktioniert einmal. Brich das Anlegen nicht ab: Dann brauchst du einen neuen Link.`,
      "Family Agenda ist noch im Testbetrieb. Er ist kostenlos. Es kann noch etwas fehlen oder nicht funktionieren.",
      "Fragen oder Fehler gefunden? Antworte einfach auf diese Mail. Du kennst uns nicht? Dann ignoriere sie.",
      "Family Agenda Cloud · betrieben in Deutschland · family-agenda.cloud",
    ],
  },
  en: {
    subject: "Invitation to the Family Agenda trial run",
    lines: (link) => [
      "Hello,",
      "you are invited to try Family Agenda with your family. Open this link to create your account and your own Family:",
      link,
      `The link works once and expires in ${INVITATION_DAYS} days. Please finish signing up: if you cancel, you need a new link.`,
      "Family Agenda is still in its trial run, which is free of charge. Some things may be missing or not work yet.",
      "Questions, or found a bug? Just reply to this email. You don't know us? Then ignore it.",
      "Family Agenda Cloud · run in Germany · family-agenda.cloud",
    ],
  },
};

/** The mail inviting `email` with `link`, in `language`. */
export function invitationMail(language: Language, email: string, link: string): ContractMail {
  const { subject, lines } = WORDS[language];
  return { from: MAIL_FROM, replyTo: MAIL_REPLY_TO, to: email, subject, text: `${lines(link).join("\n\n")}\n` };
}
