/**
 * The mails of a Cancellation, a Withdrawal and a deleted Family (#214), in plain text, for the
 * outbox to send (#192): From the one support@ mailbox, with Reply-To the same address, in the
 * recipient's language (`mailLanguageOf`), each ending with the standard footer. They acknowledge
 * receipt and say what follows; none says a Cancellation or Withdrawal was confirmed or is valid.
 * The footer keeps `{{NAME}}` and `{{POSTFLEX_ADDRESS}}` unless the Operator's imprint is given.
 * No I/O.
 */
import {
  amountOf,
  contractOf,
  dateAfter,
  dateOf,
  orderedContractOf,
  timeOf,
  type Contract,
  type Language,
  type Person,
  type Settlement,
} from "./contract-wording";

export const MAIL_FROM = "Family Agenda Cloud <support@family-agenda.cloud>";
export const MAIL_REPLY_TO = "support@family-agenda.cloud";

/** A mail as the outbox sends it. */
export type ContractMail = { from: string; replyTo: string; to: string; subject: string; text: string };

/** The Operator's name and postal address, for the footer's `{{NAME}}` and `{{POSTFLEX_ADDRESS}}`. */
export type Imprint = { name: string; postalAddress: string };

/** A Cancellation received at `receivedAt`, ending the contract on `endsOn`. */
export type CancellationMailValues = { recipient: Person; contract: Contract; receivedAt: Date; endsOn: Date; settlement: Settlement };

/**
 * A Withdrawal received at `receivedAt`: within the 14 days it ends the Subscription at once and
 * everything paid, `refundCents`, is refunded; after them, which ended on `endedOn`, it counts as
 * a Cancellation at the earliest date, `endsOn`. Within them the Family is Locked, unless its Trial
 * still runs, until `trialEndsOn`: then it stays in its Trial.
 */
export type WithdrawalMailValues = {
  recipient: Person;
  contract: Contract;
  receivedAt: Date;
  period: { case: "within"; refundCents: number; trialEndsOn?: Date } | { case: "after"; endedOn: Date; endsOn: Date; settlement: Settlement };
};

/**
 * A deleted Family, for the Admin who deleted it on `/delete` (`by: "recipient"`), or, deleted
 * automatically 30 days after it was locked, for an Admin; with `subscription` if one was running,
 * which the deletion cancelled as of `endsOn`.
 */
export type FamilyDeletedMailValues = {
  recipient: Person;
  deletedAt: Date;
  by: "recipient" | "automatic";
  subscription: { endsOn: Date; settlement: Settlement } | null;
};

/** A deleted Family, for every other Admin: deleted by the Admin named `by.admin`, or automatically. */
export type FamilyDeletedNoticeValues = { recipient: Person; deletedAt: Date; by: { admin: string } | "automatic" };

/** Lines of a paragraph; a null line is one this case leaves out. */
export type Paragraph = readonly (string | null)[];

/** A date and a time, formatted. */
type When = { date: string; time: string };

/** The sentences of the mails, in one language, from values already formatted. */
type Words = {
  greeting: (name: string) => string;
  cancellation: {
    subject: string;
    received: (when: When) => string;
    content: (contract: string, end: string) => string;
    ends: (end: string) => string;
  };
  withdrawal: {
    subject: string;
    received: (when: When) => string;
    receivedLate: (when: When) => string;
    content: (orderedContract: string) => string;
    withdrawn: (refund: string, deletedOn: string) => Paragraph[];
    withdrawnInTrial: (refund: string, trialEnd: string) => Paragraph[];
    late: (periodEnd: string, end: string) => string;
  };
  untilTheEnd: (ends: string, end: string, deletedOn: string) => { untilThen: string; locked: string; undo: string };
  trial: string;
  yearlyRefund: (refund: string) => string;
  deleted: {
    subject: string;
    byRecipient: (when: When) => string;
    backups: (goneOn: string) => string;
    subscription: (end: string) => string;
    yearlyRefund: (refund: string) => string;
    thanks: string;
  };
  notice: { subject: string; byAdmin: (admin: string, date: string) => string; gone: string };
  automatic: (date: string) => string;
  footer: readonly string[];
};

