// -*- mode: Bluespec; -*-
/**
 * The lifecycle of a Family: creating, suspending, resuming, locking, unlocking and deleting it
 * (#148, map #145; locking #225).
 * Code: routing/src/create-family.ts, delete-family.ts, family-status.ts, provisioning.ts
 * (`withFamilyLock`), directory.ts, family-databases.ts, receiver.ts, scheduler.ts (`giving`),
 * request-routing.ts and router.ts (a browser's request).
 *
 * WHAT IT MODELS
 * - One Family (Families are independent: the lock, the entry, the database and the schedules
 *   are each the Family's own). Its Logto Organization exists from the start: the core created
 *   it before posting `family.created`.
 * - The world (`w`): the Directory's entry (status, the wrapped secrets, `deleted_at`, the run
 *   that locked it, which stands for `locked_at` and `lock_reason`), the
 *   Family's role (and the password it was given), its database, what the core prepared it with,
 *   its blobs, its Organization and its schedules in pg-boss.
 * - Runs (`runs`), each one call of a command: a delivery of `family.created` ("deliver", as
 *   often as `RUNS` names it: delivered again, side by side), the Operator's `create
 *   --family-id` ("finish"), `suspend`, `resume`, `delete`, and `lockFamily` ("lock") and
 *   `unlockFamily` ("unlock") of family-status.ts. Each step is one statement or one
 *   call of the code. Any run may fail at any step (`crash`: a crash, or a call failing), which
 *   ends its session and with it the Family's lock.
 * - The Family's lock (`lock`), an advisory lock of the session: create runs all of it under
 *   the lock; suspend, resume, lock, unlock and the first two steps of delete too. `LOCKING = false` takes it
 *   away (not the code).
 * - Readers (`readers`): a Scheduler job of the Family ("job", queued while it has schedules)
 *   or a browser's request ("request"). Each reads the entry (`find`), and when the Family is
 *   served goes on to the core with its Context (`act`), in a later step.
 * - A secret drawn by run r is r + 1; 0 is none.
 *
 * PROPERTIES (instances and scenarios in familyLifecycle_test.qnt, run by familyLifecycle-check.sh)
 * - Safety `createdOnce`: the Family's role, entry and what the core prepared hold one and the
 *   same secret: it is never created twice, by deliveries side by side or a finish.
 * - Safety `activeIsWhole`: an active Family has its database, its role with the entry's
 *   password, a database the core prepared with its key, and its Organization.
 * - Safety `sectionsApart`: status changes and the schedules that follow them never interleave.
 * - Safety `deletedIsFinal`: a deleted Family never becomes anything else.
 * - Safety `deletedNotServed`: once deleted, no find serves it; once deletion finished, it has
 *   no schedules.
 * - Safety `lockedNotServed`: a Locked Family is never served, whether it is active or suspended;
 *   a Scheduler job of it triggers nothing.
 * - Safety `firstLockKept`: once locked, it stays locked by the run that locked it first, until
 *   an unlock.
 * - Liveness as invariants of every reachable state (instance `deliveries`, no Operator):
 *   `deliveryFinishes`, one undisturbed delivery makes the Family active and whole;
 *   `deletionFinishes` (instance `checked`), one undisturbed delete run finishes a deletion begun;
 *   `lockFinishes` and `unlockFinishes` (instance `checked`), one undisturbed lock run leaves a
 *   Family that can be locked Locked and without schedules, and one undisturbed unlock run leaves
 *   it unlocked, with schedules exactly when it is active.
 * - Accepted (see ACCEPTED): `nothingReachesDeleted`, `activeIsScheduled`.
 * - Counterexample `unlocked` (no lock): two deliveries side by side create the Family twice.
 *
 * ACCEPTED (the code keeps it; each is a counterexample of familyLifecycle-check.sh)
 * - `nothingReachesDeleted`: a Scheduler job or a browser's request that found the Family active
 *   goes on to its core after `delete` marked it deleted: due work runs, a request is answered,
 *   with the Context read before. The database still lets connections in until dropping begins.
 * - `activeIsScheduled`: a resume that fails after the status change and before its schedules
 *   are created leaves an active Family without schedules: it is routed to, but no due work,
 *   purge or sweep runs until `resume` is run again. So does an unlock that fails after clearing
 *   the lock, until `unlock` or `resume` is run again.
 *
 * ASSUMES
 * - The core prepares a Family's database with the key in the Context it is handed, and a
 *   database prepared with one key does not open with another.
 * - pg-boss runs a job queued before its schedule was removed (`find` needs no schedules once
 *   queued); the job checks the entry like any other.
 *
 * NOT COVERED
 * - Other Families, a second Organization; the UNIQUE organization_id refusal.
 * - How long dropping the database waits for connections; the 14 days of the bucket and backups.
 * - The core's answers (failover.qnt); timeouts; the core's own redelivery schedule.
 */
