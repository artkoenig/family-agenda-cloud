import { describe, expect, it } from "vitest";
import { newerPreparedVersion } from "../../src/core-version";

describe("newerPreparedVersion", () => {
  it.each([
    ["0.3.2", "0.3.1"],
    ["0.4.0", "0.3.9"],
    ["1.0.0", "0.9.9"],
    ["0.10.0", "0.9.0"],
    ["10.0.0", "9.99.99"],
  ])("answers %s, a newer version than %s", (version, than) => {
    expect(newerPreparedVersion(version, than)).toBe(version);
  });

  it.each([
    ["the same version", "0.3.1", "0.3.1"],
    ["an older patch", "0.3.0", "0.3.1"],
    ["an older minor, though a later patch", "0.2.9", "0.3.0"],
    ["an older major, though a later minor", "0.9.0", "1.0.0"],
    ["a version compared as numbers, not as text", "0.9.0", "0.10.0"],
  ])("answers none for %s", (_case, version, than) => {
    expect(newerPreparedVersion(version, than)).toBeUndefined();
  });

  it.each([
    ["a version with a pre-release", "0.4.0-rc.1", "0.3.1"],
    ["a version with two parts", "1.0", "0.3.1"],
    ["a version with four parts", "1.0.0.0", "0.3.1"],
    ["a version with a leading v", "v1.0.0", "0.3.1"],
    ["text before the version", "x1.0.0", "0.3.1"],
    ["text after the version", "1.0.0x", "0.3.1"],
    ["empty text", "", "0.3.1"],
    ["a CORE_VERSION that is not major.minor.patch", "1.0.0", "0.3"],
  ])("answers none for %s", (_case, version, than) => {
    expect(newerPreparedVersion(version, than)).toBeUndefined();
  });

  it("answers none for a Family prepared for no core version yet", () => {
    expect(newerPreparedVersion(null, "0.3.1")).toBeUndefined();
  });
});
