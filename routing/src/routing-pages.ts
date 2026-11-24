/**
 * The paths of the Routing module's own pages that need to know who is signed in, and the way back
 * to one after a sign-in. No I/O.
 */
import type { Language } from "./sign-in-pages";

/** Where an Admin orders the Tariff, and where Stripe's Checkout sends them after the order. */
export const ORDER_PATHS: Record<"order" | "done", Record<Language, string>> = {
  order: { de: "/order", en: "/en/order" },
  done: { de: "/order/done", en: "/en/order/done" },
};

/** A page of the order, in its language. */
export type OrderPath = { page: keyof typeof ORDER_PATHS; language: Language };

const PAGES = ["order", "done"] as const;
const LANGUAGES = ["de", "en"] as const;

/** The page of the order at this path; undefined for every other path. */
export function orderPathOf(pathname: string): OrderPath | undefined {
  return PAGES.flatMap((page) => LANGUAGES.map((language) => ({ page, language }))).find(({ page, language }) => ORDER_PATHS[page][language] === pathname);
}

/**
 * The page to come back to after a sign-in, as the browser asks for it: only the exact path of a
 * Routing module's page, so that a link to central sign-in sends nobody anywhere else.
 */
export function wayBackOf(asked: string | null): string | undefined {
  return asked !== null && orderPathOf(asked) ? asked : undefined;
}

/** Where a page sends a browser that is not signed in; the callback sends it back to the page. */
export const signInPathFor = (page: string): string => `/sign-in?${new URLSearchParams({ back: page }).toString()}`;
