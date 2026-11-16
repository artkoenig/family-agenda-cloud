import { takingTurns } from "./failover";
import { reasonOf, type Log } from "./log";

/**
 * The pool of cores by its name. The Cube runs the cores as one service with replicas, whose name
 * resolves to the address of every replica running now. The Routing module is told that one name
 * (per port, see config.ts) and resolves it at each call: a replica added takes load from the next
 * call on, and one that is gone is no longer asked, without a restart of the Routing module.
 * No I/O: the name is resolved through `resolve` (see resolve.ts).
 */

/** Answers the address of each core the pool's address stands for now; none, or an error, when it names nothing. */
export type Resolve = (address: URL) => Promise<URL[]>;

/** The address's host as a connection is made to it: an IPv6 address without its brackets. */
export const hostnameOf = ({ hostname }: URL): string => (hostname.startsWith("[") ? hostname.slice(1, -1) : hostname);

/** The pool on one of the cores' ports, as the Router and the client of the triggered operations ask it for cores. */
export type Pool = {
  /** The pool's name with its port, as the log names it. */
  host: string;
  /**
   * The cores the name stands for now, each call starting at the next of them; any core may serve
   * any Family. None when the name does not resolve or stands for no core, which the log then says.
   */
  cores(): Promise<URL[]>;
};

/** The pool at `address`, the cores' service on one of their ports. */
export function poolAt(address: string, resolve: Resolve, log: Log): Pool {
  const name = new URL(address);
  const inTurn = takingTurns<URL>();
  return {
    host: name.host,
    async cores() {
      try {
        const cores = await resolve(name);
        if (cores.length === 0) log.error("The pool's name stands for no core", { pool: name.host });
        return inTurn(cores);
      } catch (error) {
        log.error("The pool's name did not resolve", { pool: name.host, reason: reasonOf(error) });
        return [];
      }
    },
  };
}
