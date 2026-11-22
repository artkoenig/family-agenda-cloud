// -*- mode: Bluespec; -*-
/**
 * The proposed flow of central sign-in (#128), walked through step by step, with the
 * Family looked up in the Directory. Each run is one story; `expect` checks where it stands.
 */
module centralSignIn_test {
  import centralSignInTypes.* from "./centralSignIn"
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2", "o3"),
    FAMILY_IDS = Set("f1", "f2", "f3"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = false,
    INVITE_CHECK = NoCheck,
    CONSOLE_EDITS = true,
    AUTO_REPAIR = false,
    ACCOUNTS_BEFORE_ORG = false
  ).* from "./centralSignIn"

  def landedAt(p: Person): Landing = landingIn(signIns.get(p))

  /** 1. Registration, a sign-in while family.created is still on its way, then the redirect. */
  run happyPathTest =
    init
      .then(register("alice"))
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == UnknownOrganization("o1"))    // page: "wird vorbereitet"
      .then(receive("f1", "o1"))
      .then(retry("alice"))
      .expect(landedAt("alice") == Preparing)                    // still: database not ready
      .then(prepare("f1"))
      .then(retry("alice"))
      .expect(landedAt("alice") == InFamily("f1"))
      .expect(landsOnlyWhereAdmin and landsWhereClaimed)

  /** 2. Alice is invited into Bob's Family as well: the chooser page. */
  run twoFamiliesTest =
    init
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(receive("f2", "o2")).then(prepare("f2"))
      .then(sendInvitation("o2", "alice"))
      .then(acceptInvitation("o2", "alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == SeveralFamilies and not(oneFamilyPerPerson))
      .then(choose("alice", "f2"))
      .expect(landedAt("alice") == InFamily("f2") and landsOnlyWhereAdmin)

  /** 3. The core missed PostRegister: "Keine Family", repaired, a fresh sign-in, the Family. */
  run lostPostRegisterTest =
    init
      .then(register("alice"))
      .then(losePostRegister("alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == NoFamily)
      .then(repair("alice"))
      .expect(signIns.get("alice") == SignedOut and postRegister.get("alice") == 1)
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == InFamily("f1"))

  /** 4. A deleted Family: between the two delete steps and after them. */
  run deletedFamilyTest =
    init
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(issueToken("alice"))
      .then(markDeleted("f1"))
      .then(land("alice"))
      .expect(landedAt("alice") == Unavailable("f1"))
      .then(deleteOrganization("f1"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == NoFamily)

  /**
   * 5. The flaw the simulation finds: PostRegister is only slow, not lost. A repair from
   * "Keine Family" sends a second one, and the core creates two Families for Alice.
   */
  run slowPostRegisterRepairTest =
    init
      .then(register("alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landedAt("alice") == NoFamily)
      .then(repair("alice"))                              // the first PostRegister is still on its way
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .expect(postRegister.get("alice") == 1)             // the repair's copy waits as well
      .then(coreCreatesFamily("alice", "o2", "f2"))
      .expect(not(oneFamilyPerPerson) and not(registrationMakesOneFamily))

  /** DSGVO deletion while PostRegister is on its way: a Family for an account that is gone. */
  run deletedBeforePostRegisterTest =
    init
      .then(register("alice"))
      .then(deleteAccount("alice"))
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .expect(not(adminsHaveAccounts))
}

/** The same stories with the proposed core changes: PostRegister for a member creates nothing,
    and a member of one Family is not invited into another. */
module centralSignIn_proposed_test {
  import centralSignInTypes.* from "./centralSignIn"
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2", "o3"),
    FAMILY_IDS = Set("f1", "f2", "f3"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSendAndAccept,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = true
  ).* from "./centralSignIn"

  /** 5 again, automatic: the sign-in asks for the Family itself; the slow copy and its own both arrive. */
  run slowPostRegisterRepairTest =
    init
      .then(register("alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landingIn(signIns.get("alice")) == Preparing and postRegister.get("alice") == 2)
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .then(coreSkipsPostRegister("alice"))
      .expect(postRegister.get("alice") == 0 and oneFamilyPerPerson and registrationMakesOneFamily)
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(retry("alice"))
      .expect(landingIn(signIns.get("alice")) == InFamily("f1"))

  /** A lost PostRegister is made good by the next sign-in, with no page in between. */
  run lostPostRegisterTest =
    init
      .then(register("alice"))
      .then(losePostRegister("alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .expect(landingIn(signIns.get("alice")) == Preparing)
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(retry("alice"))
      .expect(landingIn(signIns.get("alice")) == InFamily("f1"))

  /** A removed invited Admin cannot sign in any more; the founder cannot be removed. */
  run removedCannotSignInTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(sendInvitation("o1", "alice")).then(acceptInvitation("o1", "alice"))
      .then(removeAdmin("o1", "alice"))
      .expect(formerAdminsCannotSignIn and not(logto.accounts.contains("alice")))
      .then(issueToken("alice").fail())

  /** The founder closes the Family: every Admin's account goes, then the Organization. */
  run closeFamilyTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(sendInvitation("o1", "alice")).then(acceptInvitation("o1", "alice"))
      .then(markDeleted("f1"))
      .expect(logto.orgs.keys().contains("o1"))
      .then(deleteAdminAccounts("f1"))
      .then(deleteOrganization("f1"))
      .expect(logto.accounts == Set() and formerAdminsCannotSignIn and logto.orgs == Map())

  /** A founder who closed the Family may sign up again and gets a new one. */
  run founderSignsUpAgainTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(markDeleted("f1")).then(deleteAdminAccounts("f1")).then(deleteOrganization("f1"))
      .expect(not(logto.accounts.contains("bob")))
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(receive("f2", "o2")).then(prepare("f2"))
      .then(issueToken("bob")).then(land("bob"))
      .expect(landingIn(signIns.get("bob")) == InFamily("f2") and noFamilyForFormerAdmins)

  /** The Organization cannot go first: the accounts must be deleted before it. */
  run orgNotFirstTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(markDeleted("f1"))
      .then(deleteOrganization("f1").fail())

  /** Invited while her own PostRegister is on its way: she joins Bob's Family, gets none of her own. */
  run invitedWhileRegisteringTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(register("alice"))
      .then(sendInvitation("o1", "alice"))
      .then(acceptInvitation("o1", "alice"))
      .then(coreSkipsPostRegister("alice"))
      .expect(oneFamilyPerPerson)
      .then(issueToken("alice")).then(land("alice"))
      .expect(landingIn(signIns.get("alice")) == InFamily("f1"))

  /** 2 again: Bob cannot invite Alice, who already is an Admin of her own Family. */
  run inviteRefusedTest =
    init
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(receive("f2", "o2")).then(prepare("f2"))
      .expect(oneFamilyPerPerson)
      .then(sendInvitation("o2", "alice").fail())

  /** Invited before she registered, accepted after: the check at accepting catches it. */
  run acceptRefusedTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(sendInvitation("o2", "alice"))
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .expect(oneFamilyPerPerson and logto.invitations.contains({ orgId: "o2", invitee: "alice" }))
      .then(acceptInvitation("o2", "alice").fail())

  /** No one adds members in Logto's console. */
  run consoleAddTest =
    init
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(consoleAddMember("o1", "bob").fail())

  /** The same with the proposed core: PostRegister for a deleted account creates nothing. */
  run deletedBeforePostRegisterTest =
    init
      .then(register("alice"))
      .then(deleteAccount("alice"))
      .expect(adminsHaveAccounts)
      .then(coreCreatesFamily("alice", "o1", "f1").fail())

  /** The last Admin cannot be removed; one of two can. */
  run lastAdminStaysTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(sendInvitation("o1", "alice")).then(acceptInvitation("o1", "alice"))
      .then(removeAdmin("o1", "alice"))
      .expect(everyOrganizationHasAdmin)
      .then(removeAdmin("o1", "bob").fail())

  // "Keine Family", by cause (witnesses for quint run --main=centralSignIn_proposed_test)
  def noFamilyFor(cause: Person => bool): bool =
    match lastEvent { | Land(e) => e.landing == NoFamily and cause(e.person) | _ => false }
  /** Signed in before the core has created the Family: PostRegister is still on its way. */
  val wNoFamilyInFlight: bool = noFamilyFor(p => postRegister.get(p) > 0)
  /** PostRegister was lost, and nothing is on its way. */
  val wNoFamilyLost: bool = noFamilyFor(p => postRegister.get(p) == 0 and lostPostRegister.contains(p))
  /** Neither: once an Admin, now in no Family (removed, or the Family was deleted). */
  val wNoFamilyLeft: bool = noFamilyFor(p => postRegister.get(p) == 0 and not(lostPostRegister.contains(p)))
  /** ... because the Family was deleted (some deleted entry exists, the person is in none). */
  val wNoFamilyAfterDelete: bool =
    wNoFamilyLeft and FAMILY_IDS.exists(f => directory.get(f).status == Deleted)
  /** ... because they were removed while their Family lives on. */
  val wNoFamilyAfterRemoval: bool =
    wNoFamilyLeft and FAMILY_IDS.forall(f => directory.get(f).status != Deleted)
}

/** The core checks only when the invitation is sent. */
module centralSignIn_sendOnly_test {
  import centralSignInTypes.* from "./centralSignIn"
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2", "o3"),
    FAMILY_IDS = Set("f1", "f2", "f3"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSend,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = true
  ).* from "./centralSignIn"

  /** Invited before she registered, accepted after: two Families, without the console. */
  run acceptAfterRegisteringTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(sendInvitation("o2", "alice"))
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(acceptInvitation("o2", "alice"))
      .expect(not(oneFamilyUnlessConsole))
}

/** Closing deletes the Organization before the Admins' accounts. */
module centralSignIn_orgFirst_test {
  import centralSignInTypes.* from "./centralSignIn"
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2", "o3"),
    FAMILY_IDS = Set("f1", "f2", "f3"),
    MAPPING = FromDirectory,
    CORE_SKIPS_MEMBERS = true,
    INVITE_CHECK = AtSendAndAccept,
    CONSOLE_EDITS = false,
    AUTO_REPAIR = true,
    ACCOUNTS_BEFORE_ORG = false
  ).* from "./centralSignIn"

  /** The founder signs in between the two steps: no Organization, so a new Family is asked for. */
  run signInBetweenStepsTest =
    init
      .then(register("bob")).then(coreCreatesFamily("bob", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(markDeleted("f1"))
      .then(deleteOrganization("f1"))
      .then(issueToken("bob")).then(land("bob"))
      .expect(postRegister.get("bob") == 1)
      .then(coreCreatesFamily("bob", "o2", "f2"))
      .expect(logto.orgs.keys() == Set("o2"))
}
