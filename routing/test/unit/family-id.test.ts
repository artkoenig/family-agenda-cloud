import { describe, expect, it } from "vitest";
import { blobLocationOf, familyIdInPath, isFamilyId } from "../../src/family-id";

const familyId = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("isFamilyId", () => {
  it("takes a UUID in lower case", () => {
    expect(isFamilyId(familyId)).toBe(true);
  });

  it.each([
    ["upper case", familyId.toUpperCase()],
    ["a UUID without its hyphens", familyId.replaceAll("-", "")],
    ["text before the UUID", `x${familyId}`],
    ["text after the UUID", `${familyId}x`],
    ["a letter that is not hexadecimal", familyId.replace("f", "g")],
    ["a group one character short", "0f8fad5-d9cb-469f-a165-70867728950e"],
    ["nothing", ""],
  ])("refuses %s", (_case, text) => {
    expect(isFamilyId(text)).toBe(false);
  });
});

describe("familyIdInPath", () => {
  it("finds the Family id as the first segment, and the path after it", () => {
    expect(familyIdInPath(`/${familyId}/api/agendas?view=week`)).toEqual({ familyId, path: "/api/agendas?view=week" });
  });

  it("answers the root for a path that is the Family id alone", () => {
    expect(familyIdInPath(`/${familyId}`)).toEqual({ familyId, path: "/" });
  });

  it("keeps the slash after the Family id", () => {
    expect(familyIdInPath(`/${familyId}/`)).toEqual({ familyId, path: "/" });
  });

  it("puts a query right after the Family id on the root", () => {
    expect(familyIdInPath(`/${familyId}?x=1`)).toEqual({ familyId, path: "/?x=1" });
  });

  it("keeps a line break in the rest of the path", () => {
    expect(familyIdInPath(`/${familyId}/a\nb`)).toEqual({ familyId, path: "/a\nb" });
  });

  it.each([
    ["a segment that only begins with a Family id", `/${familyId}x/api`],
    ["a Family id in upper case", `/${familyId.toUpperCase()}/api`],
    ["a Family id that is not the first segment", `/static/${familyId}`],
    ["a path without a leading slash", `${familyId}/api`],
    ["the root", "/"],
  ])("finds none in %s", (_case, path) => {
    expect(familyIdInPath(path)).toBeUndefined();
  });
});

describe("blobLocationOf", () => {
  it("puts the Family's blobs in a directory of the blob root named after its Family id", () => {
    expect(blobLocationOf({ blobRoot: "/srv/blobs" }, familyId)).toBe(`/srv/blobs/${familyId}`);
  });
});
