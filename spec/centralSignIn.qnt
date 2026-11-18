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
 * - Life of a Family: Admins invited in two steps (the core sends, the invitee accepts; accepting
 *   may create the account), added past the core in Logto's console, and removed (the last one too), suspend / resume, delete in two steps (entry marked Deleted, then the
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
 * - Core change (INVITE_CHECK = AtSendAndAccept): someone who already is an Admin of a Family is
 *   not invited into another, neither when the invitation is sent nor when it is accepted.
 *   Checking at sending only (AtSend) is not enough: invited, then registered, then accepted.
 *   Logto's console stays past every check; SeveralFamilies -> chooser is its fallback.
 *   Assumes the core's two checks and its PostRegister run one at a time per person.
 *
 * PROPERTIES (10000 sampled runs of 30 steps, seed 42; 2 people, 2 Organization ids, 2 Family ids)
 *   holds in every variant:   landsWhereClaimed, activeFamilyIsFound, directoryAgreesWithLogto,
 *                             orgIdsUnique
 *   holds FromDirectory only: unknownMeansInFlight - an unknown Organization is always one whose
 *                             family.created is in flight, so it can be shown as Preparing.
 *                             FromLogto breaks it: markDeleted -> issueToken -> deleteOrganization
 *                             -> land finds no Organization, and cannot tell deleted from new.
 *   holds with CORE_SKIPS_MEMBERS only: registrationMakesOneFamily.
 *   holds with INVITE_CHECK = AtSendAndAccept only: oneFamilyUnlessConsole.
 *   violated everywhere, on purpose (findings, not bugs of the model):
 *     landsOnlyWhereAdmin  - issueToken -> removeAdmin -> land: a claim gone stale between the
 *                            token and the callback sends a removed Admin into the Family; the
 *                            core's own OIDC check is what refuses them.
 *     oneFamilyPerPerson   - with the core changes, only through Logto's console.
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
 * RUN (quint 0.33.1; the Rust backend is fetched from GitHub, so use the TypeScript one)
 *   quint run centralSignIn.qnt --backend=typescript --main=centralSignIn_directory \
 *     --max-steps=30 --max-samples=10000 --seed=42 \
 *     --invariants landsWhereClaimed activeFamilyIsFound directoryAgreesWithLogto orgIdsUnique
 *   (and --main=centralSignIn_logto, centralSignIn_proposed, centralSignIn_proposedSendOnly). With --seed, --max-samples
 *   defaults to 1, so always pass it. "No violation" is a sampling result, not a proof.
 *   quint test centralSignIn_test.qnt --backend=typescript --main=centralSignIn_test
 *   (and --main=centralSignIn_proposed_test, --main=centralSignIn_sendOnly_test).
 *   Update this spec before changing the code it grounds.
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

  /** An invitation Logto has mailed and the invitee has not accepted yet. */
  type Invitation = { orgId: OrgId, invitee: Person }

  type Logto = {
    accounts:    Set[Person],            // users with a confirmed email
    orgs:        OrgId -> Organization,  // existing Organizations only
    issued:      Set[OrgId],             // every id ever given out: Logto never reuses one
    invitations: Set[Invitation],        // pending, sent from the core's Admins page
    consoleAdded: Set[Person],           // ghost: made a member in Logto's console, past the core
  }

  /** Where the core refuses to invite someone who already is an Admin of a Family. */
  type InviteCheck =
    | NoCheck            // core 0.8.0: anyone is invited
    | AtSend             // the Admins page refuses the invitation
    | AtSendAndAccept    // ... and accepting it is refused as well

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

  /** The steps that are neither a landing nor the core creating a Family. */
  type StepKind =
    | DidRegister
    | DidLosePostRegister
    | DidCoreSkipsPostRegister
    | DidReceive
    | DidPrepare
    | DidSendInvitation
    | DidAcceptInvitation
    | DidConsoleAddMember
    | DidRemoveAdmin
    | DidSuspend
    | DidResume
    | DidMarkDeleted
    | DidDeleteOrganization
    | DidIssueToken
    | DidRepair

  /** What the last step was; lets an invariant check a landing in the state it was made in. */
  type Event =
    | Init
    | Land({ person: Person, claim: Set[OrgId], landing: Landing })
    | Created({ person: Person, wasMember: bool })
    | OtherStep(StepKind)

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
  /** Proposed core change: no invitation for someone who already is an Admin of a Family. */
  const INVITE_CHECK: InviteCheck

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
      if (fs.size() != 1) UnknownOrganization(o)   // > 1 cannot happen: see orgIdsUnique
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

  // ---------------------------------------------------------------- next-state functions

  /** The core's Organization for a new Family, with the person as its only Admin. */
  pure def withNewOrganization(l: Logto, p: Person, o: OrgId, f: FamilyId): Logto =
    { ...l, orgs: l.orgs.put(o, { familyId: f, admins: Set(p), registeredBy: p }),
            issued: l.issued.union(Set(o)) }

  /** Whether the core may create a Family `f` with Organization `o` for `p`'s PostRegister. */
  pure def canCreateFamily(skipsMembers: bool, l: Logto, d: FamilyId -> DirectoryEntry,
                           pending: Person -> int, p: Person, o: OrgId, f: FamilyId): bool = and {
    pending.get(p) > 0,
    not(skipsMembers and claimOf(l, p) != Set()),
    not(l.issued.contains(o)),
    not(familyIdsInUse(l).contains(f)),
    d.get(f).status == Absent,
  }

  /** The Receiver's answer to family.created: a new entry, or nothing for a repeated delivery. */
  pure def withReceived(d: FamilyId -> DirectoryEntry, f: FamilyId, o: OrgId): FamilyId -> DirectoryEntry =
    if (d.get(f).status == Absent) d.set(f, { status: BeingPrepared, orgId: o }) else d

  pure def withStatus(d: FamilyId -> DirectoryEntry, f: FamilyId, s: FamilyStatus): FamilyId -> DirectoryEntry =
    d.setBy(f, e => { ...e, status: s })

  /** Whether the core's check lets `p` into another Family at this stage of the invitation. */
  pure def inviteAllowed(check: InviteCheck, atAccept: bool, l: Logto, p: Person): bool =
    val member = claimOf(l, p) != Set()
    match check {
      | NoCheck         => true
      | AtSend          => atAccept or not(member)
      | AtSendAndAccept => not(member)
    }

  pure def canSendInvitation(check: InviteCheck, l: Logto, o: OrgId, p: Person): bool = and {
    l.orgs.keys().contains(o),
    not(l.orgs.get(o).admins.contains(p)),
    not(l.invitations.contains({ orgId: o, invitee: p })),
    inviteAllowed(check, false, l, p),
  }

  pure def withInvitation(l: Logto, o: OrgId, p: Person): Logto =
    { ...l, invitations: l.invitations.union(Set({ orgId: o, invitee: p })) }

  /** Accepting needs the invitation and its Organization; the core may check once more. */
  pure def canAcceptInvitation(check: InviteCheck, l: Logto, o: OrgId, p: Person): bool = and {
    l.invitations.contains({ orgId: o, invitee: p }),
    l.orgs.keys().contains(o),
    inviteAllowed(check, true, l, p),
  }

  /** An Admin by invitation: a member, with an account made by the invitation if needed. */
  pure def withAdmin(l: Logto, o: OrgId, p: Person): Logto =
    { ...l, accounts: l.accounts.union(Set(p)),
            orgs: l.orgs.setBy(o, org => { ...org, admins: org.admins.union(Set(p)) }),
            invitations: l.invitations.exclude(Set({ orgId: o, invitee: p })) }

  /** The Operator (or anyone with console access) makes `p` a member in Logto's console. */
  pure def withConsoleMember(l: Logto, o: OrgId, p: Person): Logto =
    { ...withAdmin(l, o, p), consoleAdded: l.consoleAdded.union(Set(p)) }

  pure def withoutAdmin(l: Logto, o: OrgId, p: Person): Logto =
    { ...l, orgs: l.orgs.setBy(o, org => { ...org, admins: org.admins.exclude(Set(p)) }) }

  /** Logto without the Organization and its memberships; the accounts stay. */
  pure def withoutOrganization(l: Logto, o: OrgId): Logto =
    { ...l, orgs: l.orgs.keys().exclude(Set(o)).mapBy(k => l.orgs.get(k)),
            invitations: l.invitations.filter(i => i.orgId != o) }

  // ================================================================ state machine

  action init = all {
    logto' = { accounts: Set(), orgs: Map(), issued: Set(), invitations: Set(), consoleAdded: Set() },
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
    lastEvent' = OtherStep(DidRegister),
  }

  /** The core misses PostRegister (down, address refused); Logto does not retry. */
  action losePostRegister(p: Person): bool = all {
    postRegister.get(p) > 0,
    postRegister' = postRegister.setBy(p, n => n - 1),
    lostPostRegister' = lostPostRegister.union(Set(p)),
    logto' = logto, familyCreated' = familyCreated, directory' = directory, signIns' = signIns,
    lastEvent' = OtherStep(DidLosePostRegister),
  }

  /** The core draws a Family id, creates the Organization with the person as Admin, posts family.created. */
  action coreCreatesFamily(p: Person, o: OrgId, f: FamilyId): bool = all {
    canCreateFamily(CORE_SKIPS_MEMBERS, logto, directory, postRegister, p, o, f),
    logto' = withNewOrganization(logto, p, o, f),
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
    lastEvent' = OtherStep(DidCoreSkipsPostRegister),
  }

  /** The Receiver takes family.created and answers 2xx; a repeated delivery changes nothing. */
  action receive(f: FamilyId, o: OrgId): bool = all {
    familyCreated.contains({ familyId: f, orgId: o }),
    familyCreated' = familyCreated.exclude(Set({ familyId: f, orgId: o })),
    directory' = withReceived(directory, f, o),
    logto' = logto, postRegister' = postRegister, signIns' = signIns,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidReceive),
  }

  /** Provisioning has created the Family's database, role and key: the Family is routed to. */
  action prepare(f: FamilyId): bool = all {
    directory.get(f).status == BeingPrepared,
    directory' = withStatus(directory, f, Active),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidPrepare),
  }

  /** An Admin invites a person on the core's Admins page; Logto mails the invitation. */
  action sendInvitation(o: OrgId, p: Person): bool = all {
    canSendInvitation(INVITE_CHECK, logto, o, p),
    logto' = withInvitation(logto, o, p),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidSendInvitation),
  }

  /** The invitee follows the link (one-time token) and becomes an Admin; it may create the account. */
  action acceptInvitation(o: OrgId, p: Person): bool = all {
    canAcceptInvitation(INVITE_CHECK, logto, o, p),
    logto' = withAdmin(logto, o, p),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidAcceptInvitation),
  }

  /** A member added in Logto's console: no check of the core is in the way. */
  action consoleAddMember(o: OrgId, p: Person): bool = all {
    logto.orgs.keys().contains(o),
    not(logto.orgs.get(o).admins.contains(p)),
    logto' = withConsoleMember(logto, o, p),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidConsoleAddMember),
  }

  /** An Admin is removed, on the Admins page or in Logto's console; the last one too. */
  action removeAdmin(o: OrgId, p: Person): bool = all {
    logto.orgs.keys().contains(o),
    logto.orgs.get(o).admins.contains(p),
    logto' = withoutAdmin(logto, o, p),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidRemoveAdmin),
  }

  action suspend(f: FamilyId): bool = all {
    directory.get(f).status == Active,
    directory' = withStatus(directory, f, Suspended),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidSuspend),
  }

  action resume(f: FamilyId): bool = all {
    directory.get(f).status == Suspended,
    directory' = withStatus(directory, f, Active),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidResume),
  }

  /** Deleting, first step: the entry is marked deleted (database, blobs follow, not modelled). */
  action markDeleted(f: FamilyId): bool = all {
    Set(Active, Suspended).contains(directory.get(f).status),
    directory' = withStatus(directory, f, Deleted),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidMarkDeleted),
  }

  /** Deleting, last step: the Organization goes with its memberships; the accounts stay. */
  action deleteOrganization(f: FamilyId): bool = all {
    directory.get(f).status == Deleted,
    logto.orgs.keys().contains(directory.get(f).orgId),
    logto' = withoutOrganization(logto, directory.get(f).orgId),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidDeleteOrganization),
  }

  /** Central sign-in at Logto: the ID token's `organizations` claim is fixed now. */
  action issueToken(p: Person): bool = all {
    logto.accounts.contains(p),
    signIns' = signIns.set(p, TokenIssued(claimOf(logto, p))),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    directory' = directory, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidIssueToken),
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
    lastEvent' = OtherStep(DidRepair),
  }

  action step = {
    nondet p = PEOPLE.oneOf()
    nondet o = ORG_IDS.oneOf()
    nondet f = FAMILY_IDS.oneOf()
    any {
      register(p), losePostRegister(p), coreCreatesFamily(p, o, f), coreSkipsPostRegister(p), receive(f, o),
      prepare(f), sendInvitation(o, p), acceptInvitation(o, p), consoleAddMember(o, p), removeAdmin(o, p),
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

  def did(k: StepKind): bool = lastEvent == OtherStep(k)
  val wRegister = did(DidRegister)
  val wLose = did(DidLosePostRegister)
  val wCreate = match lastEvent { | Created(_) => true | _ => false }
  val wReceive = did(DidReceive)
  val wPrepare = did(DidPrepare)
  val wSendInvitation = did(DidSendInvitation)
  val wAcceptInvitation = did(DidAcceptInvitation)
  val wConsoleAdd = did(DidConsoleAddMember)

  /** The rule of #128, except where someone went past the core in Logto's console. */
  val oneFamilyUnlessConsole: bool =
    PEOPLE.forall(p => claimOf(logto, p).size() <= 1 or logto.consoleAdded.contains(p))
  val wRemove = did(DidRemoveAdmin)
  val wSuspend = did(DidSuspend)
  val wResume = did(DidResume)
  val wMarkDeleted = did(DidMarkDeleted)
  val wDeleteOrg = did(DidDeleteOrganization)
  val wIssue = did(DidIssueToken)
  val wRepair = did(DidRepair)
  val wSkip = did(DidCoreSkipsPostRegister)

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
    CORE_SKIPS_MEMBERS = false,
    INVITE_CHECK = NoCheck
  ).*
}

module centralSignIn_logto {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromLogto,
    CORE_SKIPS_MEMBERS = false,
    INVITE_CHECK = NoCheck
  ).*
}

/** The proposed flow: Directory lookup; a core that skips PostRegister for members and refuses
    to invite them, when the invitation is sent and when it is accepted. */
module centralSignIn_proposed {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSendAndAccept
  ).*
}

/** The proposed flow, but the core checks only when the invitation is sent. */
module centralSignIn_proposedSendOnly {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSend
  ).*
}
