import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import pg from "pg";
import { systemClock, type Clock } from "pg-boss";
import { ConfigError, directoryConnection, readConfig, type Config } from "./config";
import { parseCreate, parseDelete, parseFamilyId, parseReset, UsageError } from "./cli-arguments";
import { familyLine } from "./cli-reports";
import { createFamily, type CreateFamilyInput } from "./create-family";
import { deleteFamily, type DeleteFamilyInput } from "./delete-family";
import { coreClient } from "./core";
import { directory, migrateDirectory } from "./directory";
import { createLog, type Log } from "./log";
import { isFamilyId } from "./family-id";
import type { Resolve } from "./pool";
import { provisioning, ProvisioningError, type ScheduledProvisioning } from "./provisioning";
import { startRouter } from "./router";
import { resetAdminPassword, UnknownAdminError, type ResetAdminPasswordInput } from "./reset-admin-password";
import { familySchedules, openQueues, runScheduler, type FamilySchedules } from "./scheduler";
import { resumeFamily, suspendFamily } from "./family-status";

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
};

const USAGE = `Usage:
  routing create --admin-email <address> [--time-zone <IANA zone>] [--family-id <id>]
    Creates a Family with its first Admin and prints its address. After a failure part-way,
    run it again with the --family-id it names to finish that Family.
  routing reset-admin-password --family-id <id> --admin-email <address>
    Has a core give the Admin of an active Family a new password, ends their sessions and prints
    the password once.
  routing delete --family-id <id> --confirm <id>
    Deletes the Family: its database and role, its blobs, its wrapped family key and database
    password. Its Directory entry stays, marked deleted. --confirm must repeat the Family id.
    It says when the Family is deleted; after a failure part-way, run it again to finish.
  routing suspend --family-id <id>
    Suspends the Family: its address answers 404 and its schedules are removed; its data stays.
  routing resume --family-id <id>
    Resumes a suspended Family: it is routed to and scheduled again.
  routing schedule
    Runs the Scheduler until stopped: every active Family's due work once a minute, its purge
    once an hour and its sweep of unreferenced secrets once a day. Due work that fails is tried
    again after a delay that doubles with each failure in a row, up to a quarter of an hour.
  routing families
    Lists every Family with its status and when its due work last ran and how it ended; for
    due work that keeps failing, how often in a row and when it is tried next.
  routing migrate
    Brings the Directory's schema up to date (every command does this first).
  routing serve
    Runs the Router on LISTEN_HOST:PORT until SIGTERM or SIGINT, passing each Family's requests
    on to the cores CORE_URL names.

A core prepares a Family's database when it first opens it, so a new core version needs no
command: a request or operation that a core of an older release refuses is tried on another core.`;

type Command = (args: string[], config: Config, io: Io, log: Log) => Promise<number>;

/** The Operator's commands by name; each answers the exit code. */
const COMMANDS: Record<string, Command> = {
  migrate: (_args, config) => withDirectory(config, () => Promise.resolve(0)),
  create: (args, config, io, log) => create(config, parseCreate(args, config.defaultTimeZone, randomUUID), io, log),
  "reset-admin-password": (args, config, io, log) => reset(config, parseReset(args), io, log),
  delete: (args, config, io, log) => runFamilyCommand(config, deletion(parseDelete(args)), io, log),
  suspend: (args, config, io, log) => runFamilyCommand(config, suspension(parseFamilyId(args)), io, log),
  resume: (args, config, io, log) => runFamilyCommand(config, resumption(parseFamilyId(args)), io, log),
  serve: (_args, config, io, log) => serve(config, io, log),
  schedule: (_args, config, io, log) => schedule(config, io, log),
  families: (_args, config, io) => families(config, io),
};

/** The Operator's command line. Answers the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const log = createLog(io.stderr);
  try {
    const [command, ...rest] = args;
    if (!command) throw new UsageError("No command given");
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
      log.error("Creating the Family was refused", { ...(input.resume ? { familyId: input.familyId } : {}), error });
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

async function reset(config: Config, input: ResetAdminPasswordInput, io: Io, log: Log): Promise<number> {
  try {
    const password = await withDirectory(config, (client) => resetAdminPassword(provisioning(config, client, log, io.resolve), input));
    // The one place the new password is given out: on the Operator's output, never in the log.
    io.stdout.write(`New password for ${input.adminEmail}: ${password}\nThe Admin's sessions have ended. Sign in with this password.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UnknownAdminError) {
      // The Operator is told which address was not found; the log names the Family only.
      io.stderr.write(`${error.message}\n`);
      log.error("Resetting the Admin's password was refused: the Family has no Admin with that email", { familyId: input.familyId });
    } else {
      log.error("Resetting the Admin's password failed", { familyId: input.familyId, error });
    }
    return 1;
  }
}

/** A command that changes a Family and its schedules: what does it, what the Operator is told, what the log says. */
type FamilyCommand = {
  familyId: string;
  work(provisioning: ScheduledProvisioning): Promise<unknown>;
  /** What the Operator is told after the Family id once it is done. */
  done: string;
  refused: string;
  failed: string;
};

/** Runs the command with the Directory and the Scheduler's queues; answers the exit code. */
async function runFamilyCommand(config: Config, command: FamilyCommand, io: Io, log: Log): Promise<number> {
  const { familyId } = command;
  try {
    await withDirectory(config, (client) =>
      withSchedules(config, (schedules) => command.work({ ...provisioning(config, client, log, io.resolve), schedules })),
    );
    io.stdout.write(`The Family ${familyId} ${command.done}\n`);
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
  work: (provisioning) => deleteFamily(provisioning, input),
  done: "is deleted",
  refused: "Deleting the Family was refused",
  failed: "Deleting the Family did not finish; run delete again to finish it",
});

const suspension = (familyId: string): FamilyCommand => ({
  familyId,
  work: (provisioning) => suspendFamily(provisioning, familyId),
  done: "is suspended",
  refused: "Suspending the Family was refused",
  failed: "Suspending the Family did not finish; run suspend again to finish it",
});

const resumption = (familyId: string): FamilyCommand => ({
  familyId,
  work: (provisioning) => resumeFamily(provisioning, familyId),
  done: "is active again",
  refused: "Resuming the Family was refused",
  failed: "Resuming the Family did not finish; run resume again to finish it",
});

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

/** One line per Family: its Family id, its status, and when its due work last ran and how it ended. */
async function families(config: Config, io: Io): Promise<number> {
  const overview = await withDirectory(config, (client) => directory(client).overview());
  for (const family of overview) io.stdout.write(`${familyLine(family)}\n`);
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
async function withDirectory<T>(config: Config, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(directoryConnection(config));
  await client.connect();
  try {
    await migrateDirectory(client);
    return await work(client);
  } finally {
    await client.end();
  }
}
