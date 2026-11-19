// -*- mode: Bluespec; -*-
/**
 * How the Scheduler runs each active Family's due work (#147, map #145). Code:
 * routing/src/scheduler.ts (`ensureQueues`, `familySchedules`, `runScheduler`, `giving`),
 * due-work.ts (`waitsForRetry`), directory.ts (`recordDueWork`), core.ts (`call`, `callCore`,
 * TRIGGERED_TIMEOUT_MS); pg-boss 12.38.1 (the `exclusive` policy, expiry, fetch order).
 *
 * WHAT IT MODELS (time in whole minutes, `now`)
 * - The minute schedule (`occur`): once a minute every Family's occurrence is sent; the queue's
 *   `exclusive` policy (unique on the Family id while a job is created or active) drops it while
 *   the Family has a job created or active.
 * - Several Scheduler processes (`PROCS`), each running at most `SLOTS` handlers at once
 *   (`localConcurrency`). A free slot fetches the oldest created job (`fetch`, pg-boss orders by
 *   created_on) within the minute (it polls every 5 s).
 * - A handler (`giving`): reads the Directory (`read`: is the retry due?), which may take into the
 *   next minute; then either ends at once (a no-op while the retry is not due) or calls the core.
 *   The call takes the pool's cores in turn (`nextCore`, after a refusal or a connection never
 *   made, which a core gives within seconds) and each attempt is
 *   given up after `TIMEOUT` minutes (`callCore`'s deadline is per core); the call ends ran
 *   (`succeed`) or failed (`failRun`), recorded in the Directory in one statement.
 * - Expiry (`expire`): pg-boss fails a job active for `EXPIRY` minutes. It does not stop the
 *   handler (which ignores `job.signal`): the call goes on, and the Family may get a new job.
 * - A Scheduler process dying (`crash`, at most `MAX_CRASHES` times): its handlers are gone, their jobs stay
 *   active until they expire; it is restarted at once.
 * - The retry (`recordDueWork`): a failed run's Family waits until the minute it ran in plus
 *   FIRST_DELAY * 2^(failures in a row before) minutes, at most CEILING.
 *
 * PROPERTIES (instances and scenarios in scheduler_test.qnt, run by scheduler-check.sh)
 * - Safety `noOverlap`: a Family never has two calls in flight at once, across processes.
 * - Safety `retryHonoured`: a failed Family is not called before its retry is due.
 * - Liveness `noStarvation`, as a bounded invariant: a Family owed a run (its last call ended, or
 *   its retry is due) is called within `STARVATION_BOUND` minutes, whatever the other Families do.
 * - Counterexamples (scheduler_test.qnt): `unfixedExpiry` (expiry not above the timeout plus the
 *   time before the call) and `unfixedPolicy` (a queue without the exclusive policy) break
 *   `noOverlap`; `unfixedOrder` (fetching the newest job first) breaks `noStarvation`;
 *   `lateNotServing` (going on after a 502/503/504, which may come late: the code before #147's
 *   fix) breaks `noOverlap` with the code's numbers (see FINDINGS).
 *
 * ASSUMES
 * - The time from a job's start to its call (`read`: two Directory queries) is under a minute in
 *   the model (`read` spans at most one minute's turn); the code allows five (EXPIRE_IN_SECONDS).
 * - A call goes on to the next core only after an answer that comes at once
 *   (`LATE_NOT_SERVING = false`): it spent no time on the core before. Otherwise a call may last
 *   NCORES * TIMEOUT.
 * - pg-boss's supervisor expires a job in the minute it expires (a later expiry only delays it).
 *
 * FINDINGS
 * - TRIGGERED_TIMEOUT_MS bounds one attempt, not the call: a call that went on after a late
 *   502/503/504 started a new 10-minute deadline on the next core, so the call could outlast the
 *   job's expiry (15 min) and the next occurrence called a second core beside it
 *   (`lateNotServing`). Fixed: a call no longer goes on after a 502/503/504 (core.ts).
 * - The retry is counted from when the failed run started (`ranAt`), not when it failed: a call
 *   that failed after its timeout is past retries of 2, 4 and 8 minutes and is tried again at once.
 *
 * NOT COVERED
 * - What the core does with a call the Scheduler gave up or abandoned (timeout, a dying process):
 *   the core may still be at work on it beside a new call. The core's turn per Source (public
 *   repo, ADR-0008) keeps two runs of one Source apart there.
 * - The purge and the sweep (same queue options), Families not active, schedules created and
 *   removed, time zones; how the failover picks cores (failover.qnt).
 */
