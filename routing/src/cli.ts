import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import pg from "pg";
import { systemClock, type Clock } from "pg-boss";
import { ConfigError, directoryConnection, readConfig, readMailConfig, type Config, type DirectorySettings } from "./config";
import { parseCreate, parseDelete, parseFamilyId, parseOpenTrials, parseSetFounder, UsageError } from "./cli-arguments";
import { familyLine, waitingMailLine } from "./cli-reports";
import { createFamily, type CreateFamilyInput } from "./create-family";
import { deleteFamily, type DeleteFamilyInput } from "./delete-family";
import { coreClient } from "./core";
import { directory, migrateDirectory } from "./directory";
import { createLog, type Log } from "./log";
import { runMailSender, smtpTransport } from "./mail-sender";
import { mailTemplates, putMailTemplates } from "./mail-templates";
import { outbox } from "./outbox";
import { setSignInExperience } from "./sign-in-experience";
import { setSignInClient, setSignInClientRedirects } from "./sign-in-client";
import { isFamilyId } from "./family-id";
import type { Resolve } from "./pool";
import { setFounder } from "./founder";
import { provisioning, ProvisioningError, type Provisioning, type ScheduledProvisioning } from "./provisioning";
import { startReceiver } from "./receiver";
import { startRouter } from "./router";
import { familySchedules, openQueues, runScheduler, type FamilySchedules } from "./scheduler";
import { resumeFamily, suspendFamily } from "./family-status";
import { startTrial } from "./trials";

export type Io = {
  /** The environment, the only source of the Routing module's settings and secrets. */
  env: Record<string, string | undefined>;
  /** What the Operator asked for, such as the address of a new Family. */
  stdout: Writable;
  /** The log. */
  stderr: Writable;
  /** When a long-running command such as serve or schedule stops; SIGTERM or SIGINT unless given. */
  until?: Promise<unknown>;
  /** The clock the Scheduler fires by; the system's unless a test moves one by hand. */
  clock?: Clock;
  /** Finds the cores the pool's name stands for; the system's name resolution unless a test stands in for it. */
  resolve?: Resolve;
  /** The certificate send-mail trusts the mail server by, in place of the system's; a test's server's. */
  smtpCa?: string;
};

const USAGE = `Usage:
  routing create --organization-id <id> [--time-zone <IANA zone>] [--family-id <id>]
    Creates a Family whose Admins are the members of that Logto Organization with the role
    admin, and prints its address. After a failure part-way, run it again with the --family-id
    it names to finish that Family. A Family that registers is created by receive instead.
  routing delete --family-id <id> --confirm <id>
    Deletes the Family: its database and role, its blobs, its wrapped family key and database
    password. Its Directory entry stays, marked deleted. --confirm must repeat the Family id.
    It says when the Family is deleted; after a failure part-way, run it again to finish.
  routing suspend --family-id <id>
    Suspends the Family: its address answers 404 and its schedules are removed; its data stays.
  routing resume --family-id <id>
    Resumes a suspended Family: it is routed to and scheduled again, unless it is Locked.
  routing open-trials [--except <Family id>]...
    Opens Trials: starts a Trial now for every Family that has none, is not deleted and never
    had a Subscription, except those named; from then on a Family that registers starts its
    Trial when it is created. Running it again starts the Trials of Families added since.
  routing start-trial --family-id <id>
    Starts the Family's Trial now; refused if it had a Trial or a Subscription.
  routing set-founder <Family id> <Admin's email or user id> [--force]
    Records that Admin of the Family as its founder, who registered it, through
    IDP_MANAGEMENT_*; refuses anyone who is not an Admin now, and overwrites a founder recorded
    before only with --force.
  routing schedule
    Runs the Scheduler until stopped: every active Family's due work once a minute, its purge
    once an hour and its sweep of unreferenced secrets once a day. Due work that fails is tried
    again after a delay that doubles with each failure in a row, up to a quarter of an hour.
  routing send-mail
    Runs the outbox's sender until SIGTERM or SIGINT: sends the mails in the outbox through
    SMTP_HOST:SMTP_PORT (implicit TLS) as SMTP_USER, at most 300 in any hour, tries a mail that
    failed again after a delay that doubles up to an hour, and deletes mails sent 30 days ago.
    It needs DIRECTORY_DATABASE_* and SMTP_* alone.
  routing outbox
    Lists every mail not sent yet: its id, type and Family, and how often it failed and why.
    No address, subject or text.
  routing families
    Lists every Family with its status (being_prepared, active, locked, suspended or deleted)
    and when its due work last ran and how it ended; for due work that keeps failing, how often
    in a row and when it is tried next.
  routing migrate
    Brings the Directory's schema up to date (every command does this first).
  routing serve
    Runs the Router on LISTEN_HOST:PORT until SIGTERM or SIGINT, passing each Family's requests
    on to the cores CORE_URL names, and the sign-in callback and /idp/events without a Context.
  routing receive
    Runs the receiver on LISTEN_HOST:RECEIVER_PORT until SIGTERM or SIGINT: it creates the
    Family each family.created of a core announces at POST /family-created, signed with
    FAMILY_WEBHOOK_SECRET, and answers 2xx once the Family is active.
  routing mail-templates
    Puts Family Agenda's mails, German and English, into Logto as its email templates, through
    IDP_MANAGEMENT_*. Deploying runs it; it replaces the templates of the same type and language.
  routing sign-in-experience
    Sets Logto's sign-in screen through IDP_MANAGEMENT_*: email with password or code, passkey,
    Google (with GOOGLE_CLIENT_ID and _SECRET, else left out), terms and privacy at sign-up,
    German unless the browser asks otherwise, and the Account Center; registration open with
    REGISTRATION=open, else closed to all but invitees. Also lets central
    sign-in's client return to <PUBLIC_URL>/ after Abmelden, if there is that client. Deploying
    runs it, since the core's logto-setup resets the sign-in methods.
  routing sign-in-client
    Sets up central sign-in's own OIDC client at Logto through IDP_MANAGEMENT_*: a Traditional
    web application redirecting to <PUBLIC_URL>/sign-in/callback, and to <PUBLIC_URL>/ after
    Abmelden, created once and updated
    after. Prints CENTRAL_SIGN_IN_CLIENT_ID= and CENTRAL_SIGN_IN_CLIENT_SECRET= for the .env.

A core prepares a Family's database when it first opens it, so a new core version needs no
command: a request or operation that a core of an older release refuses is tried on another core.`;

