// -*- mode: Bluespec; -*-
/**
 * How the Routing module calls the pool of cores, and when a call goes on to the next core
 * (#146, map #145). Code: routing/src/pool.ts, failover.ts, core.ts (`coreClient`, the triggered
 * operations of Provisioning and the Scheduler), router.ts (`passOn`, a browser's request).
 *
 * WHAT IT MODELS
 * - The pool's name (`named`): the cores the Cube's name service answers now. It may lag behind
 *   what runs: it can still name a core that stopped, and a core can run before it is named.
 * - Each core (`cores`): Down (a connection to it is refused), NotServing (it is starting, or
 *   the proxy in front of it has no core: it answers 502, 503 or 504 and runs nothing), Refusing
 *   (it refuses to open the Family: `409 migrated-by-newer-release`, `503 migrating`, `503
 *   unavailable`, and changed nothing) or Serving. Replicas are added (Down -> NotServing, then
 *   named) and removed (unnamed, then stopped) between and during calls.
 * - The rotation (`takingTurns`): each resolve of the name starts one core further (`round`).
 * - A call: resolve (`start`), then per core of its snapshot: `connect` (refused: it never
 *   arrived; answered not serving, with 503 or with 502/504, or refusing: it did not run;
 *   serving: it arrived), and once it
 *   arrived, `answer` (the core ran it and answered), `answer503` (a browser's request only: the
 *   core ran it, or part of it, and answered 503 itself) or `breakOff` (the connection broke
 *   after the call was sent, or no answer came in time: the core may or may not have run it).
 * - Kinds of call (`policyOf`): Provisioning's operations, the Scheduler's operations, a page
 *   (GET or HEAD), a request with a body the Router holds whole, one with a longer body it streams.
 *
 * PROPERTIES (instance `checked`; scenarios and instances in failover_test.qnt, run by failover-check.sh)
 * - Safety `onlyWhenNotArrived`: a call goes on to the next core only when it provably never
 *   arrived at one, unless the call is idempotent (a page).
 * - Safety `runsOnceUnlessIdempotent`: no call that is not idempotent runs twice.
 * - Liveness, as an invariant of runs where some core serves throughout and is named
 *   (`reachesAServingCore`, instance `steady`): every call that ended arrived at a core, but for
 *   one that may not go on after a core that is not serving and was answered so, and a streamed
 *   body (see ACCEPTED).
 * - Rotation `spread` (instance `steady`): with the same N cores named, the i-th call starts at
 *   core i mod N, so N calls in a row start at N different cores.
 * - Counterexamples: `unfixedBreak` (every error of a connection taken as one that was never made)
 *   runs a POST twice; `unfixedAnswer503` (a request with a body going on after any 503) too. Each
 *   is reproduced by a test of the Routing module (see failover-check.sh).
 *
 * ACCEPTED (the code keeps it; failover_test.qnt shows each)
 * - A call that may not be repeated ends on the first core that may have run it: when that core
 *   died mid-call, the call fails though other cores serve. Provisioning and the Scheduler make it
 *   again; the browser is answered 502.
 * - Provisioning's calls and a request with a body end on a core that is not serving (its 502, 503
 *   or 504 does not say that it ran nothing, as a core's own 503 would read the same).
 * - A page ends on a core that is not serving and answered 502 or 504 (a proxy with no core
 *   behind it): the browser gets that answer. It goes on only after a 503 (router.ts
 *   `unexplainedRefusal`); only the Scheduler's calls go on after all three.
 * - A request with a body longer than the Router holds is sent to its first core only, even when
 *   that core refuses the connection: the Router starts sending the rest of the body, read from
 *   the browser, before the connection is made, so it cannot send all of it again.
 * - A call resolves the name once: a core added meanwhile is not asked by it, one removed
 *   meanwhile is tried and refuses the connection.
 * - While the named cores change, the rotation does not spread over them evenly.
 * - The model has one rotation for all calls; the code has one per pool (`poolAt`): the Router's,
 *   the Scheduler's and Provisioning's each take turns on their own, and each spreads alike. A
 *   name that does not resolve at all starts no round in the code; here a name standing for no
 *   core still counts one.
 *
 * ASSUMES
 * - A core's triggered operations never answer 502, 503 or 504 once they ran anything: those
 *   statuses come from a core that is not serving, or the proxy in front of it.
 * - A refusing core changed nothing (core-answers.ts `openingRefusal`).
 *
 * NOT COVERED
 * - What the operations do, the Families, Contexts and their checks; how a call is timed out.
 * - The client side of a browser (it may itself ask again).
 */
