/**
 * The fragment of the Contract section (#267), which the browser loads into the Family's Admin area
 * from the Router, with the session of central sign-in.
 *
 * - Never a redirect and never a whole page, but 200 with a line where there is no card: the core
 *   shows nothing else. Without a session that line links the sign-in, which comes back to the section.
 * - Only the founder reads the card, whom alone the core lists the section for. Another Admin reads
 *   who holds the contract; who is no Admin, or of a Family that does not run, that the page is for Admins.
 * - Everything is read from the Directory, and names from Logto: Stripe is not asked.
 */
import { contractSectionHtml, holderSectionHtml, noAccessSectionHtml, signInSectionHtml } from "./contract-section";
import { html, isAdmin, nameOf, runs, type ContractAnswer, type ContractRequest, type ContractSetup } from "./contract-visit";
import { cookiesOf } from "./cookies";
import type { Language } from "./contract-wording";
import type { DirectoryEntry } from "./directory";
import { person } from "./logto-management";
import { sessionOf } from "./routing-session";

const METHODS = ["GET", "HEAD"];

/** Answers a request for `/contract`. */
export async function answerContractSection({ method, language, cookie }: ContractRequest, setup: ContractSetup): Promise<ContractAnswer> {
  if (!METHODS.includes(method)) return { status: 405, headers: { "cache-control": "no-store", allow: METHODS.join(", ") }, body: "" };
  const now = setup.now();
  const session = sessionOf(setup.config.operatorKey, cookiesOf(cookie), now);
  if (!session) return html(200, signInSectionHtml(language));
  const entry = await setup.directory.findByOrganization(session.organizationId);
  if (!entry || !runs(entry) || !(await isAdmin(setup, session))) return html(200, noAccessSectionHtml(language));
  if (entry.registeredBy !== session.userId) return html(200, await holderOf(setup, language, entry));
  return html(200, await cardOf(setup, language, entry, session.userId, now));
}

/** What another Admin reads: the holder of the Subscription, or before there is one the founder, who alone may order. */
async function holderOf(setup: ContractSetup, language: Language, { familyId, registeredBy }: DirectoryEntry): Promise<string> {
  const subscription = await setup.directory.lastSubscriptionOf(familyId);
  const holder = subscription?.holder ?? registeredBy;
  const name = holder === null ? null : await personName(setup, holder);
  return name === null ? noAccessSectionHtml(language) : holderSectionHtml(language, name);
}

async function cardOf(setup: ContractSetup, language: Language, entry: DirectoryEntry, founder: string, now: Date): Promise<string> {
  const subscription = await setup.directory.subscriptionOf(entry.familyId);
  const { timeZone, trialEndsAt, lockedAt, lockReason } = entry;
  return contractSectionHtml(language, {
    timeZone,
    trialEndsAt,
    lock: lockedAt && { since: lockedAt, reason: lockReason },
    subscription,
    otherHolder: subscription && subscription.holder !== founder ? await personName(setup, subscription.holder) : null,
    now,
  });
}

/** The person's name as the contract pages show it; null for one who is gone from Logto. */
async function personName({ idp }: ContractSetup, userId: string): Promise<string | null> {
  const found = await person(idp, userId);
  return found ? nameOf(found, userId) : null;
}
