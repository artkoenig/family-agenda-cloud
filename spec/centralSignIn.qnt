// -*- mode: Bluespec; -*-
/**
 * How the Routing module finds a person's Family after central sign-in (#128).
 * TYPE SKETCH ONLY: types and state, no logic yet.
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
  }

  type Logto = {
    accounts: Set[Person],               // users with a confirmed email
    orgs:     OrgId -> Organization,     // existing Organizations only
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

  type SignIn =
    | SignedOut
    | TokenIssued(Set[OrgId])     // ID token's `organizations` claim, frozen at issue time
    | Landed(Landing)

}

module centralSignIn {
  import centralSignInTypes.*

  // ---------------------------------------------------------------- constants
  const PEOPLE:     Set[Person]
  const ORG_IDS:    Set[OrgId]     // pool Logto draws Organization ids from
  const FAMILY_IDS: Set[FamilyId]  // pool the core draws Family ids from
  const MAPPING:    Mapping

  // ---------------------------------------------------------------- state
  var logto:         Logto
  var postRegister:  Set[Person]                 // Logto -> core, sent once, may be lost
  var familyCreated: Set[FamilyCreated]          // core -> Receiver, in flight until taken
  var directory:     FamilyId -> DirectoryEntry  // pre-populated with Absent for FAMILY_IDS
  var signIns:       Person -> SignIn            // pre-populated with SignedOut for PEOPLE
}

module centralSignIn_directory {
  import centralSignInTypes.*
  import centralSignIn(
    PEOPLE = Set("alice", "bob"),
    ORG_IDS = Set("o1", "o2"),
    FAMILY_IDS = Set("f1", "f2"),
    MAPPING = FromDirectory
  ).*
}
