// -*- mode: Bluespec; -*-
/**
 * How a request or a run finds its Family, and what it may reach once found (#149, map #145).
 * Code: routing/src/family-id.ts, request-routing.ts, router.ts, family-context.ts, scheduler.ts
 * (`giving`), family-status.ts, delete-family.ts, family-databases.ts; in the core (public repo):
 * apps/api/src/context/supplied-families.ts, egress/ticket.ts, egress/proxy*.ts.
 *
 * Note: #149 says "hostname to Family". There is no such lookup: every Family is served from one
 * host, and the Router reads the Family id from the first segment of the path (family-id.ts).
 *
 * WHAT IT MODELS
 * - The Directory (`directory`): each Family's status and whether its entry still holds its
 *   wrapped secrets (markDeleted destroys them). Provisioning suspends, resumes and deletes.
 * - Each Family's database (`databases`): Open, Closed (deletion set ALLOW_CONNECTIONS false: no
 *   new connection, existing ones live on) or Dropped (only once no core holds it open).
 * - A call (`calls`): a browser's request or a run of the Scheduler, for the Family named by its
 *   path or its job. Its atomic steps, each one what the Routing module does in one statement or
 *   one call: `readStatus` (one SELECT, no lock, never repeated), `seal` (unwrap the secrets of
 *   the entry that was read, seal the Context), `coreOpens` (the core opens the Family the Context
 *   names, or finds it open), `coreWorks` (it reads or writes the Family's database: any number of
 *   times, a run lasting up to 10 min), `callPlugin`, `endCall`.
 * - The cores' open Families (`coreOpen`): the core keeps a Family open, with its connection,
 *   until it was idle for CORE_IDLE. The code keys it by every field of the Context but the expiry;
 *   here those fields all follow from the Family, so the key is the Family.
 * - The shared plugin and its Egress Proxy (`pluginCalls`, `proxyOpened`): the core calls the
 *   plugin with the Source's secrets in the body and a Ticket it minted; the proxy opens a host
 *   from the Ticket alone (signature, expiry, hosts), asking no core and no Directory.
 * - Time (`clock`): rounds. A Context lives CONTEXT_LIFETIME (60 s + 30 s skew), a Ticket
 *   TICKET_LIFETIME (call timeout + 30 s).
 *
 * PROPERTIES (instance `checked` in tenantIsolation_test.qnt, run by tenantIsolation-check.sh)
 * Source files: tenantIsolation.qnt <-> the code files listed above; update the spec and re-run
 * the check before changing how the Routing module finds a Family, seals a Context or deletes.
 * - Safety `isolation`: every Context a call is handed, and every database and secrets a core
 *   used for it, belong to the Family the call named.
 * - Safety `noContextWhenInactive`: a Context is sealed only when the status read was Active.
 * - Safety `ticketIsolation`: a plugin call for Family A carries only A's secrets and a Ticket of
 *   A, and the proxy opens only hosts of A's Sources. (The proxy holds no database or secrets, so
 *   #149's literal rule, "a ticket never leads to another Family's database or secrets", holds by
 *   construction; this is the rule that can fail.)
 * - ACCEPTED violation `noActAfterStop` (instance `checked`): a core never works for a Family
 *   that is not Active. It does not hold: the status is read once, and a Context sealed before a
 *   suspend or delete, the core's open Family and a Ticket stay usable after it (see ACCEPTED).
 *   The check script asserts it stays violated; if it starts to hold, the window was closed.
 * - Counterexamples, each instance breaking one rule of the code: `headerTrusted` (a Context the
 *   browser sent is passed on) breaks `isolation`; `noStatusCheck` (sealed whatever the status)
 *   breaks `noContextWhenInactive`; `ticketAnyFamily` (a Ticket minted for another Family the core
 *   has open) breaks `ticketIsolation`.
 *
 * ACCEPTED (the code keeps it; ADR-0001 records why; tenantIsolation_test.qnt shows each)
 * - After a suspend: a request or run already past `readStatus` is still sealed, opened and
 *   worked on; the core keeps working for the Family until it was idle for CORE_IDLE; the proxy
 *   opens the Family's hosts until its Tickets expire.
 * - After a delete: the same, until the core lets go of the database; it is dropped only then.
 * - Why: the window is bounded (Context and Ticket lifetimes, CORE_IDLE), it only ever serves the
 *   Family's own data and hosts (`isolation`, `ticketIsolation` hold throughout), and closing it
 *   would need a status lock on every request or a call into every core on each status change.
 *
 * ASSUMES
 * - Only the Routing module and the cores hold the Context key; the Ticket key only the cores and
 *   proxies. Contexts and Tickets cannot be forged (sealing, HMAC) and are not captured by others.
 * - A Family's database stores its own Family id; the core refuses a Context whose database is
 *   another Family's (`family-id-differs`). Wrapped secrets unwrap only for their own Family (AAD).
 *
 * NOT COVERED
 * - Failover across cores (failover.qnt); the routes without a Family; creating a Family.
 * - A Context or Ticket replayed by someone who captured it; the cryptography itself.
 * - Old row versions, WAL and backups that still hold wrapped secrets after a delete.
 * - One browser origin for all Families (a script escaping one Family's pages; ADR-0001).
 */
