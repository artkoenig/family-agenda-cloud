/**
 * The order (#226): `/order` sends a Family's founder to Stripe's hosted Checkout, where they choose
 * the billing, the yearly one being the monthly Price's upsell; `/subscription` takes the Contract holder to Stripe's Portal (#227). Nothing here changes the Directory but the founder recorded when first needed
 * (`founderOf`): it learns of the order from Stripe's webhooks alone (#227).
 *
 * - Without a session the browser goes to central sign-in and comes back.
 * - Only an Admin of the Family sees anything, only its founder may order, and only in its Trial
 *   or while it is Locked.
 * - Checkout asks a founder Logto has no name of for it; the webhook keeps it at Logto, where every
 *   page and mail reads the Contract holder's name.
 * - A Family has one open Checkout Session at most: those before are expired first.
 */
import type { OrderingFamily } from "./checkout-texts";
import { mailLanguageOf, type Language } from "./contract-wording";
import type { Config, StripeSettings } from "./config";
import { cookiesOf } from "./cookies";
import type { Directory, DirectoryEntry } from "./directory";
import { founderOf } from "./founder";
import { person, type IdpManagement, type LogtoPerson } from "./logto-management";
import { organizations } from "./organizations";
import { noAccessPage, noFounderPage, noSubscriptionPage, notOfferedPage, onlyFounderOrdersPage, orderDonePage, orderedPage, subscriptionHolderPage } from "./order-pages";
import { checkoutSessionParams } from "./order-session";
import { ORDER_PATHS, signInPathFor, type OrderPath } from "./routing-pages";
import { sessionOf, type RoutingSession } from "./routing-session";
import type { StripePort } from "./stripe";

/** What the order works with. */
export type OrderSetup = {
  config: Config;
  directory: Directory;
  idp: IdpManagement;
  prices: StripeSettings["prices"];
  stripe: StripePort;
  /** Stripe's configuration of the Portal (`portalConfiguration`). */
  portal: string;
  now: () => Date;
};

/** A browser's request for a page of the order. */
export type OrderRequest = { method: string | undefined; path: OrderPath; cookie: string | undefined };

/** The Router's answer. */
export type OrderAnswer = { status: number; headers: Record<string, string>; body: string };

/** `/order` and `/subscription` take a GET alone: each makes a Session at Stripe. */
const METHODS: Record<OrderPath["page"], readonly string[]> = { order: ["GET"], done: ["GET", "HEAD"], subscription: ["GET"] };

const NO_STORE = { "cache-control": "no-store" };

/** Who asks for the page, and for which Family; both as they are now. */
type Visit = { setup: OrderSetup; language: Language; session: RoutingSession; entry: DirectoryEntry; admins: readonly string[]; now: Date };

/** Answers a request for a page of the order. */
export async function answerOrder(request: OrderRequest, setup: OrderSetup): Promise<OrderAnswer> {
  const { page, language } = request.path;
  const allowed = METHODS[page];
  if (!allowed.some((method) => method === request.method)) return { status: 405, headers: { ...NO_STORE, allow: allowed.join(", ") }, body: "" };
  const now = setup.now();
  const session = sessionOf(setup.config.operatorKey, cookiesOf(request.cookie), now);
  if (!session) return redirect(signInPathFor(ORDER_PATHS[page][language]));
  const visit = await visitOf(setup, language, session, now);
  if (!visit) return html(403, noAccessPage(language));
  if (page === "done") return html(200, orderDonePage(language, visit.entry.familyId));
  if (page === "subscription") return answerSubscription(visit);
  return answerOrderPage(visit);
}

/** The visit of a person signed in; undefined unless they are an Admin of a Family that can be ordered for. */
async function visitOf(setup: OrderSetup, language: Language, session: RoutingSession, now: Date): Promise<Visit | undefined> {
  const entry = await setup.directory.findByOrganization(session.organizationId);
  if (!entry || !isOrderable(entry)) return undefined;
  const admins = (await organizations(setup.idp).admins(session.organizationId)).map(({ userId }) => userId);
  return admins.includes(session.userId) ? { setup, language, session, entry, admins, now } : undefined;
}

