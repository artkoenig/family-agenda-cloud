import { describe, expect, it } from "vitest";
import { parseCreate, parseDelete, parseFamilyId, parseReset, UsageError } from "../../src/cli-arguments";
import { isFamilyId } from "../../src/family-id";

const familyId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const defaultTimeZone = "Europe/Berlin";

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
  it("draws a new Family id, leaving the time zone to the default", () => {
    const input = parseCreate(["--admin-email", "ada@example.org"], defaultTimeZone);
    expect(input).toEqual({ adminEmail: "ada@example.org", familyId: input.familyId, resume: false });
    expect(isFamilyId(input.familyId)).toBe(true);
  });

  it("draws another Family id each time", () => {
    const args = ["--admin-email", "ada@example.org"];
    expect(parseCreate(args, defaultTimeZone).familyId).not.toBe(parseCreate(args, defaultTimeZone).familyId);
  });

  it("finishes the Family that --family-id names, in lower case, in the time zone named", () => {
    const args = ["--admin-email", "ada@example.org", "--time-zone", "America/New_York", "--family-id", familyId.toUpperCase()];
    expect(parseCreate(args, defaultTimeZone)).toEqual({ adminEmail: "ada@example.org", timeZone: "America/New_York", familyId, resume: true });
  });

  it("refuses an unknown time zone", () => {
    expect(usageError(() => parseCreate(["--admin-email", "ada@example.org", "--time-zone", "Mars/Olympus"], defaultTimeZone))).toBe(
      "Unknown time zone Mars/Olympus",
    );
  });

  it("refuses an unknown default time zone when none is named", () => {
    expect(usageError(() => parseCreate(["--admin-email", "ada@example.org"], "Nowhere/Else"))).toBe("Unknown time zone Nowhere/Else");
  });

  it.each([
    ["none", []],
    ["an empty one", ["--admin-email", ""]],
    ["one without @", ["--admin-email", "ada.example.org"]],
    ["one with two @", ["--admin-email", "ada@b@example.org"]],
    ["one with nothing before @", ["--admin-email", "@example.org"]],
    ["one with an undotted domain", ["--admin-email", "ada@localhost"]],
    ["one with an empty domain label", ["--admin-email", "ada@example..org"]],
    ["one with a domain starting with a dot", ["--admin-email", "ada@.example.org"]],
    ["one with a space in the domain", ["--admin-email", "ada@exa mple.org"]],
    ["one with a space before @", ["--admin-email", "a da@example.org"]],
    ["one with a trailing dot", ["--admin-email", "ada@example.org."]],
  ])("refuses %s as the first Admin's email address", (_case, args) => {
    expect(usageError(() => parseCreate(args, defaultTimeZone))).toBe("--admin-email needs the email address of the first Admin");
  });

  it("checks the email address before the time zone", () => {
    expect(usageError(() => parseCreate(["--time-zone", "Mars/Olympus"], defaultTimeZone))).toMatch(/^--admin-email/);
  });

  it.each([["not-a-uuid"], [""], [`${familyId}0`]])("refuses %j as a --family-id", (value) => {
    expect(usageError(() => parseCreate(["--admin-email", "ada@example.org", "--family-id", value], defaultTimeZone))).toBe(
      "--family-id needs a Family id, a UUID",
    );
  });

  it("refuses an option it does not know, with parseArgs' message", () => {
    expect(usageError(() => parseCreate(["--admin-email", "ada@example.org", "--force"], defaultTimeZone))).toMatch(/--force/);
  });

  it("refuses an argument that is not an option", () => {
    expect(usageError(() => parseCreate(["--admin-email", "ada@example.org", "extra"], defaultTimeZone))).toMatch(/extra/);
  });
});

describe("parseReset", () => {
  it("names the Family, in lower case, and the Admin", () => {
    expect(parseReset(["--family-id", familyId.toUpperCase(), "--admin-email", "ada@example.org"])).toEqual({ familyId, adminEmail: "ada@example.org" });
  });

  it("refuses a missing Family id", () => {
    expect(usageError(() => parseReset(["--admin-email", "ada@example.org"]))).toBe("--family-id needs a Family id, a UUID");
  });

  it("refuses a missing email address, naming the Admin", () => {
    expect(usageError(() => parseReset(["--family-id", familyId]))).toBe("--admin-email needs the email address of the Admin");
  });

  it("refuses an option of another command", () => {
    expect(usageError(() => parseReset(["--family-id", familyId, "--admin-email", "ada@example.org", "--time-zone", "UTC"]))).toMatch(/--time-zone/);
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