module tenantIsolationTypes {
  // ---- Types ----------------------------------------------------------------------------------

  type FamilyId = str
  type CoreId = int
  type CallId = int
  type Host = str

  type Status = BeingPrepared | Active | Suspended | Deleted
  type DbState = DbOpen | DbClosed | DbDropped

  /** A Directory entry, as the Router or Scheduler reads it in one SELECT. */
  type Entry = { status: Status, hasSecrets: bool }

  /** A sealed Context. `db` and `secrets` name the Family they belong to. */
  type Context = { family: FamilyId, db: FamilyId, secrets: FamilyId, expiresAt: int }

  type CallKind = Request | Run

  type Phase =
    | Arrived
    | Checked(Entry)
    | Sealed(Context)
    | AtCore({ core: CoreId, ctx: Context })
    | Ended

  type Call = { family: FamilyId, kind: CallKind, phase: Phase }

  type Ticket = { family: FamilyId, hosts: Set[Host], expiresAt: int }

  type PluginCall = { forFamily: FamilyId, secretsOf: FamilyId, ticket: Ticket }

  /** A core worked with a Context for a call: the evidence the properties are stated over. */
  type Use = { callFamily: FamilyId, ctx: Context, status: Status }
}

module tenantIsolation {
  import tenantIsolationTypes.*

  // ---- Parameters -----------------------------------------------------------------------------

  const FAMILIES: Set[FamilyId]
  const CORES: Set[CoreId]
  /** Each call: the Family its path or job names, and whether a browser or the Scheduler made it. */
  const CALLS: CallId -> { family: FamilyId, kind: CallKind }
  /** The hosts of each Family's Sources. */
  const SOURCE_HOSTS: FamilyId -> Set[Host]
  const CONTEXT_LIFETIME: int
  const TICKET_LIFETIME: int
  const CORE_IDLE: int
  /** Rounds simulated: bounds `tick`. */
  const MAX_TIME: int
  /** True: the Router passes on a Context the browser sent (not the code: it drops the header). */
  const HEADER_TRUSTED: bool
  /** True: a Context is sealed whatever the status read (not the code: readinessOf). */
  const NO_STATUS_CHECK: bool
  /** True: the core mints a Ticket for any Family it has open (not the code: forFamily). */
  const TICKET_ANY_FAMILY: bool

  // ---- State ----------------------------------------------------------------------------------

  var directory: FamilyId -> Entry
  var databases: FamilyId -> DbState
  var calls: CallId -> Call
  /** Per core, the Families it holds open, with the round each was last used. */
  var coreOpen: CoreId -> (FamilyId -> int)
  var pluginCalls: Set[PluginCall]
  var proxyOpened: Set[{ forFamily: FamilyId, host: Host, status: Status }]
  var clock: int
  /** Ghost: every use of a Context by a core. */
  var uses: Set[Use]
  /** Ghost: the status read before each Context was sealed. */
  var seals: Set[{ family: FamilyId, readAs: Status }]

  // ---- Functional layer -----------------------------------------------------------------------

  /** request-routing.ts / scheduler.ts: only an Active Family is served. */
  pure def isServed(e: Entry): bool = e.status == Active

  /** family-context.ts: unwrap the secrets of the entry read, seal for its Family. */
  pure def canSeal(read: Entry, noStatusCheck: bool): bool =
    (noStatusCheck or isServed(read)) and read.hasSecrets

  pure def sealFor(f: FamilyId, now: int, lifetime: int): Context =
    { family: f, db: f, secrets: f, expiresAt: now + lifetime }

