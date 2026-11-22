// -*- mode: Bluespec; -*-
// Instances of the failover model (failover.qnt) and scenarios of it, run by failover-check.sh.
// Calls: 0 Provisioning, 1 the Scheduler, 2 a page, 3 a POST with a held body, 4 a streamed upload.

/** The code, with replicas coming and going and cores changing: safety. */
module checked {
  import failover(NCORES = 3, CALLS = Set(0, 1, 2, 3, 4),
    KINDS = Map(0 -> "provisioning", 1 -> "scheduler", 2 -> "page", 3 -> "post", 4 -> "upload"),
    CHURN = true, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = true, BODY_ON_ANY_503 = false).* from "./failover"
}

/** The code, with core 0 serving and named throughout: liveness and the rotation. */
module steady {
  import failover(NCORES = 3, CALLS = Set(0, 1, 2, 3, 4, 5, 6),
    KINDS = Map(0 -> "provisioning", 1 -> "scheduler", 2 -> "page", 3 -> "post", 4 -> "upload", 5 -> "scheduler", 6 -> "page"),
    CHURN = false, KEEPS_SERVING = Set(0), BREAK_IS_BROKEN = true, BODY_ON_ANY_503 = false).* from "./failover"
}

/** Counterexample: every error of a connection taken as one that was never made. */
module unfixedBreak {
  import failover(NCORES = 2, CALLS = Set(3), KINDS = Map(3 -> "post"),
    CHURN = false, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = false, BODY_ON_ANY_503 = false).* from "./failover"
}

/** Counterexample: a request with a body going on after any 503. */
module unfixedAnswer503 {
  import failover(NCORES = 2, CALLS = Set(3), KINDS = Map(3 -> "post"),
    CHURN = false, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = true, BODY_ON_ANY_503 = true).* from "./failover"
}

/** Scenarios of the code. */
module scenarios {
  import failover(NCORES = 3, CALLS = Set(0, 1, 2, 3, 4),
    KINDS = Map(0 -> "provisioning", 1 -> "scheduler", 2 -> "page", 3 -> "post", 4 -> "upload"),
    CHURN = true, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = true, BODY_ON_ANY_503 = false).* from "./failover"

  /** A core is set to `state` without anything else changing. */
  action becomes(core: int, state: str): bool = all {
    cores' = cores.set(core, state),
    named' = named, round' = round, starts' = starts, calls' = calls, runs' = runs,
  }

  /** Each round starts one core further: the next call's first core is the one after. */
  run rotationStartsOneFurtherTest =
    init.then(start(1)).then(start(2)).then(start(3)).then(start(0))
      .expect(starts == [0, 1, 2, 0] and calls.get(2).order == [1, 2, 0] and spread)

  /** A core that refuses the connection, one that refuses the Family: a POST goes on past both, once. */
  run postGoesOnPastCoresItNeverReachedTest =
    init.then(becomes(0, "down")).then(becomes(1, "refusing"))
      .then(start(3)).then(connect(3)).then(connect(3)).then(connect(3)).then(answer(3))
      .expect(calls.get(3).outcome == "ran" and calls.get(3).passed == Set(0, 1) and runs.get(3) == 1 and safety)

  /** A POST whose connection broke after it was sent fails, though another core serves (accepted). */
  run postEndsWhereItMayHaveRunTest =
    init.then(start(3)).then(connect(3)).then(breakOff(3))
      .expect(calls.get(3).phase == "done" and calls.get(3).outcome == "failed" and calls.get(3).passed == Set() and safety)

  /** A page whose connection broke goes on to the next core: it may be asked again. */
  run pageGoesOnAfterABreakTest =
    init.then(start(2)).then(connect(2)).then(breakOff(2)).then(connect(2)).then(answer(2))
      .expect(calls.get(2).outcome == "ran" and calls.get(2).arrived == Set(0, 1) and safety)

  /** The Scheduler and Provisioning end on a core that is not serving (accepted, #147). */
  run triggeredOperationsEndAfterNotServingTest =
    init.then(becomes(0, "notServing")).then(becomes(1, "notServing"))
      .then(start(1)).then(connect(1))
      .then(start(0)).then(connect(0))
      .expect(calls.get(1).outcome == "notServed" and calls.get(1).arrived == Set() and
              calls.get(0).outcome == "notServed" and calls.get(0).arrived == Set() and safety)