module scheduler {
  // ---- Parameters -----------------------------------------------------------------------------

  /** The active Families. */
  const FAMILIES: Set[int]
  /** The Scheduler processes. */
  const PROCS: Set[int]
  /** How many handlers each process runs at once (`CONCURRENCY`). */
  const SLOTS: int
  /** How many cores a call may try (the pool's replicas). */
  const NCORES: int
  /** Minutes after which an attempt on one core is given up (TRIGGERED_TIMEOUT_MS). */
  const TIMEOUT: int
  /** Minutes after which pg-boss counts an active job as abandoned (EXPIRE_IN_SECONDS). */
  const EXPIRY: int
  /** RETRY_DELAYS. */
  const FIRST_DELAY: int
  const CEILING: int
  /** A call goes on after an answer that may come late in an attempt, a 502/503/504 (not the code). */
  const LATE_NOT_SERVING: bool
  /** How many times a Scheduler process may die mid-run (liveness needs the deaths to stop). */
  const MAX_CRASHES: int
  /** The queue's `exclusive` policy (the code); false: a queue without a policy. */
  const EXCLUSIVE: bool
  /** Fetch the oldest created job first (pg-boss); false: the newest first. */
  const FIFO: bool

  /** How long a call may last: every attempt up to its timeout when 502s may come late. */
  pure val CALL_BOUND: int = if (LATE_NOT_SERVING) NCORES * TIMEOUT else TIMEOUT
  /** The most minutes a Family owed a run waits: its job's queue behind every other Family. */
  pure val STARVATION_BOUND: int =
    MAX_CRASHES * EXPIRY + 2 +
    ((FAMILIES.size() + PROCS.size() * SLOTS - 1) / (PROCS.size() * SLOTS)) * (CALL_BOUND + 2)

  pure def min(a: int, b: int): int = if (a < b) a else b
  pure def pow2(n: int): int = if (n <= 0) 1 else 2 ^ n
  pure val NONE: int = -1

  // ---- State ------------------------------------------------------------------------------------

  type Job = { id: int, family: int, state: str, createdOn: int, startedOn: int }

  type Handler = {
    job: int, family: int, proc: int,
    /** "reading" (the Directory) or "calling" (the core). */
    phase: str,
    /** The minute it started (`ranAt`). */
    ranAt: int,
    /** The attempt on a core under way, from 1, and the minute it started. */
    attempt: int, attemptStart: int,
  }

  /** How the Family's due work last ended (directory.ts `DueWorkRun`). */
  type DueWork = { failures: int, retryAt: int }

  var now: int
  /** The jobs created or active; completed and failed ones are gone. */
  var jobs: Set[Job]
  var nextJob: int
  var handlers: Set[Handler]
  var directory: int -> DueWork
  /** The minute each Family's occurrence was last sent. */
  var occurred: int -> int
  /** Ghost: the minute from which the Family is owed a call (NONE while one is in flight). */
  var owed: int -> int
  /** How many processes died. */
  var crashes: int
  /** Ghost: no call started before its Family's retry was due. */
  var honoured: bool
  /** Ghost, for the witnesses: what happened at least once. */
  var seen: Set[str]

  action init = all {
    now' = 0,
    jobs' = Set(),
    nextJob' = 0,
    handlers' = Set(),
    directory' = FAMILIES.mapBy(_ => { failures: 0, retryAt: NONE }),
    occurred' = FAMILIES.mapBy(_ => NONE),
    owed' = FAMILIES.mapBy(_ => 0),
    crashes' = 0,
    honoured' = true,
    seen' = Set(),
  }

  // ---- Functional logic ---------------------------------------------------------------------------

  /** due-work.ts `waitsForRetry`. */
  pure def waitsForRetry(last: DueWork, at: int): bool = last.retryAt != NONE and at < last.retryAt

  /** directory.ts `recordDueWork`, failed: the delay grows with the failures in a row before. */
  pure def recordFailure(last: DueWork, ranAt: int): DueWork =
    { failures: last.failures + 1, retryAt: ranAt + min(FIRST_DELAY * pow2(last.failures), CEILING) }

  pure val SUCCEEDED: DueWork = { failures: 0, retryAt: NONE }

  pure def busy(hs: Set[Handler], p: int): int = hs.filter(h => h.proc == p).size()

  pure def fetchable(js: Set[Job]): Set[Job] = js.filter(j => j.state == "created")

  /** The job a fetch takes: the oldest created one (pg-boss), or the newest (unfixed). */
  pure def nextInLine(js: Set[Job], fifo: bool): Set[Job] =
    val created = fetchable(js)
    created.filter(j => created.forall(k =>
      if (fifo) j.createdOn < k.createdOn or (j.createdOn == k.createdOn and j.id <= k.id)
      else j.createdOn > k.createdOn or (j.createdOn == k.createdOn and j.id >= k.id)))

