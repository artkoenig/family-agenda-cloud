/**
 * The paths of the Routing module's own pages that need to know who is signed in, and the way back
 * to one after a sign-in. No I/O.
 */
import { CONTRACT_PATHS } from "./contract-wording";
import type { Language } from "./sign-in-pages";

/**
 * Where an Admin orders the Tariff, where Stripe's Checkout sends them after the order, and where the
 * Contract holder reaches Stripe's Portal.
 */
export const ORDER_PATHS: Record<"order" | "done" | "subscription", Record<Language, string>> = {
  order: { de: "/order", en: "/en/order" },
  done: { de: "/order/done", en: "/en/order/done" },
  subscription: { de: "/subscription", en: "/en/subscription" },
};

/** A page of the order, in its language. */
export type OrderPath = { page: keyof typeof ORDER_PATHS; language: Language };

/** Where Stripe posts its events (#227). */
export const STRIPE_EVENTS_PATH = "/stripe/events";

const PAGES = ["order", "done", "subscription"] as const;
const LANGUAGES = ["de", "en"] as const;

/** The page of the order at this path; undefined for every other path. */
export function orderPathOf(pathname: string): OrderPath | undefined {
  return PAGES.flatMap((page) => LANGUAGES.map((language) => ({ page, language }))).find(({ page, language }) => ORDER_PATHS[page][language] === pathname);
}

/** The language of the page a Subscription is cancelled on (#229), if this is its path. */
export function cancelPathOf(pathname: string): Language | undefined {
  return LANGUAGES.find((language) => CONTRACT_PATHS.cancel[language] === pathname);
}

/** The language of the page a Subscription is withdrawn from on (#230), if this is its path. */
export function withdrawPathOf(pathname: string): Language | undefined {
  return LANGUAGES.find((language) => CONTRACT_PATHS.withdraw[language] === pathname);
}

/**
 * The page to come back to after a sign-in, as the browser asks for it: only the exact path of a
 * Routing module's page, so that a link to central sign-in sends nobody anywhere else.
 */
export function wayBackOf(asked: string | null): string | undefined {
  return asked !== null && (orderPathOf(asked) || cancelPathOf(asked) || withdrawPathOf(asked)) ? asked : undefined;
}

/** Where a page sends a browser that is not signed in; the callback sends it back to the page. */
export const signInPathFor = (page: string): string => `/sign-in?${new URLSearchParams({ back: page }).toString()}`;
