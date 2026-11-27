// -*- mode: Bluespec; -*-
// Instances of the lifecycle model (familyLifecycle.qnt) and scenarios of it, run by familyLifecycle-check.sh.
// Runs: 0..2 deliveries of family.created, 3 the Operator's create --family-id, 4 suspend,
// 5 resume, 6 and 7 delete, 8 and 9 lock, 10 unlock. Readers: 0 a Scheduler job, 1 a browser's request.

/** The code, with every command, failures and readers: safety, and that a deletion begun finishes. */
module checked {
  import familyLifecycle(
    RUNS = Map(0 -> "deliver", 1 -> "deliver", 2 -> "deliver", 3 -> "finish", 4 -> "suspend", 5 -> "resume", 6 -> "delete", 7 -> "delete",
      8 -> "lock", 9 -> "lock", 10 -> "unlock"),
    READERS = Map(0 -> "job", 1 -> "request"),
    FAILURES = true, LOCKING = true).* from "./familyLifecycle"
}

/** The code, deliveries only (no Operator): a delivery always finishes the Family. */
module deliveries {
  import familyLifecycle(
    RUNS = Map(0 -> "deliver", 1 -> "deliver", 2 -> "deliver", 3 -> "deliver"),
    READERS = Map(0 -> "job", 1 -> "request"),
    FAILURES = true, LOCKING = true).* from "./familyLifecycle"
}

/** Accepted: deliveries, suspends and resumes with failures, so that sampling finds the crashed resume. */
module resumes {
  import familyLifecycle(
    RUNS = Map(0 -> "deliver", 1 -> "suspend", 2 -> "suspend", 3 -> "resume", 4 -> "resume", 5 -> "resume"),
    READERS = Map(0 -> "job"),
    FAILURES = true, LOCKING = true).* from "./familyLifecycle"
}

/** Counterexample: no Family lock. */
module unlocked {
  import familyLifecycle(
    RUNS = Map(0 -> "deliver", 1 -> "deliver"),
    READERS = Map(0 -> "job"),
    FAILURES = false, LOCKING = false).* from "./familyLifecycle"
}

/** Scenarios of the code. */
module scenarios {
  import familyLifecycle(
    RUNS = Map(0 -> "deliver", 1 -> "deliver", 2 -> "deliver", 3 -> "finish", 4 -> "suspend", 5 -> "resume", 6 -> "delete", 7 -> "delete",
      8 -> "lock", 9 -> "lock", 10 -> "unlock"),
    READERS = Map(0 -> "job", 1 -> "request"),
    FAILURES = true, LOCKING = true).* from "./familyLifecycle"

  action runToEnd(r: int): bool =
    runStep(r).then(runStep(r)).then(runStep(r)).then(runStep(r)).then(runStep(r)).then(runStep(r))

  /** An undisturbed delivery makes the Family active, whole and scheduled. */
  run deliveryMakesActiveTest =
    init.then(runToEnd(0))
      .expect(w.status == "active" and w.schedules and activeIsWhole and lock == -1 and runs.get(0).pc == "done")

  /** A delivery that failed after the core opened the Family is finished by the next, with the same secrets. */
  run redeliveryFinishesTest =
    init.then(runStep(0)).then(runStep(0)).then(runStep(0)).then(runStep(0)).then(crash(0))
      .then(runToEnd(1))
      .expect(w.status == "active" and w.entrySecret == 1 and w.prepared == 1 and safety)

  /** A delivery that failed before the entry was written leaves the role; the next draws new secrets. */
  run redeliveryAfterRoleOnlyTest =
    init.then(runStep(0)).then(runStep(0)).then(crash(0))
      .then(runToEnd(1))
      .expect(w.status == "active" and w.entrySecret == 2 and w.role == 2 and safety)

  /** Two deliveries side by side: the second waits for the lock, then only creates the schedules. */
  run sideBySideTest =
    init.then(runStep(0)).then(runStep(0))
      .expect(lock == 0 and runs.get(1).pc == "start") // run 1 waits: `locked` needs the lock free
      .then(runStep(0)).then(runStep(0)).then(runStep(0)).then(runStep(0))
      .then(runStep(1))
      .expect(runs.get(1).pc == "schedulesOnly" and safety)

  /** Suspend and resume: schedules follow the status. */
  run suspendResumeTest =
    init.then(runToEnd(0))
      .then(runStep(4)).then(runStep(4)).expect(w.status == "suspended" and not(w.schedules))
      .then(runStep(5)).then(runStep(5)).expect(w.status == "active" and w.schedules and safety)

  /** A delivery again for a deleted Family is refused; resume is refused too. */
  run deletedIsFinalTest =
    init.then(runToEnd(0))
      .then(runStep(6)).then(runStep(6)).then(runStep(6)).then(runStep(6)).then(runStep(6))
      .then(runStep(1)).then(runStep(5))
      .expect(w.status == "deleted" and runs.get(1).pc == "done" and runs.get(5).pc == "done" and not(w.schedules) and safety)

