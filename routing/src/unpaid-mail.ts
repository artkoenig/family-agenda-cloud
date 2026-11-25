/**
 * The mail to the Contract holder whose Family is locked because the Subscription is not paid (#227):
 * the last retry failed. Plain text, for the outbox. No I/O.
 */
import { contractMail, type ContractMail, type Imprint, type Paragraph } from "./contract-mails";
import { dateAfter, dateOf, type Language, type Person } from "./contract-wording";
import { APP_URL } from "./legal-pages";
import { ORDER_PATHS } from "./routing-pages";

/** A Family locked at `lockedAt` as its Subscription, which `holder` holds, is not paid. */
export type UnpaidMailValues = { holder: Person; familyName: string; lockedAt: Date };

/** How many days after it was locked a Family is deleted (#228). */
const DELETED_AFTER_DAYS = 30;

type Facts = { familyName: string; locked: string; deleted: string; link: string };

const WORDS: Record<Language, { subject: string; paragraphs: (facts: Facts) => Paragraph[] }> = {
  de: {
    subject: "Ihre Familie ist gesperrt: Zahlung ausgeblieben – Family Agenda",
    paragraphs: ({ familyName, locked, deleted, link }) => [
      [`die Zahlung für Ihr Abonnement ist trotz mehrerer Versuche ausgeblieben. Ihre Familie ${familyName} ist deshalb seit dem ${locked} gesperrt.`],
      [`Sobald die offene Rechnung bezahlt ist, ist sie sofort wieder freigeschaltet: ${link}`],
      [`Ohne Zahlung löschen wir die Familie am ${deleted} mit allen Daten. Einen Export können Admins bis dahin im Admin-Bereich herunterladen.`],
    ],
  },
  en: {
    subject: "Your family is locked: payment missing – Family Agenda",
    paragraphs: ({ familyName, locked, deleted, link }) => [
      [`The payment for your subscription has not arrived despite several attempts. Your family ${familyName} has therefore been locked since ${locked}.`],
      [`As soon as the open invoice is paid, it is unlocked at once: ${link}`],
      [`Without payment we delete the family with all its data on ${deleted}. Admins can download an export in the Admin area until then.`],
    ],
  },
};

/** The mail to the holder of a Subscription that became `unpaid`. */
export function unpaidMail(language: Language, { holder, familyName, lockedAt }: UnpaidMailValues, imprint: Imprint): ContractMail {
  const { subject, paragraphs } = WORDS[language];
  const facts = { familyName, locked: dateOf(lockedAt, language), deleted: dateAfter(lockedAt, DELETED_AFTER_DAYS, language), link: `${APP_URL}${ORDER_PATHS.subscription[language]}` };
  return contractMail(language, holder, subject, paragraphs(facts), imprint);
}
