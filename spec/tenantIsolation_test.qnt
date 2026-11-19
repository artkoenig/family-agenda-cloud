// -*- mode: Bluespec; -*-
// Instances of the tenant isolation model (tenantIsolation.qnt) and scenarios of it, run by
// tenantIsolation-check.sh.

/** The code, 3 Families, 2 cores, requests and runs: `safety` must hold. */
module checked {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2", "f3"), CORES = Set(0, 1),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request },
                2 -> { family: "f1", kind: Run }, 3 -> { family: "f3", kind: Run }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2"), "f3" -> Set("h3")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 8,
    HEADER_TRUSTED = false, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = false
  ).* from "./tenantIsolation"
}

/** A Context the browser sent is passed on: `isolation` must fail. */
module headerTrusted {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 4,
    HEADER_TRUSTED = true, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = false
  ).* from "./tenantIsolation"
}

/** Sealed whatever the status: `noContextWhenInactive` must fail. */
module noStatusCheck {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 4,
    HEADER_TRUSTED = false, NO_STATUS_CHECK = true, TICKET_ANY_FAMILY = false
  ).* from "./tenantIsolation"
}

/** A Ticket for any Family the core has open: `ticketIsolation` must fail. */
module ticketAnyFamily {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 4,
    HEADER_TRUSTED = false, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = true
  ).* from "./tenantIsolation"
}

/** Scenarios of the code, one story each; `expect` checks where it stands. */
module scenarios {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request },
                2 -> { family: "f1", kind: Run }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 8,
    HEADER_TRUSTED = false, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = false
  ).* from "./tenantIsolation"

  action start = initWith(Set())

  /** Two Families' requests: each core use is its own Family's. */
  run eachToItsOwnFamilyTest =
    start
      .then(readStatus(0)).then(seal(0, "f1")).then(coreOpens(0, 0))
      .then(readStatus(1)).then(seal(1, "f2")).then(coreOpens(1, 0))
      .then(callPlugin(0, "f1")).then(callPlugin(1, "f2"))
      .expect(safety and noActAfterStop)

  /** The Router seals only for the Family in the path; another Family's Context is refused. */
  run noContextOfAnotherFamilyTest =
    start.then(readStatus(0)).then(seal(0, "f2").fail())

  /** A request arriving while its Family is suspended gets no Context (404). */
  run suspendedOnArrivalTest =
    start.then(suspend("f1")).then(readStatus(0))
      .expect(calls.get(0).phase == Ended and seals == Set() and safety)

  /** A request arriving while its Family is deleted gets no Context (404). */
  run deletedOnArrivalTest =
    start.then(markDeleted("f1")).then(readStatus(0))
      .expect(calls.get(0).phase == Ended and seals == Set())

  /** FINDING: suspended between the read and the seal: sealed, opened, worked on. */
  run suspendedInFlightTest =
    start.then(readStatus(0)).then(suspend("f1")).then(seal(0, "f1")).then(coreOpens(0, 0))
      .expect(safety and not(noActAfterStop))

  /** FINDING: deleted between the read and the seal: the entry read still held the secrets. */
  run deletedInFlightTest =
    start.then(readStatus(0)).then(markDeleted("f1")).then(seal(0, "f1")).then(coreOpens(0, 0))
      .expect(safety and someWorkAfterDelete)

  /** FINDING: a run keeps working after the delete closed the database; it is dropped only after. */
  run runOutlivesDeleteTest =
    start.then(readStatus(2)).then(seal(2, "f1")).then(coreOpens(2, 0))
      .then(markDeleted("f1")).then(closeDatabase("f1"))
      .then(coreWorks(2))
      .then(endCall(2)).then(tick).then(tick).then(coreCloses(0, "f1")).then(dropDatabase("f1"))
      .expect(databases.get("f1") == DbDropped and someWorkAfterDelete and safety)

  /** The database is not dropped while a core holds it open. */
  run noDropWhileOpenTest =
    start.then(readStatus(2)).then(seal(2, "f1")).then(coreOpens(2, 0))
      .then(markDeleted("f1")).then(closeDatabase("f1"))
      .then(dropDatabase("f1").fail())

  /** FINDING: a Family open in the core serves a new Context after its database was closed. */
  run openFamilyOutlivesCloseTest =
    start.then(readStatus(0)).then(seal(0, "f1")).then(coreOpens(0, 0))
      .then(readStatus(2)).then(seal(2, "f1"))
      .then(markDeleted("f1")).then(closeDatabase("f1"))
      .then(coreOpens(2, 0))
      .expect(isAtCore(calls.get(2).phase) and someWorkAfterDelete)

  /** FINDING: the proxy opens a suspended Family's hosts until its Ticket expires. */
  run ticketOutlivesSuspendTest =
    start.then(readStatus(0)).then(seal(0, "f1")).then(coreOpens(0, 0))
      .then(callPlugin(0, "f1")).then(suspend("f1"))
      .then(proxyConnects({ forFamily: "f1", secretsOf: "f1",
                            ticket: { family: "f1", hosts: Set("h1"), expiresAt: 3 } }, "h1"))
      .expect(someHostOpenedAfterStop and ticketIsolation)

  /** An expired Ticket opens nothing. */
  run expiredTicketTest =
    start.then(readStatus(0)).then(seal(0, "f1")).then(coreOpens(0, 0))
      .then(callPlugin(0, "f1")).then(tick).then(tick).then(tick)
      .then(proxyConnects({ forFamily: "f1", secretsOf: "f1",
                            ticket: { family: "f1", hosts: Set("h1"), expiresAt: 3 } }, "h1").fail())

  /** An expired Context is refused by the core. */
  run expiredContextRefusedTest =
    start.then(readStatus(0)).then(seal(0, "f1")).then(tick).then(tick).then(tick)
      .then(coreRefuses(0, 0)).expect(uses == Set() and calls.get(0).phase == Ended)
}

/** The counterexamples as stories: each broken rule of the code breaks its property. */
module headerTrustedRun {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 4,
    HEADER_TRUSTED = true, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = false
  ).* from "./tenantIsolation"

  run foreignContextPassedOnTest =
    initWith(Set()).then(readStatus(0)).then(seal(0, "f2")).then(coreOpens(0, 0))
      .expect(not(isolation))
}

module ticketAnyFamilyRun {
  import tenantIsolationTypes.* from "./tenantIsolation"
  import tenantIsolation(
    FAMILIES = Set("f1", "f2"), CORES = Set(0),
    CALLS = Map(0 -> { family: "f1", kind: Request }, 1 -> { family: "f2", kind: Request }),
    SOURCE_HOSTS = Map("f1" -> Set("h1"), "f2" -> Set("h2")),
    CONTEXT_LIFETIME = 2, TICKET_LIFETIME = 3, CORE_IDLE = 2, MAX_TIME = 4,
    HEADER_TRUSTED = false, NO_STATUS_CHECK = false, TICKET_ANY_FAMILY = true
  ).* from "./tenantIsolation"

  run ticketOfAnotherOpenFamilyTest =
    initWith(Set())
      .then(readStatus(0)).then(seal(0, "f1")).then(coreOpens(0, 0))
      .then(readStatus(1)).then(seal(1, "f2")).then(coreOpens(1, 0))
      .then(callPlugin(0, "f2"))
      .expect(not(ticketIsolation))
}
