/**
 * `routing invite`: invites a person to register a Family of their own while registration is
 * closed. The link carries a one-time token of Logto's, which lets the person create an account
 * even with `signInMode: SignIn`; PostRegister then makes their Family, as for anyone who registers.
 */
import type { Language } from "./contract-wording";
import { INVITATION_DAYS, invitationMail } from "./invitation-mail";
import { managementCall, type IdpManagement } from "./logto-management";
import type { Outbox } from "./outbox";
import { ProvisioningError } from "./provisioning";
import { INVITATION_PATH } from "./sign-in-pages";

/** What `invite` is asked for; the email is lower case, as Logto keeps it. */
export type InviteInput = { email: string; language: Language };

const TOKEN_LIFETIME_SECONDS = INVITATION_DAYS * 24 * 60 * 60;

/**
 * Puts the invitation mail into the outbox and answers its id there. Refuses a person for whom no
 * Family would be made: a member of an Organization, and one with an Admin's invitation, whom the
 * core gives no Family of their own. A person with an account and no Family is invited again.
 * No error names the address, as the log never does.
 */
export async function invite(idp: IdpManagement, outbox: Outbox, publicUrl: string, { email, language }: InviteInput): Promise<string> {
  await refuseMember(idp, email);
  await refuseInvitee(idp, email);
  const link = new URL(`${publicUrl}${INVITATION_PATH}`);
  link.search = new URLSearchParams({ one_time_token: await oneTimeToken(idp, email), login_hint: email }).toString();
  return outbox.enqueue(invitationMail(language, email, link.toString()), { type: "family-invitation" });
}

async function refuseMember(idp: IdpManagement, email: string): Promise<void> {
  const path = `/api/users?search.primaryEmail=${encodeURIComponent(email)}&mode.primaryEmail=exact`;
  const users = await read<{ id: string }>(idp, path, "finding the person's user");
  for (const { id } of users) {
    const organizations = await read(idp, `/api/users/${encodeURIComponent(id)}/organizations`, "listing the person's Organizations");
    if (organizations.length > 0) throw new ProvisioningError("The person already is in a Family");
  }
}

/** The statuses of an Admin's invitation by which the core gives the person no Family of their own. */
const INVITED = ["Pending", "Accepted"];

async function refuseInvitee(idp: IdpManagement, email: string): Promise<void> {
  const invitations = await read<{ status: string }>(idp, `/api/organization-invitations?invitee=${encodeURIComponent(email)}`, "listing the person's invitations");
  if (invitations.some(({ status }) => INVITED.includes(status))) throw new ProvisioningError("The person has an Admin's invitation, so would get no Family of their own");
}

async function oneTimeToken(idp: IdpManagement, email: string): Promise<string> {
  const response = await managementCall(idp, "POST", "/api/one-time-tokens", { email, expiresIn: TOKEN_LIFETIME_SECONDS }, "creating a one-time token");
  return ((await response.json()) as { token: string }).token;
}

async function read<T>(idp: IdpManagement, path: string, doing: string): Promise<T[]> {
  return (await (await managementCall(idp, "GET", path, undefined, doing)).json()) as T[];
}
