// -*- mode: Bluespec; -*-
// Instances of the Scheduler model (scheduler.qnt) and scenarios of it, run by scheduler-check.sh.
// Minutes scaled down: an attempt's timeout of 2, expiry 4 (the code: 10 and 15); the retry as in
// the code (2 minutes, doubling, at most 15). Three Families, two Scheduler processes of one slot.

/** The code: safety and the bound on starvation. */
module checked {
  import scheduler(FAMILIES = Set(0, 1, 2), PROCS = Set(0, 1), SLOTS = 1, NCORES = 2, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
}

/** The code, with Scheduler processes dying mid-run. */
module crashing {
  import scheduler(FAMILIES = Set(0, 1, 2), PROCS = Set(0, 1), SLOTS = 1, NCORES = 2, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 1, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
}

/** Counterexample: expiry not above the timeout. */
module unfixedExpiry {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 2,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
}

/** Counterexample: expiry above the timeout, but not above the timeout plus the time before the call. */
module unfixedMargin {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 3,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
}

/** Counterexample: a queue without the exclusive policy. */
module unfixedPolicy {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = false, FIFO = true).* from "./scheduler"
}

/** Counterexample: the newest job fetched first. */
module unfixedOrder {
  import scheduler(FAMILIES = Set(0, 1, 2), PROCS = Set(0), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = false).* from "./scheduler"
}

/** Counterexample (#147): the code's numbers, going on after a 502/503/504 late in an attempt. */
module lateNotServing {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 2, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = true, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
}

/** Scenarios of the code, one Family. */
module scenarios {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 2, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 1, EXCLUSIVE = true, FIFO = true).* from "./scheduler"

  /** The handler of a job. */
  def handlerOf(job: int): Handler = handlers.filter(h => h.job == job).getOnlyElement()

  /** The Family's job fetched by process `p` and its call started, in the current minute. */
  action calls(p: int): bool = occur(0).then(fetch(p)).then(read(handlerOf(nextJob - 1)))

  /** Two minutes, doubling, at most a quarter of an hour, from the minute the failed run started. */
  run retryDelaysTest = {
    val f1 = recordFailure(SUCCEEDED, 10)
    val f2 = recordFailure(f1, 20)
    val f3 = recordFailure(f2, 30)
    val f4 = recordFailure(f3, 40)
    val f5 = recordFailure(f4, 50)
    init.expect(f1.retryAt == 12 and f2.retryAt == 24 and f3.retryAt == 38 and f4.retryAt == 55 and f5.retryAt == 65
      and f5.failures == 5)
  }

  /** A run under way makes the next minutes' occurrences no-ops (`exclusive`). */
  run runUnderWayDropsOccurrencesTest =
    init.then(calls(0)).then(tick).then(occur(0))
      .expect(jobs.size() == 1 and callsOf(handlers, 0).size() == 1 and noOverlap)

  /** An attempt reaching its timeout must end before the minute turns, before its job could expire. */
  run timeoutEndsTheCallBeforeExpiryTest =
    init.then(calls(0)).then(tick).then(occur(0)).then(tick).then(occur(0))
      .expect(urgent and now == 2 and jobs.forall(j => now < j.startedOn + EXPIRY))
      .then(failRun(handlerOf(0)))
      .expect(directory.get(0) == { failures: 1, retryAt: 2 } and handlers == Set() and jobs == Set())

  /** A failed Family's occurrences are no-ops until its retry is due; then it is called again. */
  run failedFamilyWaitsForItsRetryTest =
    init.then(calls(0)).then(failRun(handlerOf(0))).then(tick)
      .then(occur(0)).then(fetch(0)).then(read(handlerOf(1)))
      .expect(handlers == Set() and jobs == Set() and seen.contains("waited"))
      .then(tick).then(calls(1))
      .expect(now == 2 and callsOf(handlers, 0).size() == 1 and retryHonoured)

