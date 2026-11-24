import type pg from "pg";
import type { ContractMail } from "./contract-mails";
import { isMailType } from "./outbox-policy";

/**
 * The mail outbox (#233): the mails the Routing module sends, in the Directory. Putting a mail in
 * writes the Directory alone, never the mail server, so it can be part of the transaction of the
 * change it tells of: the mail goes out if and only if the change is committed, and neither
 * waits for the mail server nor fails with it. `routing send-mail` sends what is in it.
 */

/** A mail as the outbox sends it: plain text, UTF-8, from `from` with Reply-To `replyTo`. */
export type OutboxMail = ContractMail;

/**
 * What the log names a mail by, as it never names its address, subject or text: its type, such
 * as `confirmation` or `trial-reminder-1`, and the Family it is about, if any.
 */
export type MailLabel = { type: string; familyId?: string };

/** A mail not sent yet, as `routing outbox` lists it: no address, subject or text. */
export type WaitingMail = {
  id: string;
  type: string;
  familyId: string | null;
  createdAt: Date;
  attempts: number;
  nextAttemptAt: Date;
  /** Why the last attempt failed, its addresses masked; null before the first failure. */
  lastError: string | null;
};

export type Outbox = {
  /** Puts the mail in, to be sent as soon as the hourly limit allows. Answers its id. */
  enqueue(mail: OutboxMail, label: MailLabel): Promise<string>;
  /** Every mail not sent yet, oldest first. */
  waiting(): Promise<WaitingMail[]>;
};

/** The outbox through `client`: a caller's transaction, to put a mail in with the change it tells of. */
export function outbox(client: Pick<pg.ClientBase, "query">): Outbox {
  return {
    async enqueue(mail, { type, familyId }) {
      if (!isMailType(type)) throw new Error("A mail's type is lower-case words joined by hyphens");
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO mail_outbox (type, family_id, mail_from, reply_to, mail_to, subject, body)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [type, familyId ?? null, mail.from, mail.replyTo, mail.to, mail.subject, mail.text],
      );
      const [row] = rows as [{ id: string }];
      return row.id;
    },
    async waiting() {
      const { rows } = await client.query<WaitingRow>(
        `SELECT id, type, family_id, created_at, attempts, next_attempt_at, last_error
           FROM mail_outbox WHERE sent_at IS NULL ORDER BY created_at, id`,
      );
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        familyId: row.family_id,
        createdAt: row.created_at,
        attempts: row.attempts,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
      }));
    },
  };
}

type WaitingRow = {
  id: string;
  type: string;
  family_id: string | null;
  created_at: Date;
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
};
