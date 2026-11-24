/**
 * The files of site/ that legal-pages.ts builds, on disk: `pnpm legal-pages` writes them
 * (build-legal-pages.ts), and a test checks that the committed ones are up to date.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, type SiteFile } from "./legal-pages";

/**
 * The repository's site/: the nearest one above this file that holds legal/, so that it is also
 * found from a copy of routing/ inside the repository, such as Stryker's sandbox.
 */
export function siteDirectory(from = dirname(fileURLToPath(import.meta.url))): string {
  const site = join(from, "site");
  if (existsSync(join(site, "legal"))) return site;
  const parent = dirname(from);
  if (parent === from) throw new Error("No site/legal/ above the Routing module");
  return siteDirectory(parent);
}

/** What the built files of `site` should hold. */
export function expectedSiteFiles(site: string): SiteFile[] {
  return buildSite((path) => readFileSync(join(site, path), "utf8"));
}

/** Writes the built files of `site` and returns the paths of those that changed. */
export function writeSite(site: string): string[] {
  const changed = expectedSiteFiles(site).filter(({ path, content }) => {
    const file = join(site, path);
    return !existsSync(file) || readFileSync(file, "utf8") !== content;
  });
  for (const { path, content } of changed) writeFileSync(join(site, path), content);
  return changed.map(({ path }) => path);
}
