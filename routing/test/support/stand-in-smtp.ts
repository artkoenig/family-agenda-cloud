import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import { SMTPServer, type SMTPServerAuthentication, type SMTPServerDataStream } from "smtp-server";

/**
 * A mail server as the outbox's sender reaches IONOS's: SMTP with implicit TLS (as on port 465),
 * which takes a mail only after a login with `USER` and `PASSWORD`. Its certificate is made for
 * localhost when it starts; `ca` is what the sender is told to trust in its place.
 */
export type StandInSmtp = {
  host: string;
  port: number;
  /** The certificate the sender trusts, for SMTP_HOST=localhost. */
  ca: string;
  /** The mails it took, in order. */
  received: ReceivedMail[];
  /** Refuses each recipient with this SMTP code (such as 451 or 550), until set to null. */
  refuseWith(code: number | null): void;
  close(): Promise<void>;
};

/** A mail as the server took it: the envelope, and the headers and text as a mail client reads them. */
export type ReceivedMail = {
  envelopeFrom: string;
  envelopeTo: string[];
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  /** Its HTML; null for a mail of plain text alone. */
  html: string | null;
  /** The charset its text is sent in. */
  charset: string;
  /** The files it carries. */
  attachments: { filename: string; contentType: string; content: Buffer }[];
};

export const USER = "support@family-agenda.test";
export const PASSWORD = "the mailbox password";

/** A key and a certificate for localhost, made with openssl, valid for a day. */
function localhostCertificate(): { key: string; cert: string } {
  const directory = mkdtempSync(join(tmpdir(), "stand-in-smtp-"));
  try {
    const [key, cert] = [join(directory, "key.pem"), join(directory, "cert.pem")];
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
      { stdio: "ignore" },
    );
    return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function readAll(stream: SMTPServerDataStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const addressOf = (header: unknown): string => (header as { text?: string } | undefined)?.text ?? "";

export async function startStandInSmtp(): Promise<StandInSmtp> {
  const { key, cert } = localhostCertificate();
  const received: ReceivedMail[] = [];
  let refusal: number | null = null;
  const server = new SMTPServer({
    secure: true,
    key,
    cert,
    authMethods: ["PLAIN", "LOGIN"],
    disabledCommands: ["STARTTLS"],
    logger: false,
    onAuth(auth: SMTPServerAuthentication, _session, callback) {
      if (auth.username === USER && auth.password === PASSWORD) callback(null, { user: USER });
      else callback(Object.assign(new Error("Authentication failed"), { responseCode: 535 }));
    },
    onRcptTo(address, _session, callback) {
      if (refusal === null) callback();
      else callback(Object.assign(new Error(`<${address.address}>: Recipient refused`), { responseCode: refusal }));
    },
    onData(stream, session, callback) {
      void (async () => {
        const raw = await readAll(stream);
        const mail = await simpleParser(raw);
        const fromAddress = session.envelope.mailFrom;
        received.push({
          envelopeFrom: fromAddress === false ? "" : fromAddress.address,
          envelopeTo: session.envelope.rcptTo.map(({ address }) => address),
          from: addressOf(mail.from),
          replyTo: addressOf(mail.replyTo),
          to: addressOf(mail.to),
          subject: mail.subject ?? "",
          text: mail.text ?? "",
          html: mail.html || null,
          charset: (mail.headers.get("content-type") as { params?: { charset?: string } } | undefined)?.params?.charset ?? "",
          attachments: mail.attachments.map(({ filename, contentType, content }) => ({ filename: filename ?? "", contentType, content })),
        });
        callback();
      })().catch((error: unknown) => {
        callback(error as Error);
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address() as AddressInfo;
  return {
    host: "localhost",
    port,
    ca: cert,
    received,
    refuseWith: (code) => {
      refusal = code;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  };
}