module failover {
  // ---- Parameters -----------------------------------------------------------------------------

  /** The cores of the pool, 0 .. NCORES-1: the order the name service answers them in. */
  const NCORES: int
  /** The calls made, each of one kind (`KINDS`). */
  const CALLS: Set[int]
  /** The kind of each call: "provisioning", "scheduler", "page", "post", "upload". */
  const KINDS: int -> str
  /** Whether the cores the pool's name stands for change: replicas added, named, unnamed. */
  const CHURN: bool
  /** The cores that serve throughout: never stopped, never changing their state. */
  const KEEPS_SERVING: Set[int]
  /** False: every error of a connection is taken as one that was never made (not the code). */
  const BREAK_IS_BROKEN: bool
  /** True: a request with a body goes on after any 503 (not the code). */
  const BODY_ON_ANY_503: bool

  pure val CORE_IDS: List[int] = range(0, NCORES)

  // ---- Policies, as the code decides (failover.ts) ---------------------------------------------

  type Policy = {
    /** Goes on after a core that answered it is not serving with 502 or 504 (core.ts `alsoWhenNotServing`). */
    onNotServing: bool,
    /** Goes on after a core that answered it is not serving with 503 (also router.ts `unexplainedRefusal`). */
    onNotServing503: bool,
    /** Goes on after a broken connection or no answer: the request has no body (`isBodiless`). */
    idempotent: bool,
    /** Goes on to the next core at all: the Router holds all of the body (`body.whole`). */
    whole: bool,
    /** A browser's request, which a core may answer with a 503 of its own after running it. */
    browser: bool,
  }

  pure def policyOf(kind: str): Policy =
    if (kind == "provisioning") { onNotServing: false, onNotServing503: false, idempotent: false, whole: true, browser: false }
    else if (kind == "scheduler") { onNotServing: true, onNotServing503: true, idempotent: false, whole: true, browser: false }
    else if (kind == "page") { onNotServing: false, onNotServing503: true, idempotent: true, whole: true, browser: true }
    else if (kind == "post") { onNotServing: false, onNotServing503: false, idempotent: false, whole: true, browser: true }
    else { onNotServing: false, onNotServing503: false, idempotent: false, whole: false, browser: true } // "upload"

  /** The rotation of `takingTurns`: the items starting at `round` mod their number. */
  pure def inTurn(items: List[int], round: int): List[int] =
    if (items.length() == 0) []
    else {
      val start = round % items.length()
      items.slice(start, items.length()).concat(items.slice(0, start))
    }

  // ---- State ------------------------------------------------------------------------------------

  type Call = {
    /** "idle", "trying" (cores still to try in `order`), "sent" (to `at`), "done". */
    phase: str,
    order: List[int],
    at: int,
    /** How it ended: "ran", "failed" (gave up on a core that may have run it), "notServed", "noCore". */
    outcome: str,
    /** The cores it arrived at, which may have run it. */
    arrived: Set[int],
    /** The cores it went on from. */
    passed: Set[int],
  }

  /** The cores the pool's name stands for now. */
  var named: Set[int]
  /** Each core's state: "down", "notServing", "refusing", "serving". */
  var cores: int -> str
  /** The rounds of the rotation so far. */
  var round: int
  /** The core each round started at, in order (a round of no cores adds none). */
  var starts: List[int]
  var calls: int -> Call
  /** How many times each call ran on a core. */
  var runs: int -> int

  pure val IDLE: Call = { phase: "idle", order: [], at: -1, outcome: "", arrived: Set(), passed: Set() }

  action init = all {
    named' = CORE_IDS.indices().map(i => i),
    cores' = CORE_IDS.indices().mapBy(_ => "serving"),
    round' = 0,
    starts' = [],
    calls' = CALLS.mapBy(_ => IDLE),
    runs' = CALLS.mapBy(_ => 0),
  }

  // ---- The calls (core.ts `call`, router.ts `passOn`) --------------------------------------------

