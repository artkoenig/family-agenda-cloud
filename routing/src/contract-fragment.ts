/**
 * The fragment of the Contract section (#267), which the browser loads into the Family's Admin area
 * from the Router, with the session of central sign-in.
 *
 * - Never a redirect and never a whole page. Without a session, 200 and a line that links the
 *   sign-in, which comes back to the section: the founder's session may have run out.
 * - Only the founder who is an Admin of a Family that runs reads the card: the core lists the
 *   section for the founder alone. Everybody else gets 403.
 * - Everything is read from the Directory, and names from Logto: Stripe is not asked.
 */
import { contractSectionHtml, signInSectionHtml } from "./contract-section";
import { html, isAdmin, nameOf, runs, type ContractAnswer, type ContractRequest, type ContractSetup } from "./contract-visit";
import { cookiesOf } from "./cookies";
import type { Language } from "./contract-wording";
import type { DirectoryEntry } from "./directory";
import { person } from "./logto-management";
import { sessionOf } from "./routing-session";

const METHODS = ["GET", "HEAD"];

const REFUSED: ContractAnswer = { status: 403, headers: { "cache-control": "no-store" }, body: "" };

/** Answers a request for `/contract`. */
export async function answerContractSection({ method, language, cookie }: ContractRequest, setup: ContractSetup): Promise<ContractAnswer> {
  if (!METHODS.includes(method)) return { status: 405, headers: { "cache-control": "no-store", allow: METHODS.join(", ") }, body: "" };
  const now = setup.now();
  const session = sessionOf(setup.config.operatorKey, cookiesOf(cookie), now);
  if (!session) return html(200, signInSectionHtml(language));
  const entry = await setup.directory.findByOrganization(session.organizationId);
  if (!entry || !runs(entry) || entry.registeredBy !== session.userId || !(await isAdmin(setup, session))) return REFUSED;
  return html(200, await cardOf(setup, language, entry, session.userId, now));
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