  /** The job of a handler that ended is completed, if it is still that handler's (not expired). */
  pure def completed(js: Set[Job], h: Handler): Set[Job] = js.filter(j => j.id != h.job)

  pure def callsOf(hs: Set[Handler], f: int): Set[Handler] =
    hs.filter(h => h.family == f and h.phase == "calling")

  // ---- Must happen before the minute turns ---------------------------------------------------------

  /** Something is due within the current minute: the minute does not turn before it. */
  val urgent: bool = or {
    FAMILIES.exists(f => occurred.get(f) < now),
    PROCS.exists(p => busy(handlers, p) < SLOTS) and fetchable(jobs) != Set(),
    handlers.exists(h => h.phase == "reading" and h.ranAt < now),
    handlers.exists(h => h.phase == "calling" and now >= h.attemptStart + TIMEOUT),
    jobs.exists(j => j.state == "active" and now >= j.startedOn + EXPIRY),
  }

  // ---- Actions ----------------------------------------------------------------------------------------

  action tick: bool = all {
    not(urgent),
    now' = now + 1,
    jobs' = jobs, nextJob' = nextJob, handlers' = handlers, directory' = directory,
    occurred' = occurred, owed' = owed, honoured' = honoured, crashes' = crashes, seen' = seen,
  }

  /** The minute's occurrence of the Family's schedule, dropped while it has a job (`exclusive`). */
  action occur(f: int): bool = all {
    occurred.get(f) < now,
    occurred' = occurred.set(f, now),
    if (EXCLUSIVE and jobs.exists(j => j.family == f)) all {
      jobs' = jobs, nextJob' = nextJob,
    } else all {
      jobs' = jobs.union(Set({ id: nextJob, family: f, state: "created", createdOn: now, startedOn: NONE })),
      nextJob' = nextJob + 1,
    },
    now' = now, handlers' = handlers, directory' = directory, owed' = owed, honoured' = honoured, crashes' = crashes, seen' = seen,
  }