  /** The call resolves the pool's name and takes the cores in turn; a streamed body only the first. */
  action start(c: int): bool = all {
    calls.get(c).phase == "idle",
    val inOrder = inTurn(CORE_IDS.select(i => named.contains(i)), round)
    val order = if (policyOf(KINDS.get(c)).whole) inOrder else inOrder.slice(0, min(1, inOrder.length()))
    all {
      calls' = calls.setBy(c, call => { ...call, phase: "trying", order: order }),
      round' = round + 1,
      starts' = if (inOrder.length() == 0) starts else starts.append(inOrder[0]),
    },
    named' = named, cores' = cores, runs' = runs,
  }

  pure def min(a: int, b: int): int = if (a < b) a else b

  /** The call goes on from its current core to the next, or ends with `outcome` when none is left. */
  pure def goOn(call: Call, from: int, outcome: str): Call =
    if (call.order.length() <= 1) { ...call, phase: "done", order: [], outcome: outcome, passed: call.passed.union(Set(from)) }
    else { ...call, phase: "trying", order: call.order.slice(1, call.order.length()), passed: call.passed.union(Set(from)) }

  /** No core was left to try: the pool's name stood for none, or each refused or was not there. */
  action noCoreLeft(c: int): bool = all {
    calls.get(c).phase == "trying",
    calls.get(c).order.length() == 0,
    calls' = calls.setBy(c, call => { ...call, phase: "done", outcome: "noCore" }),
    named' = named, cores' = cores, round' = round, starts' = starts, runs' = runs,
  }

  /** The call is made to the next core of its order; one not serving answers 503, or 502 or 504. */
  action connect(c: int): bool = {
    nondet answers503 = Set(true, false).oneOf()
    connectAnswering(c, answers503)
  }