const WORDS: Record<Language, Words> = {
  de: {
    greeting: (name) => `Hallo ${name},`,
    cancellation: {
      subject: "Eingangsbestätigung deiner Kündigung – Family Agenda Cloud",
      received: ({ date, time }) => `Deine Kündigung ist am ${date} um ${time} bei uns eingegangen.`,
      content: (contract, end) => `Inhalt: Ordentliche Kündigung des Vertrags ${contract}, zum ${end}.`,
      ends: (end) => `Der Vertrag endet am ${end}.`,
    },
    withdrawal: {
      subject: "Eingangsbestätigung deines Widerrufs – Family Agenda Cloud",
      received: ({ date, time }) => `Dein Widerruf ist am ${date} um ${time} bei uns eingegangen.`,
      receivedLate: ({ date, time }) => `Deine Erklärung ist am ${date} um ${time} bei uns eingegangen.`,
      content: (orderedContract) => `Inhalt: Widerruf des Vertrags ${orderedContract}.`,
      withdrawn: (refund, deletedOn) => [
        [
          `Das Abonnement endet damit sofort, und deine Familie ist gesperrt. Bereits gezahlte Beträge, insgesamt ${refund}, erstatten wir innerhalb von 14 Tagen auf dein Zahlungsmittel.`,
        ],
        [
          `Admins können im Admin-Bereich weiterhin einen Export herunterladen. Am ${deletedOn} löschen wir die Familie mit allen Daten. Möchtest du weitermachen, kannst du bis dahin im Admin-Bereich neu bestellen.`,
        ],
      ],
      withdrawnInTrial: (refund, trialEnd) => [
        [`Das Abonnement endet damit sofort. Bereits gezahlte Beträge, insgesamt ${refund}, erstatten wir innerhalb von 14 Tagen auf dein Zahlungsmittel.`],
        [
          `Dein Testzeitraum läuft bis zum ${trialEnd} weiter: Bis dahin können alle Family Agenda Cloud wie gewohnt nutzen. Möchtest du danach weitermachen, kannst du im Admin-Bereich neu bestellen.`,
        ],
      ],
      late: (periodEnd, end) =>
        `Die Widerrufsfrist von 14 Tagen ist am ${periodEnd} abgelaufen. Wir behandeln deine Erklärung deshalb als ordentliche Kündigung zum frühestmöglichen Zeitpunkt: Der Vertrag endet am ${end}.`,
    },
    untilTheEnd: (ends, end, deletedOn) => ({
      untilThen: `${ends} Bis dahin können alle Family Agenda Cloud wie gewohnt nutzen.`,
      locked: `Ab dem ${end} ist deine Familie gesperrt. Admins können bis dahin und während der Sperre im Admin-Bereich einen Export herunterladen. Am ${deletedOn} löschen wir die Familie mit allen Daten.`,
      undo: `Du kannst die Kündigung bis zum ${end} im Admin-Bereich zurücknehmen.`,
    }),
    trial: "Es wird nichts berechnet.",
    yearlyRefund: (refund) => `Den nicht genutzten Teil deines Jahresbeitrags, ${refund}, erstatten wir mit dem Vertragsende auf dein Zahlungsmittel.`,
    deleted: {
      subject: "Deine Familie wurde gelöscht – Family Agenda Cloud",
      byRecipient: ({ date, time }) => `Du hast deine Familie am ${date} um ${time} gelöscht.`,
      backups: (goneOn) => `Alle Daten der Familie sind gelöscht; die letzten Kopien in unseren Sicherungen werden spätestens am ${goneOn} entfernt.`,
      subscription: (end) => `Dein Abonnement ist zum ${end} gekündigt.`,
      yearlyRefund: (refund) => `Den nicht genutzten Teil, ${refund}, erstatten wir auf dein Zahlungsmittel.`,
      thanks: "Danke, dass du Family Agenda Cloud genutzt hast.",
    },
    notice: {
      subject: "Deine Familie wurde gelöscht – Family Agenda Cloud",
      byAdmin: (admin, date) => `${admin} hat deine Familie am ${date} gelöscht.`,
      gone: "Dein Zugang und alle Daten der Familie sind damit gelöscht.",
    },
    automatic: (date) => `Wie angekündigt haben wir deine Familie am ${date}, 30 Tage nach der Sperre, gelöscht.`,
    footer: [
      "-- ",
      "Family Agenda Cloud · {{NAME}} · {{POSTFLEX_ADDRESS}}",
      "Fragen? Antworte einfach auf diese E-Mail oder schreib an support@family-agenda.cloud.",
      "Impressum: https://family-agenda.cloud/impressum",
    ],
  },
  en: {
    greeting: (name) => `Hello ${name},`,
    cancellation: {
      subject: "Your cancellation has been received – Family Agenda Cloud",
      received: ({ date, time }) => `We received your cancellation on ${date} at ${time}.`,
      content: (contract, end) => `Content: ordinary cancellation of the contract ${contract}, with effect from ${end}.`,
      ends: (end) => `The contract ends on ${end}.`,
    },
    withdrawal: {
      subject: "Acknowledgement of your withdrawal – Family Agenda Cloud",
      received: ({ date, time }) => `We received your withdrawal on ${date} at ${time}.`,
      receivedLate: ({ date, time }) => `We received your statement on ${date} at ${time}.`,
      content: (orderedContract) => `Content: withdrawal from the contract ${orderedContract}.`,
      withdrawn: (refund, deletedOn) => [
        [`The subscription therefore ends at once, and your family is locked. We will refund all amounts paid, ${refund} in total, to your payment method within 14 days.`],
        [
          `Admins can still download an export in the Admin area. On ${deletedOn} we delete the family with all its data. If you want to continue, you can subscribe again in the Admin area until then.`,
        ],
      ],
      withdrawnInTrial: (refund, trialEnd) => [
        [`The subscription therefore ends at once. We will refund all amounts paid, ${refund} in total, to your payment method within 14 days.`],
        [
          `Your trial continues until ${trialEnd}: until then everyone can use Family Agenda Cloud as usual. If you want to continue after that, you can subscribe again in the Admin area.`,
        ],
      ],
      late: (periodEnd, end) =>
        `The 14-day withdrawal period ended on ${periodEnd}. We therefore treat your statement as an ordinary cancellation at the earliest possible date: the contract ends on ${end}.`,
    },
    untilTheEnd: (ends, end, deletedOn) => ({
      untilThen: `${ends} Until then everyone can use Family Agenda Cloud as usual.`,
      locked: `From ${end} your family is locked. Admins can download an export in the Admin area until then and while the family is locked. On ${deletedOn} we delete the family with all its data.`,
      undo: `You can undo the cancellation in the Admin area until ${end}.`,
    }),
    trial: "Nothing will be charged.",
    yearlyRefund: (refund) => `We will refund the unused part of your yearly fee, ${refund}, to your payment method when the contract ends.`,
    deleted: {
      subject: "Your family has been deleted – Family Agenda Cloud",
      byRecipient: ({ date, time }) => `You deleted your family on ${date} at ${time}.`,
      backups: (goneOn) => `All of the family's data has been deleted; the last copies in our backups will be removed by ${goneOn}.`,
      subscription: (end) => `Your subscription is cancelled with effect from ${end}.`,
      yearlyRefund: (refund) => `We will refund the unused part, ${refund}, to your payment method.`,
      thanks: "Thank you for using Family Agenda Cloud.",
    },
    notice: {
      subject: "Your family has been deleted – Family Agenda Cloud",
      byAdmin: (admin, date) => `${admin} deleted your family on ${date}.`,
      gone: "Your access and all of the family's data have been deleted with it.",
    },
    automatic: (date) => `As announced, we deleted your family on ${date}, 30 days after it was locked.`,
    footer: [
      "-- ",
      "Family Agenda Cloud · {{NAME}} · {{POSTFLEX_ADDRESS}}",
      "Questions? Just reply to this email or write to support@family-agenda.cloud.",
      "Imprint: https://family-agenda.cloud/en/imprint",
    ],
  },
};

