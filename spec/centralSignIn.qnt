// -*- mode: Bluespec; -*-
/**
 * How the Routing module finds a person's Family after central sign-in (#128, map #125).
 *
 * WHAT IT MODELS
 * - Logto: accounts and Organizations (customData.familyId, members with the role admin);
 *   Organization ids are never reused (`issued`).
 * - Registration: Logto's sign-up sends PostRegister once (may be lost, Logto does not retry);
 *   the core creates the Organization and posts family.created, retried until taken (never lost);
 *   the Receiver writes the Directory entry (BeingPrepared), Provisioning makes it Active.
 * - Life of a Family: Admins invited (the invitation may create the account) and removed (the
 *   last one too), suspend / resume, delete in two steps (entry marked Deleted, then the
 *   Organization deleted), as routing/src/delete-family.ts does.
 * - Central sign-in in two steps: Logto issues the ID token (its `organizations` claim frozen),
 *   then the Routing module lands the person (`landingOf`).
 * - The open choice of #128 as a variant `MAPPING`: Organization id -> Family id from the
 *   Directory (an index is just a query on the entries' orgId) or from Logto's customData.
 *
 * PROPOSED FLOW (instance centralSignIn_proposed; stories in centralSignIn_test.qnt)
 * - Look the Family up in the Directory (MAPPING = FromDirectory).
 * - Pages: InFamily -> redirect; Preparing / UnknownOrganization -> "wird vorbereitet", which asks
 *   again with the same claim (retry); SeveralFamilies -> chooser (choose); Unavailable -> notice;
 *   NoFamily -> "Reparieren" (repair: the core runs PostRegister once more, the person is signed
 *   out and signs in again for a fresh claim).
 * - Core change (CORE_SKIPS_MEMBERS): PostRegister for someone already in an Organization
 *   creates nothing. Without it, a repair while the first PostRegister is only slow, or an
 *   invitation while one is in flight, gives the person a second Family of their own.
 *
 * PROPERTIES (quint run --backend=typescript, 2 people, 2 Organization ids, 2 Family ids)
 *   holds in every variant:   landsWhereClaimed, activeFamilyIsFound, directoryAgreesWithLogto,
 *                             orgIdsUnique
 *   holds FromDirectory only: unknownMeansInFlight - an unknown Organization is always one whose
 *                             family.created is in flight, so it can be shown as Preparing.
 *                             FromLogto breaks it: markDeleted -> issueToken -> deleteOrganization
 *                             -> land finds no Organization, and cannot tell deleted from new.
 *   holds with CORE_SKIPS_MEMBERS only: registrationMakesOneFamily.
 *   violated everywhere, on purpose (findings, not bugs of the model):
 *     landsOnlyWhereAdmin  - issueToken -> removeAdmin -> land: a claim gone stale between the
 *                            token and the callback sends a removed Admin into the Family; the
 *                            core's own OIDC check is what refuses them.
 *     oneFamilyPerPerson   - an Admin invites someone who is Admin elsewhere; no part of the
 *                            system can refuse that, so the chooser page is needed.
 *   every action, page and Landing is witnessed (> 0 traces).
 *
 * WHAT IT DOES NOT COVER
 * - The core's own sign-in, its 12-hour session and sign-out (#129); the 403 the core answers.
 * - Databases, blobs, keys, the Scheduler; the Operator's command line beyond status changes.
 * - Failures of the Management API call in FromLogto (it is assumed to answer).
 * - What the pages look like, and how the Routing module makes the core run PostRegister again
 *   (an open question: Logto's webhook re-delivery, or a call of the core's /idp/events).
 * - Time: the window between issueToken and land is one step, however short it is in reality.
 *
 * RUN
 *   quint run centralSignIn.qnt --backend=typescript --main=centralSignIn_directory \
 *     --invariants landsWhereClaimed activeFamilyIsFound directoryAgreesWithLogto orgIdsUnique
 *   (and --main=centralSignIn_logto, --main=centralSignIn_proposed);
 *   quint test centralSignIn_test.qnt --backend=typescript --main=centralSignIn_test
 *   (and --main=centralSignIn_proposed_test). Update this spec before changing the code it grounds.
 */
module centralSignInTypes {