type Command = (args: string[], config: Config, io: Io, log: Log) => Promise<number>;

/** The Operator's commands by name; each answers the exit code. */
const COMMANDS: Record<string, Command> = {
  migrate: (_args, config) => withDirectory(config, () => Promise.resolve(0)),
  create: (args, config, io, log) => create(config, parseCreate(args, config.defaultTimeZone, randomUUID), io, log),
  delete: (args, config, io, log) => runFamilyCommand(config, deletion(parseDelete(args)), io, log),
  suspend: (args, config, io, log) => runFamilyCommand(config, suspension(parseFamilyId(args)), io, log),
  resume: (args, config, io, log) => runFamilyCommand(config, resumption(parseFamilyId(args)), io, log),
  "open-trials": (args, config, io) => openTrials(config, parseOpenTrials(args), io),
  "start-trial": (args, config, io, log) => runDirectoryCommand(config, trialStart(parseFamilyId(args)), io, log),
  "set-founder": (args, config, io, log) => founderSetting(args, config, io, log),
  serve: (_args, config, io, log) => serve(config, io, log),
  receive: (_args, config, io, log) => receive(config, io, log),
  schedule: (_args, config, io, log) => schedule(config, io, log),
  families: (_args, config, io) => families(config, io),
  outbox: (_args, config, io) => listOutbox(config, io),
  "mail-templates": (_args, config, io) => putTemplates(config, io),
  "sign-in-experience": (_args, config, io, log) => signInExperience(config, io, log),
  "sign-in-client": (_args, config, io, log) => signInClient(config, io, log),
};

/** The Operator's command line. Answers the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const log = createLog(io.stderr);
  try {
    const [command, ...rest] = args;
    if (!command) throw new UsageError("No command given");
    // The mail sender runs with the Directory and the mail server alone: no key of the Routing module's.
    if (command === "send-mail") return await sendMail(io, log);
    const commandNamed = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
    if (!commandNamed) throw new UsageError(`Unknown command ${command}`);
    return await commandNamed(rest, readConfig(io.env), io, log);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    if (error instanceof ConfigError) {
      log.error("The configuration is incomplete", { error });
      return 2;
    }
    log.error("The command failed", { error });
    return 1;
  }
}

async function create(config: Config, input: CreateFamilyInput, io: Io, log: Log): Promise<number> {
  try {
    const address = await withDirectory(config, (client) =>
      withSchedules(config, (schedules) => createFamily({ ...provisioning(config, client, log, io.resolve), schedules }, input)),
    );
    io.stdout.write(`${address}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ProvisioningError) {
      // Nothing was done; a drawn Family id that was never used is not worth naming.
      log.error("Creating the Family was refused", { ...(input.familyIdFrom === "drawn" ? {} : { familyId: input.familyId }), error });
    } else {
      log.error("Creating the Family failed; run create again with --family-id to finish it", { familyId: input.familyId, error });
    }
    return 1;
  }
}

async function serve(config: Config, io: Io, log: Log): Promise<number> {
  await migrate(config);
  const router = await startRouter(config, log, io.resolve);
  log.info("The Router listens", { url: router.url });
  await (io.until ?? stopSignal());
  await router.close();
  log.info("The Router stopped");
  return 0;
}

async function receive(config: Config, io: Io, log: Log): Promise<number> {
  await migrate(config);
  const receiver = await startReceiver(config, log, io.resolve);
  log.info("The receiver listens", { url: receiver.url });
  await (io.until ?? stopSignal());
  await receiver.close();
  log.info("The receiver stopped");
  return 0;
}

const stopSignal = () =>
  new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve).once("SIGINT", resolve);
  });

/** Brings the Directory's schema up to date. */
async function migrate(config: Config): Promise<void> {
  const client = new pg.Client(directoryConnection(config));
  await client.connect();
  try {
    await migrateDirectory(client);
  } finally {
    await client.end();
  }
}

