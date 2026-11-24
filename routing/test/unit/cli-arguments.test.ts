import { describe, expect, it } from "vitest";
import { parseCreate, parseDelete, parseFamilyId, parseInvite, parseOpenTrials, parseSetFounder, UsageError } from "../../src/cli-arguments";

const familyId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const defaultTimeZone = "Europe/Berlin";
const drawnFamilyId = "6b1f0c2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const draw = () => drawnFamilyId;

/** The message of the UsageError that parsing throws. */
function usageError(parse: () => unknown): string {
  try {
    parse();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return (error as Error).message;
  }
  throw new Error("No UsageError");
}

describe("parseCreate", () => {
  const org = ["--organization-id", "org_7ka9"];

  it("draws a new Family id, leaving the time zone to the default", () => {
    expect(parseCreate(org, defaultTimeZone, draw)).toStrictEqual({ organizationId: "org_7ka9", familyId: drawnFamilyId, familyIdFrom: "drawn" });
  });

  it("draws no Family id for the Family that --family-id names", () => {
    const args = [...org, "--family-id", familyId];
    expect(parseCreate(args, defaultTimeZone, () => expect.unreachable("a Family id drawn")).familyId).toBe(familyId);
  });

  it("finishes the Family that --family-id names, in lower case, in the time zone named", () => {
    const args = [...org, "--time-zone", "America/New_York", "--family-id", familyId.toUpperCase()];
    expect(parseCreate(args, defaultTimeZone, draw)).toEqual({ organizationId: "org_7ka9", timeZone: "America/New_York", familyId, familyIdFrom: "operator" });
  });

  it.each(["a", "Ab-9_z", "x".repeat(64)])("takes %s as the Organization id", (organizationId) => {
    expect(parseCreate(["--organization-id", organizationId], defaultTimeZone, draw).organizationId).toBe(organizationId);
  });

  it("refuses an unknown time zone", () => {
    expect(usageError(() => parseCreate([...org, "--time-zone", "Mars/Olympus"], defaultTimeZone, draw))).toBe("Unknown time zone Mars/Olympus");
  });

  it("refuses an unknown default time zone when none is named", () => {
    expect(usageError(() => parseCreate(org, "Nowhere/Else", draw))).toBe("Unknown time zone Nowhere/Else");
  });

  it.each([
    ["none", []],
    ["an empty one", ["--organization-id", ""]],
    ["one with a space", ["--organization-id", "org 1"]],
    ["one with a slash", ["--organization-id", "org/1"]],
    ["one longer than 64", ["--organization-id", "x".repeat(65)]],
  ])("refuses %s as the Organization id", (_case, args) => {
    expect(usageError(() => parseCreate(args, defaultTimeZone, draw))).toBe("--organization-id needs the id of the Family's Logto Organization");
  });

  it("checks the Organization id before the time zone", () => {
    expect(usageError(() => parseCreate(["--time-zone", "Mars/Olympus"], defaultTimeZone, draw))).toMatch(/^--organization-id/);
  });

  it.each([["not-a-uuid"], [""], [`${familyId}0`]])("refuses %j as a --family-id", (value) => {
    expect(usageError(() => parseCreate([...org, "--family-id", value], defaultTimeZone, draw))).toBe("--family-id needs a Family id, a UUID");
  });

  it("refuses an option it does not know, with parseArgs' message", () => {
    expect(usageError(() => parseCreate(["--organization-id", "org_7ka9", "--force"], defaultTimeZone, draw))).toMatch(/--force/);
  });

  it("refuses an argument that is not an option", () => {
    expect(usageError(() => parseCreate(["--organization-id", "org_7ka9", "extra"], defaultTimeZone, draw))).toMatch(/extra/);
  });
});

describe("parseDelete", () => {
  it("names the Family and the confirmation, both in lower case, and leaves checking them to deleteFamily", () => {
    expect(parseDelete(["--family-id", "Not-A-UUID", "--confirm", familyId.toUpperCase()])).toEqual({ familyId: "not-a-uuid", confirmation: familyId });
  });

  it.each([[["--confirm", familyId]], [["--family-id", "", "--confirm", familyId]]])("refuses a missing Family id: %j", (args) => {
    expect(usageError(() => parseDelete(args))).toBe("--family-id needs the Family id of the Family to delete");
  });

  it("refuses a missing confirmation", () => {
    expect(usageError(() => parseDelete(["--family-id", familyId]))).toBe("--confirm needs the Family id once more");
  });

  it("takes an empty confirmation, which deleteFamily refuses", () => {
    expect(parseDelete(["--family-id", familyId, "--confirm", ""])).toEqual({ familyId, confirmation: "" });
  });
});