  // ---------------------------------------------------------------- ids (opaque)
  type Person     = str
  type OrgId      = str   // Logto Organization id
  type FamilyId   = str

  // ---------------------------------------------------------------- variants
  /** Where the Routing module looks up the Family of an Organization id. */
  type Mapping =
    | FromDirectory     // the Directory's entry with that organizationId (written on family.created)
    | FromLogto         // the Organization's customData.familyId (one Management API call)

  // ---------------------------------------------------------------- Logto
  /** One Logto Organization = one Family at the Identity Provider. */
  type Organization = {
    familyId: FamilyId,       // customData.familyId, set by the core when it creates it
    admins:   Set[Person],    // members with the role `admin`
    registeredBy: Person,     // ghost: whose PostRegister created it
  }

  type Logto = {
    accounts: Set[Person],               // users with a confirmed email
    orgs:     OrgId -> Organization,     // existing Organizations only
    issued:   Set[OrgId],                // every id ever given out: Logto never reuses one
  }

  // ---------------------------------------------------------------- Directory
  type FamilyStatus = Absent | BeingPrepared | Active | Suspended | Deleted

  type DirectoryEntry = {
    status: FamilyStatus,
    orgId:  str,               // "" while Absent
  }

  // ---------------------------------------------------------------- messages
  /** core -> Receiver, retried by the core until answered with 2xx: never lost. */
  type FamilyCreated = { familyId: FamilyId, orgId: OrgId }

  // ---------------------------------------------------------------- sign-in
  /** Where central sign-in sends the person. */
  type Landing =
    | InFamily(FamilyId)          // redirect to /<Family id>/
    | Preparing                   // Organization known, Family not active yet
    | Unavailable(FamilyId)       // Family suspended or deleted
    | NoFamily                    // the claim names no Organization
    | UnknownOrganization(OrgId)  // the claim names one, the mapping finds no Family
    | SeveralFamilies             // the "one Family per person" rule is broken

  /** What the last step was; lets an invariant check a landing in the state it was made in. */
  type Event =
    | Init
    | Land({ person: Person, claim: Set[OrgId], landing: Landing })
    | Created({ person: Person, wasMember: bool })
    | OtherStep(str)

  type SignIn =
    | SignedOut
    | TokenIssued(Set[OrgId])     // ID token's `organizations` claim, frozen at issue time
    | Landed({ claim: Set[OrgId], landing: Landing })   // the page keeps the claim it was shown with

}

module centralSignIn {
  import centralSignInTypes.*

  // ---------------------------------------------------------------- constants
  const PEOPLE:     Set[Person]
  const ORG_IDS:    Set[OrgId]     // pool Logto draws Organization ids from
  const FAMILY_IDS: Set[FamilyId]  // pool the core draws Family ids from
  const MAPPING:    Mapping
  /** Proposed core change: PostRegister for someone already in an Organization creates nothing. */
  const CORE_SKIPS_MEMBERS: bool

  // ---------------------------------------------------------------- state
  var logto:         Logto
  var postRegister:  Person -> int               // Logto -> core: copies in flight, each may be lost
  var familyCreated: Set[FamilyCreated]          // core -> Receiver, in flight until taken
  var directory:     FamilyId -> DirectoryEntry  // pre-populated with Absent for FAMILY_IDS
  var signIns:       Person -> SignIn            // pre-populated with SignedOut for PEOPLE
  // ghost state, for properties only
  var lostPostRegister: Set[Person]              // people whose PostRegister the core missed
  var lastEvent:        Event

  // ================================================================ functional layer

  /** The Organizations the person is an Admin of: what the ID token's claim says when issued. */
  pure def claimOf(l: Logto, p: Person): Set[OrgId] =
    l.orgs.keys().filter(o => l.orgs.get(o).admins.contains(p))

  pure def isAdminOf(l: Logto, d: FamilyId -> DirectoryEntry, p: Person, f: FamilyId): bool =
    val o = d.get(f).orgId
    l.orgs.keys().contains(o) and l.orgs.get(o).admins.contains(p)

  pure def familyIdsInUse(l: Logto): Set[FamilyId] =
    l.orgs.keys().map(o => l.orgs.get(o).familyId)

