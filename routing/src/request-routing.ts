import type { DirectoryEntry } from "./directory";
import { isBodiless } from "./failover";
import { familyIdInPath } from "./family-id";
import { readinessOf } from "./family-readiness";

/**
 * Where the Router sends a browser's request: on to a core as it is, on to a core for a Family,
 * or nowhere, with the answer the Router gives instead. No I/O: the Directory is asked through
 * `find`, and only for a request that names a Family.
 */

/** A browser's request as the Router routes it: its method and its target, the path with its query. */
export type BrowserTarget = { method: string | undefined; target: string };

/** An answer the Router gives itself, without a core. */
export type Refusal = { to: "refused"; status: number; headers: Record<string, string>; body: string };

export type Route<E> =
  /** The health check: the one path a core answers without a Context. */
  | { to: "core"; path: string }
  /** A request for an active Family, with the path after its Family id. */
  | { to: "family"; familyId: string; path: string; entry: E }
  | Refusal;

const TEXT = { "content-type": "text/plain; charset=utf-8" };

/**
 * The same answer whether the Family is unknown, suspended or deleted, which tells nobody which
 * Families exist, and for a path to the core's triggered operations (/operations/*), which no
 * browser may reach.
 */
const NOT_FOUND: Refusal = { to: "refused", status: 404, headers: TEXT, body: "Not found\n" };

/** For a request no core answered, or whose routing failed. */
export const BAD_GATEWAY: Refusal = { to: "refused", status: 502, headers: TEXT, body: "Bad gateway\n" };

/**
 * For a request every core that answered refused, because none opens the Family now: each runs an
 * older release than the one that migrated the Family's database, is still preparing it, or cannot
 * reach it. It did not run, so the browser may ask again.
 */
export const UNAVAILABLE: Refusal = {
  to: "refused",
  status: 503,
  headers: { ...TEXT, "retry-after": "30", "cache-control": "no-store" },
  body: "Not available right now. Try again in a moment.\n",
};

export async function routeRequest<E extends Pick<DirectoryEntry, "status">>(
  { method, target }: BrowserTarget,
  find: (familyId: string) => Promise<E | undefined>,
): Promise<Route<E>> {
  if (isFamilyIndependent(method, target)) return { to: "core", path: target };
  const inPath = familyIdInPath(target);
  if (!inPath || namesOperations(inPath.path)) return NOT_FOUND;
  const { readiness, entry } = readinessOf(await find(inPath.familyId));
  if (readiness !== "served") return NOT_FOUND;
  return { to: "family", ...inPath, entry };
}

function isFamilyIndependent(method: string | undefined, target: string): boolean {
  const [pathname = ""] = target.split("?", 1);
  if (!isBodiless(method)) return false;
  // Static files are not: a core in supplied mode serves them only with a Context, below the
  // Family's prefix, where its pages link to them.
  return pathname === "/api/health";
}

/**
 * Whether the path below a Family's prefix names the core's triggered operations, as a core could
 * read it once it decodes the path and resolves its dot segments. Only the Routing module triggers
 * them, with a Context of its own: passed on from a browser, they would let anyone who knows a
 * Family's address reset its Admin's password.
 */
function namesOperations(rest: string): boolean {
  const [pathname = ""] = rest.split("?", 1);
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Not decodable as a whole: checked as it is, which still resolves its dot segments.
  }
  // One slash for many: "//operations" would otherwise be read as a host.
  const resolved = new URL(`/${decoded}`.replaceAll(/[/\\]+/g, "/"), "https://core.invalid").pathname;
  const [first = ""] = resolved.split("/").filter(Boolean);
  return first.toLowerCase() === "operations";
}
