import { describe, expect, it } from "vitest";
import type { FamilyStatus } from "../../src/directory";
import { landingOf } from "../../src/landing";

/** A Directory that knows these Organizations, each with its Family. */
const directoryOf = (families: Record<string, { familyId: string; status: FamilyStatus }>) => (organizationId: string) =>
  Promise.resolve(families[organizationId] ?? null);

describe("landingOf (spec: landingOf, landingOfFamily)", () => {
  it("lands in the Family of the one claimed Organization when it is active", async () => {
    const find = directoryOf({ org_a: { familyId: "f-a", status: "active" } });

    expect(await landingOf(["org_a"], find)).toEqual({ page: "family", familyId: "f-a" });
  });

  it("waits for a Family being prepared", async () => {
    const find = directoryOf({ org_a: { familyId: "f-a", status: "being_prepared" } });

    expect(await landingOf(["org_a"], find)).toEqual({ page: "preparing" });
  });

  it("waits for an Organization the Directory does not know: its family.created is on its way", async () => {
    expect(await landingOf(["org_new"], directoryOf({}))).toEqual({ page: "preparing" });
  });

  it("waits when the claim names no Organization, without asking the Directory", async () => {
    const asked: string[] = [];
    const find = (organizationId: string) => {
      asked.push(organizationId);
      return Promise.resolve(null);
    };

    expect(await landingOf([], find)).toEqual({ page: "preparing" });
    expect(asked).toEqual([]);
  });

  it.each(["suspended", "deleted"] as const)("shows a Family %s as unavailable", async (status) => {
    const find = directoryOf({ org_a: { familyId: "f-a", status } });

    expect(await landingOf(["org_a"], find)).toEqual({ page: "unavailable" });
  });

  it("refuses a claim of several Organizations, without asking the Directory", async () => {
    const asked: string[] = [];
    const find = (organizationId: string) => {
      asked.push(organizationId);
      return Promise.resolve({ familyId: "f-a", status: "active" as const });
    };

    expect(await landingOf(["org_a", "org_b"], find)).toEqual({ page: "several" });
    expect(asked).toEqual([]);
  });
});
