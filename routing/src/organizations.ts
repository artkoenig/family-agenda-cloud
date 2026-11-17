/**
 * The Families' Logto Organizations, through Logto's Management API. A Family is an Organization;
 * its Admins are users, which Logto keeps when the Organization goes.
 */
import { managementFetch, type IdpManagement } from "./logto-management";

export type Organizations = {
  /** Deletes the Organization and its memberships; one that is gone already is no failure. */
  delete(organizationId: string): Promise<void>;
};

export function organizations(idp: IdpManagement): Organizations {
  return {
    async delete(organizationId) {
      const response = await managementFetch(idp, `/api/organizations/${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      if (response.ok || response.status === 404) return;
      throw new Error(`Logto's Management API answered deleting the Organization with ${response.status}`);
    },
  };
}