  /** The core opens the Family a Context names: unexpired, its database holds that Family's id,
   *  and it is open already or its database still takes connections. */
  pure def canOpen(ctx: Context, now: int, open: FamilyId -> int, db: DbState): bool = all {
    now <= ctx.expiresAt,
    ctx.db == ctx.family,
    open.keys().contains(ctx.family) or db == DbOpen,
  }

  pure def withoutKey(m: FamilyId -> int, k: FamilyId): FamilyId -> int =
    m.keys().exclude(Set(k)).mapBy(x => m.get(x))

  pure def mintTicket(f: FamilyId, hosts: FamilyId -> Set[Host], now: int, lifetime: int): Ticket =
    { family: f, hosts: hosts.get(f), expiresAt: now + lifetime }

  pure def ctxOf(p: Phase): Set[Context] = match p {
    | Sealed(ctx) => Set(ctx)
    | AtCore(a) => Set(a.ctx)
    | _ => Set()
  }

  pure val NO_ENTRY: Entry = { status: Deleted, hasSecrets: false }
  pure val NO_CONTEXT: Context = { family: "", db: "", secrets: "", expiresAt: -1 }

  pure def isChecked(p: Phase): bool = match p { | Checked(_) => true | _ => false }
  pure def isSealed(p: Phase): bool = match p { | Sealed(_) => true | _ => false }
  pure def isAtCore(p: Phase): bool = match p { | AtCore(_) => true | _ => false }
  pure def readOf(p: Phase): Entry = match p { | Checked(e) => e | _ => NO_ENTRY }
  pure def sealedOf(p: Phase): Context = match p { | Sealed(ctx) => ctx | _ => NO_CONTEXT }
  pure def atCoreOf(p: Phase): { core: CoreId, ctx: Context } =
    match p { | AtCore(a) => a | _ => { core: -1, ctx: NO_CONTEXT } }

  pure def coreOf(p: Phase): Set[CoreId] = match p {
    | AtCore(a) => Set(a.core)
    | _ => Set()
  }

  // ---- Actions --------------------------------------------------------------------------------

  action init: bool = {
    nondet prepared = FAMILIES.powerset().oneOf()
    initWith(prepared)
  }

