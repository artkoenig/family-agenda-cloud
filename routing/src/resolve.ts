import { lookup } from "node:dns/promises";
import { hostnameOf, type Resolve } from "./pool";

/**
 * How a pool's name is resolved to its cores: the one place the Routing module asks the Cube's
 * name service.
 */

/**
 * Resolves the address's host as the system does, which asks the Cube's name service anew each
 * time, and answers the address once per host address found, in a stable order.
 */
export const systemResolve: Resolve = async (address) => {
  const found = await lookup(hostnameOf(address), { all: true });
  const hosts = new Set(found.map(({ address: host, family }) => (family === 6 ? `[${host}]` : host)));
  return [...hosts].sort().map((host) => {
    const core = new URL(address);
    core.hostname = host;
    return core;
  });
};
