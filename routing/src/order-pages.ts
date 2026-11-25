/**
 * The pages on which a Family's founder orders the Tariff (#226): `/order`, and `/order/done` after
 * Stripe's Checkout; and `/subscription`, on the way to Stripe's Portal (#227); the English ones under `/en` (`ORDER_PATHS`). In the landing page's design
 * system, like the contract pages. Every value is escaped. No I/O.
 */
import { escape, page, paragraphs, submit } from "./contract-pages";
import { amountOf, dateOf, holderLine, ordererLine, PRICE_CENTS, type Billing, type Language } from "./contract-wording";
import { SIGN_OUT_PATH, SUPPORT_LINK } from "./sign-in-pages";

/** The names of the fields `/order` posts. */
export const BILLING_FIELD = "billing";
export const NAME_FIELD = "name";

/** The longest name of a user Logto takes. */
export const NAME_LIMIT = 128;

/** `/order` for the founder: `askName` if Logto has no name of theirs; `invalid` for a post without a name or a billing. */
export type OrderForm = { firstPaymentAt: Date; askName: boolean; billing: Billing; invalid: boolean };

type Words = {
  title: string;
  choice: string;
  prices: Record<Billing, { label: string; hint: string }>;
  firstPayment: (date: string) => string;
  name: string;
  invalid: string;
  button: string;
  ordered: string;
  notOffered: string;
  noFounder: string;
  subscription: { title: string; none: string };
  noAccess: { title: string; line: string };
  support: string;
  done: { title: string; mail: string };
  toFamily: string;
  signOut: string;
};

/** What a month of the yearly Tariff comes to (Art. 246a EGBGB). */
const YEARLY_PER_MONTH_CENTS = Math.round(PRICE_CENTS.yearly / 12);

const WORDS: Record<Language, Words> = {
  de: {
    title: "Tarif bestellen",
    choice: "Zahlungsweise",
    prices: {
      monthly: { label: `${amountOf(PRICE_CENTS.monthly, "de")} im Monat`, hint: "inkl. USt." },
      yearly: { label: `${amountOf(PRICE_CENTS.yearly, "de")} jährlich (entspricht ${amountOf(YEARLY_PER_MONTH_CENTS, "de")} im Monat)`, hint: "inkl. USt." },
    },
    firstPayment: (date) => `Erste Zahlung am ${date}`,
    name: "Ihr Name, als Vertragsinhaber",
    invalid: "Bitte wählen Sie eine Zahlungsweise und geben Sie Ihren Namen an (höchstens 128 Zeichen).",
    button: "Weiter zur Kasse",
    ordered: "Tarif bereits bestellt",
    notOffered: "Für diese Familie kann zurzeit kein Tarif bestellt werden.",
    noFounder: "Für diese Familie ist nicht hinterlegt, wer bestellen kann.",
    subscription: { title: "Abonnement", none: "Für diese Familie gibt es kein Abonnement." },
    noAccess: { title: "Kein Zugriff", line: "Nur Admins der Familie können diese Seite sehen." },
    support: "Fragen? Schreiben Sie uns:",
    done: { title: "Danke für Ihre Bestellung.", mail: "Die Vertragsbestätigung kommt per E-Mail." },
    toFamily: "Zur Familie",
    signOut: "Abmelden",
  },
  en: {
    title: "Order the tariff",
    choice: "Billing",
    prices: {
      monthly: { label: `${amountOf(PRICE_CENTS.monthly, "en")} per month`, hint: "VAT included" },
      yearly: { label: `${amountOf(PRICE_CENTS.yearly, "en")} per year (equals ${amountOf(YEARLY_PER_MONTH_CENTS, "en")} per month)`, hint: "VAT included" },
    },
    firstPayment: (date) => `First payment on ${date}`,
    name: "Your name, as the contract holder",
    invalid: "Please choose a billing and enter your name (at most 128 characters).",
    button: "Continue to checkout",
    ordered: "Tariff already ordered",
    notOffered: "No tariff can be ordered for this family at the moment.",
    noFounder: "It is not recorded who can order for this family.",
    subscription: { title: "Subscription", none: "This family has no subscription." },
    noAccess: { title: "No access", line: "Only the family's admins can see this page." },
    support: "Questions? Write to us:",
    done: { title: "Thank you for your order.", mail: "The contract confirmation is on its way by email." },
    toFamily: "To the family",
    signOut: "Sign out",
  },
};

/** `/order` for the founder of a Family in its Trial or Locked: the choice of billing, and the way to Checkout. */
export function orderPage(language: Language, { firstPaymentAt, askName, billing, invalid }: OrderForm): string {
  const words = WORDS[language];
  const choice = (value: Billing): string => {
    const { label, hint } = words.prices[value];
    return `<label class="choice"><input type="radio" name="${BILLING_FIELD}" value="${value}" required${value === billing ? " checked" : ""}><span>${escape(label)} <span class="hint">${escape(hint)}</span></span></label>`;
  };
  const name = `<p class="name"><label for="${NAME_FIELD}">${escape(words.name)}</label> <input id="${NAME_FIELD}" name="${NAME_FIELD}" autocomplete="name" maxlength="${String(NAME_LIMIT)}" required></p>\n`;
  return page(
    language,
    words.title,
    `${invalid ? `<p role="alert">${escape(words.invalid)}</p>\n` : ""}<form method="post" class="order">
<fieldset class="choices"><legend>${escape(words.choice)}</legend>
${choice("monthly")}
${choice("yearly")}
</fieldset>
${askName ? name : ""}${paragraphs([words.firstPayment(dateOf(firstPaymentAt, language))])}
${submit({ label: words.button, note: null })}
</form>`,
    STYLE,
  );
}

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

const support = (language: Language): string => `<p>${escape(WORDS[language].support)} ${SUPPORT_LINK}</p>`;

const link = (href: string, label: string): string => `<p class="action"><a class="fam-button fam-button--secondary" href="${escape(href)}">${escape(label)}</a></p>`;

const toFamily = (language: Language, familyId: string): string => link(`/${familyId}/`, WORDS[language].toFamily);

const STYLE = `
.order,.choices{display:grid;gap:8px}
.choices{margin:0 0 12px;padding:0;border:0}
.choices legend{padding:0 0 8px;font-weight:600}
.choice{display:flex;align-items:center;gap:12px;min-height:var(--control-height);padding:8px 12px;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:var(--surface-raised);cursor:pointer}
.choice:has(input:checked){background:var(--hearth-tint)}
.hint{display:block;color:var(--ink-muted)}
.name label{display:block;margin-bottom:4px}
.name input{box-sizing:border-box;width:100%;min-height:var(--control-height);padding:8px 12px;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:var(--surface-raised);color:inherit;font:inherit}
`;