  /** The call is made to the next core of its order; if that core is not serving, it answers 503 when `answers503`, else 502 or 504. */
  action connectAnswering(c: int, answers503: bool): bool = all {
    val call = calls.get(c)
    val policy = policyOf(KINDS.get(c))
    all {
      call.phase == "trying",
      call.order.length() > 0,
      val core = call.order[0]
      val state = cores.get(core)
      calls' = calls.set(c,
        if (state == "down") goOn(call, core, "noCore")                 // never connected
        else if (state == "refusing") goOn(call, core, "noCore")        // changed nothing
        else if (state == "notServing")
          if (if (answers503) policy.onNotServing503 else policy.onNotServing) goOn(call, core, "notServed")
          else { ...call, phase: "done", order: [], outcome: "notServed" }
        else { ...call, phase: "sent", at: core, arrived: call.arrived.union(Set(core)) }),
    },
    named' = named, cores' = cores, round' = round, starts' = starts, runs' = runs,
  }

  /** The core ran the call and answered it. */
  action answer(c: int): bool = all {
    calls.get(c).phase == "sent",
    cores.get(calls.get(c).at) != "down",
    calls' = calls.setBy(c, call => { ...call, phase: "done", order: [], outcome: "ran" }),
    runs' = runs.setBy(c, n => n + 1),
    named' = named, cores' = cores, round' = round, starts' = starts,
  }

  /** The core ran a browser's request, or part of it, and answered 503 of its own. */
  action answer503(c: int): bool = all {
    val call = calls.get(c)
    val policy = policyOf(KINDS.get(c))
    all {
      call.phase == "sent",
      policy.browser,
      cores.get(call.at) != "down",
      // A page may always be asked again (`unexplainedRefusal`); a body only in the unfixed variant.
      calls' = calls.set(c,
        if (policy.idempotent or (BODY_ON_ANY_503 and policy.whole)) goOn(call, call.at, "ran")
        else { ...call, phase: "done", order: [], outcome: "ran" }),
      runs' = runs.setBy(c, n => n + 1),
    },
    named' = named, cores' = cores, round' = round, starts' = starts,
  }

  /** The connection broke after the call was sent, or no answer came in time; the core may have run it. */
  action breakOff(c: int): bool = {
    nondet ran = Set(0, 1).oneOf()
    breakOffHaving(c, ran)
  }

  /** The connection broke after the core ran the call `ran` times (0 or 1). */
  action breakOffHaving(c: int, ran: int): bool = all {
    val call = calls.get(c)
    val policy = policyOf(KINDS.get(c))
    all {
      call.phase == "sent",
      runs' = runs.setBy(c, n => n + ran),
      calls' = calls.set(c,
        if (policy.idempotent or not(BREAK_IS_BROKEN)) goOn(call, call.at, "failed")
        else { ...call, phase: "done", order: [], outcome: "failed" }),
    },
    named' = named, cores' = cores, round' = round, starts' = starts,
  }

  // ---- The pool (the Cube) ------------------------------------------------------------------------

  /** A replica is added: it starts, and the name service names it; it may serve or refuse later. */
  action addReplica(core: int): bool = all {
    CHURN,
    cores.get(core) == "down",
    not(named.contains(core)),
    cores' = cores.set(core, "notServing"),
    named' = named, round' = round, starts' = starts, calls' = calls, runs' = runs,
  }

  /** The name service names a core that runs, or unnames one (a replica being removed). */
  action rename(core: int): bool = all {
    CHURN,
    named' = if (named.contains(core)) named.exclude(Set(core))
             else if (cores.get(core) != "down") named.union(Set(core)) else named,
    cores' = cores, round' = round, starts' = starts, calls' = calls, runs' = runs,
  }

  /** A core stops (removed, or died), named or not; one it was at work for breaks off. */
  action stop(core: int): bool = all {
    not(KEEPS_SERVING.contains(core)),
    cores.get(core) != "down",
    cores' = cores.set(core, "down"),
    named' = named, round' = round, starts' = starts, calls' = calls, runs' = runs,
  }

  /** A running core changes between serving, not serving and refusing the Family. */
  action change(core: int): bool = all {
    not(KEEPS_SERVING.contains(core)),
    cores.get(core) != "down",
    nondet state = Set("notServing", "refusing", "serving").oneOf()
    cores' = cores.set(core, state),
    named' = named, round' = round, starts' = starts, calls' = calls, runs' = runs,
  }

  action step = {
    nondet c = CALLS.oneOf()
    nondet core = CORE_IDS.indices().oneOf()
    any { start(c), noCoreLeft(c), connect(c), answer(c), answer503(c), breakOff(c), addReplica(core), rename(core), stop(core), change(core) }
  }

  // ---- Properties -----------------------------------------------------------------------------------

  pure def isIdempotent(c: int): bool = policyOf(KINDS.get(c)).idempotent

  /** A call went on from a core only when it never arrived there, unless it is idempotent. */
  val onlyWhenNotArrived: bool =
    CALLS.forall(c => isIdempotent(c) or calls.get(c).arrived.intersect(calls.get(c).passed) == Set())

  /** No call that is not idempotent ran twice. */
  val runsOnceUnlessIdempotent: bool = CALLS.forall(c => isIdempotent(c) or runs.get(c) <= 1)

  val safety: bool = onlyWhenNotArrived and runsOnceUnlessIdempotent

  /**
   * With some core serving throughout and named (`KEEPS_SERVING`, no churn), every call that ended
   * arrived at a core, but for one answered not serving that may not go on after it, and for a
   * streamed body, which is sent to its first core only (both accepted).
   */
  val reachesAServingCore: bool =
    CALLS.forall(c => calls.get(c).phase != "done" or calls.get(c).arrived != Set() or
      not(policyOf(KINDS.get(c)).whole) or
      (calls.get(c).outcome == "notServed" and not(policyOf(KINDS.get(c)).onNotServing)))


  /** With the same cores named all along, the i-th round started at core i mod their number. */
  val spread: bool = starts.indices().forall(i => starts[i] == i % NCORES)

  // ---- Witnesses: each holds in some state of a run, which shows that the case is reached -------

  val someCallWentOn: bool = CALLS.exists(c => calls.get(c).passed != Set())
  val someCallArrivedTwice: bool = CALLS.exists(c => calls.get(c).arrived.size() > 1)
  val someCallEndedWithoutCore: bool = CALLS.exists(c => calls.get(c).outcome == "noCore")
  val someCallFailedWhereItMayHaveRun: bool = CALLS.exists(c => calls.get(c).outcome == "failed")
  val someCallWentOnPastARemovedCore: bool =
    CALLS.exists(c => calls.get(c).passed.exists(core => not(named.contains(core)) and cores.get(core) == "down"))
  /** A page ended ended on a core that is not serving: it answered 502 or 504 (accepted). */
  val somePageEndedNotServed: bool =
    CALLS.exists(c => KINDS.get(c) == "page" and calls.get(c).outcome == "notServed")
}
