import { Writable } from "node:stream";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directoryConnection } from "../src/config";
import { MAIL_FROM, MAIL_REPLY_TO } from "../src/contract-mails";
import { createLog, type Log } from "../src/log";
import { deliverDue, MAIL_SENDER_RUNNING, smtpTransport, sweepOutbox, type MailTransport, type Sending } from "../src/mail-sender";
import { outbox, type OutboxMail } from "../src/outbox";
import { setUpRouting, type TestRouting } from "./support/routing";
import { PASSWORD, startStandInSmtp, USER, type StandInSmtp } from "./support/stand-in-smtp";

const FAMILY = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MINUTE = 60_000;

const mailTo = (to: string, subject = "Ihre Kündigung ist eingegangen"): OutboxMail => ({
  from: MAIL_FROM,
  replyTo: MAIL_REPLY_TO,
  to,
  subject,
  text: "Guten Tag Anna Müller,\n\nwir haben Ihre Kündigung erhalten. Grüße – Family Agenda\n",
});

let routing: TestRouting;
let smtp: StandInSmtp;
const clients: pg.Client[] = [];
const transports: MailTransport[] = [];
let logged: string;
let log: Log;
/** The sender's time: a minute after the Directory's, so that a mail put in is due at once, however slowly the test runs. */
let time: Date;

beforeEach(async () => {
  routing = await setUpRouting();
  expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });
  smtp = await startStandInSmtp();
  logged = "";
  log = createLog(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        logged += chunk.toString();
        done();
      },
    }),
    () => time,
  );
  time = new Date(Date.now() + MINUTE);
});
afterEach(async () => {
  for (const transport of transports.splice(0)) transport.close();
  for (const client of clients.splice(0)) await client.end();
  await smtp.close();
  await routing.close();
});

async function connect(): Promise<pg.Client> {
  const client = new pg.Client(
    directoryConnection({ directoryDatabaseUrl: routing.env.DIRECTORY_DATABASE_URL!, directoryDatabasePassword: routing.env.DIRECTORY_DATABASE_PASSWORD! }),
  );
  await client.connect();
  clients.push(client);
  return client;
}

function transportTo(port = smtp.port): MailTransport {
  const transport = smtpTransport({ host: smtp.host, port, user: USER, password: PASSWORD }, smtp.ca);
  transports.push(transport);
  return transport;
}

async function sender(transport = transportTo()): Promise<Sending> {
  return { client: await connect(), transport, log, now: () => time };
}

const logLines = () =>
  logged
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

/** The log names no recipient, subject or text of a mail. */
function expectNoMailIn(text: string, mails: OutboxMail[]): void {
  for (const mail of mails) {
    expect(text).not.toContain(mail.to);
    expect(text).not.toContain(mail.subject);
    expect(text).not.toContain(mail.text.split("\n")[0]);
  }
  expect(text).not.toMatch(/@(example|family)\./);
}

