import type pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directory, type Directory } from "../src/directory";
import { setUpRouting, type TestRouting } from "./support/routing";

let routing: TestRouting;
let families: Directory;
beforeEach(async () => {
  routing = await setUpRouting();
  const client = { query: async (sql: string, values?: unknown[]) => ({ rows: await routing.directory(sql, values) }) };
  families = directory(client as unknown as Pick<pg.ClientBase, "query">);
});
afterEach(async () => {
  await routing.close();
});

/** Creates a Family of the Organization through the command line; answers its Family id. */
async function createFamily(organizationId: string): Promise<string> {
  const result = await routing.run(["create", "--organization-id", organizationId]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  return /\/([0-9a-f-]{36})\/$/.exec(result.stdout.trim())![1]!;
}

describe("Finding a Family by its Organization id", () => {
  it("finds an active Family", async () => {
    const familyId = await createFamily("org_active");

    expect(await families.findByOrganization("org_active")).toMatchObject({ familyId, status: "active", organizationId: "org_active" });
  });

  it("finds a Family being prepared", async () => {
    const familyId = await createFamily("org_prepared");
    await routing.directory("UPDATE family SET status = 'being_prepared' WHERE family_id = $1", [familyId]);

    expect(await families.findByOrganization("org_prepared")).toMatchObject({ familyId, status: "being_prepared" });
  });

  it("finds a suspended Family", async () => {
    const familyId = await createFamily("org_suspended");
    expect(await routing.run(["suspend", "--family-id", familyId])).toMatchObject({ exitCode: 0 });

    expect(await families.findByOrganization("org_suspended")).toMatchObject({ familyId, status: "suspended" });
  });

  it("finds a deleted Family", async () => {
    const familyId = await createFamily("org_deleted");
    await families.markDeleted(familyId);

    expect(await families.findByOrganization("org_deleted")).toMatchObject({ familyId, status: "deleted" });
  });

  it("finds nothing for an Organization it does not know", async () => {
    await createFamily("org_known");

    expect(await families.findByOrganization("org_unknown")).toBeNull();
  });

  it("never gives two Families the same Organization id", async () => {
    await createFamily("org_shared");
    const second = await routing.run(["create", "--organization-id", "org_shared"]);

    expect(second.exitCode).not.toBe(0);
    expect(await routing.directory("SELECT family_id FROM family WHERE organization_id = 'org_shared'")).toHaveLength(1);
  });
});