  /** The Directory's entries naming Organization `o` (the "index" is this query). */
  pure def directoryFamiliesOf(d: FamilyId -> DirectoryEntry, o: OrgId): Set[FamilyId] =
    d.keys().filter(f => d.get(f).status != Absent and d.get(f).orgId == o)

  /** The Family of Organization `o` under the chosen mapping, as a set of at most one id. */
  pure def familyOf(m: Mapping, l: Logto, d: FamilyId -> DirectoryEntry, o: OrgId): Set[FamilyId] =
    match m {
      | FromDirectory => directoryFamiliesOf(d, o)
      | FromLogto     => if (l.orgs.keys().contains(o)) Set(l.orgs.get(o).familyId) else Set()
    }

  pure def landingOfFamily(d: FamilyId -> DirectoryEntry, f: FamilyId): Landing =
    match d.get(f).status {
      | Absent        => Preparing          // only reachable FromLogto, before family.created
      | BeingPrepared => Preparing
      | Active        => InFamily(f)
      | Suspended     => Unavailable(f)
      | Deleted       => Unavailable(f)
    }

  /** Where central sign-in sends a person whose ID token claims `claim`. */
  pure def landingOf(m: Mapping, l: Logto, d: FamilyId -> DirectoryEntry, claim: Set[OrgId]): Landing =
    if (claim.size() == 0) NoFamily
    else if (claim.size() > 1) SeveralFamilies
    else
      val o = claim.getOnlyElement()
      val fs = familyOf(m, l, d, o)
      if (fs.size() == 0) UnknownOrganization(o)
      else landingOfFamily(d, fs.getOnlyElement())

  pure def hasToken(s: SignIn): bool = match s { | TokenIssued(_) => true | _ => false }
  pure def claimIn(s: SignIn): Set[OrgId] = match s { | TokenIssued(c) => c | Landed(l) => l.claim | _ => Set() }
  pure def landingIn(s: SignIn): Landing = match s { | Landed(l) => l.landing | _ => NoFamily }
  pure def isLanded(s: SignIn): bool = match s { | Landed(_) => true | _ => false }
  pure def isWaiting(l: Landing): bool =
    match l { | Preparing => true | UnknownOrganization(_) => true | _ => false }

  /** The Families the chooser page offers: those of the claimed Organizations the mapping finds. */
  pure def choicesOf(m: Mapping, l: Logto, d: FamilyId -> DirectoryEntry, claim: Set[OrgId]): Set[FamilyId] =
    claim.fold(Set(), (acc, o) => acc.union(familyOf(m, l, d, o)))

  // ================================================================ state machine

  action init = all {
    logto' = { accounts: Set(), orgs: Map(), issued: Set() },
    postRegister' = PEOPLE.mapBy(_ => 0),
    familyCreated' = Set(),
    directory' = FAMILY_IDS.mapBy(_ => { status: Absent, orgId: "" }),
    signIns' = PEOPLE.mapBy(_ => SignedOut),
    lostPostRegister' = Set(),
    lastEvent' = Init,
  }

  /** Logto's sign-up: the account exists with a confirmed email, PostRegister goes to the core. */
  action register(p: Person): bool = all {
    not(logto.accounts.contains(p)),
    logto' = { ...logto, accounts: logto.accounts.union(Set(p)) },
    postRegister' = postRegister.setBy(p, n => n + 1),
    familyCreated' = familyCreated, directory' = directory, signIns' = signIns,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("register"),
  }

  /** The core misses PostRegister (down, address refused); Logto does not retry. */
  action losePostRegister(p: Person): bool = all {
    postRegister.get(p) > 0,
    postRegister' = postRegister.setBy(p, n => n - 1),
    lostPostRegister' = lostPostRegister.union(Set(p)),
    logto' = logto, familyCreated' = familyCreated, directory' = directory, signIns' = signIns,
    lastEvent' = OtherStep("losePostRegister"),
  }