describe("A mail put in the outbox", () => {
  it("is sent through the mail server with its From, Reply-To, To, subject and UTF-8 text", async () => {
    const mail = mailTo("anna.mueller@example.org");
    const client = await connect();
    await outbox(client).enqueue(mail, { type: "cancellation", familyId: FAMILY });

    expect(await deliverDue(await sender())).toEqual({ sent: 1, failed: 0 });

    expect(smtp.received).toEqual([
      {
        envelopeFrom: "no-reply@family-agenda.cloud",
        envelopeTo: ["anna.mueller@example.org"],
        from: '"Family Agenda" <no-reply@family-agenda.cloud>',
        replyTo: "support@family-agenda.cloud",
        to: "anna.mueller@example.org",
        subject: "Ihre Kündigung ist eingegangen",
        text: mail.text,
        charset: "utf-8",
      },
    ]);
    expect(await routing.directory("SELECT attempts, sent_at, last_error, claimed_until FROM mail_outbox")).toEqual([
      { attempts: 1, sent_at: time, last_error: null, claimed_until: null },
    ]);
    expect(await outbox(client).waiting()).toEqual([]);
    // Sent once: nothing is due any more.
    expect(await deliverDue(await sender())).toEqual({ sent: 0, failed: 0 });
    expect(smtp.received).toHaveLength(1);
    expect(logLines()).toEqual([
      expect.objectContaining({ level: "info", message: "A mail was sent", type: "cancellation", familyId: FAMILY, attempts: 1 }),
    ]);
    expectNoMailIn(logged, [mail]);
  });

  it("is part of the transaction that puts it in: committed with the change, gone with a rollback, while the mail server is down", async () => {
    const created = await routing.run(["create", "--organization-id", "org_first"]);
    const familyId = /\/([0-9a-f-]{36})\/$/.exec(created.stdout.trim())![1]!;
    await smtp.close();
    const client = await connect();

    await client.query("BEGIN");
    await client.query("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);
    await outbox(client).enqueue(mailTo("anna@example.org", "Rolled back"), { type: "suspension", familyId });
    await client.query("ROLLBACK");
    await client.query("BEGIN");
    await client.query("UPDATE family SET status = 'suspended' WHERE family_id = $1", [familyId]);
    await outbox(client).enqueue(mailTo("anna@example.org"), { type: "suspension", familyId });
    await client.query("COMMIT");

    expect(await routing.directory("SELECT status FROM family")).toEqual([{ status: "suspended" }]);
    expect(await routing.directory("SELECT type, family_id, subject, attempts, sent_at FROM mail_outbox")).toEqual([
      { type: "suspension", family_id: familyId, subject: "Ihre Kündigung ist eingegangen", attempts: 0, sent_at: null },
    ]);
    // The mail server down fails the sending alone, which tries again later.
    expect(await deliverDue(await sender())).toEqual({ sent: 0, failed: 1 });
    expect(logLines()).toEqual([
      expect.objectContaining({ level: "info", message: "Sending a mail failed; it is tried again", type: "suspension", familyId, attempts: 1, reason: "ESOCKET" }),
    ]);
  });

  it("can be about no Family, and refuses a type that is no type", async () => {
    const client = await connect();
    await outbox(client).enqueue(mailTo("operator@example.org"), { type: "health-alert" });
    await expect(outbox(client).enqueue(mailTo("operator@example.org"), { type: "Health alert to operator@example.org" })).rejects.toThrow(
      "A mail's type is lower-case words joined by hyphens",
    );

    expect(await deliverDue(await sender())).toEqual({ sent: 1, failed: 0 });
    expect(logLines()).toEqual([expect.not.objectContaining({ familyId: expect.anything() as unknown })]);
  });
});

describe("A mail the mail server refuses", () => {
  it("is tried again after a delay that doubles up to an hour, and logged as an error once, on the fifth failure", async () => {
    const mail = mailTo("bo@example.org");
    await outbox(await connect()).enqueue(mail, { type: "trial-reminder-1", familyId: FAMILY });
    const sending = await sender();
    smtp.refuseWith(451);

    const start = time.getTime();
    const delays = [1, 2, 4, 8, 16, 32, 60, 60];
    let at = start;
    for (const [index, delay] of delays.entries()) {
      expect(await deliverDue(sending)).toEqual({ sent: 0, failed: 1 });
      const [row] = await routing.directory("SELECT attempts, next_attempt_at, last_error FROM mail_outbox");
      expect(row).toEqual({ attempts: index + 1, next_attempt_at: new Date(at + delay * MINUTE), last_error: "Can't send mail - all recipients were rejected: 451 <address>: Recipient refused" });
      // Not tried again before its time.
      time = new Date(at + delay * MINUTE - 1000);
      expect(await deliverDue(sending)).toEqual({ sent: 0, failed: 0 });
      at += delay * MINUTE;
      time = new Date(at);
    }
    const lines = logLines();
    expect(lines.filter(({ level }) => level === "info")).toHaveLength(7);
    expect(lines.filter(({ level }) => level === "error")).toEqual([
      expect.objectContaining({ message: "A mail keeps failing to be sent; it is still tried", type: "trial-reminder-1", familyId: FAMILY, attempts: 5, reason: "EENVELOPE 451" }),
    ]);
    expect(lines[0]).toMatchObject({ retryAt: new Date(start + MINUTE).toISOString(), reason: "EENVELOPE 451" });

    smtp.refuseWith(null);
    expect(await deliverDue(sending)).toEqual({ sent: 1, failed: 0 });
    expect(smtp.received.map(({ to }) => to)).toEqual(["bo@example.org"]);
    expect(await routing.directory("SELECT attempts, last_error FROM mail_outbox WHERE sent_at IS NOT NULL")).toEqual([{ attempts: 9, last_error: null }]);
    expectNoMailIn(logged, [mail]);
  });
});

describe("Many mails", () => {
  it("go out at most 300 in any hour", { timeout: 60_000 }, async () => {
    const client = await connect();
    const mails = Array.from({ length: 400 }, (_, index) => mailTo(`family-${index}@example.org`, `Mail ${index}`));
    for (const mail of mails) await outbox(client).enqueue(mail, { type: "confirmation", familyId: FAMILY });
    // A mail server that takes every mail at once: what counts here is how many the sender sends.
    const subjects: string[] = [];
    const sending = await sender({
      send: (mail) => {
        subjects.push(mail.subject);
        return Promise.resolve();
      },
      close: () => {},
    });
    const start = time.getTime();

    expect(await deliverDue(sending)).toEqual({ sent: 300, failed: 0 });
    time = new Date(start + 30 * MINUTE);
    expect(await deliverDue(sending)).toEqual({ sent: 0, failed: 0 });
    time = new Date(start + 60 * MINUTE - 1);
    expect(await deliverDue(sending)).toEqual({ sent: 0, failed: 0 });
    time = new Date(start + 60 * MINUTE);
    expect(await deliverDue(sending)).toEqual({ sent: 100, failed: 0 });

    expect(new Set(subjects).size).toBe(400);
    expectNoMailIn(logged, mails);
  });

  it("are each sent once by two senders at the same time", { timeout: 60_000 }, async () => {
    const client = await connect();
    const mails = Array.from({ length: 80 }, (_, index) => mailTo(`family-${index}@example.org`, `Mail ${index}`));
    for (const mail of mails) await outbox(client).enqueue(mail, { type: "confirmation", familyId: FAMILY });

    const [first, second] = await Promise.all([deliverDue(await sender()), deliverDue(await sender())]);

    expect(first.sent + second.sent).toBe(80);
    expect(smtp.received).toHaveLength(80);
    expect(new Set(smtp.received.map(({ subject }) => subject)).size).toBe(80);
    expect(await routing.directory("SELECT count(*)::int AS waiting FROM mail_outbox WHERE sent_at IS NULL OR attempts <> 1")).toEqual([{ waiting: 0 }]);
  });

  it("count against the hour while another sender has claimed them", async () => {
    const client = await connect();
    for (let index = 0; index < 3; index++) await outbox(client).enqueue(mailTo(`family-${index}@example.org`), { type: "confirmation" });
    // 299 sent in the hour, and one claimed by a sender that is sending it.
    await routing.directory(
      `INSERT INTO mail_outbox (type, mail_from, reply_to, mail_to, subject, body, attempts, sent_at)
       SELECT 'confirmation', 'f', 'r', 't', 's', 'b', 1, $1::timestamptz - interval '59 minutes' FROM generate_series(1, 299)`,
      [time],
    );
    await routing.directory("UPDATE mail_outbox SET claimed_until = $1::timestamptz + interval '5 minutes' WHERE id = (SELECT min(id) FROM mail_outbox)", [time]);

    expect(await deliverDue(await sender())).toEqual({ sent: 0, failed: 0 });
    time = new Date(time.getTime() + MINUTE);
    expect(await deliverDue(await sender())).toEqual({ sent: 2, failed: 0 });
    // The claim ran out: its sender stopped, and the next one sends the mail.
    time = new Date(time.getTime() + 60 * MINUTE);
    expect(await deliverDue(await sender())).toEqual({ sent: 1, failed: 0 });
  });
});

describe("The sweep", () => {
  it("deletes the mails sent 30 days ago or before, and keeps the rest", async () => {
    const client = await connect();
    for (const subject of ["30 days", "29 days", "not sent"]) await outbox(client).enqueue(mailTo("anna@example.org", subject), { type: "confirmation" });
    const day = 24 * 60 * MINUTE;
    await routing.directory("UPDATE mail_outbox SET sent_at = $1 WHERE subject = '30 days'", [new Date(time.getTime() - 30 * day)]);
    await routing.directory("UPDATE mail_outbox SET sent_at = $1 WHERE subject = '29 days'", [new Date(time.getTime() - 29 * day)]);
    await routing.directory("UPDATE mail_outbox SET created_at = $1 WHERE subject = 'not sent'", [new Date(time.getTime() - 40 * day)]);

    expect(await sweepOutbox(client, time)).toBe(1);

    expect(await routing.directory("SELECT subject FROM mail_outbox ORDER BY id")).toEqual([{ subject: "29 days" }, { subject: "not sent" }]);
  });
});

describe("The command line", () => {
  it("runs the sender with the Directory and the mail server alone, until stopped", async () => {
    const mail = mailTo("anna@example.org");
    await outbox(await connect()).enqueue(mail, { type: "confirmation", familyId: FAMILY });
    const onlyMail = Object.fromEntries(Object.keys(routing.env).map((name) => [name, name.startsWith("DIRECTORY_DATABASE_") ? routing.env[name] : undefined]));
    let stop = () => {};
    const until = new Promise<void>((resolve) => {
      stop = resolve;
    });

    const running = routing.run(
      ["send-mail"],
      { ...onlyMail, SMTP_HOST: smtp.host, SMTP_PORT: String(smtp.port), SMTP_USER: USER, SMTP_PASSWORD: PASSWORD },
      { until, smtpCa: smtp.ca },
    );
    await expect.poll(() => smtp.received.length, { timeout: 10_000 }).toBe(1);
    stop();
    const result = await running;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(MAIL_SENDER_RUNNING);
    expect(result.stderr).toContain('"message":"The mail sender stopped"');
    expect(result.stderr).not.toContain(PASSWORD);
    expectNoMailIn(result.stderr, [mail]);
  });

  it("refuses to run the sender without the mail server's password", async () => {
    const result = await routing.run(["send-mail"], { SMTP_HOST: smtp.host, SMTP_PORT: String(smtp.port), SMTP_USER: USER });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("SMTP_PASSWORD is not set");
  });

  it("lists the mails not sent yet, without address, subject or text", async () => {
    const client = await connect();
    const mails = [mailTo("anna@example.org"), mailTo("bo@example.org", "Second")];
    await outbox(client).enqueue(mails[0]!, { type: "confirmation", familyId: FAMILY });
    await outbox(client).enqueue(mails[1]!, { type: "health-alert" });
    smtp.refuseWith(550);
    await deliverDue(await sender());
    await outbox(client).enqueue(mailTo("cleo@example.org"), { type: "confirmation", familyId: FAMILY });

    const result = await routing.run(["outbox"]);

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(new RegExp(`^\\d+\\tconfirmation\\t${FAMILY}\\tqueued \\S+\\t1 failed attempt, next try \\S+\\tlast error: .*<address>: Recipient refused$`));
    expect(lines[1]).toMatch(/^\d+\thealth-alert\t-\tqueued \S+\t1 failed attempt/);
    expect(lines[2]).toMatch(/\tnot tried yet, due \S+$/);
    expectNoMailIn(result.stdout, mails);
  });
});