/** The mail to the holder whose Cancellation came in. */
export function cancellationMail(language: Language, values: CancellationMailValues, imprint?: Imprint): ContractMail {
  const { cancellation } = WORDS[language];
  const end = dateOf(values.endsOn, language);
  return mail(
    language,
    values.recipient,
    cancellation.subject,
    [
      [cancellation.received(whenOf(values.receivedAt, language))],
      [cancellation.content(contractOf(values.contract, language), end)],
      ...untilTheEnd(language, cancellation.ends(end), values.endsOn, values.settlement),
    ],
    imprint,
  );
}

/** The mail to the holder whose Withdrawal came in, within the withdrawal period or after it. */
export function withdrawalMail(language: Language, values: WithdrawalMailValues, imprint?: Imprint): ContractMail {
  const { withdrawal } = WORDS[language];
  const { period } = values;
  const when = whenOf(values.receivedAt, language);
  const effect =
    period.case === "within"
      ? withdrawnOf(language, period, values.receivedAt)
      : untilTheEnd(language, withdrawal.late(dateOf(period.endedOn, language), dateOf(period.endsOn, language)), period.endsOn, period.settlement);
  const received = period.case === "within" ? withdrawal.received(when) : withdrawal.receivedLate(when);
  return mail(language, values.recipient, withdrawal.subject, [[received], [withdrawal.content(orderedContractOf(values.contract, language))], ...effect], imprint);
}