module familyLifecycle {
  // ---- Parameters -----------------------------------------------------------------------------

  /** The runs, each of one kind: "deliver", "finish", "suspend", "resume", "delete", "lock", "unlock". */
  const RUNS: int -> str
  /** The readers, each of one kind: "job", "request". */
  const READERS: int -> str
  /** Whether a run may fail at any step. */
  const FAILURES: bool
  /** False: no Family lock (not the code). */
  const LOCKING: bool

  // ---- State ------------------------------------------------------------------------------------

  type World = {
    /** "none" (no entry), "being_prepared", "active", "suspended", "deleted". */
    status: str,
    /** The secrets the entry holds wrapped (key and database password, drawn together); 0 none. */
    entrySecret: int,
    deletedAt: bool,
    /** The password the Family's role has; -1: no role. */
    role: int,
    db: bool,
    /** The key the core prepared the database with; 0 not yet. */
    prepared: int,
    /** The core was handed a key other than the one it prepared the database with. */
    preparedTwice: bool,
    blobs: bool,
    org: bool,
    schedules: bool,
    /** The run that locked the Family, standing for when and why; NOBODY: not locked. */
    lockedBy: int,
  }

  /** A run's step and the secrets it holds in memory. */
  type Run = { pc: str, secret: int }

  /** "idle", or "served" with the secret it read. */
  type Reader = { pc: str, secret: int }

  var w: World
  var runs: int -> Run
  /** The run holding the Family's lock; -1 none. */
  var lock: int
  var readers: int -> Reader
  /** A reader went on to the core while the Family was deleted. */
  var reachedDeleted: bool
  /** A deleted Family got another status. */
  var reactivated: bool
  /** A Locked Family's lock changed to another run's, without an unlock in between. */
  var relocked: bool

  pure val NOBODY = -1

  pure val INITIAL: World = {
    status: "none", entrySecret: 0, deletedAt: false, role: -1, db: false, prepared: 0,
    preparedTwice: false, blobs: false, org: true, schedules: false, lockedBy: NOBODY,
  }

  // ---- Functional layer ------------------------------------------------------------------------

  pure def isCreate(kind: str): bool = kind == "deliver" or kind == "finish"

  /** A run's steps under the lock, where status and schedules change. */
  pure def inSection(kind: str, pc: str): bool =
    if (isCreate(kind)) Set("ensureDb", "add", "open", "schedules", "activate", "schedulesOnly").contains(pc)
    else if (kind == "delete") Set("mark", "unschedule").contains(pc)
    else if (kind == "suspend") pc == "unschedule"
    else if (kind == "resume") pc == "schedule"
    else if (kind == "lock") pc == "unschedule"
    else if (kind == "unlock") pc == "follow"
    else false

  pure def free(l: int, r: int): bool = l == NOBODY or l == r