/**
 * A command that changes a Family: what does it, answering what the Operator is told after the
 * Family id once it is done, and what the log says.
 */
type FamilyCommand<P = ScheduledProvisioning> = {
  familyId: string;
  work(provisioning: P): Promise<string>;
  refused: string;
  failed: string;
};

/** Runs the command with the Directory and the Scheduler's queues; answers the exit code. */
function runFamilyCommand(config: Config, command: FamilyCommand, io: Io, log: Log): Promise<number> {
  return reported(command, io, log, () =>
    withDirectory(config, (client) => withSchedules(config, (schedules) => command.work({ ...provisioning(config, client, log, io.resolve), schedules }))),
  );
}

/** Runs the command with the Directory only; answers the exit code. */
function runDirectoryCommand(config: Config, command: FamilyCommand<Provisioning>, io: Io, log: Log): Promise<number> {
  return reported(command, io, log, () => withDirectory(config, (client) => command.work(provisioning(config, client, log, io.resolve))));
}

/** Tells the Operator what the command did, or logs why it did not; answers the exit code. */
async function reported(command: Omit<FamilyCommand, "work">, io: Io, log: Log, running: () => Promise<string>): Promise<number> {
  const { familyId } = command;
  try {
    const done = await running();
    io.stdout.write(`The Family ${familyId} ${done}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ProvisioningError) {
      // Text that is not a Family id names no Family and is not worth logging.
      log.error(command.refused, { ...(isFamilyId(familyId) ? { familyId } : {}), error });
    } else {
      log.error(command.failed, { familyId, error });
    }
    return 1;
  }
}

const deletion = (input: DeleteFamilyInput): FamilyCommand => ({
  familyId: input.familyId,
  work: async (provisioning) => {
    await deleteFamily(provisioning, input);
    return "is deleted";
  },
  refused: "Deleting the Family was refused",
  failed: "Deleting the Family did not finish; run delete again to finish it",
});

const suspension = (familyId: string): FamilyCommand => ({
  familyId,
  work: async (provisioning) => {
    await suspendFamily(provisioning, familyId);
    return "is suspended";
  },
  refused: "Suspending the Family was refused",
  failed: "Suspending the Family did not finish; run suspend again to finish it",
});

const resumption = (familyId: string): FamilyCommand => ({
  familyId,
  work: async (provisioning) =>
    (await resumeFamily(provisioning, familyId)) === "locked"
      ? "is resumed and stays Locked: it is not routed to or scheduled until it is unlocked"
      : "is active again",
  refused: "Resuming the Family was refused",
  failed: "Resuming the Family did not finish; run resume again to finish it",
});

const trialStart = (familyId: string): FamilyCommand<Provisioning> => ({
  familyId,
  work: async ({ directory }) => {
    const { startsAt, endsAt } = await startTrial(directory, familyId);
    return `starts its Trial ${startsAt.toISOString()}; it ends ${endsAt.toISOString()}`;
  },
  refused: "Starting the Trial was refused",
  failed: "Starting the Trial failed; run start-trial again",
});

/** Records the founder; needs IDP_MANAGEMENT_*. */
function founderSetting(args: string[], config: Config, io: Io, log: Log): Promise<number> {
  const input = parseSetFounder(args);
  const idp = config.idpManagement;
  if (idp === null) throw new ConfigError("set-founder needs IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET");
  const command: FamilyCommand<Provisioning> = {
    familyId: input.familyId,
    work: async ({ directory }) => `has the founder ${await setFounder(directory, idp, input)}`,
    refused: "Recording the founder was refused",
    failed: "Recording the founder failed; run set-founder again",
  };
  return runDirectoryCommand(config, command, io, log);
}

/** Opens Trials and names each Family whose Trial it started. */
async function openTrials(config: Config, except: string[], io: Io): Promise<number> {
  const started = await withDirectory(config, (client) => directory(client).openTrials(except));
  for (const familyId of started) io.stdout.write(`The Family ${familyId} starts its Trial\n`);
  io.stdout.write(`Trials are open; ${started.length} started now\n`);
  return 0;
}

async function schedule(config: Config, io: Io, log: Log): Promise<number> {
  const { clock = systemClock } = io;
  const stop = new AbortController();
  void (io.until ?? stopSignal()).then(() => {
    stop.abort();
  });
  await withDirectory(config, (client) =>
    runScheduler({ config, client, directory: directory(client), core: coreClient(config, log, { timers: clock, resolve: io.resolve }), log, clock, signal: stop.signal }),
  );
  return 0;
}

async function sendMail(io: Io, log: Log): Promise<number> {
  const config = readMailConfig(io.env);
  const stop = new AbortController();
  void (io.until ?? stopSignal()).then(() => {
    stop.abort();
  });
  const transport = smtpTransport(config.smtp, io.smtpCa);
  await withDirectory(config, (client) => runMailSender({ client, transport, log, clock: io.clock ?? systemClock, signal: stop.signal }));
  return 0;
}

/** One line per mail not sent yet; no address, subject or text. */
async function listOutbox(config: Config, io: Io): Promise<number> {
  const waiting = await withDirectory(config, (client) => outbox(client).waiting());
  for (const mail of waiting) io.stdout.write(`${waitingMailLine(mail)}\n`);
  return 0;
}

/** One line per Family: its Family id, its status, and when its due work last ran and how it ended. */
async function families(config: Config, io: Io): Promise<number> {
  const overview = await withDirectory(config, (client) => directory(client).overview());
  for (const family of overview) io.stdout.write(`${familyLine(family)}\n`);
  return 0;
}

/** Puts the mails into Logto; needs IDP_MANAGEMENT_*, and no Directory. */
async function putTemplates(config: Config, io: Io): Promise<number> {
  if (config.idpManagement === null) throw new ConfigError("mail-templates needs IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET");
  const templates = mailTemplates();
  await putMailTemplates(config.idpManagement, templates);
  io.stdout.write(`Logto has ${templates.length} email templates\n`);
  return 0;
}

/** Opens the Scheduler's queues for writing schedules only, and runs `work` with them. */
async function withSchedules<T>(config: Config, work: (schedules: FamilySchedules) => Promise<T>): Promise<T> {
  const boss = openQueues(config, { supervise: false, schedule: false, registerInstance: false, max: 1 });
  await boss.start();
  try {
    return await work(await familySchedules(boss));
  } finally {
    await boss.stop({ graceful: false });
  }
}

/** Opens the Directory, brings its schema up to date and runs `work` with it. */
async function withDirectory<T>(config: DirectorySettings, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(directoryConnection(config));
  await client.connect();
  try {
    await migrateDirectory(client);
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Registers central sign-in's client at Logto and prints its CENTRAL_SIGN_IN_CLIENT_*; needs IDP_MANAGEMENT_*, and no Directory. */
async function signInClient(config: Config, io: Io, log: Log): Promise<number> {
  if (config.idpManagement === null) throw new ConfigError("sign-in-client needs IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET");
  const { clientId, clientSecret, created } = await setSignInClient(config.idpManagement, config.publicUrl);
  log.info(created ? "Central sign-in's client is created at Logto" : "Central sign-in's client at Logto is updated", { clientId });
  io.stdout.write(`CENTRAL_SIGN_IN_CLIENT_ID=${clientId}\nCENTRAL_SIGN_IN_CLIENT_SECRET=${clientSecret}\n`);
  return 0;
}

/**
 * Sets Logto's sign-in experience, and the landing page as where central sign-in's client returns
 * after Abmelden; needs IDP_MANAGEMENT_*, and no Directory.
 */
async function signInExperience(config: Config, io: Io, log: Log): Promise<number> {
  if (config.idpManagement === null) throw new ConfigError("sign-in-experience needs IDP_MANAGEMENT_ENDPOINT, _CLIENT_ID and _CLIENT_SECRET");
  const { google } = await setSignInExperience(config.idpManagement, config.google, config.registration);
  const client = await setSignInClientRedirects(config.idpManagement, config.publicUrl);
  log.info(client ? "Central sign-in's client returns to the landing page after Abmelden" : "There is no central sign-in client at Logto to return after Abmelden");
  io.stdout.write(
    google === "skipped"
      ? "Logto's sign-in experience is set, without Google: GOOGLE_CLIENT_ID and _SECRET are not set\n"
      : `Logto's sign-in experience is set, with Google (connector ${google})\n`,
  );
  io.stdout.write(
    config.registration === "open"
      ? "Registration is open: anyone can register (REGISTRATION=open)\n"
      : "Registration is closed: only invitation links create accounts (REGISTRATION is not open)\n",
  );
  return 0;
}