  /** A delete that failed after marking the Family deleted is finished by the next. */
  run deletionFinishedByTheNextTest =
    init.then(runToEnd(0))
      .then(runStep(6)).then(runStep(6)).then(runStep(6)).then(crash(6))
      .expect(w.status == "deleted" and w.schedules and deletionFinishes)
      .then(runStep(7)).then(runStep(7)).then(runStep(7)).then(runStep(7))
      .then(runStep(7)).then(runStep(7)).then(runStep(7)).then(runStep(7)).then(runStep(7))
      .expect(w.deletedAt and not(w.schedules) and not(w.db) and not(w.org) and safety)

  /** A job of a Family marked deleted whose delete failed before unscheduling removes the schedules. */
  run jobRemovesSchedulesOfADeletedFamilyTest =
    init.then(runToEnd(0))
      .then(runStep(6)).then(runStep(6)).then(runStep(6)).then(crash(6))
      .then(find(0))
      .expect(not(w.schedules) and readers.get(0).pc == "idle")

  /** Accepted: a job that found the Family active triggers its due work after it was marked deleted. */
  run jobReachesDeletedFamilyTest =
    init.then(runToEnd(0))
      .then(find(0))
      .then(runStep(6)).then(runStep(6)).then(runStep(6))
      .then(act(0))
      .expect(w.status == "deleted" and not(nothingReachesDeleted))

  /** Accepted: a resume that failed after changing the status leaves an active Family unscheduled. */
  run resumeFailedLeavesActiveUnscheduledTest =
    init.then(runToEnd(0))
      .then(runStep(4)).then(runStep(4))
      .then(runStep(5)).then(crash(5))
      .then(crash(1)).then(crash(2)).then(crash(3)).then(crash(6)).then(crash(7))
      .then(crash(8)).then(crash(9)).then(crash(10))
      .expect(w.status == "active" and not(w.schedules) and not(activeIsScheduled))

  /** A lock withholds an active Family and removes its schedules; a second lock keeps the first. */
  run lockWithholdsTest =
    init.then(runToEnd(0))
      .then(runStep(8)).expect(readiness(w) == "withheld" and w.schedules)
      .then(runStep(8)).expect(w.lockedBy == 8 and not(w.schedules) and safety)
      .then(runStep(9)).then(runStep(9)).expect(w.lockedBy == 8 and not(w.schedules) and safety)

  /** A lock that failed before removing the schedules: a job finds the Family withheld and triggers nothing. */
  run lockFailedJobTriggersNothingTest =
    init.then(runToEnd(0))
      .then(runStep(8)).then(crash(8))
      .then(find(0))
      .expect(w.schedules and readers.get(0).pc == "idle" and lockFinishes and safety)

  /** An unlock serves the Family again and brings back its schedules. */
  run unlockServesAgainTest =
    init.then(runToEnd(0))
      .then(runStep(8)).then(runStep(8))
      .then(runStep(10)).then(runStep(10))
      .expect(readiness(w) == "served" and w.schedules and someUnlocked and safety)

  /** A Locked Family suspended and resumed stays Locked and without schedules. */
  run lockedResumedStaysLockedTest =
    init.then(runToEnd(0))
      .then(runStep(8)).then(runStep(8))
      .then(runStep(4)).then(runStep(4)).expect(w.status == "suspended" and someLockedSuspended)
      .then(runStep(5)).then(runStep(5))
      .expect(w.status == "active" and w.lockedBy == 8 and not(w.schedules) and readiness(w) == "withheld" and safety)

  /** Locking and unlocking a deleted Family is refused. */
  run deletedNotLockedTest =
    init.then(runToEnd(0))
      .then(runStep(6)).then(runStep(6)).then(runStep(6)).then(runStep(6)).then(runStep(6))
      .then(runStep(8)).then(runStep(10))
      .expect(not(isLocked(w)) and runs.get(8).pc == "done" and runs.get(10).pc == "done" and not(w.schedules) and safety)

  /** A delivery again for a Locked Family gives it no schedules. */
  run redeliveryOfLockedTest =
    init.then(runToEnd(0))
      .then(runStep(8)).then(runStep(8))
      .then(runStep(1))
      .expect(not(w.schedules) and runs.get(1).pc == "done" and safety)
}

/** Scenarios without the lock. */
module unlockedScenarios {
  import familyLifecycle(RUNS = Map(0 -> "deliver", 1 -> "deliver"), READERS = Map(0 -> "job"),
    FAILURES = false, LOCKING = false).* from "./familyLifecycle"

  /** Without the lock, two deliveries side by side both draw secrets: the Family is created twice. */
  run createdTwiceTest =
    init.then(runStep(0)).then(runStep(1))
      .then(runStep(0)).then(runStep(1))
      .then(runStep(0)).then(runStep(1))
      .expect(not(createdOnce))
}
