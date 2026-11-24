import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expectedSiteFiles, siteDirectory, writeSite } from "../../src/legal-site";

describe("the committed site/", () => {
  it("is up to date with site/legal/ and the footer: run `pnpm legal-pages` after changing them", () => {
    const site = siteDirectory();

    for (const { path, content } of expectedSiteFiles(site)) expect(readFileSync(join(site, path), "utf8"), path).toBe(content);
  });
});

describe("writeSite and siteDirectory", () => {
  const directories: string[] = [];
  const temporary = () => {
    const directory = mkdtempSync(join(tmpdir(), "legal-site-"));
    directories.push(directory);
    return directory;
  };
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("writes the files that are missing or out of date, and only those", () => {
    const site = join(temporary(), "site");
    for (const path of ["legal", "index.html", "en/index.html"]) cpSync(join(siteDirectory(), path), join(site, path), { recursive: true });

    expect(writeSite(site)).toEqual(["impressum.html", "en/imprint.html", "datenschutz.html", "en/privacy.html", "agb.html", "en/terms.html"]);
    expect(writeSite(site)).toEqual([]);

    writeFileSync(join(site, "en/imprint.html"), "stale");
    expect(writeSite(site)).toEqual(["en/imprint.html"]);
    expect(readFileSync(join(site, "en/imprint.html"), "utf8")).toMatch(/^<!doctype html>/);
  });

  it("finds the nearest site/ with legal/ above a directory", () => {
    const root = temporary();
    mkdirSync(join(root, "site/legal"), { recursive: true });
    mkdirSync(join(root, "routing/.stryker-tmp/sandbox/src"), { recursive: true });

    expect(siteDirectory(join(root, "routing/.stryker-tmp/sandbox/src"))).toBe(join(root, "site"));
    expect(siteDirectory(root)).toBe(join(root, "site"));
  });

  it("refuses a directory with no site/legal/ above it", () => {
    const root = temporary();
    mkdirSync(join(root, "site"));

    expect(() => siteDirectory(root)).toThrow("No site/legal/ above the Routing module");
  });
});
