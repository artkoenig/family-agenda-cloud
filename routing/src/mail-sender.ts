import { once } from "node:events";
import nodemailer from "nodemailer";
import type pg from "pg";
import { systemClock, type Clock } from "pg-boss";
import type { SmtpSettings } from "./config";
import { describe, type Log } from "./log";
import type { OutboxMail } from "./outbox";
import { HOURLY_LIMIT, nextAttemptAt, sendsAlert, smtpReasonOf, sweptBefore, withoutAddresses } from "./outbox-policy";

/**
 * The outbox's sender (#233), `routing send-mail`: sends the mails due in the outbox through the
 * mail server, at most HOURLY_LIMIT in any hour, tries a mail that failed again after a growing
 * delay, and deletes the mails sent SENT_RETENTION_DAYS ago once a day. It is the one part of the
 * Routing module given the mail server's password. Its log lines name a mail by its id, type and
 * Family id: never its address, subject or text.
 *
 * A sender claims each mail before sending it, so that two senders never send the same mail; a
 * claim runs out after CLAIM_MINUTES, so a mail whose sender stopped part-way is sent by the next.
 * A mail is sent at least once: one whose sender stopped after sending it, before noting so, is
 * sent again.
 */

/** What sends one mail; it throws when the mail server did not take it. */
export type MailTransport = { send(mail: OutboxMail): Promise<void>; close(): void };

/** What the sender logs once it is under way. */
export const MAIL_SENDER_RUNNING = "The mail sender is running";

/** How long a sender's claim on a mail lasts: well above the time sending one mail can take. */
const CLAIM_MINUTES = 10;
/** How many mails a sender claims at once. */
const BATCH = 25;
/** How often the sender looks for mails due; a mail put in waits about as long. */
export const DELIVERY_INTERVAL_MS = 10_000;
export const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
/** An arbitrary, fixed key of the advisory lock that keeps two senders' claims apart, so that both count the same hour. */
const CLAIM_LOCK = 7_320_233;
/** How long the mail server may take to answer, before a mail counts as failed. */
const SMTP_TIMEOUT_MS = 60_000;

/**
 * The mail server through SMTP with implicit TLS, as IONOS's on port 465 and Scaleway TEM's on 465
 * take it; `ca` is the certificate to trust in place of the system's, for a test's server.
 * The envelope's sender is the mail's From, which is the mailbox logged in with.
 */
