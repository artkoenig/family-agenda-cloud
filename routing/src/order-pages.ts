/**
 * The pages of the order of the Tariff (#226): `/order` where it cannot go on to Stripe's Checkout,
 * and `/order/done` after it; and `/subscription`, on the way to Stripe's Portal (#227); the English ones under `/en` (`ORDER_PATHS`). In the landing page's design
 * system, like the contract pages. Every value is escaped. No I/O.
 */
import { escape, page, paragraphs, support, toFamily } from "./contract-pages";
import { holderLine, ordererLine, type Language } from "./contract-wording";
import { SIGN_OUT_PATH } from "./sign-in-pages";

type Words = {
  title: string;
  ordered: string;
  notOffered: string;
  noFounder: string;
  subscription: { title: string; none: string };
  noAccess: { title: string; line: string };
  done: { title: string; mail: string };
  signOut: string;
};

const WORDS: Record<Language, Words> = {
  de: {
    title: "Tarif bestellen",
    ordered: "Tarif bereits bestellt",
    notOffered: "Für diese Familie kann zurzeit kein Tarif bestellt werden.",
    noFounder: "Für diese Familie ist nicht hinterlegt, wer bestellen kann.",
    subscription: { title: "Abonnement", none: "Für diese Familie gibt es kein Abonnement." },
    noAccess: { title: "Kein Zugriff", line: "Nur Admins der Familie können diese Seite sehen." },
    done: { title: "Danke für deine Bestellung.", mail: "Die Vertragsbestätigung kommt per E-Mail." },
    signOut: "Abmelden",
  },
  en: {
    title: "Order the tariff",
    ordered: "Tariff already ordered",
    notOffered: "No tariff can be ordered for this family at the moment.",
    noFounder: "It is not recorded who can order for this family.",
    subscription: { title: "Subscription", none: "This family has no subscription." },
    noAccess: { title: "No access", line: "Only the family's admins can see this page." },
    done: { title: "Thank you for your order.", mail: "The contract confirmation is on its way by email." },
    signOut: "Sign out",
  },
};

/** `/order` of a Family with a running Subscription, with its holder's name unless Logto no longer knows them. */
export function orderedPage(language: Language, familyId: string, holderName: string | null): string {
  const { title, ordered } = WORDS[language];
  return page(language, title, `${paragraphs([ordered, ...(holderName === null ? [] : [holderLine(holderName, language)])])}\n${toFamily(language, familyId)}`);
}

/** `/order` for an Admin who is not the founder. */
export function onlyFounderOrdersPage(language: Language, familyId: string, founderName: string): string {
  return page(language, WORDS[language].title, `${paragraphs([ordererLine(founderName, language)])}\n${toFamily(language, familyId)}`);
}

/** `/order` of a Family no founder is recorded for: nobody may order, and the support says how it goes on. */
export function noFounderPage(language: Language, familyId: string): string {
  const { title, noFounder } = WORDS[language];
  return page(language, title, `${paragraphs([noFounder])}\n${support(language)}\n${toFamily(language, familyId)}`);
}

/** `/order` of a Family that is neither in its Trial nor Locked. */
export function notOfferedPage(language: Language, familyId: string): string {
  const { title, notOffered } = WORDS[language];
  return page(language, title, `${paragraphs([notOffered])}\n${support(language)}\n${toFamily(language, familyId)}`);
}

/** Any page for a person who is not an Admin of a Family that can be ordered for. */
export function noAccessPage(language: Language): string {
  const { noAccess, signOut } = WORDS[language];
  return page(language, noAccess.title, `${paragraphs([noAccess.line])}\n${support(language)}\n${link(SIGN_OUT_PATH, signOut)}`);
}

/** `/order/done`: the order came in; what it changes comes from Stripe's webhooks alone (#227). */
export function orderDonePage(language: Language, familyId: string): string {
  const { done } = WORDS[language];
  return page(language, done.title, `${paragraphs([done.mail])}\n${toFamily(language, familyId)}`);
}

/** `/subscription` for an Admin who is not its holder, with the holder's name unless Logto no longer knows them. */
export function subscriptionHolderPage(language: Language, familyId: string, holderName: string | null): string {
  return page(language, WORDS[language].subscription.title, `${holderName === null ? support(language) : paragraphs([holderLine(holderName, language)])}\n${toFamily(language, familyId)}`);
}

/** `/subscription` of a Family that never had a Subscription. */
export function noSubscriptionPage(language: Language, familyId: string): string {
  const { title, none } = WORDS[language].subscription;
  return page(language, title, `${paragraphs([none])}\n${toFamily(language, familyId)}`);
}

const link = (href: string, label: string): string => `<p class="action"><a class="fam-button fam-button--secondary" href="${escape(href)}">${escape(label)}</a></p>`;
