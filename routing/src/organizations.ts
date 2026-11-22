/**
 * The Families' Logto Organizations, through Logto's Management API. A Family is an Organization;
 * its Admins are users, which Logto keeps when the Organization goes: they are deleted first.
 */
import { managementFetch, type IdpManagement } from "./logto-management";

export type Organizations = {
  /**
   * Deletes every user who is a member of the Organization and answers how many were deleted. A
   * user gone already is no failure, nor is an Organization gone already, which has no members to list.
   */
  deleteMembers(organizationId: string): Promise<number>;
  /** Deletes the Organization and its memberships; one that is gone already is no failure. */
  delete(organizationId: string): Promise<void>;
};

/** The largest page Logto lists. */
const PAGE_SIZE = 100;

export function organizations(idp: IdpManagement): Organizations {
  return {
    async deleteMembers(organizationId) {
      const members = await listMembers(idp, organizationId);
      for (const userId of members) await deleteUser(idp, userId);
      return members.length;
    },
    async delete(organizationId) {
      const response = await managementFetch(idp, `/api/organizations/${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      if (response.ok || response.status === 404) return;
      throw new Error(`Logto's Management API answered deleting the Organization with ${response.status}`);
    },
  };
}

/** The ids of the Organization's users, every page of them; none of an Organization that is gone. */
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

async function deleteUser(idp: IdpManagement, userId: string): Promise<void> {
  const response = await managementFetch(idp, `/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (response.ok || response.status === 404) return;
  throw new Error(`Logto's Management API answered deleting an Admin's user with ${response.status}`);
}
