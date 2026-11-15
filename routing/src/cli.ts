import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import { parseArgs } from "node:util";
import pg from "pg";
import { ConfigError, readConfig, type Config } from "./config";
import { coreClient } from "./core";
import { createFamily, ProvisioningError, type CreateFamilyInput } from "./create-family";
import { directory, migrateDirectory } from "./directory";
import { createLog, type Log } from "./log";

export type Io = {
  /** The environment, the only source of the Routing module's settings and secrets. */
  env: Record<string, string | undefined>;
  /** What the Operator asked for, such as the address of a new Family. */
  stdout: Writable;
  /** The log. */
  stderr: Writable;
};

const USAGE = `Usage:
  routing create --admin-email <address> [--time-zone <IANA zone>] [--family-id <id>]
    Creates a Family with its first Admin and prints its address. After a failure part-way,
    run it again with the --family-id it names to finish that Family.
  routing migrate
    Brings the Directory's schema up to date (every command does this first).`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class UsageError extends Error {}

/** The Operator's command line. Answers the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const log = createLog(io.stderr);
  try {
    const [command, ...rest] = args;
    if (command === "migrate") {
      const config = readConfig(io.env);
      return await withDirectory(config, () => Promise.resolve(0));
    }
    if (command === "create") {
      const config = readConfig(io.env);
      return await create(config, parseCreate(rest, config), io, log);
    }
    throw new UsageError(command ? `Unknown command ${command}` : "No command given");
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
  const adminEmail = values["admin-email"];
  if (!adminEmail || !isEmailAddress(adminEmail)) throw new UsageError("--admin-email needs the email address of the first Admin");
  const timeZone = values["time-zone"];
  const effectiveTimeZone = timeZone ?? config.defaultTimeZone;
  if (!isTimeZone(effectiveTimeZone)) throw new UsageError(`Unknown time zone ${effectiveTimeZone}`);
  return { adminEmail, ...familyIdOption(values["family-id"]), ...(timeZone === undefined ? {} : { timeZone }) };
}

/** The Family to finish that --family-id names, or a newly drawn Family id. */
function familyIdOption(value: string | undefined): { familyId: string; resume: boolean } {
  if (value === undefined) return { familyId: randomUUID(), resume: false };
  const familyId = value.toLowerCase();
  if (!UUID.test(familyId)) throw new UsageError("--family-id needs a Family id, a UUID");
  return { familyId, resume: true };
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
    const address = await withDirectory(config, (client) =>
      createFamily({ config, client, directory: directory(client), core: coreClient(config.coreUrls), log }, input),
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

/** Opens the Directory, brings its schema up to date and runs `work` with it. */
async function withDirectory<T>(config: Config, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = new URL(config.directoryDatabaseUrl);
  const client = new pg.Client({
    host: url.hostname,
    port: Number(url.port || "5432"),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    password: config.directoryDatabasePassword,
  });
  await client.connect();
  try {
    await migrateDirectory(client);
    return await work(client);
  } finally {
    await client.end();
  }
}
