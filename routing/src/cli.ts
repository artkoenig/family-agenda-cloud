import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import { parseArgs } from "node:util";
import pg from "pg";
import { ConfigError, directoryConnection, readConfig, type Config } from "./config";
import { coreClient } from "./core";
import { createFamily, ProvisioningError, type CreateFamilyInput, type Provisioning } from "./create-family";
import { deleteFamily, type DeleteFamilyInput } from "./delete-family";
import { directory, migrateDirectory } from "./directory";
import { createLog, type Log } from "./log";
import { startRouter } from "./router";
import { resetAdminPassword, UnknownAdminError, type ResetAdminPasswordInput } from "./reset-admin-password";

export type Io = {
  /** The environment, the only source of the Routing module's settings and secrets. */
  env: Record<string, string | undefined>;
  /** What the Operator asked for, such as the address of a new Family. */
  stdout: Writable;
  /** The log. */
  stderr: Writable;
  /** When a long-running command such as serve stops; SIGTERM or SIGINT unless given. */
  until?: Promise<unknown>;
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
    After a failure part-way, run it again to finish.
  routing migrate
    Brings the Directory's schema up to date (every command does this first).
  routing serve
    Runs the Router on LISTEN_HOST:PORT until SIGTERM or SIGINT, passing each Family's requests
    on to the cores in CORE_URLS.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class UsageError extends Error {}

type Command = (args: string[], config: Config, io: Io, log: Log) => Promise<number>;

/** The Operator's commands by name; each answers the exit code. */
const COMMANDS: Record<string, Command> = {
  migrate: (_args, config) => withDirectory(config, () => Promise.resolve(0)),
  create: (args, config, io, log) => create(config, parseCreate(args, config), io, log),
  "reset-admin-password": (args, config, io, log) => reset(config, parseReset(args), io, log),
  delete: (args, config, _io, log) => remove(config, parseDelete(args), log),
  serve: (_args, config, io, log) => serve(config, io, log),
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

function parseCreate(args: string[], config: Config): CreateFamilyInput {
  const values = options(args, ["admin-email", "time-zone", "family-id"]);
  const adminEmail = adminEmailOption(values["admin-email"], "the first Admin");
  const timeZone = values["time-zone"];
  const effectiveTimeZone = timeZone ?? config.defaultTimeZone;
  if (!isTimeZone(effectiveTimeZone)) throw new UsageError(`Unknown time zone ${effectiveTimeZone}`);
  return { adminEmail, ...familyIdOption(values["family-id"]), ...(timeZone === undefined ? {} : { timeZone }) };
}

/** The Family to finish that --family-id names, or a newly drawn Family id. */
function familyIdOption(value: string | undefined): { familyId: string; resume: boolean } {
  if (value === undefined) return { familyId: randomUUID(), resume: false };
  return { familyId: familyIdValue(value), resume: true };
}

/** The Family id that --family-id names, in the lower case the Directory keeps. */
function familyIdValue(value: string | undefined): string {
  const familyId = value?.toLowerCase();
  if (!familyId || !UUID.test(familyId)) throw new UsageError("--family-id needs a Family id, a UUID");
  return familyId;
}

/** The email address that --admin-email names; `whose` says which Admin it is for. */
function adminEmailOption(value: string | undefined, whose: string): string {
  if (!value || !isEmailAddress(value)) throw new UsageError(`--admin-email needs the email address of ${whose}`);
  return value;
}

function options(args: string[], names: string[]): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args, options: Object.fromEntries(names.map((name) => [name, { type: "string" }])), strict: true });
    return values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** One @, something before it, and a dotted domain after it; the core checks it further. */
function isEmailAddress(text: string): boolean {
  const [local, domain, ...rest] = text.split("@");
  return rest.length === 0 && Boolean(local) && /^[^\s.]+(\.[^\s.]+)+$/.test(domain ?? "") && !/\s/.test(local ?? "");
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

async function create(config: Config, input: CreateFamilyInput, io: Io, log: Log): Promise<number> {
  try {
    const address = await withDirectory(config, (client) => createFamily(provisioning(config, client, log), input));
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
  const router = await startRouter(config, log);
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

function parseReset(args: string[]): ResetAdminPasswordInput {
  const values = options(args, ["family-id", "admin-email"]);
  return { familyId: familyIdValue(values["family-id"]), adminEmail: adminEmailOption(values["admin-email"], "the Admin") };
}

async function reset(config: Config, input: ResetAdminPasswordInput, io: Io, log: Log): Promise<number> {
  try {
    const password = await withDirectory(config, (client) => resetAdminPassword(provisioning(config, client, log), input));
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

function parseDelete(args: string[]): DeleteFamilyInput {
  const values = options(args, ["family-id", "confirm"]);
  const familyId = familyIdValue(values["family-id"]);
  const confirmation = values.confirm;
  if (confirmation === undefined) throw new UsageError("--confirm needs the Family id once more");
  return { familyId, confirmation: confirmation.toLowerCase() };
}

async function remove(config: Config, input: DeleteFamilyInput, log: Log): Promise<number> {
  try {
    await withDirectory(config, (client) => deleteFamily(provisioning(config, client, log), input));
    return 0;
  } catch (error) {
    if (error instanceof ProvisioningError) {
      log.error("Deleting the Family was refused", { familyId: input.familyId, error });
    } else {
      log.error("Deleting the Family failed; run delete again to finish it", { familyId: input.familyId, error });
    }
    return 1;
  }
}

/** What Provisioning works with, on the Directory's connection. */
function provisioning(config: Config, client: pg.Client, log: Log): Provisioning {
  return { config, client, directory: directory(client), core: coreClient(config.coreUrls), log };
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