export function smtpTransport(smtp: SmtpSettings, ca?: string): MailTransport {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: true,
    auth: { user: smtp.user, pass: smtp.password },
    pool: true,
    maxConnections: 1,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    ...(ca === undefined ? {} : { tls: { ca } }),
  });
  return {
    async send(mail) {
      await transporter.sendMail({ from: mail.from, replyTo: mail.replyTo, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    },
    close() {
      transporter.close();
    },
  };
}

export type Sending = {
  /** The sender's own connection to the Directory; no caller's transaction. */
  client: pg.ClientBase;
  transport: MailTransport;
  log: Log;
  now: () => Date;
};

type ClaimedRow = {
  id: string;
  type: string;
  family_id: string | null;
  mail_from: string;
  reply_to: string;
  mail_to: string;
  subject: string;
  body: string;
  body_html: string | null;
  attempts: number;
};

/** Sends every mail due now that the hourly limit allows. Answers how many were sent and how many failed. */
export async function deliverDue(sending: Sending): Promise<{ sent: number; failed: number }> {
  const counts = { sent: 0, failed: 0 };
  for (;;) {
    const claimed = await claim(sending.client, sending.now());
    if (claimed.length === 0) return counts;
    for (const row of claimed) counts[(await deliver(sending, row)) ? "sent" : "failed"] += 1;
  }
}

/**
 * Claims the next mails due at `now`, as many as the hour leaves: HOURLY_LIMIT less the mails sent
 * in the hour before `now` and those other senders claimed and are sending.
 */
async function claim(client: pg.ClientBase, now: Date): Promise<ClaimedRow[]> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [CLAIM_LOCK]);
    const { rows: counted } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM mail_outbox
        WHERE sent_at > $1::timestamptz - interval '1 hour' OR (sent_at IS NULL AND claimed_until > $1::timestamptz)`,
      [now],
    );
    const [taken] = counted as [{ count: number }];
    const room = Math.min(HOURLY_LIMIT - taken.count, BATCH);
    const { rows } =
      room > 0
        ? await client.query<ClaimedRow>(
            `UPDATE mail_outbox SET claimed_until = $1::timestamptz + make_interval(mins => $3)
              WHERE id IN (SELECT id FROM mail_outbox
                            WHERE sent_at IS NULL AND next_attempt_at <= $1 AND (claimed_until IS NULL OR claimed_until <= $1)
                            ORDER BY next_attempt_at, id LIMIT $2 FOR UPDATE SKIP LOCKED)
              RETURNING id, type, family_id, mail_from, reply_to, mail_to, subject, body, body_html, attempts`,
            [now, room, CLAIM_MINUTES],
          )
        : { rows: [] };
    await client.query("COMMIT");
    return rows.sort((a, b) => Number(a.id) - Number(b.id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Sends one claimed mail and notes how it went; answers whether the mail server took it. */
async function deliver({ client, transport, log, now }: Sending, row: ClaimedRow): Promise<boolean> {
  const attempts = row.attempts + 1;
  const label = { mailId: row.id, type: row.type, ...(row.family_id === null ? {} : { familyId: row.family_id }), attempts };
  try {
    const html = row.body_html === null ? {} : { html: row.body_html };
    await transport.send({ from: row.mail_from, replyTo: row.reply_to, to: row.mail_to, subject: row.subject, text: row.body, ...html });
  } catch (error) {
    const retryAt = nextAttemptAt(now(), attempts);
    await client.query("UPDATE mail_outbox SET attempts = $2, next_attempt_at = $3, last_error = $4, claimed_until = NULL WHERE id = $1", [
      row.id,
      attempts,
      retryAt,
      withoutAddresses(describe(error)),
    ]);
    const fields = { ...label, retryAt: retryAt.toISOString(), reason: smtpReasonOf(error) };
    if (sendsAlert(attempts)) log.error("A mail keeps failing to be sent; it is still tried", fields);
    else log.info("Sending a mail failed; it is tried again", fields);
    return false;
  }
  await client.query("UPDATE mail_outbox SET attempts = $2, sent_at = $3, last_error = NULL, claimed_until = NULL WHERE id = $1", [row.id, attempts, now()]);
  log.info("A mail was sent", label);
  return true;
}

/** Deletes the mails sent SENT_RETENTION_DAYS before `now` or earlier. Answers how many. */
export async function sweepOutbox(client: Pick<pg.ClientBase, "query">, now: Date): Promise<number> {
  const { rowCount } = await client.query("DELETE FROM mail_outbox WHERE sent_at <= $1", [sweptBefore(now)]);
  return rowCount ?? 0;
}

export type MailSenderDependencies = Omit<Sending, "now"> & {
  /** The clock it looks for mails by; the system's unless a test moves one by hand. */
  clock?: Clock;
  /** Stops the sender; it runs until then. */
  signal?: AbortSignal;
};

/** Runs the sender until `signal` aborts: sends what is due every DELIVERY_INTERVAL_MS, and sweeps once a day. */
export async function runMailSender(dependencies: MailSenderDependencies): Promise<void> {
  const { client, log, clock = systemClock, signal } = dependencies;
  const sending: Sending = { ...dependencies, now: () => new Date(clock.now()) };
  // One thing at a time on the one connection: a sweep never lands in a claim's transaction.
  let work = Promise.resolve();
  let delivering = false;
  const deliverNow = () => {
    if (delivering) return;
    delivering = true;
    work = work
      .then(() => deliverDue(sending))
      .then(
        () => undefined,
        (error: unknown) => {
          log.error("Sending the mails due failed", { error });
        },
      )
      .finally(() => {
        delivering = false;
      });
  };
  const sweepNow = () => {
    work = work.then(async () => {
      try {
        log.info("The outbox swept the mails sent long ago", { swept: await sweepOutbox(client, sending.now()) });
      } catch (error) {
        log.error("Sweeping the outbox failed", { error });
      }
    });
  };
  sweepNow();
  deliverNow();
  const delivery = clock.setInterval(deliverNow, DELIVERY_INTERVAL_MS);
  const sweep = clock.setInterval(sweepNow, SWEEP_INTERVAL_MS);
  log.info(MAIL_SENDER_RUNNING);
  try {
    if (signal && !signal.aborted) await once(signal, "abort");
    else if (!signal) await new Promise(() => {});
  } finally {
    clock.clearInterval(delivery);
    clock.clearInterval(sweep);
    await work;
    dependencies.transport.close();
    log.info("The mail sender stopped");
  }
}