  /** create-family.ts `existingFor`, `existingOf`: where a create run goes on, with the secret it holds. */
  pure def createRead(world: World, kind: str, drawn: int): Run =
    // A Locked Family is answered with its address, and gets no schedules.
    if (world.status == "active" and isLocked(world)) { pc: "done", secret: 0 }
    else if (world.status == "active") { pc: "schedulesOnly", secret: world.entrySecret }
    else if (world.status != "none" and world.status != "being_prepared") { pc: "done", secret: 0 }
    else if (world.status == "being_prepared") { pc: "ensureDb", secret: world.entrySecret }
    // `finish`: a Family id that left no trace is refused.
    else if (kind == "finish" and world.role < 0 and not(world.db)) { pc: "done", secret: 0 }
    else { pc: "ensureDb", secret: drawn }

  /** family-databases.ts `ensureFamilyDatabase`: the role with this password, the database. */
  pure def ensureDb(world: World, secret: int): World = { ...world, role: secret, db: true }

  /** directory.ts `add`: ON CONFLICT DO NOTHING. */
  pure def add(world: World, secret: int): World =
    if (world.status == "none") { ...world, status: "being_prepared", entrySecret: secret } else world

  /** The core opens the Family with this key: it needs the role's password; it prepares the database. */
  pure def canOpen(world: World, secret: int): bool = world.db and world.role == secret and world.org

  pure def open(world: World, secret: int): World = {
    ...world,
    prepared: if (world.prepared == 0) secret else world.prepared,
    preparedTwice: world.preparedTwice or (world.prepared != 0 and world.prepared != secret),
    blobs: true,
  }

  /** directory.ts `changeStatus`: `from` to `to`, and no other. */
  pure def changeStatus(world: World, before: str, after: str): World =
    if (world.status == before) { ...world, status: after } else world

  pure def markDeleted(world: World): World = { ...world, status: "deleted", entrySecret: 0 }
  pure def dropDb(world: World): World = { ...world, role: -1, db: false }

  pure def isLocked(world: World): bool = world.lockedBy != NOBODY

  /** directory.ts `LOCKABLE`: only an active or suspended Family is locked or unlocked. */
  pure def lockable(world: World): bool = world.status == "active" or world.status == "suspended"

  /** directory.ts `lock`: `coalesce(locked_at, now)`, so the first lock is kept. */
  pure def lockBy(world: World, r: int): World =
    if (lockable(world) and not(isLocked(world))) { ...world, lockedBy: r } else world

  /** directory.ts `unlock`. */
  pure def unlockOf(world: World): World =
    if (lockable(world)) { ...world, lockedBy: NOBODY } else world

  /** family-status.ts `schedulesFollow`, with directory.ts `statusOf`: only an active Family not Locked has schedules. */
  pure def scheduled(world: World): bool = world.status == "active" and not(isLocked(world))

  /** family-readiness.ts `readinessOf`, with directory.ts `statusOf` (active and locked: `locked`). */
  pure def readiness(world: World): str =
    if (world.status == "none" or world.status == "deleted") "gone"
    else if (scheduled(world)) "served"
    else "withheld"

  /** A delivery from start to end, alone and without failing (the liveness check). */
  pure def deliverAlone(world: World, drawn: int): World = {
    val r = createRead(world, "deliver", drawn)
    if (r.pc == "done") world
    else if (r.pc == "schedulesOnly") { ...world, schedules: true }
    else {
      val opened = open(add(ensureDb(world, r.secret), r.secret), r.secret)
      { ...opened, schedules: true, status: "active" }
    }
  }

  /** A lock run from start to end, alone and without failing (the liveness check). */
  pure def lockAlone(world: World, r: int): World =
    if (lockable(world)) { ...lockBy(world, r), schedules: false } else world

  /** An unlock run from start to end, alone and without failing (the liveness check). */
  pure def unlockAlone(world: World): World =
    if (lockable(world)) { ...unlockOf(world), schedules: scheduled(unlockOf(world)) } else world

  /** A delete run from start to end, alone and without failing (the liveness check). */
  pure def deleteAlone(world: World): World =
    if (world.status == "none" or world.deletedAt) world
    else { ...dropDb(markDeleted(world)), schedules: false, blobs: false, org: false, deletedAt: true }

