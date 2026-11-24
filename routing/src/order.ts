/**
 * The order (#226): a Family's founder chooses the billing on `/order` and is sent to Stripe's
 * hosted Checkout. Nothing here changes the Directory but the founder recorded when first needed
 * (`founderOf`): it learns of the order from Stripe's webhooks alone (#227).
 *
 * - Without a session the browser goes to central sign-in and comes back.
 * - Only an Admin of the Family sees anything, only its founder may order, and only in its Trial
 *   or while it is Locked.
 * - A founder Logto has no name of enters it; it is kept at Logto, where every page and mail reads
 *   the Contract holder's name.
 * - A Family has one open Checkout Session at most: those before are expired first.
 */
import { firstPayment, type OrderingFamily } from "./checkout-texts";
import { mailLanguageOf, type Billing, type Language } from "./contract-wording";
import type { Config, StripeSettings } from "./config";
import { cookiesOf } from "./cookies";
import type { Directory, DirectoryEntry } from "./directory";
import { founderOf } from "./founder";
import { person, setName, type IdpManagement, type LogtoPerson } from "./logto-management";
import { organizations } from "./organizations";
import { BILLING_FIELD, NAME_FIELD, NAME_LIMIT, noAccessPage, noFounderPage, notOfferedPage, onlyFounderOrdersPage, orderDonePage, orderedPage, orderPage } from "./order-pages";
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
  now: () => Date;
};

/** A browser's request for a page of the order; `form` reads what it posts, undefined if that is too long. */
export type OrderRequest = { method: string | undefined; path: OrderPath; cookie: string | undefined; form: () => Promise<URLSearchParams | undefined> };

/** The Router's answer. */
export type OrderAnswer = { status: number; headers: Record<string, string>; body: string };

const METHODS: Record<OrderPath["page"], readonly string[]> = { order: ["GET", "HEAD", "POST"], done: ["GET", "HEAD"] };

const NO_STORE = { "cache-control": "no-store" };

/** Who asks for the page, and for which Family; both as they are now. */
type Visit = { setup: OrderSetup; language: Language; session: RoutingSession; entry: DirectoryEntry; admins: readonly string[]; now: Date };

/** Answers a request for a page of the order. */
export async function answerOrder(request: OrderRequest, setup: OrderSetup): Promise<OrderAnswer> {
  const { page, language } = request.path;
  const allowed = METHODS[page];
  if (!allowed.some((method) => method === request.method)) return { status: 405, headers: { ...NO_STORE, allow: allowed.join(", ") }, body: "" };
  const posted = request.method === "POST";
  const now = setup.now();
  const session = sessionOf(setup.config.operatorKey, cookiesOf(request.cookie), now);
  if (!session) return redirect(posted ? 303 : 302, signInPathFor(ORDER_PATHS[page][language]));
  const visit = await visitOf(setup, language, session, now);
  if (!visit) return html(403, noAccessPage(language));
  if (page === "done") return html(200, orderDonePage(language, visit.entry.familyId));
  return answerOrderPage(visit, posted ? request.form : undefined);
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

/** `/order`, or the order if a form was posted. */
async function answerOrderPage(visit: Visit, form: OrderRequest["form"] | undefined): Promise<OrderAnswer> {
  const { setup, language, session, entry, now } = visit;
  const { familyId } = entry;
  const running = await setup.directory.subscriptionOf(familyId);
  if (running) return html(200, orderedPage(language, familyId, await nameAtLogto(setup.idp, running.holder)));
  const family = orderingFamilyOf(entry, now);
  if (!family) return html(200, notOfferedPage(language, familyId));
  const founder = await founderAtLogto(visit);
  if (!founder) return html(200, noFounderPage(language, familyId));
  if (founder.userId !== session.userId) return html(200, onlyFounderOrdersPage(language, familyId, nameOf(founder) ?? founder.userId));
  return form ? postedOrder(visit, family, founder, form) : html(200, formOf(visit, family, founder));
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

function formOf({ language, now }: Visit, family: OrderingFamily, founder: LogtoPerson, invalid = false, billing: Billing = "monthly"): string {
  return orderPage(language, { firstPaymentAt: firstPayment(family, now).dueAt, askName: founder.name === null, billing, invalid });
}

/** The founder's order: keeps their name if Logto has none, and sends them to the Checkout of a new Session. */
async function postedOrder(visit: Visit, family: OrderingFamily, founder: LogtoPerson, readForm: OrderRequest["form"]): Promise<OrderAnswer> {
  const { setup, session, entry } = visit;
  const form = await readForm();
  if (!form) return { status: 413, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" }, body: "Too long\n" };
  const billing = billingOf(form.get(BILLING_FIELD));
  const name = founder.name ?? enteredName(form.get(NAME_FIELD));
  if (billing === undefined || name === undefined) return html(400, formOf(visit, family, founder, true, billing));
  if (founder.name === null) await setName(setup.idp, session.userId, name);
  const { stripe, prices, config } = setup;
  for (const open of await stripe.openSessions(entry.familyId)) await stripe.expireSession(open);
  const checkout = await stripe.createSession(
    checkoutSessionParams({
      familyId: entry.familyId,
      family,
      holder: { userId: session.userId, email: founder.email },
      billing,
      price: prices[billing],
      language: mailLanguageOf(founder.locale),
      pageLanguage: visit.language,
      publicUrl: config.publicUrl,
      now: visit.now,
    }),
  );
  return redirect(303, checkout);
}

const billingOf = (posted: string | null): Billing | undefined => (posted === "monthly" || posted === "yearly" ? posted : undefined);

/** The name entered, if it is one Logto takes. */
function enteredName(posted: string | null): string | undefined {
  const name = (posted ?? "").trim();
  return name === "" || name.length > NAME_LIMIT ? undefined : name;
}

const html = (status: number, body: string): OrderAnswer => ({ status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" }, body });

const redirect = (status: 302 | 303, location: string): OrderAnswer => ({ status, headers: { ...NO_STORE, location }, body: "" });
