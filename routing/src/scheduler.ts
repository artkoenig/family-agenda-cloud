import type pg from "pg";
import { PgBoss, systemClock, type Clock, type ConstructorOptions } from "pg-boss";
import type { Config } from "./config";
import type { Core } from "./core";
import type { FamilySchedules } from "./create-family";
import { sealedContext, unwrappedFamily } from "./family-context";
import type { Directory, DirectoryEntry } from "./directory";
import type { Log } from "./log";

/** What the Scheduler logs once it is under way. */
export const SCHEDULER_RUNNING = "The Scheduler is running";

/** The schema pg-boss keeps its queues and schedules in, in the Directory's database. */
const SCHEMA = "scheduler";

/**
 * The occasions the Scheduler gives each active Family's core, one queue each, every one with a
 * schedule per Family keyed by its Family id. The core decides what is due on each occasion.
 */
const OCCASIONS = {
  /** Due work: the Sources the core finds due are polled. */
  "due-work": { cron: "* * * * *" },
  /** The purge of messages past their retention. */
  "purge-messages": { cron: "0 * * * *" },
  /** The sweep of secrets no Source refers to any more, at night where the Family lives. */
  "sweep-secrets": { cron: "30 3 * * *" },
} as const;

type Occasion = keyof typeof OCCASIONS;

const occasions = Object.keys(OCCASIONS) as Occasion[];

/** The data of each scheduled job: which Family it is for. */
type FamilyJob = { familyId: string };

/** pg-boss on the Directory's database, opened with the Routing module's role. */
export function openQueues(config: Config, options: Omit<ConstructorOptions, "database"> = {}): PgBoss {
  const url = new URL(config.directoryDatabaseUrl);
  return new PgBoss({
    host: url.hostname,
    port: Number(url.port || "5432"),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    password: config.directoryDatabasePassword,
    schema: SCHEMA,
    max: 4,
    ...options,
  });
}

/**
 * Creates the occasions' queues unless they exist. A run still under way keeps the next
 * occurrence of its Family from being queued at all (`exclusive`, keyed by the Family id), so one
 * Family's due work never runs twice at once. Retries are not pg-boss's: a failed run is recorded.
 */
async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of occasions) {
    if (await boss.getQueue(name)) continue;
    await boss.createQueue(name, { policy: "exclusive", retryLimit: 0 });
  }
}

export async function familySchedules(boss: PgBoss): Promise<FamilySchedules> {
  await ensureQueues(boss);
  return {
    async create(familyId, timeZone) {
      for (const name of occasions) {
        const data: FamilyJob = { familyId };
        await boss.schedule(name, OCCASIONS[name].cron, data, { key: familyId, singletonKey: familyId, tz: timeZone });
      }
    },
    async remove(familyId) {
      for (const name of occasions) await boss.unschedule(name, familyId);
    },
  };
}

export type SchedulerDependencies = {
  config: Config;
  /** The Routing module's connection to the Directory. */
  client: pg.ClientBase;
  directory: Directory;
  core: Core;
  log: Log;
  /** The clock the schedules fire by. */
  clock?: Clock;
  /** Stops the Scheduler once runs under way have ended. */
  signal?: AbortSignal;
};

/** Runs the Scheduler until `signal` aborts. */
export async function runScheduler(dependencies: SchedulerDependencies): Promise<void> {
  const { config, log, clock = systemClock, signal } = dependencies;
  const boss = openQueues(config, { clock });
  boss.on("error", (error) => {
    log.error("The Scheduler's queues failed", { error });
  });
  await boss.start();
  try {
    const schedules = await familySchedules(boss);
    const occasion = occasionFor({ ...dependencies, clock, schedules });
    for (const name of occasions) {
      await boss.work<FamilyJob>(name, { pollingIntervalSeconds: 5 }, async ([job]) => {
        if (job) await occasion(name, job.data.familyId);
      });
    }
    log.info(SCHEDULER_RUNNING);
    await stopped(signal);
  } finally {
    await boss.stop({ graceful: true, timeout: 30_000 });
    log.info("The Scheduler stopped");
  }
}

const stopped = (signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) resolve();
    signal?.addEventListener("abort", () => {
      resolve();
    });
  });

/** Gives the Family's core the occasion, if the Family is active, and records how due work ended. */
function occasionFor(dependencies: SchedulerDependencies & { clock: Clock; schedules: FamilySchedules }) {
  const { config, directory, core, log, schedules } = dependencies;
  return async (name: Occasion, familyId: string): Promise<void> => {
    const entry = await directory.find(familyId);
    if (entry?.status !== "active") {
      log.info("The Family is not active; nothing is triggered", { familyId, occasion: name, status: entry?.status ?? "unknown" });
      if (!entry || entry.status === "deleted") await schedules.remove(familyId);
      return;
    }
    if (name === "due-work") {
      await runDueWork(dependencies, entry);
      return;
    }
    try {
      const context = await sealedContext(config, unwrappedFamily(config, entry));
      await (name === "purge-messages" ? core.purgeMessages(context) : core.sweepSecrets(context));
      log.info("The core ran the occasion", { familyId, occasion: name });
    } catch (error) {
      log.error("The core did not run the occasion", { familyId, occasion: name, error });
    }
  };
}

async function runDueWork(
  { config, directory, core, log, clock }: SchedulerDependencies & { clock: Clock },
  entry: DirectoryEntry,
): Promise<void> {
  const { familyId } = entry;
  const ranAt = new Date(clock.now());
  try {
    const { ran, failed } = await core.runDueWork(await sealedContext(config, unwrappedFamily(config, entry)));
    await directory.recordDueWork(familyId, { ranAt, outcome: "succeeded", sourcesRan: ran, sourcesFailed: failed });
    log.info("Due work ran", { familyId, sourcesRan: ran, sourcesFailed: failed });
  } catch (error) {
    await directory.recordDueWork(familyId, { ranAt, outcome: "failed", error: error instanceof Error ? error.message : String(error) });
    log.error("Due work failed", { familyId, error });
  }
}