  // ---- Actions ----------------------------------------------------------------------------------

  action unchangedReaders = all { readers' = readers, reachedDeleted' = reachedDeleted }

  /** A run's step: its next state, the world after it, and whether it releases the lock. */
  action stepTo(r: int, nextRun: Run, world: World, release: bool): bool = all {
    runs' = runs.set(r, nextRun),
    w' = world,
    lock' = if (release and lock == r) NOBODY else lock,
    reactivated' = (reactivated or (w.status == "deleted" and world.status != "deleted")),
    relocked' = (relocked or (isLocked(w) and isLocked(world) and w.lockedBy != world.lockedBy)),
    unchangedReaders,
  }

  /** A run takes the lock (when LOCKING) and makes its first step under it. */
  action locked(r: int, nextRun: Run, world: World): bool = all {
    not(LOCKING) or lock == NOBODY,
    runs' = runs.set(r, nextRun),
    w' = world,
    lock' = if (LOCKING and nextRun.pc != "done") r else lock,
    reactivated' = (reactivated or (w.status == "deleted" and world.status != "deleted")),
    relocked' = (relocked or (isLocked(w) and isLocked(world) and w.lockedBy != world.lockedBy)),
    unchangedReaders,
  }

  action createStep(r: int): bool = {
    val cur = runs.get(r)
    val s = cur.secret
    any {
      all { cur.pc == "start", locked(r, createRead(w, RUNS.get(r), r + 1), w) },
      all { cur.pc == "ensureDb", stepTo(r, { ...cur, pc: "add" }, ensureDb(w, s), false) },
      all { cur.pc == "add", stepTo(r, { ...cur, pc: "open" }, add(w, s), false) },
      all { cur.pc == "open", canOpen(w, s), stepTo(r, { ...cur, pc: "schedules" }, open(w, s), false) },
      all { cur.pc == "schedules", stepTo(r, { ...cur, pc: "activate" }, { ...w, schedules: true }, false) },
      // directory.ts `activate`: unconditional.
      all { cur.pc == "activate", stepTo(r, { ...cur, pc: "done" }, { ...w, status: "active" }, true) },
      all { cur.pc == "schedulesOnly", stepTo(r, { ...cur, pc: "done" }, { ...w, schedules: true }, true) },
    }
  }

  action deleteStep(r: int): bool = {
    val cur = runs.get(r)
    any {
      // Outside the lock: `existingEntry`, and a Family whose deletion finished is left as it is.
      all { cur.pc == "start",
            stepTo(r, { ...cur, pc: if (w.status == "none" or w.deletedAt) "done" else "lock" }, w, false) },
      all { cur.pc == "lock", locked(r, { ...cur, pc: "mark" }, w) },
      all { cur.pc == "mark", stepTo(r, { ...cur, pc: "unschedule" }, markDeleted(w), false) },
      all { cur.pc == "unschedule", stepTo(r, { ...cur, pc: "drop" }, { ...w, schedules: false }, true) },
      all { cur.pc == "drop", stepTo(r, { ...cur, pc: "blobs" }, dropDb(w), false) },
      all { cur.pc == "blobs", stepTo(r, { ...cur, pc: "org" }, { ...w, blobs: false }, false) },
      all { cur.pc == "org", stepTo(r, { ...cur, pc: "finish" }, { ...w, org: false }, false) },
      all { cur.pc == "finish", stepTo(r, { ...cur, pc: "done" }, { ...w, deletedAt: true }, false) },
    }
  }

  action suspendStep(r: int): bool = {
    val cur = runs.get(r)
    val changed = changeStatus(w, "active", "suspended")
    any {
      all { cur.pc == "start",
            // secret 1 marks a suspend that suspended (the witness `someResumed`).
            locked(r, if (changed.status == "suspended") { pc: "unschedule", secret: 1 } else { ...cur, pc: "done" }, changed) },
      all { cur.pc == "unschedule", stepTo(r, { ...cur, pc: "done" }, { ...w, schedules: false }, true) },
    }
  }

