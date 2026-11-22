import { createHmac } from "node:crypto";
import { reasonOf, type Log } from "./log";
import type { Pool } from "./pool";
import { IDP_EVENTS_PATH } from "./request-routing";

/**
 * Has a core run Logto's PostRegister for a person once more (#155): Logto sends it once and
 * never again, so a registration whose PostRegister the cores missed has no Family. Central
 * sign-in sends it again for a person whose ID token claims no Organization (spec/centralSignIn.qnt:
 * `AUTO_REPAIR`).
 *
 * The Router posts the event to a core's `POST /idp/events` as Logto would, signed with Logto's
 * key IDP_WEBHOOK_SECRET (HMAC-SHA256, hex, header `logto-signature-sha-256`). The core reads
 * only `event`, `user.id` and `user.primaryEmail`, and records `PostRegister:<userId>` once: a
 * copy for a PostRegister that was only slow does nothing, and the core creates nothing for a
 * person already a member or deleted (artkoenig/family-agenda#467). So sending one too many is
 * harmless, and sending none, as when every core fails, waits for the person's next sign-in.
 */

/** The person to register: their Logto user id and their verified email. */
export type Registrant = { userId: string; email: string };

/** Sends PostRegister for the person again; never fails, and logs what became of it by the user id alone. */
export type PostRegisterAgain = (registrant: Registrant) => Promise<void>;

/** The header Logto signs its events in. */
const SIGNATURE_HEADER = "logto-signature-sha-256";

/** How long a core may take to answer the event. */
const TIMEOUT_MS = 5_000;

/** Logto's PostRegister for the person, as far as the core reads it. */
export const postRegisterEvent = ({ userId, email }: Registrant, now: Date): string =>
  JSON.stringify({ event: "PostRegister", createdAt: now.toISOString(), userId, user: { id: userId, primaryEmail: email } });

/** The signature Logto gives a body: its HMAC-SHA256 with the webhook's key, in hex. */
export const signatureOf = (secret: string, body: string): string => createHmac("sha256", secret).update(body).digest("hex");

/**
 * PostRegister to the pool's cores, signed with `secret`: to each in turn until one takes it, as
 * any core may. A core that refuses it (4xx), as for a wrong key, is not passed over: another
 * would refuse it alike.
 */
export function postRegisterAgain(pool: Pool, secret: string, log: Log, now: () => Date = () => new Date()): PostRegisterAgain {
  return async (registrant) => {
    const body = postRegisterEvent(registrant, now());
    const headers = { "content-type": "application/json", [SIGNATURE_HEADER]: signatureOf(secret, body) };
    const failures: string[] = [];
    for (const core of await pool.cores()) {
      const outcome = await fetch(new URL(IDP_EVENTS_PATH, core), { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) }).then(
        ({ ok, status }) => (ok ? "taken" : status < 500 ? `refused ${String(status)}` : String(status)),
        (error: unknown) => reasonOf(error),
      );
      if (outcome === "taken") {
        log.info("Sent PostRegister again", { userId: registrant.userId, core: core.host });
        return;
      }
      failures.push(`${core.host} ${outcome}`);
      if (outcome.startsWith("refused")) break;
    }
    log.error("Sending PostRegister again failed; the next sign-in tries again", { userId: registrant.userId, failures: failures.join(", ") || "no core" });
  };
}