  /** The core draws a Family id, creates the Organization with the person as Admin, posts family.created. */
  action coreCreatesFamily(p: Person, o: OrgId, f: FamilyId): bool = all {
    postRegister.get(p) > 0,
    not(CORE_SKIPS_MEMBERS and claimOf(logto, p) != Set()),
    not(logto.issued.contains(o)),
    not(familyIdsInUse(logto).contains(f)),
    directory.get(f).status == Absent,
    logto' = { ...logto, orgs: logto.orgs.put(o, { familyId: f, admins: Set(p), registeredBy: p }),
                         issued: logto.issued.union(Set(o)) },
    postRegister' = postRegister.setBy(p, n => n - 1),
    familyCreated' = familyCreated.union(Set({ familyId: f, orgId: o })),
    directory' = directory, signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = Created({ person: p, wasMember: claimOf(logto, p) != Set() }),
  }

  /** With CORE_SKIPS_MEMBERS: the core takes PostRegister for a member and creates nothing. */
  action coreSkipsPostRegister(p: Person): bool = all {
    CORE_SKIPS_MEMBERS,
    postRegister.get(p) > 0,
    claimOf(logto, p) != Set(),
    postRegister' = postRegister.setBy(p, n => n - 1),
    logto' = logto, familyCreated' = familyCreated, directory' = directory, signIns' = signIns,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("coreSkipsPostRegister"),
  }

  /** The Receiver takes family.created and answers 2xx; a repeated delivery changes nothing. */
  action receive(f: FamilyId, o: OrgId): bool = all {
    familyCreated.contains({ familyId: f, orgId: o }),
    familyCreated' = familyCreated.exclude(Set({ familyId: f, orgId: o })),
    directory' = if (directory.get(f).status == Absent)
                   directory.set(f, { status: BeingPrepared, orgId: o })
                 else directory,
    logto' = logto, postRegister' = postRegister, signIns' = signIns,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("receive"),
  }

  /** Provisioning has created the Family's database, role and key: the Family is routed to. */
  action prepare(f: FamilyId): bool = all {
    directory.get(f).status == BeingPrepared,
    directory' = directory.setBy(f, e => { ...e, status: Active }),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("prepare"),
  }

  /** An Admin invites a person on the core's Admins page; the invitation may create the account. */
  action inviteAdmin(o: OrgId, p: Person): bool = all {
    logto.orgs.keys().contains(o),
    not(logto.orgs.get(o).admins.contains(p)),
    logto' = { ...logto, accounts: logto.accounts.union(Set(p)),
               orgs: logto.orgs.setBy(o, org => { ...org, admins: org.admins.union(Set(p)) }) },
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("inviteAdmin"),
  }

  /** An Admin is removed, on the Admins page or in Logto's console; the last one too. */
  action removeAdmin(o: OrgId, p: Person): bool = all {
    logto.orgs.keys().contains(o),
    logto.orgs.get(o).admins.contains(p),
    logto' = { ...logto, orgs: logto.orgs.setBy(o, org => { ...org, admins: org.admins.exclude(Set(p)) }) },
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("removeAdmin"),
  }

  action suspend(f: FamilyId): bool = all {
    directory.get(f).status == Active,
    directory' = directory.setBy(f, e => { ...e, status: Suspended }),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("suspend"),
  }

  action resume(f: FamilyId): bool = all {
    directory.get(f).status == Suspended,
    directory' = directory.setBy(f, e => { ...e, status: Active }),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("resume"),
  }

  /** Deleting, first step: the entry is marked deleted (database, blobs follow, not modelled). */
  action markDeleted(f: FamilyId): bool = all {
    Set(Active, Suspended).contains(directory.get(f).status),
    directory' = directory.setBy(f, e => { ...e, status: Deleted }),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("markDeleted"),
  }

  /** Deleting, last step: the Organization goes with its memberships; the accounts stay. */
  action deleteOrganization(f: FamilyId): bool = all {
    directory.get(f).status == Deleted,
    logto.orgs.keys().contains(directory.get(f).orgId),
    logto' = { ...logto, orgs: logto.orgs.keys().exclude(Set(directory.get(f).orgId))
                                  .mapBy(o => logto.orgs.get(o)) },
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("deleteOrganization"),
  }

  /** Central sign-in at Logto: the ID token's `organizations` claim is fixed now. */
  action issueToken(p: Person): bool = all {
    logto.accounts.contains(p),
    signIns' = signIns.set(p, TokenIssued(claimOf(logto, p))),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    directory' = directory, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("issueToken"),
  }

  /** The Routing module takes the callback and sends the person on, by the claim it was given. */
  action land(p: Person): bool = all {
    hasToken(signIns.get(p)),
    val landing = landingOf(MAPPING, logto, directory, claimIn(signIns.get(p)))
    all {
      signIns' = signIns.set(p, Landed({ claim: claimIn(signIns.get(p)), landing: landing })),
      logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
      directory' = directory, lostPostRegister' = lostPostRegister,
      lastEvent' = Land({ person: p, claim: claimIn(signIns.get(p)), landing: landing }),
    },
  }

  // ---------------------------------------------------------------- proposed flow (pages)

  /** "Deine Family wird vorbereitet" asks again, with the claim it was shown with. */
  action retry(p: Person): bool = all {
    isLanded(signIns.get(p)),
    isWaiting(landingIn(signIns.get(p))),
    val claim = claimIn(signIns.get(p))
    val landing = landingOf(MAPPING, logto, directory, claim)
    all {
      signIns' = signIns.set(p, Landed({ claim: claim, landing: landing })),
      logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
      directory' = directory, lostPostRegister' = lostPostRegister,
      lastEvent' = Land({ person: p, claim: claim, landing: landing }),
    },
  }

  /** The chooser page: the person picks one of the claimed Families. */
  action choose(p: Person, f: FamilyId): bool = all {
    isLanded(signIns.get(p)),
    landingIn(signIns.get(p)) == SeveralFamilies,
    choicesOf(MAPPING, logto, directory, claimIn(signIns.get(p))).contains(f),
    val claim = claimIn(signIns.get(p))
    val landing = landingOfFamily(directory, f)
    all {
      signIns' = signIns.set(p, Landed({ claim: claim, landing: landing })),
      logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
      directory' = directory, lostPostRegister' = lostPostRegister,
      lastEvent' = Land({ person: p, claim: claim, landing: landing }),
    },
  }

  /**
   * "Keine Family" -> Reparieren: the Routing module has the core run PostRegister for the
   * person once more, then signs them out so the next sign-in carries a fresh claim.
   */
  action repair(p: Person): bool = all {
    isLanded(signIns.get(p)),
    landingIn(signIns.get(p)) == NoFamily,
    claimOf(logto, p) == Set(),         // checked again now, not by the old claim
    postRegister' = postRegister.setBy(p, n => n + 1),
    signIns' = signIns.set(p, SignedOut),
    logto' = logto, familyCreated' = familyCreated, directory' = directory,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep("repair"),
  }

  action step = {
    nondet p = PEOPLE.oneOf()
    nondet o = ORG_IDS.oneOf()
    nondet f = FAMILY_IDS.oneOf()
    any {
      register(p), losePostRegister(p), coreCreatesFamily(p, o, f), coreSkipsPostRegister(p), receive(f, o),
      prepare(f), inviteAdmin(o, p), removeAdmin(o, p),
      suspend(f), resume(f), markDeleted(f), deleteOrganization(f),
      issueToken(p), land(p),
      retry(p), choose(p, f), repair(p),
    }
  }

  // ================================================================ properties

  /** A redirect into a Family goes to an active one whose Admin the person is at that moment. */
  val landsOnlyWhereAdmin: bool =
    match lastEvent {
      | Land(e) => match e.landing {
          | InFamily(f) => directory.get(f).status == Active and isAdminOf(logto, directory, e.person, f)
          | _ => true
        }
      | _ => true
    }

  /** A redirect into a Family goes to an active one whose Organization the ID token claimed. */
  val landsWhereClaimed: bool =
    match lastEvent {
      | Land(e) => match e.landing {
          | InFamily(f) => directory.get(f).status == Active and e.claim.contains(directory.get(f).orgId)
          | _ => true
        }
      | _ => true
    }

  /** A person whose single claimed Organization is an active Family is sent into it. */
  val activeFamilyIsFound: bool =
    match lastEvent {
      | Land(e) => match e.landing {
          | UnknownOrganization(o) =>
              not(directoryFamiliesOf(directory, o).exists(f => directory.get(f).status == Active))
          | _ => true
        }
      | _ => true
    }

  /** An Organization the mapping does not know is one whose family.created is still in flight. */
  val unknownMeansInFlight: bool =
    match lastEvent {
      | Land(e) => match e.landing {
          | UnknownOrganization(o) => familyCreated.exists(m => m.orgId == o)
          | _ => true
        }
      | _ => true
    }

  /** The product rule from #128: a person is an Admin of at most one Family. */
  val oneFamilyPerPerson: bool =
    PEOPLE.forall(p => claimOf(logto, p).size() <= 1)

  /** Every Directory entry in use names an Organization that names it back (until deleted). */
  val directoryAgreesWithLogto: bool =
    FAMILY_IDS.forall(f =>
      val e = directory.get(f)
      Set(BeingPrepared, Active, Suspended).contains(e.status) implies
        (logto.orgs.keys().contains(e.orgId) and logto.orgs.get(e.orgId).familyId == f))

  /** The Directory never holds two Families with one Organization. */
  val orgIdsUnique: bool =
    ORG_IDS.forall(o => directoryFamiliesOf(directory, o).size() <= 1)

  // ---------------------------------------------------------------- witnesses
  def landedWith(pred: Landing => bool): bool =
    match lastEvent { | Land(e) => pred(e.landing) | _ => false }

  val wInFamily: bool = landedWith(l => match l { | InFamily(_) => true | _ => false })
  val wPreparing: bool = landedWith(l => match l { | Preparing => true | _ => false })
  val wUnavailable: bool = landedWith(l => match l { | Unavailable(_) => true | _ => false })
  val wNoFamily: bool = landedWith(l => match l { | NoFamily => true | _ => false })
  val wUnknownOrg: bool = landedWith(l => match l { | UnknownOrganization(_) => true | _ => false })
  val wSeveral: bool = landedWith(l => match l { | SeveralFamilies => true | _ => false })
  /** No Family because PostRegister was lost: registered, never an Admin anywhere. */
  val wNoFamilyLostPostRegister: bool =
    match lastEvent { | Land(e) => e.landing == NoFamily and lostPostRegister.contains(e.person) | _ => false }
  /** An active Family with no Admin left (the last one removed itself). */
  val wOrphanedFamily: bool =
    FAMILY_IDS.exists(f => directory.get(f).status == Active and
      logto.orgs.keys().contains(directory.get(f).orgId) and logto.orgs.get(directory.get(f).orgId).admins == Set())

  def did(name: str): bool = lastEvent == OtherStep(name)
  val wRegister = did("register")
  val wLose = did("losePostRegister")
  val wCreate = match lastEvent { | Created(_) => true | _ => false }
  val wReceive = did("receive")
  val wPrepare = did("prepare")
  val wInvite = did("inviteAdmin")
  val wRemove = did("removeAdmin")
  val wSuspend = did("suspend")
  val wResume = did("resume")
  val wMarkDeleted = did("markDeleted")
  val wDeleteOrg = did("deleteOrganization")
  val wIssue = did("issueToken")
  val wRepair = did("repair")
  val wSkip = did("coreSkipsPostRegister")

  /** The core never creates a Family for someone who already is an Admin of one. */
  val registrationMakesOneFamily: bool =
    match lastEvent { | Created(e) => not(e.wasMember) | _ => true }

  /** A waiting page that turned into a redirect. */
  val wRetryIntoFamily: bool =
    match lastEvent { | Land(e) => match e.landing { | InFamily(_) => e.claim.size() == 1 and
        lostPostRegister.contains(e.person) == false | _ => false } | _ => false }
  /** Someone whose PostRegister was lost lands in a Family after the repair. */
  val wRepairedIntoFamily: bool =
    match lastEvent { | Land(e) => lostPostRegister.contains(e.person) and
        match e.landing { | InFamily(_) => true | _ => false } | _ => false }
  /** The chooser page sent someone into a Family. */
  val wChoseFamily: bool =
    match lastEvent { | Land(e) => e.claim.size() > 1 and
        match e.landing { | InFamily(_) => true | _ => false } | _ => false }
}

module centralSignIn_directory {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = false
  ).*
}

module centralSignIn_logto {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromLogto,
    CORE_SKIPS_MEMBERS = false
  ).*
}

/** The proposed flow: Directory lookup, and a core that skips PostRegister for members. */
module centralSignIn_proposed {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true
  ).*
}