  action resumeStep(r: int): bool = {
    val cur = runs.get(r)
    val changed = changeStatus(w, "suspended", "active")
    any {
      all { cur.pc == "start",
            locked(r, { ...cur, pc: if (changed.status == "active") "schedule" else "done" }, changed) },
      // family-status.ts `schedulesFollow`: a Family Locked once resumed gets no schedules.
      all { cur.pc == "schedule", stepTo(r, { ...cur, pc: "done" }, { ...w, schedules: scheduled(w) }, true) },
    }
  }

  /** family-status.ts `lockFamily`: the lock, then the schedules removed; refused unless lockable. */
  action lockStep(r: int): bool = {
    val cur = runs.get(r)
    any {
      all { cur.pc == "start", locked(r, { ...cur, pc: if (lockable(w)) "unschedule" else "done" }, lockBy(w, r)) },
      all { cur.pc == "unschedule", stepTo(r, { ...cur, pc: "done" }, { ...w, schedules: false }, true) },
    }
  }

  /** family-status.ts `unlockFamily`: the lock cleared, then the schedules follow the status. */
  action unlockStep(r: int): bool = {
    val cur = runs.get(r)
    val changed = unlockOf(w)
    any {
      all { cur.pc == "start",
            // secret 1 marks an unlock that unlocked a Locked Family (the witness `someUnlocked`).
            locked(r, if (lockable(w)) { pc: "follow", secret: if (isLocked(w)) 1 else 0 } else { ...cur, pc: "done" }, changed) },
      all { cur.pc == "follow", stepTo(r, { ...cur, pc: "done" }, { ...w, schedules: scheduled(w) }, true) },
    }
  }

  action runStep(r: int): bool = {
    val kind = RUNS.get(r)
    if (isCreate(kind)) createStep(r)
    else if (kind == "delete") deleteStep(r)
    else if (kind == "suspend") suspendStep(r)
    else if (kind == "lock") lockStep(r)
    else if (kind == "unlock") unlockStep(r)
    else resumeStep(r)
  }

  /** A run fails at its step: its session ends, and the lock with it. */
  action crash(r: int): bool = all {
    FAILURES,
    runs.get(r).pc != "done",
    stepTo(r, { ...runs.get(r), pc: "done" }, w, true),
  }

  /** scheduler.ts `giving`, router.ts: a reader reads the entry. */
  action find(i: int): bool = {
    val ready = readiness(w)
    all {
    readers.get(i).pc == "idle",
    READERS.get(i) == "request" or w.schedules,
    readers' = readers.set(i, if (ready == "served") { pc: "served", secret: w.entrySecret } else readers.get(i)),
    // A job of a Family that is gone removes its schedules (outside the lock).
    w' = if (ready == "gone" and READERS.get(i) == "job") { ...w, schedules: false } else w,
    reachedDeleted' = reachedDeleted,
    runs' = runs, lock' = lock, reactivated' = reactivated, relocked' = relocked,
  }}

  /** The reader goes on to the core with the Context it read. */
  action act(i: int): bool = all {
    readers.get(i).pc == "served",
    readers' = readers.set(i, { pc: "idle", secret: 0 }),
    reachedDeleted' = (reachedDeleted or w.status == "deleted"),
    w' = w, runs' = runs, lock' = lock, reactivated' = reactivated, relocked' = relocked,
  }

  action init: bool = all {
    w' = INITIAL,
    runs' = RUNS.keys().mapBy(_ => { pc: "start", secret: 0 }),
    lock' = NOBODY,
    readers' = READERS.keys().mapBy(_ => { pc: "idle", secret: 0 }),
    reachedDeleted' = false,
    reactivated' = false,
    relocked' = false,
  }

  action step: bool = any {
    nondet r = RUNS.keys().oneOf()
    // A failure is one choice in six, so that runs also get to their end.
    nondet roll = 0.to(5).oneOf()
    any { runStep(r), all { roll == 0, crash(r) } },
    nondet i = READERS.keys().oneOf()
    any { find(i), act(i) },
  }