  /** A free slot of the process fetches the job next in line. */
  action fetch(p: int): bool = all {
    busy(handlers, p) < SLOTS,
    nextInLine(jobs, FIFO) != Set(),
    val j = nextInLine(jobs, FIFO).getOnlyElement()
    all {
      jobs' = jobs.exclude(Set(j)).union(Set({ ...j, state: "active", startedOn: now })),
      handlers' = handlers.union(Set({ job: j.id, family: j.family, proc: p, phase: "reading",
                                       ranAt: now, attempt: 0, attemptStart: NONE })),
    },
    now' = now, nextJob' = nextJob, directory' = directory, occurred' = occurred, owed' = owed,
    honoured' = honoured, crashes' = crashes, seen' = seen,
  }

  /** The handler has read the Directory: a no-op while the retry is not due, else the call starts. */
  action read(h: Handler): bool = all {
    handlers.contains(h),
    h.phase == "reading",
    if (waitsForRetry(directory.get(h.family), h.ranAt)) all {
      handlers' = handlers.exclude(Set(h)),
      jobs' = completed(jobs, h),
      owed' = owed, honoured' = honoured, seen' = seen.union(Set("waited")),
    } else all {
      handlers' = handlers.exclude(Set(h)).union(Set({ ...h, phase: "calling", attempt: 1, attemptStart: now })),
      jobs' = jobs,
      owed' = owed.set(h.family, NONE),
      honoured' = (honoured and not(waitsForRetry(directory.get(h.family), now))),
      seen' = seen.union(if (callsOf(handlers, h.family) != Set()) Set("overlap") else Set()),
    },
    now' = now, nextJob' = nextJob, directory' = directory, occurred' = occurred, crashes' = crashes,
  }

  /** The core did not run the call (refused, unreached): it goes on to the next core, with a new deadline. */
  action nextCore(h: Handler): bool = all {
    handlers.contains(h),
    h.phase == "calling",
    h.attempt < NCORES,
    LATE_NOT_SERVING or h.attemptStart == now,
    handlers' = handlers.exclude(Set(h)).union(Set({ ...h, attempt: h.attempt + 1, attemptStart: now })),
    now' = now, jobs' = jobs, nextJob' = nextJob, directory' = directory, occurred' = occurred,
    owed' = owed, honoured' = honoured, crashes' = crashes, seen' = seen.union(Set("wentOn")),
  }

  /** The call ended: the run is recorded and the job completed. */
  action end(h: Handler, succeeded: bool): bool = all {
    handlers.contains(h),
    h.phase == "calling",
    val last = directory.get(h.family)
    val outcome = if (succeeded) SUCCEEDED else recordFailure(last, h.ranAt)
    all {
      directory' = directory.set(h.family, outcome),
      // Owed again at once after a success (the next minute's occurrence), after a failure once the retry is due.
      owed' = if (callsOf(handlers, h.family).size() > 1) owed
              else owed.set(h.family, if (succeeded or outcome.retryAt < now) now else outcome.retryAt),
      seen' = seen.union(Set(if (succeeded) "succeeded" else "failed"))
                  .union(if (jobs.exists(j => j.id == h.job)) Set() else Set("endedAfterExpiry"))
                  .union(if (not(succeeded) and outcome.retryAt <= now) Set("retryPastAtFailure") else Set()),
    },
    handlers' = handlers.exclude(Set(h)),
    jobs' = completed(jobs, h),
    now' = now, nextJob' = nextJob, occurred' = occurred, honoured' = honoured, crashes' = crashes,
  }

  action succeed(h: Handler): bool = end(h, true)
  action failRun(h: Handler): bool = end(h, false)

  /** pg-boss fails a job active for EXPIRY minutes; its handler, if any, goes on. */
  action expire(j: Job): bool = all {
    jobs.contains(j),
    j.state == "active",
    now >= j.startedOn + EXPIRY,
    jobs' = jobs.exclude(Set(j)),
    now' = now, nextJob' = nextJob, handlers' = handlers, directory' = directory, occurred' = occurred,
    owed' = owed, honoured' = honoured, crashes' = crashes, seen' = seen.union(Set("expired")),
  }

  /** A Scheduler process dies and is restarted: its handlers are gone, their jobs stay active. */
  action crash(p: int): bool = all {
    crashes < MAX_CRASHES,
    crashes' = crashes + 1,
    handlers.exists(h => h.proc == p),
    val gone = handlers.filter(h => h.proc == p)
    all {
      handlers' = handlers.exclude(gone),
      // A Family whose call was abandoned is owed a run from now on.
      owed' = FAMILIES.mapBy(f =>
        if (callsOf(gone, f) != Set() and callsOf(handlers.exclude(gone), f) == Set()) now else owed.get(f)),
    },
    now' = now, jobs' = jobs, nextJob' = nextJob, directory' = directory, occurred' = occurred,
    honoured' = honoured, seen' = seen.union(Set("crashed")),
  }

  action step = any {
    tick,
    nondet f = FAMILIES.oneOf()
    occur(f),
    nondet p = PROCS.oneOf()
    any { fetch(p), crash(p) },
    all { handlers != Set(), nondet h = handlers.oneOf() any { read(h), nextCore(h), succeed(h), failRun(h) } },
    all { jobs != Set(), nondet j = jobs.oneOf() expire(j) },
  }

  // ---- Properties -----------------------------------------------------------------------------------

  /** A Family never has two calls in flight, across Scheduler processes. */
  val noOverlap: bool = FAMILIES.forall(f => callsOf(handlers, f).size() <= 1)

  /** No call started before its Family's retry was due. */
  val retryHonoured: bool = honoured

  /** A Family owed a run is called within STARVATION_BOUND minutes. */
  val noStarvation: bool = FAMILIES.forall(f => owed.get(f) == NONE or now - owed.get(f) <= STARVATION_BOUND)

  /** Each process runs at most SLOTS handlers. */
  val withinSlots: bool = PROCS.forall(p => busy(handlers, p) <= SLOTS)

  val safety: bool = noOverlap and retryHonoured and withinSlots

  // ---- Witnesses: each holds in some state of a run, which shows that the case is reached -------

  val someRunSucceeded: bool = seen.contains("succeeded")
  val someRunFailed: bool = seen.contains("failed")
  val someFamilyWaitedForItsRetry: bool = seen.contains("waited")
  val someCallWentOn: bool = seen.contains("wentOn")
  val someJobExpired: bool = seen.contains("expired")
  val someProcessCrashed: bool = seen.contains("crashed")
  val someCallEndedAfterItsJobExpired: bool = seen.contains("endedAfterExpiry")
  val someRetryWasPastWhenRecorded: bool = seen.contains("retryPastAtFailure")
  val someFailedTwiceInARow: bool = FAMILIES.exists(f => directory.get(f).failures >= 2)
  val someSlotsAllBusy: bool = PROCS.forall(p => busy(handlers, p) == SLOTS)
}
