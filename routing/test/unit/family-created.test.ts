import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { familyCreatedOf } from "../../src/family-created";

const secret = "a webhook secret of 32 characters or more";
const familyId = "0f8fad5b-d9cb-469f-a165-70867728950e";

const sign = (body: Buffer, key = secret) => createHmac("sha256", key).update(body).digest("hex");
const bodyOf = (value: unknown) => Buffer.from(JSON.stringify(value));
const delivery = { event: "family.created", familyId, organizationId: "org_7ka9", email: "admin@example.org" };

/** What the delivery of `value`, signed with the secret, is taken as. */
const taken = (value: unknown) => {
  const body = typeof value === "string" ? Buffer.from(value) : bodyOf(value);
  return familyCreatedOf(body, sign(body), secret);
};

describe("familyCreatedOf", () => {
  it("takes the Family id and Organization id of a signed family.created, and nothing else", () => {
    expect(taken(delivery)).toStrictEqual({ familyId, organizationId: "org_7ka9" });
  });

  it("takes the signature in upper case, and the Family id in lower case", () => {
    const body = bodyOf({ ...delivery, familyId: familyId.toUpperCase() });
    expect(familyCreatedOf(body, sign(body).toUpperCase(), secret)).toEqual({ familyId, organizationId: "org_7ka9" });
  });

  it.each([
    ["no signature", undefined],
    ["an empty one", ""],
    ["one that is no hex", "z".repeat(64)],
    ["one too short", "ab".repeat(31)],
    ["one with another secret", sign(bodyOf(delivery), "another secret of 32 characters or more")],
    ["one of another body", sign(bodyOf({ ...delivery, organizationId: "org_other" }))],
  ])("refuses a delivery with %s as unsigned", (_case, signature) => {
    expect(familyCreatedOf(bodyOf(delivery), signature, secret)).toEqual({ refused: "unsigned" });
  });

  it.each([
    ["no JSON", "family.created"],
    ["an array", [delivery]],
    ["null", null],
    ["another event", { ...delivery, event: "family.deleted" }],
    ["no Family id", { ...delivery, familyId: undefined }],
    ["a Family id that is no UUID", { ...delivery, familyId: "../etc" }],
    ["a numeric Family id", { ...delivery, familyId: 7 }],
    ["no Organization id", { ...delivery, organizationId: undefined }],
    ["an Organization id with a slash", { ...delivery, organizationId: "org/1" }],
    ["an empty Organization id", { ...delivery, organizationId: "" }],
  ])("refuses a signed delivery of %s as malformed", (_case, value) => {
    expect(taken(value)).toEqual({ refused: "malformed" });
  });
});