/** What a Withdrawal within the period does: the Family is Locked, or stays in the Trial that still runs. */
function withdrawnOf(language: Language, { refundCents, trialEndsOn }: { refundCents: number; trialEndsOn?: Date }, receivedAt: Date): Paragraph[] {
  const { withdrawal } = WORDS[language];
  const refund = amountOf(refundCents, language);
  return trialEndsOn ? withdrawal.withdrawnInTrial(refund, dateOf(trialEndsOn, language)) : withdrawal.withdrawn(refund, dateAfter(receivedAt, 30, language));
}

/** The Cancellation mail from "Bis dahin können alle …" on, after `ends`, the sentence that says when the contract ends. */
function untilTheEnd(language: Language, ends: string, endsOn: Date, settlement: Settlement): Paragraph[] {
  const words = WORDS[language];
  const { untilThen, locked, undo } = words.untilTheEnd(ends, dateOf(endsOn, language), dateAfter(endsOn, 30, language));
  return [[untilThen, settled(language, settlement)], [locked], [undo]];
}

/** What a Cancellation's mail adds for a yearly Subscription after year one, or for an order during the Trial. */
function settled(language: Language, settlement: Settlement): string | null {
  if (settlement.case === "plain") return null;
  if (settlement.case === "ordered-during-trial") return WORDS[language].trial;
  return WORDS[language].yearlyRefund(amountOf(settlement.refundCents, language));
}

/** The mail to the Admin who deleted the Family, or after an automatic deletion. */
export function familyDeletedMail(language: Language, values: FamilyDeletedMailValues, imprint?: Imprint): ContractMail {
  const words = WORDS[language];
  const { deletedAt } = values;
  const deleted = values.by === "automatic" ? words.automatic(dateOf(deletedAt, language)) : words.deleted.byRecipient(whenOf(deletedAt, language));
  const backups = words.deleted.backups(dateAfter(deletedAt, 14, language));
  const paragraphs = [[`${deleted} ${backups}`, subscriptionCancelled(language, values.subscription)], [words.deleted.thanks]];
  return mail(language, values.recipient, words.deleted.subject, paragraphs, imprint);
}

/** The running Subscription the deletion cancelled, with the refund of a yearly one after year one. */
function subscriptionCancelled(language: Language, subscription: FamilyDeletedMailValues["subscription"]): string | null {
  if (subscription === null) return null;
  const { deleted } = WORDS[language];
  const { endsOn, settlement } = subscription;
  const cancelled = deleted.subscription(dateOf(endsOn, language));
  if (settlement.case !== "yearly-after-year-one") return cancelled;
  return `${cancelled} ${deleted.yearlyRefund(amountOf(settlement.refundCents, language))}`;
}

/** The mail to every other Admin of the deleted Family. */
export function familyDeletedNoticeMail(language: Language, values: FamilyDeletedNoticeValues, imprint?: Imprint): ContractMail {
  const words = WORDS[language];
  const { by } = values;
  const date = dateOf(values.deletedAt, language);
  const deleted = by === "automatic" ? words.automatic(date) : words.notice.byAdmin(by.admin, date);
  return mail(language, values.recipient, words.notice.subject, [[`${deleted} ${words.notice.gone}`]], imprint);
}

/** A mail to `recipient` from its paragraphs, between the greeting and the standard footer, as the other contract mails are (confirmation-mail.ts). */
export const contractMail = mail;

function whenOf(instant: Date, language: Language): When {
  return { date: dateOf(instant, language), time: timeOf(instant, language) };
}

/** The whole mail: the greeting, the paragraphs and the footer. */
function mail(language: Language, recipient: Person, subject: string, paragraphs: readonly Paragraph[], imprint: Imprint | undefined): ContractMail {
  const body = [[WORDS[language].greeting(recipient.name)], ...paragraphs, footer(language, imprint)]
    .map((lines) => lines.filter((line) => line !== null).join("\n"))
    .join("\n\n");
  return { from: MAIL_FROM, replyTo: MAIL_REPLY_TO, to: recipient.email, subject, text: `${body}\n` };
}

function footer(language: Language, imprint: Imprint | undefined): Paragraph {
  const lines = WORDS[language].footer;
  if (imprint === undefined) return lines;
  return lines.map((line) => line.replace("{{NAME}}", () => imprint.name).replace("{{POSTFLEX_ADDRESS}}", () => imprint.postalAddress));
}
