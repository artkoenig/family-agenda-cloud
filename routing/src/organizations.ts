/**
 * The Families' Logto Organizations, through Logto's Management API. A Family is an Organization;
 * its Admins are its members, users whom Logto keeps when the Organization goes.
 */
import { managementFetch, type IdpManagement } from "./logto-management";

export type Organizations = {
  /**
   * Deletes the user of every member of the Organization, until Logto lists none, and answers how
   * many it deleted. A user gone already is no failure, nor is an Organization gone already.
   */
  deleteMemberUsers(organizationId: string): Promise<number>;
  /** Deletes the Organization and its memberships; one that is gone already is no failure. */
  delete(organizationId: string): Promise<void>;
};

/** The largest page Logto lists. */
const PAGE_SIZE = 100;
/** How often the members are listed and deleted before members Logto still lists fail the step. */
const ROUNDS = 3;

export function organizations(idp: IdpManagement): Organizations {
  return {
    async deleteMemberUsers(organizationId) {
      let deleted = 0;
      for (let round = 0; round < ROUNDS; round++) {
        const members = await listMembers(idp, organizationId);
        if (members.length === 0) return deleted;
        for (const userId of members) if (await deleteUser(idp, userId)) deleted++;
      }
      throw new Error(`Logto still lists members of the Organization after deleting their users ${ROUNDS} times`);
    },
    async delete(organizationId) {
      const response = await managementFetch(idp, `/api/organizations/${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      if (response.ok || response.status === 404) return;
      throw new Error(`Logto's Management API answered deleting the Organization with ${response.status}`);
    },
  };
}

/** The ids of the Organization's members, every page of them; none of an Organization that is gone. */
async function listMembers(idp: IdpManagement, organizationId: string): Promise<string[]> {
  const members: string[] = [];
  for (let page = 1; ; page++) {
    const path = `/api/organizations/${encodeURIComponent(organizationId)}/users?page=${page}&page_size=${PAGE_SIZE}`;
    const response = await managementFetch(idp, path, { method: "GET" });
    if (response.status === 404) return members;
    if (!response.ok) throw new Error(`Logto's Management API answered listing the Organization's users with ${response.status}`);
    const listed = (await response.json()) as { id: string }[];
    members.push(...listed.map(({ id }) => id));
    if (listed.length < PAGE_SIZE) return members;
  }
}

/** Deletes the user and answers whether it was there to delete. */
async function deleteUser(idp: IdpManagement, userId: string): Promise<boolean> {
  const response = await managementFetch(idp, `/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (response.status === 404) return false;
  if (response.ok) return true;
  throw new Error(`Logto's Management API answered deleting an Admin's user with ${response.status}`);
}
