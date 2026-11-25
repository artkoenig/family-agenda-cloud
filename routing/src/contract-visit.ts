/**
 * What the pages a Subscription is ended on share (#229, #230): `/cancel` and `/withdraw` answer
 * the same people the same way until it comes to what the Contract holder declares.
 *
 * - Without a session the browser goes to central sign-in and comes back.
 * - A form counts only with the session's token.
 * - What a form declares is worked out under the Family's lock, on a connection of its own.
 *
 * The Contract section (contract-fragment.ts) shares who may see what, but answers with no redirect.
 */
import type pg from "pg";
import { monthsAfter, type Cancellable, type EndDate } from "./cancel-dates";
import type { Config } from "./config";
import type { Imprint } from "./contract-mails";
import { CSRF_FIELD } from "./contract-pages";
import { CONTRACT_PATHS, type Billing, type Language } from "./contract-wording";
import { cookiesOf } from "./cookies";
import type { Directory, DirectoryEntry } from "./directory";
import type { Log } from "./log";
import type { IdpManagement, LogtoPerson } from "./logto-management";
import { organizations } from "./organizations";
import { withFamilyLock } from "./provisioning";
import { signInPathFor } from "./routing-pages";
import { isOwnForm, sessionOf, type RoutingSession } from "./routing-session";
import type { StripePort, StripeSubscription } from "./stripe";
import { CANCELLATION_RECEIVED_AT, CANCELLATION_REFUND_CENTS } from "./stripe-subscription";

/** What the pages work with. */
export type ContractSetup = {
  config: Config;
  directory: Directory;
  directoryPool: pg.Pool;
  idp: IdpManagement;
  stripe: StripePort;
  imprint: Imprint;
  log: Log;
  now: () => Date;
};

/** A browser's request for one of the pages; `form` reads what it posts, undefined if that is too long. */
export type ContractRequest = { method: string; language: Language; cookie: string | undefined; form: () => Promise<URLSearchParams | undefined> };

/** The Router's answer. */
export type ContractAnswer = { status: number; headers: Record<string, string>; body: string };

/** A request let in: who is signed in, and the form they posted with their session's token; null if they posted none. */
export type Admitted = { session: RoutingSession; now: Date; form: URLSearchParams | null };

const METHODS = ["GET", "HEAD", "POST"];

const NO_STORE = { "cache-control": "no-store" };

export const html = (status: number, body: string): ContractAnswer => ({ status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" }, body });

export const redirect = (status: 302 | 303, location: string): ContractAnswer => ({ status, headers: { ...NO_STORE, location }, body: "" });

/** Lets a request for `page` in, or answers it: no such method, no session, a form too long or not the session's own, which `refused` tells. */
export async function admitted(request: ContractRequest, setup: ContractSetup, page: "cancel" | "withdraw", refused: (language: Language) => string): Promise<Admitted | ContractAnswer> {
  const { language } = request;
  if (!METHODS.includes(request.method)) return { status: 405, headers: { ...NO_STORE, allow: METHODS.join(", ") }, body: "" };
  const posted = request.method === "POST";
  const now = setup.now();
  const session = sessionOf(setup.config.operatorKey, cookiesOf(request.cookie), now);
  if (!session) return redirect(posted ? 303 : 302, signInPathFor(CONTRACT_PATHS[page][language]));
  if (!posted) return { session, now, form: null };
  const form = await request.form();
  if (!form) return { status: 413, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" }, body: "Too long\n" };
  if (!isOwnForm(session, form.get(CSRF_FIELD))) return html(403, refused(language));
  return { session, now, form };
}

/** Whether the Family runs, Locked or not: not one being prepared, suspended or deleted. */
export const runs = ({ status }: DirectoryEntry): boolean => status === "active" || status === "locked";

export async function isAdmin({ idp }: ContractSetup, { organizationId, userId }: RoutingSession): Promise<boolean> {
  return (await organizations(idp).admins(organizationId)).some((admin) => admin.userId === userId);
}

/** The person's name, else their address, else their id at Logto. */
export const nameOf = ({ name, email }: LogtoPerson, userId: string): string => name ?? email ?? userId;

/** The Family's name at Logto, else its id. */
export async function familyNameOf({ idp }: ContractSetup, { organizationId, familyId }: DirectoryEntry): Promise<string> {
  if (organizationId === null) return familyId;
  return (await organizations(idp).name(organizationId)) ?? familyId;
}

/**
 * When the Subscription is, or was, first paid: at its anchor. Stripe charges at once for a Checkout
 * paid after its anchor and moves that a period on; such a Subscription was first paid a period before it.
 */
export function cancellableOf({ billing_cycle_anchor }: StripeSubscription, billing: Billing, { trialEndsAt }: DirectoryEntry, now: Date): Cancellable {
  const anchor = new Date(billing_cycle_anchor * 1000);
  const inTrial = trialEndsAt !== null && now < trialEndsAt;
  return { billing, anchor: now < anchor && !inTrial ? monthsAfter(anchor, billing === "yearly" ? -12 : -1) : anchor };
}

/** What the Subscription notes of the Cancellation: when it came in, and what its end pays back. */
export const notedOf = ({ settlement }: EndDate, now: Date): Record<string, string> => ({
  [CANCELLATION_RECEIVED_AT]: now.toISOString(),
  [CANCELLATION_REFUND_CENTS]: settlement.case === "yearly-after-year-one" ? String(settlement.refundCents) : "",
});

/** The instant the Subscription's metadata notes under `key`; null if it notes none. */
export function notedAt({ metadata }: StripeSubscription, key: string): Date | null {
  const noted = new Date(metadata[key] ?? "");
  return Number.isNaN(noted.getTime()) ? null : noted;
}

export const instantOf = (seconds: number | null): Date | null => (seconds === null ? null : new Date(seconds * 1000));

/** What `work` answers under the Family's lock, on a connection of its own: the lock is the session's. */
export async function underFamilyLock<T>(pool: pg.Pool, familyId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const answer = await withFamilyLock(client, familyId, () => work(client));
    client.release();
    return answer;
  } catch (error) {
    client.release(true);
    throw error;
  }
}