  // ---- Properties -------------------------------------------------------------------------------

  val createdOnce: bool =
    not(w.preparedTwice) and
    (w.entrySecret != 0 implies (w.role == w.entrySecret and Set(0, w.entrySecret).contains(w.prepared)))

  val activeIsWhole: bool =
    w.status == "active" implies
      (w.db and w.role == w.entrySecret and w.entrySecret != 0 and w.prepared == w.entrySecret and w.org)

  val sectionsApart: bool =
    RUNS.keys().filter(r => inSection(RUNS.get(r), runs.get(r).pc)).size() <= 1

  val deletedIsFinal: bool = not(reactivated)

  val deletedNotServed: bool =
    (w.status == "deleted" implies readiness(w) == "gone") and (w.deletedAt implies not(w.schedules))

  val lockedNotServed: bool = isLocked(w) implies readiness(w) != "served"

  val firstLockKept: bool = not(relocked)

  val safety: bool =
    createdOnce and activeIsWhole and sectionsApart and deletedIsFinal and deletedNotServed and lockedNotServed and firstLockKept

  /** Not kept (ACCEPTED): nothing goes on to the core of a deleted Family. */
  val nothingReachesDeleted: bool = not(reachedDeleted)

  /** Not kept (ACCEPTED): an active Family not Locked has its schedules, once no run is under way. */
  val activeIsScheduled: bool =
    (RUNS.keys().forall(r => runs.get(r).pc == "done") and scheduled(w)) implies w.schedules

  /** Liveness: from here, with the runs under way failed, one more delivery makes the Family active and whole. */
  val deliveryFinishes: bool = {
    val after = deliverAlone(w, 100)
    Set("none", "being_prepared", "active").contains(w.status) implies
      (after.status == "active" and after.schedules and after.db and after.org
        and after.role == after.entrySecret and after.prepared == after.entrySecret and not(after.preparedTwice))
  }

  /** Liveness: from here, a deletion begun is finished by one more delete run. */
  val deletionFinishes: bool = {
    val after = deleteAlone(w)
    w.status == "deleted" implies
      (after.deletedAt and not(after.db) and after.role < 0 and not(after.blobs) and not(after.org) and not(after.schedules))
  }

  /** Liveness: from here, one more lock run leaves a Family that can be locked Locked, without schedules, keeping its first lock. */
  val lockFinishes: bool = {
    val after = lockAlone(w, 99)
    lockable(w) implies
      (isLocked(after) and not(after.schedules) and (isLocked(w) implies after.lockedBy == w.lockedBy))
  }

  /** Liveness: from here, one more unlock run leaves a Family that can be unlocked unlocked, scheduled exactly when active. */
  val unlockFinishes: bool = {
    val after = unlockAlone(w)
    lockable(w) implies (not(isLocked(after)) and after.schedules == (after.status == "active"))
  }

  // ---- Witnesses --------------------------------------------------------------------------------

  val someActive: bool = w.status == "active"
  val someSuspended: bool = w.status == "suspended"
  /** Active again after a suspend that suspended: only resume makes a suspended Family active. */
  val someResumed: bool =
    w.status == "active" and RUNS.keys().exists(r => RUNS.get(r) == "suspend" and runs.get(r).secret == 1)
  val someDeletionBegun: bool = w.status == "deleted" and not(w.deletedAt)
  val someDeleted: bool = w.deletedAt
  val someServed: bool = READERS.keys().exists(i => readers.get(i).pc == "served")
  val someLocked: bool = w.status == "active" and isLocked(w)
  val someLockedSuspended: bool = w.status == "suspended" and isLocked(w)
  /** Active and served again after an unlock that unlocked a Locked Family. */
  val someUnlocked: bool =
    scheduled(w) and RUNS.keys().exists(r => RUNS.get(r) == "unlock" and runs.get(r).secret == 1)
}