  /** A page goes on after a core that is not serving and answered 503. */
  run pageGoesOnAfterNotServing503Test =
    init.then(becomes(0, "notServing")).then(start(2)).then(connectAnswering(2, true)).then(connect(2)).then(answer(2))
      .expect(calls.get(2).outcome == "ran" and calls.get(2).passed == Set(0) and calls.get(2).arrived == Set(1) and safety)

  /**
   * A page ends on a core that is not serving and answered 502 or 504, though other cores serve
   * (accepted). Test: router.test.ts "passes a page's 502 (and 504) back to the browser without
   * asking the next core".
   */
  run pageEndsAfterNotServing502Test =
    init.then(becomes(0, "notServing")).then(start(2)).then(connectAnswering(2, false))
      .expect(calls.get(2).phase == "done" and calls.get(2).outcome == "notServed" and calls.get(2).arrived == Set() and
              somePageEndedNotServed and reachesAServingCore and safety)

  /** A streamed upload is sent to one core only: refused there, it ends without another. */
  run uploadEndsAfterItsOneCoreTest =
    init.then(becomes(0, "refusing")).then(start(4))
      .expect(calls.get(4).order == [0])
      .then(connect(4))
      .expect(calls.get(4).phase == "done" and calls.get(4).outcome == "noCore" and safety)

  /**
   * A streamed upload whose one core refused the connection ends without another, though cores
   * serve (accepted). Test: router.test.ts "answers 502 to a body longer than the Router holds
   * when the one core it was sent to could not be connected to".
   */
  run uploadEndsAtADownCoreTest =
    init.then(becomes(0, "down")).then(start(4)).then(connect(4))
      .expect(calls.get(4).phase == "done" and calls.get(4).arrived == Set() and calls.get(4).outcome == "noCore" and reachesAServingCore)

  /** A core removed after the call resolved the name refuses the connection: the call goes on. */
  run removedMeanwhileIsPassedTest =
    init.then(start(1)).then(rename(0)).then(stop(0)).then(connect(1))
      .expect(calls.get(1).phase == "trying" and calls.get(1).order == [1, 2])

  /** A core added after the call resolved the name is not asked by it (accepted). */
  run addedMeanwhileIsNotAskedTest =
    init.then(rename(2)).then(stop(2)).then(start(1)).then(addReplica(2)).then(rename(2))
      .expect(calls.get(1).order == [0, 1] and named == Set(0, 1, 2))

  /** The pool's name stands for no core: the call ends without one. */
  run noCoreNamedTest =
    init.then(rename(0)).then(rename(1)).then(rename(2)).then(start(1)).then(noCoreLeft(1))
      .expect(calls.get(1).outcome == "noCore" and starts == [])
}

/** The counterexamples as runs: each breaks safety, and a test of the Routing module shows the code does not. */
module unfixedBreakRun {
  import failover(NCORES = 2, CALLS = Set(3), KINDS = Map(3 -> "post"),
    CHURN = false, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = false, BODY_ON_ANY_503 = false).* from "./failover"

  /**
   * The POST arrives at core 0, which runs it and dies before answering; taken as never
   * connected, it goes on to core 1 and runs again. Test: router.test.ts "does not send a request
   * with a body to another core when the connection broke after it arrived".
   */
  run postRunsTwiceTest =
    init.then(start(3)).then(connect(3))
      .then(breakOffHaving(3, 1))
      .then(connect(3)).then(answer(3))
      .expect(not(safety))
}

module unfixedAnswer503Run {
  import failover(NCORES = 2, CALLS = Set(3), KINDS = Map(3 -> "post"),
    CHURN = false, KEEPS_SERVING = Set(), BREAK_IS_BROKEN = true, BODY_ON_ANY_503 = true).* from "./failover"

  /**
   * The POST runs on core 0, which answers 503 of its own; taken as not run, it goes on to core 1
   * and runs again. Test: router.test.ts "does not send a request with a body to another core
   * after a 503 that does not say the core refused the Family".
   */
  run postRunsTwiceTest =
    init.then(start(3)).then(connect(3)).then(answer503(3)).then(connect(3)).then(answer(3))
      .expect(not(safety))
}