  /** Every Family Active but those still being prepared. */
  action initWith(prepared: Set[FamilyId]): bool = {
    all {
      directory' = FAMILIES.mapBy(f =>
        { status: if (prepared.contains(f)) BeingPrepared else Active, hasSecrets: true }),
      databases' = FAMILIES.mapBy(_ => DbOpen),
      calls' = CALLS.keys().mapBy(c => { family: CALLS.get(c).family, kind: CALLS.get(c).kind, phase: Arrived }),
      coreOpen' = CORES.mapBy(_ => Map()),
      pluginCalls' = Set(),
      proxyOpened' = Set(),
      clock' = 0,
      uses' = Set(),
      seals' = Set(),
    }
  }

  action unchangedRouting: bool = all {
    calls' = calls, coreOpen' = coreOpen, pluginCalls' = pluginCalls, proxyOpened' = proxyOpened,
    uses' = uses, seals' = seals,
  }

  action setPhase(c: CallId, p: Phase): bool =
    calls' = calls.set(c, { ...calls.get(c), phase: p })

  /** One SELECT of the entry; nothing served when it is not Active. */
  action readStatus(c: CallId): bool = val read = directory.get(calls.get(c).family) all {
    calls.get(c).phase == Arrived,
    setPhase(c, if (NO_STATUS_CHECK or isServed(read)) Checked(read) else Ended),
    directory' = directory, databases' = databases, coreOpen' = coreOpen,
    pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, uses' = uses, seals' = seals,
  }

  /** Seal from the entry read; with HEADER_TRUSTED, a browser's Context of any Family is passed on. */
  action seal(c: CallId, sealedFor: FamilyId): bool = {
    val read = readOf(calls.get(c).phase)
    all {
      isChecked(calls.get(c).phase),
      canSeal(read, NO_STATUS_CHECK),
      sealedFor == calls.get(c).family or (HEADER_TRUSTED and calls.get(c).kind == Request),
      setPhase(c, Sealed(sealFor(sealedFor, clock, CONTEXT_LIFETIME))),
      seals' = seals.union(Set({ family: calls.get(c).family, readAs: read.status })),
      directory' = directory, databases' = databases, coreOpen' = coreOpen,
      pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, uses' = uses,
    }
  }

  def useOf(c: CallId, ctx: Context): Use =
    { callFamily: calls.get(c).family, ctx: ctx, status: directory.get(ctx.family).status }

  /** The core opens the Context's Family. */
  action coreOpens(c: CallId, core: CoreId): bool = {
    val ctx = sealedOf(calls.get(c).phase)
    all {
      isSealed(calls.get(c).phase),
      canOpen(ctx, clock, coreOpen.get(core), databases.get(ctx.db)),
      setPhase(c, AtCore({ core: core, ctx: ctx })),
      coreOpen' = coreOpen.setBy(core, m => m.put(ctx.family, clock)),
      uses' = uses.union(Set(useOf(c, ctx))),
      directory' = directory, databases' = databases,
      pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, seals' = seals,
    }
  }

  /** The core refuses the Context (expired, another Family's database, no connection): 4xx/5xx. */
  action coreRefuses(c: CallId, core: CoreId): bool = {
    val ctx = sealedOf(calls.get(c).phase)
    all {
      isSealed(calls.get(c).phase),
      not(canOpen(ctx, clock, coreOpen.get(core), databases.get(ctx.db))),
      setPhase(c, Ended),
      directory' = directory, databases' = databases, coreOpen' = coreOpen,
      pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, uses' = uses, seals' = seals,
    }
  }

  /** The core reads or writes the Family's database for the call, on the connection it holds. */
  action coreWorks(c: CallId): bool = {
    val a = atCoreOf(calls.get(c).phase)
    all {
      isAtCore(calls.get(c).phase),
      coreOpen' = coreOpen.setBy(a.core, m => m.put(a.ctx.family, clock)),
      uses' = uses.union(Set(useOf(c, a.ctx))),
      directory' = directory, databases' = databases, calls' = calls,
      pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, seals' = seals,
    }
  }

  /** The core calls the shared plugin: the Source's secrets from the Family's database, a Ticket. */
  action callPlugin(c: CallId, ticketFor: FamilyId): bool = {
    val a = atCoreOf(calls.get(c).phase)
    all {
      isAtCore(calls.get(c).phase),
      ticketFor == a.ctx.family
        or (TICKET_ANY_FAMILY and coreOpen.get(a.core).keys().contains(ticketFor)),
      pluginCalls' = pluginCalls.union(Set({
        forFamily: calls.get(c).family,
        secretsOf: a.ctx.db,
        ticket: mintTicket(ticketFor, SOURCE_HOSTS, clock, TICKET_LIFETIME),
      })),
      directory' = directory, databases' = databases, calls' = calls, coreOpen' = coreOpen,
      proxyOpened' = proxyOpened, clock' = clock, uses' = uses, seals' = seals,
    }
  }

  action endCall(c: CallId): bool = all {
    isAtCore(calls.get(c).phase),
    setPhase(c, Ended),
    directory' = directory, databases' = databases, coreOpen' = coreOpen,
    pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, uses' = uses, seals' = seals,
  }

  /** The proxy opens a host from the Ticket alone. */
  action proxyConnects(pc: PluginCall, h: Host): bool = all {
    pluginCalls.contains(pc),
    clock < pc.ticket.expiresAt,
    pc.ticket.hosts.contains(h),
    proxyOpened' = proxyOpened.union(Set({ forFamily: pc.forFamily, host: h,
                                           status: directory.get(pc.forFamily).status })),
    directory' = directory, databases' = databases, calls' = calls, coreOpen' = coreOpen,
    pluginCalls' = pluginCalls, clock' = clock, uses' = uses, seals' = seals,
  }

  action proxyConnectsAny(h: Host): bool = all {
    pluginCalls != Set(),
    nondet pc = pluginCalls.oneOf()
    proxyConnects(pc, h),
  }

  /** The core closes a Family idle for CORE_IDLE that no call of it is working on. */
  action coreCloses(core: CoreId, f: FamilyId): bool = all {
    coreOpen.get(core).keys().contains(f),
    clock - coreOpen.get(core).get(f) >= CORE_IDLE,
    not(CALLS.keys().exists(c => coreOf(calls.get(c).phase).contains(core)
                                 and ctxOf(calls.get(c).phase).exists(x => x.family == f))),
    coreOpen' = coreOpen.setBy(core, m => withoutKey(m, f)),
    directory' = directory, databases' = databases, calls' = calls,
    pluginCalls' = pluginCalls, proxyOpened' = proxyOpened, clock' = clock, uses' = uses, seals' = seals,
  }

  action changeStatus(f: FamilyId, e: Entry): bool = all {
    directory' = directory.set(f, e),
    databases' = databases, clock' = clock, unchangedRouting,
  }

  action activate(f: FamilyId): bool = all {
    directory.get(f).status == BeingPrepared,
    changeStatus(f, { ...directory.get(f), status: Active }),
  }

  /** family-status.ts: changes the status; revokes no Context, closes nothing. */
  action suspend(f: FamilyId): bool = all {
    directory.get(f).status == Active,
    changeStatus(f, { ...directory.get(f), status: Suspended }),
  }

  action resume(f: FamilyId): bool = all {
    directory.get(f).status == Suspended,
    changeStatus(f, { ...directory.get(f), status: Active }),
  }

  /** delete-family.ts, first step: markDeleted destroys the wrapped secrets. */
  action markDeleted(f: FamilyId): bool = all {
    directory.get(f).status != Deleted,
    changeStatus(f, { status: Deleted, hasSecrets: false }),
  }

  /** family-databases.ts: ALLOW_CONNECTIONS false. */
  action closeDatabase(f: FamilyId): bool = all {
    directory.get(f).status == Deleted,
    databases.get(f) == DbOpen,
    databases' = databases.set(f, DbClosed),
    directory' = directory, clock' = clock, unchangedRouting,
  }

  /** family-databases.ts: DROP DATABASE once no connection is left; it ends none. */
  action dropDatabase(f: FamilyId): bool = all {
    databases.get(f) == DbClosed,
    CORES.forall(k => not(coreOpen.get(k).keys().contains(f))),
    databases' = databases.set(f, DbDropped),
    directory' = directory, clock' = clock, unchangedRouting,
  }

  action tick: bool = all {
    clock < MAX_TIME,
    clock' = clock + 1,
    directory' = directory, databases' = databases, unchangedRouting,
  }

  action step: bool = {
    nondet c = CALLS.keys().oneOf()
    nondet f = FAMILIES.oneOf()
    nondet core = CORES.oneOf()
    nondet h = FAMILIES.map(x => SOURCE_HOSTS.get(x)).flatten().oneOf()
    any {
      readStatus(c),
      seal(c, f),
      coreOpens(c, core),
      coreRefuses(c, core),
      coreWorks(c),
      callPlugin(c, f),
      endCall(c),
      proxyConnectsAny(h),
      coreCloses(core, f),
      activate(f),
      suspend(f),
      resume(f),
      markDeleted(f),
      closeDatabase(f),
      dropDatabase(f),
      tick,
    }
  }

  // ---- Properties -----------------------------------------------------------------------------

  /** Every Context a call holds, and every one a core used for it, is its own Family's. */
  val isolation: bool = and {
    CALLS.keys().forall(c => ctxOf(calls.get(c).phase).forall(ctx =>
      ctx.family == calls.get(c).family and ctx.db == ctx.family and ctx.secrets == ctx.family)),
    uses.forall(u => u.ctx.family == u.callFamily and u.ctx.db == u.callFamily
                     and u.ctx.secrets == u.callFamily),
  }

  val noContextWhenInactive: bool = seals.forall(s => s.readAs == Active)

  val ticketIsolation: bool = and {
    pluginCalls.forall(pc => pc.secretsOf == pc.forFamily and pc.ticket.family == pc.forFamily
                             and pc.ticket.hosts == SOURCE_HOSTS.get(pc.forFamily)),
    proxyOpened.forall(o => SOURCE_HOSTS.get(o.forFamily).contains(o.host)),
  }

  val safety: bool = isolation and noContextWhenInactive and ticketIsolation

  /** The finding: a core works only for an Active Family. Does not hold (see header). */
  val noActAfterStop: bool = uses.forall(u => u.status == Active)

  // ---- Witnesses (reachability: each should be reached in some traces) -------------------------

  val someCallRefused: bool = CALLS.keys().exists(c => calls.get(c).phase == Ended) and uses == Set()
  val someCoreWorked: bool = uses != Set()
  val somePluginCalled: bool = pluginCalls != Set()
  val someHostOpened: bool = proxyOpened != Set()
  val someCoreClosed: bool =
    uses != Set() and CORES.forall(k => coreOpen.get(k) == Map())
  val someDatabaseDropped: bool = FAMILIES.exists(f => databases.get(f) == DbDropped)
  val someWorkAfterSuspend: bool = uses.exists(u => u.status == Suspended)
  val someWorkAfterDelete: bool = uses.exists(u => u.status == Deleted)
  val someHostOpenedAfterStop: bool = proxyOpened.exists(o => o.status != Active)
}
