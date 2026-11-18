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
    INVITE_CHECK = NoCheck
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
    INVITE_CHECK = AtSendAndAccept
  ).* from "./centralSignIn"

  /** 5 again: the slow first PostRegister creates the Family, the repair's copy is skipped. */
  run slowPostRegisterRepairTest =
    init
      .then(register("alice"))
      .then(issueToken("alice"))
      .then(land("alice"))
      .then(repair("alice"))
      .then(coreCreatesFamily("alice", "o1", "f1"))
      .expect(postRegister.get("alice") == 1)
      .then(coreSkipsPostRegister("alice"))
      .expect(postRegister.get("alice") == 0 and oneFamilyPerPerson and registrationMakesOneFamily)
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(issueToken("alice")).then(land("alice"))
      .expect(landingIn(signIns.get("alice")) == InFamily("f1"))

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

  /** Logto's console is past every check of the core: the chooser stays as the fallback. */
  run consoleAddTest =
    init
      .then(register("alice")).then(coreCreatesFamily("alice", "o1", "f1"))
      .then(receive("f1", "o1")).then(prepare("f1"))
      .then(register("bob")).then(coreCreatesFamily("bob", "o2", "f2"))
      .then(receive("f2", "o2")).then(prepare("f2"))
      .then(consoleAddMember("o2", "alice"))
      .expect(not(oneFamilyPerPerson) and oneFamilyUnlessConsole)
      .then(issueToken("alice")).then(land("alice"))
      .expect(landingIn(signIns.get("alice")) == SeveralFamilies)
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
    INVITE_CHECK = AtSend
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