  /** A process that dies leaves its job active until it expires; then the Family is called again. */
  run crashedRunIsTakenOverAfterExpiryTest =
    init.then(calls(0)).then(crash(0))
      .then(tick).then(occur(0)).then(tick).then(occur(0)).then(tick).then(occur(0)).then(tick)
      .expect(now == 4 and jobs.size() == 1 and urgent)
      .then(expire(jobs.getOnlyElement())).then(calls(1))
      .expect(callsOf(handlers, 0).size() == 1 and noOverlap and noStarvation)
}

/**
 * The counterexamples as runs: each breaks noOverlap. Test of the code for the first three:
 * scheduler.test.ts "is not doubled while it lasts longer than an ordinary call may, and is given
 * up only after ten minutes" (a call held past the expiry would arrive twice).
 */
module unfixedExpiryRun {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 2,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
  def handlerOf(job: int): Handler = handlers.filter(h => h.job == job).getOnlyElement()

  /** The job expires in the minute its call times out: the next occurrence calls beside it. */
  run callsTwiceTest =
    init.then(occur(0)).then(fetch(0)).then(read(handlerOf(0))).then(tick).then(occur(0)).then(tick)
      .then(expire(jobs.getOnlyElement())).then(occur(0)).then(fetch(1)).then(read(handlerOf(1)))
      .expect(not(noOverlap))
}

module unfixedMarginRun {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 3,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
  def handlerOf(job: int): Handler = handlers.filter(h => h.job == job).getOnlyElement()

  /** Reading the Directory took into the next minute: the call's timeout ends after the job's expiry. */
  run callsTwiceTest =
    init.then(occur(0)).then(fetch(0)).then(tick).then(occur(0)).then(read(handlerOf(0)))
      .then(tick).then(occur(0)).then(tick)
      .then(expire(jobs.getOnlyElement())).then(occur(0)).then(fetch(1)).then(read(handlerOf(1)))
      .expect(not(noOverlap))
}

module unfixedPolicyRun {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = false, FIFO = true).* from "./scheduler"
  def handlerOf(job: int): Handler = handlers.filter(h => h.job == job).getOnlyElement()

  /** Without `exclusive`, the next minute's occurrence is queued beside the run under way. */
  run callsTwiceTest =
    init.then(occur(0)).then(fetch(0)).then(read(handlerOf(0))).then(tick).then(occur(0)).then(fetch(1)).then(read(handlerOf(1)))
      .expect(not(noOverlap))
}

module lateNotServingRun {
  import scheduler(FAMILIES = Set(0), PROCS = Set(0, 1), SLOTS = 1, NCORES = 2, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = true, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = true).* from "./scheduler"
  def handlerOf(job: int): Handler = handlers.filter(h => h.job == job).getOnlyElement()

  /**
   * Counterexample of the code before #147's fix, with its margin: the first core answers 504 just
   * before its timeout, the call goes on to the second with a new deadline, the job expires, and
   * the next occurrence calls a core beside it. Test of the code: scheduler.test.ts "that answers
   * 504 late fails the run instead of going on, which could outlast its job and double it".
   */
  run callsTwiceTest =
    init.then(occur(0)).then(fetch(0)).then(read(handlerOf(0))).then(tick).then(occur(0)).then(tick).then(occur(0))
      .then(nextCore(handlerOf(0))).then(tick).then(occur(0)).then(tick)
      .then(expire(jobs.getOnlyElement())).then(occur(0)).then(fetch(1)).then(read(handlerOf(1)))
      .expect(not(noOverlap) and seen.contains("wentOn"))
}

module unfixedOrderRun {
  import scheduler(FAMILIES = Set(0, 1, 2), PROCS = Set(0), SLOTS = 1, NCORES = 1, TIMEOUT = 2, EXPIRY = 4,
    FIRST_DELAY = 2, CEILING = 15, LATE_NOT_SERVING = false, MAX_CRASHES = 0, EXCLUSIVE = true, FIFO = false).* from "./scheduler"

  /** Fetching the newest job first passes over the Family queued longest (simulation: noStarvation breaks). */
  run newestFirstTest =
    init.then(occur(0)).then(occur(1)).then(occur(2)).then(fetch(0))
      .expect(handlers.forall(h => h.family == 2))
}
