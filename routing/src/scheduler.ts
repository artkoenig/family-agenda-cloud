import { once } from "node:events";
import type pg from "pg";
import { PgBoss, systemClock, type Clock, type ConstructorOptions } from "pg-boss";
import type { Config } from "./config";
import { TRIGGERED_TIMEOUT_MS, type Core, type SourcesPolled } from "./core";
import type { Directory, DirectoryEntry, RetryDelays } from "./directory";
import { sealedContext, unwrappedFamily } from "./family-context";
import { waitsForRetry } from "./due-work";
import { readinessOf } from "./family-readiness";
import { describe, reasonOf, type Log } from "./log";

/** What the Scheduler logs once it is under way. */
export const SCHEDULER_RUNNING = "The Scheduler is running";

/** The schema pg-boss keeps its queues and schedules in, in the Directory's database. */
const SCHEMA = "scheduler";

/**
 * How long a job may stay active before pg-boss counts it as abandoned. Above the timeout of the
 * core call the job makes (TRIGGERED_TIMEOUT_MS), so that a job is always ended by its call
 * first: while the call lasts the job is active, and an active job keeps the next occurrence of
 * its Family from being queued at all. Timeout below expiry is what makes runs never overlap.
 */
const EXPIRE_IN_SECONDS = TRIGGERED_TIMEOUT_MS / 1000 + 5 * 60;

/**
 * How long a Family whose due work failed waits before it is tried again: two minutes, twice as
 * long after each further failure in a row, never longer than a quarter of an hour. The retry falls
 * on an occurrence of the minute schedule; until then the Family's occurrences are no-ops.
 */
const RETRY_DELAYS: RetryDelays = { firstDelayMinutes: 2, ceilingMinutes: 15 };

/** How many Families' occasions of one kind run at once in this process. */
const CONCURRENCY = 10;

/** An occasion the Scheduler gives each active Family's core; the core decides what is due on it. */
type Occasion = {
  cron: string;
  /** Triggers the occasion on the core: answers what due work polled, nothing for the others. */
  trigger(core: Core, sealedContext: string): Promise<SourcesPolled | undefined>;
  /** Whether the Directory notes how the occasion last ended. */
  recorded: boolean;
  ran: string;
  failed: string;
};

/**
 * The occasions, one queue each, every one with a schedule per Family keyed by its Family id.
 * The sweep of unreferenced secrets is per Family too: the secrets are in each Family's database,
 * which the core opens only with that Family's Context.
 */
const OCCASIONS: Record<string, Occasion> = {
  "due-work": {
    cron: "* * * * *",
    trigger: (core, context) => core.runDueWork(context),
    recorded: true,
    ran: "Due work ran",
    failed: "Due work failed",
  },
  "purge-messages": {
    cron: "0 * * * *",
    trigger: async (core, context) => {
      await core.purgeMessages(context);
      return undefined;
    },
    recorded: false,
    ran: "The core purged the messages past their retention",
    failed: "The core did not purge the messages past their retention",
  },
  /** At night where the Family lives. */
  "sweep-secrets": {
    cron: "30 3 * * *",
    trigger: async (core, context) => {
      await core.sweepSecrets(context);
      return undefined;
    },
    recorded: false,
    ran: "The core swept the unreferenced secrets",
    failed: "The core did not sweep the unreferenced secrets",
  },
};

const occasionNames = Object.keys(OCCASIONS);

/** What each scheduled job carries: the Family it is for. */
type ScheduledFamily = { familyId: string };

/** A Family's schedules in the Scheduler, one per occasion, keyed by its Family id. */
export type FamilySchedules = {
  /** Creates the Family's schedules, or leaves them as they are. */
  create(familyId: string, timeZone: string): Promise<void>;
  /** Removes the Family's schedules; a Family without them is fine. */
  remove(familyId: string): Promise<void>;
};

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
    max: CONCURRENCY + 4,
    ...options,
  });
}

/**
 * Creates the occasions' queues, or brings the options of existing ones up to date; safe while
 * another process does the same, as creating a queue that exists does nothing. A run under way
 * keeps the next occurrence of its Family from being queued at all (`exclusive`, keyed by the
 * Family id), so one Family's due work never runs twice at once. Retries are not pg-boss's: a
 * failed run is recorded, and the Family is tried again on a later occurrence (see RETRY_DELAYS).
 */
