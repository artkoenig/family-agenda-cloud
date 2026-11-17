/**
 * The Families' Logto Organizations, through Logto's Management API, signed in as the
 * machine-to-machine application the cores use (IDP_MANAGEMENT_*). A Family is an Organization; its
 * Admins are users, which Logto keeps when the Organization goes.
 */

/** Where Logto's Management API is and how to sign in to it. */
export type IdpManagement = { endpoint: string; clientId: string; clientSecret: string };

/** The resource indicator of a self-hosted Logto's Management API. */
const MANAGEMENT_RESOURCE = "https://default.logto.app/api";

export type Organizations = {
  /** Deletes the Organization and its memberships; one that is gone already is no failure. */
  delete(organizationId: string): Promise<void>;
};

export function organizations({ endpoint, clientId, clientSecret }: IdpManagement): Organizations {
  return {
    async delete(organizationId) {
      const response = await fetch(`${endpoint}/api/organizations/${encodeURIComponent(organizationId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${await accessToken(endpoint, clientId, clientSecret)}` },
      });
      if (response.ok || response.status === 404) return;
      throw new Error(`Logto's Management API answered deleting the Organization with ${response.status}`);
    },
  };
}

async function accessToken(endpoint: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", resource: MANAGEMENT_RESOURCE, scope: "all" }).toString(),
  });
  if (!response.ok) throw new Error(`Logto refused the management client's credentials with ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}