describe("parseFamilyId", () => {
  it("names the Family, in lower case", () => {
    expect(parseFamilyId(["--family-id", familyId.toUpperCase()])).toBe(familyId);
  });

  it.each([[[]], [["--family-id", "nope"]]])("refuses %j", (args) => {
    expect(usageError(() => parseFamilyId(args))).toBe("--family-id needs a Family id, a UUID");
  });

  it("refuses an option it does not know", () => {
    expect(usageError(() => parseFamilyId(["--family-id", familyId, "--confirm", familyId]))).toMatch(/--confirm/);
  });
});

describe("parseOpenTrials", () => {
  const other = "6b1f0c2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";

  it("excepts no Family when none is named", () => {
    expect(parseOpenTrials([])).toEqual([]);
  });

  it("excepts every Family that an --except names, in lower case", () => {
    expect(parseOpenTrials(["--except", familyId.toUpperCase(), "--except", other])).toEqual([familyId, other]);
  });

  it.each([[["--except", "nope"]], [["--except", familyId, "--except", ""]]])("refuses an --except that names no Family id: %j", (args) => {
    expect(usageError(() => parseOpenTrials(args))).toBe("--except needs a Family id, a UUID");
  });

  it("refuses an option it does not know", () => {
    expect(usageError(() => parseOpenTrials(["--family-id", familyId]))).toMatch(/--family-id/);
  });

  it("refuses an argument that is not an option", () => {
    expect(usageError(() => parseOpenTrials([familyId]))).toMatch(new RegExp(familyId));
  });
});

describe("parseSetFounder", () => {
  it("names the Family, in lower case, and the Admin as given", () => {
    expect(parseSetFounder([familyId.toUpperCase(), "Anna@Example.org"])).toStrictEqual({ familyId, admin: "Anna@Example.org", force: false });
  });

  it("overwrites a recorded founder with --force, before or after the arguments", () => {
    expect(parseSetFounder(["--force", familyId, "user_1"])).toStrictEqual({ familyId, admin: "user_1", force: true });
    expect(parseSetFounder([familyId, "user_1", "--force"])).toStrictEqual({ familyId, admin: "user_1", force: true });
  });

  it.each([[[]], [["nope", "user_1"]]])("refuses %j, which names no Family id", (args) => {
    expect(usageError(() => parseSetFounder(args))).toBe("set-founder needs the Family id, a UUID, then the Admin's email or user id");
  });

  it.each([[[familyId]], [[familyId, ""]], [[familyId, "user_1", "user_2"]]])("refuses %j, which does not name one Admin", (args) => {
    expect(usageError(() => parseSetFounder(args))).toBe("set-founder needs the Family id, a UUID, then the Admin's email or user id");
  });

  it("refuses an option it does not know", () => {
    expect(usageError(() => parseSetFounder([familyId, "user_1", "--confirm"]))).toMatch(/--confirm/);
  });
});

describe("parseInvite", () => {
  it("names the person by email, in lower case, and German unless asked for", () => {
    expect(parseInvite(["Anna.B@Example.org"])).toStrictEqual({ email: "anna.b@example.org", language: "de" });
    expect(parseInvite(["anna@example.org", "--language", "de"])).toStrictEqual({ email: "anna@example.org", language: "de" });
    expect(parseInvite(["--language", "en", "anna@example.org"])).toStrictEqual({ email: "anna@example.org", language: "en" });
  });

  it.each([[[]], [["anna"]], [["anna@example"]], [["a b@example.org"]], [["a@b@example.org"]], [["anna@example.org x"]], [["x anna@example.org"]], [["anna@example.org", "bert@example.org"]], [["@example.org"]], [["anna@.org"]], [["anna@example."]], [["anna@exa mple.org"]], [["anna@example.o rg"]]])(
    "refuses %j, which does not name one email",
    (args) => {
      expect(usageError(() => parseInvite(args))).toBe("invite needs the email of the person to invite");
    },
  );

  it.each([["fr"], [""]])("refuses the language %j", (language) => {
    expect(usageError(() => parseInvite(["anna@example.org", "--language", language]))).toBe("--language needs de or en");
  });

  it("refuses an option it does not know", () => {
    expect(usageError(() => parseInvite(["anna@example.org", "--force"]))).toMatch(/--force/);
  });
});