async function ensureQueues(boss: PgBoss): Promise<void> {
  const options = { retryLimit: 0, expireInSeconds: EXPIRE_IN_SECONDS };
  for (const name of occasionNames) {
    await boss.createQueue(name, { policy: "exclusive", ...options });
    await boss.updateQueue(name, options);
  }
}

export async function familySchedules(boss: PgBoss): Promise<FamilySchedules> {
  await ensureQueues(boss);
  return {
    async create(familyId, timeZone) {
      const data: ScheduledFamily = { familyId };
      for (const [name, { cron }] of Object.entries(OCCASIONS)) {
        await boss.schedule(name, cron, data, { key: familyId, singletonKey: familyId, tz: timeZone });
      }
    },
    async remove(familyId) {
      for (const name of occasionNames) await boss.unschedule(name, familyId);
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
    log.error("The Scheduler's queues failed", { reason: reasonOf(error) });
  });
  await boss.start();
  try {
    const schedules = await familySchedules(boss);
    for (const [name, occasion] of Object.entries(OCCASIONS)) {
      const give = giving(occasion, { ...dependencies, clock, schedules });
      // One worker per Family at a time, several at once, so that a slow Family holds up no other.
      await boss.work<ScheduledFamily>(name, { pollingIntervalSeconds: 5, localConcurrency: CONCURRENCY }, async ([job]) => {
        if (job) await give(name, job.data.familyId);
      });
    }
    log.info(SCHEDULER_RUNNING);
    await stopped(signal);
  } finally {
    await boss.stop({ graceful: true, timeout: 30_000 });
    log.info("The Scheduler stopped");
  }
}

async function stopped(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise(() => {});
  if (!signal.aborted) await once(signal, "abort");
}

/**
 * Gives the Family's core the occasion, if the Family is active. A deleted Family loses its
 * schedules; how due work ended is recorded, and the job ends with the call either way. A Family
 * whose due work failed is left out until its retry is due, so that it does not burn the pool; so
 * is one that no core of the pool opens, which fails the run as any other failure does.
 */
function giving(
  occasion: Occasion,
  dependencies: SchedulerDependencies & { clock: Clock; schedules: FamilySchedules },
) {
  const { config, directory, core, log, clock, schedules } = dependencies;
  return async (name: string, familyId: string): Promise<void> => {
    const { readiness, entry } = readinessOf(await directory.find(familyId));
    if (readiness !== "served") {
      log.info("The Family is not active; nothing is triggered", { familyId, occasion: name, status: entry?.status ?? "unknown" });
      if (readiness === "gone") await schedules.remove(familyId);
      return;
    }
    const last = occasion.recorded ? await directory.lastDueWork(familyId) : null;
    const ranAt = new Date(clock.now());
    if (waitsForRetry(last, ranAt)) {
      log.info("Due work waits for its retry", { familyId, occasion: name, failures: last.failures, retryAt: last.retryAt.toISOString() });
      return;
    }
    try {
      const sources = await occasion.trigger(core, contextOf(config, entry));
      if (occasion.recorded && sources) await directory.recordDueWork(familyId, { ranAt, outcome: "succeeded", sources });
      log.info(occasion.ran, { familyId, occasion: name, ...(sources ? { sources } : {}) });
    } catch (error) {
      const retry = occasion.recorded ? await recordFailure(directory, familyId, ranAt, error) : {};
      log.error(occasion.failed, { familyId, occasion: name, reason: reasonOf(error), ...retry });
    }
  };
}

/** Records the failed run of due work; answers how often in a row it failed and when it is retried, for the log. */
async function recordFailure(directory: Directory, familyId: string, ranAt: Date, error: unknown): Promise<{ failures?: number; retryAt?: string }> {
  const run = await directory.recordDueWork(familyId, { ranAt, outcome: "failed", error: describe(error), retry: RETRY_DELAYS });
  return run?.outcome === "failed" ? { failures: run.failures, retryAt: run.retryAt.toISOString() } : {};
}

const contextOf = (config: Config, entry: DirectoryEntry) => sealedContext(config, unwrappedFamily(config, entry));
