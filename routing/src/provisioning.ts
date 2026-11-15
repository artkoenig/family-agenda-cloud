import type pg from "pg";
import type { Config } from "./config";
import { coreClient, type Core } from "./core";
import { directory, type Directory } from "./directory";
import type { Log } from "./log";

/** What Provisioning's commands work with. */
export type Provisioning = {
  config: Config;
  /** The Routing module's connection to the Directory's server, which creates the Families' databases too. */
  client: pg.ClientBase;
  directory: Directory;
  core: Core;
  log: Log;
};

/** What Provisioning works with, on the Directory's connection. */
export function provisioning(config: Config, client: pg.ClientBase, log: Log): Provisioning {
  return { config, client, directory: directory(client), core: coreClient(config.coreUrls), log };
}

/** A command was refused before it changed anything. */
export class ProvisioningError extends Error {}

const FAMILY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether the text is a Family id: a UUID, in lower case. */
export const isFamilyId = (text: string): boolean => FAMILY_ID.test(text);

/** The directory, as the cores see it, that holds the Family's blobs. */
export const blobLocationOf = (config: Config, familyId: string): string => `${config.blobRoot}/${familyId}`;
