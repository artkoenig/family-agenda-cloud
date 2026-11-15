import type { DirectoryEntry } from "./directory";
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
  /** Static files and the health check: the same for every Family, so served without one. */
  | { to: "core"; path: string }
  /** A request for an active Family prepared for the running core version, with the path after its Family id. */
  | { to: "family"; familyId: string; path: string; entry: E }
  | Refusal;

const TEXT = { "content-type": "text/plain; charset=utf-8" };

/**
 * The same answer whether the Family is unknown, suspended or deleted, which tells nobody which
 * Families exist, and for a path to the core's triggered operations (/operations/*), which no
 * browser may reach.
 */
const NOT_FOUND: Refusal = { to: "refused", status: 404, headers: TEXT, body: "Not found\n" };

/**
 * For an active Family not prepared for the running core version, as after the cores moved to a
 * new release and before a rollout prepared it: a core never opens a database it cannot read.
 */
const BEING_UPDATED: Refusal = {
  to: "refused",
  status: 503,
  headers: { ...TEXT, "retry-after": "30", "cache-control": "no-store" },
  body: "This Family is being updated. Try again in a moment.\n",
};

export async function routeRequest<E extends Pick<DirectoryEntry, "status" | "coreVersion">>(
  { method, target }: BrowserTarget,
  coreVersion: string,
  find: (familyId: string) => Promise<E | undefined>,
): Promise<Route<E>> {
  if (isFamilyIndependent(method, target)) return { to: "core", path: target };
  const inPath = familyIdInPath(target);
  if (!inPath || namesOperations(inPath.path)) return NOT_FOUND;
  const { readiness, entry } = readinessOf(await find(inPath.familyId), coreVersion);
  if (readiness === "awaiting-rollout") return BEING_UPDATED;
  if (readiness !== "served") return NOT_FOUND;
  return { to: "family", ...inPath, entry };
}

function isFamilyIndependent(method: string | undefined, target: string): boolean {
  const [pathname = ""] = target.split("?", 1);
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname.startsWith("/static/") || pathname === "/api/health";
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
