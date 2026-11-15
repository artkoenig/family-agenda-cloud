import type { Config } from "./config";
import type { Core } from "./core";
import { ProvisioningError } from "./create-family";
import type { Directory } from "./directory";
import { sealedContext, unwrappedFamily } from "./family-context";
import type { Log } from "./log";

export type ResetAdminPasswordInput = { familyId: string; adminEmail: string };

/** The Family has no Admin with the email address the Operator named; the address is for the Operator, not the log. */
export class UnknownAdminError extends Error {
  constructor(familyId: string, adminEmail: string) {
    super(`The Family ${familyId} has no Admin with the email ${adminEmail}`);
  }
}

/**
 * Has a core reset the password of one Admin of a Family, with that Family's Context, and answers
 * the new password. The Routing module holds it only to hand it to the Operator once: it is never
 * logged and never stored.
 */
export async function resetAdminPassword(
  { config, directory, core, log }: { config: Config; directory: Directory; core: Core; log: Log },
  { familyId, adminEmail }: ResetAdminPasswordInput,
): Promise<string> {
  const entry = await directory.find(familyId);
  if (!entry) throw new ProvisioningError(`There is no Family ${familyId}`);
  if (entry.status !== "active") throw new ProvisioningError(`The Family ${familyId} is ${entry.status.replaceAll("_", " ")}, not active`);
  const family = unwrappedFamily(config, entry);
  const password = await core.resetAdminPassword(await sealedContext(config, family), adminEmail);
  if (password === undefined) throw new UnknownAdminError(familyId, adminEmail);
  log.info("The core reset an Admin's password and ended their sessions", { familyId });
  return password;
}
