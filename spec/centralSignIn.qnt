// -*- mode: Bluespec; -*-
/**
 * How the Routing module finds a person's Family after central sign-in (#128, map #125).
 *
 * WHAT IT MODELS
 * - Logto: accounts, Organizations (customData.familyId, members with the role admin) and
 *   pending invitations; Organization ids are never reused (`issued`).
 * - Registration: Logto's sign-up sends PostRegister once (may be lost, Logto does not retry);
 *   the core creates the Organization and posts family.created, retried until taken (never lost);
 *   the Receiver writes the Directory entry (BeingPrepared), Provisioning makes it Active.
 * - Life of a Family: Admins invited in two steps (the core sends, the invitee accepts; accepting
 *   may create the account). An invited Admin removed on the Admins page has their Logto user
 *   deleted and cannot sign in. The founder is never removed: they close the Family and end the
 *   subscription, which deletes the Family (entry marked Deleted), the accounts of all its Admins,
 *   then its Organization. Suspend / resume. A DSGVO deletion of an account with no Family.
 * - Logto's console: no one edits people there by hand (CONSOLE_EDITS = false in the proposal;
 *   consoleAddMember models what happens if someone did).
 * - Central sign-in in two steps: Logto issues the ID token (its `organizations` claim frozen),
 *   then the Routing module lands the person (`landingOf`).
 * - The open choice of #128 as a variant `MAPPING`: Organization id -> Family id from the
 *   Directory (an index is just a query on the entries' orgId) or from Logto's customData.
 *
 * PROPOSED FLOW (instance centralSignIn_proposed; stories in centralSignIn_test.qnt)
 * - Look the Family up in the Directory (MAPPING = FromDirectory).
 * - Pages: InFamily -> redirect; Preparing / UnknownOrganization -> "wird vorbereitet", which asks
 *   again (retry); Unavailable -> notice. No page with a repair button (the Operator, 2026-11-18):
 * - AUTO_REPAIR: a sign-in whose claim names no Organization has the core run PostRegister again
 *   and shows "wird vorbereitet"; the page signs in again silently to see the new Organization.
 *   With the rules above, an empty claim only means a registration whose PostRegister is on its
 *   way or lost, so this never makes a Family for someone who had one.
 * - ACCOUNTS_BEFORE_ORG: closing deletes the Admins' accounts before the Organization. The other
 *   way round, a founder signing in between the two steps has an empty claim, is given a new
 *   Family, and the closed Family's Admins are no longer known to delete their accounts.
 * - Core change (CORE_SKIPS_MEMBERS): PostRegister for someone already in an Organization, or
 *   whose account is deleted, creates nothing. Without it, a second PostRegister (the automatic
 *   one while the first is slow, or an invitation while one is in flight) gives a second Family,
 *   and a DSGVO deletion before PostRegister arrives leaves a Family for an account that is gone.
 * - Core change (INVITE_CHECK = AtSendAndAccept): someone who already is an Admin of a Family is
 *   not invited into another, neither when the invitation is sent nor when it is accepted.
 *   Checking at sending only (AtSend) is not enough: invited, then registered, then accepted.
 *   Assumes the core's checks and its PostRegister run one at a time per person.
 * - Assumed: a former Admin does not sign up again; one invited again is an Admin again.
 *
 * PROPERTIES (10000 sampled runs of 30 steps, seed 42; 2 people, 2 Organization ids, 2 Family ids)
 *   no counterexample in the proposal: oneFamilyPerPerson, registrationMakesOneFamily,
 *     landsWhereClaimed, activeFamilyIsFound, directoryAgreesWithLogto, orgIdsUnique,
 *     unknownMeansInFlight, everyOrganizationHasAdmin, adminsHaveAccounts,
 *     formerAdminsCannotSignIn, noFamilyForFormerAdmins;
 *     never reached: NoFamily, the repair page, SeveralFamilies, an Active Family without Admins.
 *   FromLogto breaks unknownMeansInFlight: markDeleted -> issueToken -> deleteOrganization -> land
 *     finds no Organization, and cannot tell deleted from new.
 *   violated everywhere, on purpose: landsOnlyWhereAdmin - issueToken -> removeAdmin -> land: a
 *     claim gone stale between the token and the callback; the core's own OIDC check refuses them.
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
 *   (and --main=centralSignIn_logto, centralSignIn_proposed, centralSignIn_proposedSendOnly,
 *   centralSignIn_proposedOrgFirst). With --seed, --max-samples
 *   defaults to 1, so always pass it. "No violation" is a sampling result, not a proof.
 *   quint test centralSignIn_test.qnt --backend=typescript --main=centralSignIn_test
 *   (and --main=centralSignIn_proposed_test, centralSignIn_sendOnly_test, centralSignIn_orgFirst_test).
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
    formerAdmins: Set[Person],           // ghost: removed, or their Family closed; account deleted
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
    | DidDeleteAccount
    | DidDeleteAdminAccounts
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
  /** Proposed core change: PostRegister for a member, or for a deleted account, creates nothing. */
  const CORE_SKIPS_MEMBERS: bool
  /** Proposed core change: no invitation for someone who already is an Admin of a Family. */
  const INVITE_CHECK: InviteCheck
  /**
   * Whether people are edited by hand in Logto's console (members added, users created or
   * deleted). The Operator says: never (2026-11-18). Only consoleAddMember models it.
   */
  const CONSOLE_EDITS: bool
  /** Proposal: a sign-in with no Organization has the core run PostRegister again, by itself. */
  const AUTO_REPAIR: bool
  /** Closing a Family deletes its Admins' accounts before its Organization (else after). */
  const ACCOUNTS_BEFORE_ORG: bool

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

  /**
   * With AUTO_REPAIR, a sign-in with no Organization waits for the Family it has asked for; there
   * is no page with a repair button (the Operator, 2026-11-18).
   */
  pure def autoRepairs(auto: bool, claim: Set[OrgId]): bool = auto and claim == Set()

  pure def landingAt(auto: bool, m: Mapping, l: Logto, d: FamilyId -> DirectoryEntry, claim: Set[OrgId]): Landing =
    if (autoRepairs(auto, claim)) Preparing else landingOf(m, l, d, claim)

  /** One more PostRegister for `p` if `more`, else as it is. */
  pure def withPostRegister(pending: Person -> int, p: Person, more: bool): Person -> int =
    if (more) pending.setBy(p, n => n + 1) else pending

  /** The waiting page signs in again silently when it had no Organization, to see the new one. */
  pure def claimForRetry(claim: Set[OrgId], fresh: Set[OrgId]): Set[OrgId] =
    if (claim == Set()) fresh else claim

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

  /** With the proposed core: PostRegister creates nothing for a member, or for a deleted account. */
  pure def skipsPostRegister(l: Logto, p: Person): bool =
    claimOf(l, p) != Set() or not(l.accounts.contains(p))

  /** Whether the core may create a Family `f` with Organization `o` for `p`'s PostRegister. */
  pure def canCreateFamily(skipsMembers: bool, l: Logto, d: FamilyId -> DirectoryEntry,
                           pending: Person -> int, p: Person, o: OrgId, f: FamilyId): bool = and {
    pending.get(p) > 0,
    not(skipsMembers and skipsPostRegister(l, p)),
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

  /**
   * An Admin by invitation: a member, with an account made by the invitation if needed. A former
   * Admin invited again is an Admin again (assumed: inviting them back is the inviter's decision).
   */
  pure def withAdmin(l: Logto, o: OrgId, p: Person): Logto =
    { ...l, accounts: l.accounts.union(Set(p)),
            orgs: l.orgs.setBy(o, org => { ...org, admins: org.admins.union(Set(p)) }),
            invitations: l.invitations.exclude(Set({ orgId: o, invitee: p })),
            formerAdmins: l.formerAdmins.exclude(Set(p)) }

  /** The Operator (or anyone with console access) makes `p` a member in Logto's console. */
  pure def withConsoleMember(l: Logto, o: OrgId, p: Person): Logto =
    { ...withAdmin(l, o, p), consoleAdded: l.consoleAdded.union(Set(p)) }

  pure def withoutAdmin(l: Logto, o: OrgId, p: Person): Logto =
    { ...l, orgs: l.orgs.setBy(o, org => { ...org, admins: org.admins.exclude(Set(p)) }) }

  /**
   * Logto with the user deleted: the account and with it every membership. The Operator's rule
   * (2026-11-18): a removed Admin, and every Admin of a closed Family, cannot sign in any more.
   */
  pure def withoutUser(l: Logto, p: Person): Logto =
    { ...l, accounts: l.accounts.exclude(Set(p)),
            orgs: l.orgs.keys().mapBy(o => { ...l.orgs.get(o), admins: l.orgs.get(o).admins.exclude(Set(p)) }),
            formerAdmins: l.formerAdmins.union(Set(p)) }

  pure def withoutUsers(l: Logto, ps: Set[Person]): Logto =
    ps.fold(l, (acc, p) => withoutUser(acc, p))

  /** Logto without the Organization and its memberships; the accounts stay. */
  pure def withoutOrganization(l: Logto, o: OrgId): Logto =
    { ...l, orgs: l.orgs.keys().exclude(Set(o)).mapBy(k => l.orgs.get(k)),
            invitations: l.invitations.filter(i => i.orgId != o) }

  // ================================================================ state machine

  action init = all {
    logto' = { accounts: Set(), orgs: Map(), issued: Set(), invitations: Set(), consoleAdded: Set(),
               formerAdmins: Set() },
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
    not(logto.formerAdmins.contains(p)),   // assumed: a former Admin does not sign up again
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

  /** With CORE_SKIPS_MEMBERS: PostRegister for a member, or a deleted account, creates nothing. */
  action coreSkipsPostRegister(p: Person): bool = all {
    CORE_SKIPS_MEMBERS,
    postRegister.get(p) > 0,
    skipsPostRegister(logto, p),
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
    CONSOLE_EDITS,
    logto.orgs.keys().contains(o),
    not(logto.orgs.get(o).admins.contains(p)),
    logto' = withConsoleMember(logto, o, p),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidConsoleAddMember),
  }

  /**
   * An invited Admin is removed on the core's Admins page: their Logto user is deleted, so they
   * cannot sign in any more. The founder is never removed this way (they close the Family).
   */
  action removeAdmin(o: OrgId, p: Person): bool = all {
    logto.orgs.keys().contains(o),
    logto.orgs.get(o).admins.contains(p),
    logto.orgs.get(o).registeredBy != p,
    logto' = withoutUser(logto, p),
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

  /**
   * DSGVO: after the subscription has ended and the Family is deleted, the person's Logto account
   * is deleted on request (through the Management API, not by hand). Their session ends.
   */
  action deleteAccount(p: Person): bool = all {
    logto.accounts.contains(p),
    claimOf(logto, p) == Set(),
    logto' = { ...logto, accounts: logto.accounts.exclude(Set(p)) },
    signIns' = signIns.set(p, SignedOut),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidDeleteAccount),
  }

  /** Closing the Family: the accounts of all its Admins are deleted (before or after the Organization). */
  action deleteAdminAccounts(f: FamilyId): bool = all {
    directory.get(f).status == Deleted,
    logto.orgs.keys().contains(directory.get(f).orgId),
    logto.orgs.get(directory.get(f).orgId).admins != Set(),
    logto' = withoutUsers(logto, logto.orgs.get(directory.get(f).orgId).admins),
    postRegister' = postRegister, familyCreated' = familyCreated, directory' = directory,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidDeleteAdminAccounts),
  }

  /** Deleting, first step (the Operator, or the founder closing the Family and ending the subscription): the entry is marked deleted (database, blobs follow, not modelled). */
  action markDeleted(f: FamilyId): bool = all {
    Set(Active, Suspended).contains(directory.get(f).status),
    directory' = withStatus(directory, f, Deleted),
    logto' = logto, postRegister' = postRegister, familyCreated' = familyCreated,
    signIns' = signIns, lostPostRegister' = lostPostRegister,
    lastEvent' = OtherStep(DidMarkDeleted),
  }

  /** Deleting, last step: the Organization goes with its memberships. */
  action deleteOrganization(f: FamilyId): bool = all {
    directory.get(f).status == Deleted,
    logto.orgs.keys().contains(directory.get(f).orgId),
    not(ACCOUNTS_BEFORE_ORG) or logto.orgs.get(directory.get(f).orgId).admins == Set(),
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
    val claim = claimIn(signIns.get(p))
    val landing = landingAt(AUTO_REPAIR, MAPPING, logto, directory, claim)
    all {
      signIns' = signIns.set(p, Landed({ claim: claim, landing: landing })),
      postRegister' = withPostRegister(postRegister, p, autoRepairs(AUTO_REPAIR, claim)),
      logto' = logto, familyCreated' = familyCreated,
      directory' = directory, lostPostRegister' = lostPostRegister,
      lastEvent' = Land({ person: p, claim: claimIn(signIns.get(p)), landing: landing }),
    },
  }

  // ---------------------------------------------------------------- proposed flow (pages)

  /** "Deine Family wird vorbereitet" asks again, with its claim, or a fresh one if it had none. */
  action retry(p: Person): bool = all {
    isLanded(signIns.get(p)),
    isWaiting(landingIn(signIns.get(p))),
    logto.accounts.contains(p),
    val claim = claimForRetry(claimIn(signIns.get(p)), claimOf(logto, p))
    val landing = landingAt(AUTO_REPAIR, MAPPING, logto, directory, claim)   // still none: keep waiting
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
    not(AUTO_REPAIR),                   // the proposal has no page with a repair button
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
      prepare(f), sendInvitation(o, p), acceptInvitation(o, p), consoleAddMember(o, p), removeAdmin(o, p), deleteAccount(p),
      deleteAdminAccounts(f),
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

  val wDeleteAccount = did(DidDeleteAccount)
  val wDeleteAdminAccounts = did(DidDeleteAdminAccounts)

  /** A removed Admin, or an Admin of a closed Family, has no account: they cannot sign in. */
  val formerAdminsCannotSignIn: bool =
    logto.formerAdmins.intersect(logto.accounts) == Set()

  /** No one gets a Family after theirs was closed or they were removed. */
  val noFamilyForFormerAdmins: bool =
    match lastEvent { | Created(e) => not(logto.formerAdmins.contains(e.person)) | _ => true }

  /** Someone removed, or whose Family closed, while the founder of another lives on. */
  val wRemovedInvitee: bool = did(DidRemoveAdmin)

  /** Every Organization of a Family that is not being deleted has an Admin. */
  val everyOrganizationHasAdmin: bool =
    logto.orgs.keys().forall(o =>
      directory.get(logto.orgs.get(o).familyId).status != Deleted implies logto.orgs.get(o).admins != Set())

  /** Every Admin has a Logto account. */
  val adminsHaveAccounts: bool =
    logto.orgs.keys().forall(o => logto.orgs.get(o).admins.subseteq(logto.accounts))

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
    INVITE_CHECK = NoCheck,
    CONSOLE_EDITS = true,
    AUTO_REPAIR = false,
    ACCOUNTS_BEFORE_ORG = false
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
    INVITE_CHECK = NoCheck,
    CONSOLE_EDITS = true,
    AUTO_REPAIR = false,
    ACCOUNTS_BEFORE_ORG = false
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
    INVITE_CHECK = AtSendAndAccept,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = true
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
    INVITE_CHECK = AtSend,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = true
  ).*
}

/** The proposed flow, but closing a Family deletes its Organization before its Admins' accounts. */
module centralSignIn_proposedOrgFirst {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSendAndAccept,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = false
  ).*
}