/** Whether the Family runs, Locked or not: not one being prepared, suspended or deleted. */
const isOrderable = ({ status }: DirectoryEntry): boolean => status === "active" || status === "locked";

/** `/order`: the founder's way to Checkout, or why there is none. */
async function answerOrderPage(visit: Visit): Promise<OrderAnswer> {
  const { setup, language, session, entry, now } = visit;
  const { familyId } = entry;
  const running = await setup.directory.subscriptionOf(familyId);
  if (running) return html(200, orderedPage(language, familyId, await nameAtLogto(setup.idp, running.holder)));
  const family = orderingFamilyOf(entry, now);
  if (!family) return html(200, notOfferedPage(language, familyId));
  const founder = await founderAtLogto(visit);
  if (!founder) return html(200, noFounderPage(language, familyId));
  if (founder.userId !== session.userId) return html(200, onlyFounderOrdersPage(language, familyId, nameOf(founder) ?? founder.userId));
  return checkout(visit, family, founder);
}

/** `/subscription`: takes the Contract holder to Stripe's Portal, also while the Family is Locked. */
async function answerSubscription({ setup, language, session, entry }: Visit): Promise<OrderAnswer> {
  const { familyId } = entry;
  const subscription = await setup.directory.lastSubscriptionOf(familyId);
  if (!subscription || subscription.customerId === null) return html(200, noSubscriptionPage(language, familyId));
  if (subscription.holder !== session.userId) return html(200, subscriptionHolderPage(language, familyId, await nameAtLogto(setup.idp, subscription.holder)));
  const portal = await setup.stripe.portalSession({
    customer: subscription.customerId,
    configuration: setup.portal,
    locale: language,
    return_url: `${setup.config.publicUrl}/${familyId}/`,
  });
  return redirect(portal);
}

/** The Family's founder as Logto keeps them; undefined if none is recorded, or they are no Admin any more. */
async function founderAtLogto({ setup, entry, admins }: Visit): Promise<(LogtoPerson & { userId: string }) | undefined> {
  const founder = await founderOf(setup, entry.familyId);
  const userId = admins.find((admin) => admin === founder);
  if (userId === undefined) return undefined;
  const found = await person(setup.idp, userId);
  return found && { ...found, userId };
}

const nameOf = ({ name, email }: LogtoPerson): string | null => name ?? email;

async function nameAtLogto(idp: IdpManagement, userId: string): Promise<string | null> {
  const found = await person(idp, userId);
  return found ? nameOf(found) : null;
}

/** The case the Family orders in; undefined if it is neither in its Trial nor Locked. */
function orderingFamilyOf({ lockedAt, trialEndsAt }: DirectoryEntry, now: Date): OrderingFamily | undefined {
  if (lockedAt !== null) return { case: "locked" };
  if (trialEndsAt !== null && trialEndsAt > now) return { case: "trial", trialEndsAt };
  return undefined;
}

/** Sends the founder to the Checkout of a new Session. */
async function checkout(visit: Visit, family: OrderingFamily, founder: LogtoPerson): Promise<OrderAnswer> {
  const { setup, session, entry } = visit;
  const { stripe, prices, config } = setup;
  for (const open of await stripe.openSessions(entry.familyId)) await stripe.expireSession(open);
  const url = await stripe.createSession(
    checkoutSessionParams({
      familyId: entry.familyId,
      family,
      holder: { userId: session.userId, email: founder.email, name: founder.name },
      monthlyPrice: prices.monthly,
      language: mailLanguageOf(founder.locale),
      pageLanguage: visit.language,
      publicUrl: config.publicUrl,
      now: visit.now,
    }),
  );
  return redirect(url);
}

const html = (status: number, body: string): OrderAnswer => ({ status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" }, body });

const redirect = (location: string): OrderAnswer => ({ status: 302, headers: { ...NO_STORE, location }, body: "" });
