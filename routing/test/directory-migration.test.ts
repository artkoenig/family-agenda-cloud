import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";

const ORG = "org_first";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

/**
 * Turns the Directory back into the one the Routing module left before a core prepared a Family on
 * opening it (#119): at schema version 5, with the core version each Family was prepared for and
 * why preparing it last failed.
 */
async function asBeforeCoresPreparedOnOpening(): Promise<void> {
  await routing.directory("ALTER TABLE family ADD COLUMN core_version text, ADD COLUMN preparation_failed_for text, ADD COLUMN preparation_error text");
  await routing.directory("UPDATE family SET core_version = '0.7.0', preparation_failed_for = '0.8.0', preparation_error = 'the core answered 500'");
  await routing.directory("DELETE FROM directory_migration WHERE version > 5");
}

const columns = async () =>
  (await routing.directory("SELECT column_name FROM information_schema.columns WHERE table_name = 'family' ORDER BY column_name")).map(({ column_name }) => column_name);

describe("A Directory that holds each Family's core version", () => {
  it("migrates: the core version and the failed preparation are gone, and its Families are as they were", async () => {
    const created = await routing.run(["create", "--organization-id", ORG]);
    const familyId = /\/([0-9a-f-]{36})\/$/.exec(created.stdout.trim())![1]!;
    const before = await routing.run(["families"]);
    const columnsNow = await columns();
    await asBeforeCoresPreparedOnOpening();
    expect(await columns()).toEqual([...columnsNow, "core_version", "preparation_error", "preparation_failed_for"].sort());

    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });

    expect(await columns()).toEqual(columnsNow);
    expect(await routing.directory("SELECT max(version) AS version FROM directory_migration")).toEqual([{ version: 7 }]);
    const after = await routing.run(["families"]);
    expect(after).toMatchObject({ exitCode: 0, stdout: before.stdout });
    expect(after.stdout).toBe(`${familyId}\tactive\tdue work never ran\n`);
    // Its wrapped family key and database password still open: a core is handed its Context.
    const router = await routing.startRouter();
    expect((await fetch(`${router.url}/${familyId}/admin`)).status).toBe(200);
  });

  it("is migrated by whichever command runs first, and serves a Family prepared for an older core version", async () => {
    const created = await routing.run(["create", "--organization-id", ORG]);
    const familyId = /\/([0-9a-f-]{36})\/$/.exec(created.stdout.trim())![1]!;
    await asBeforeCoresPreparedOnOpening();

    // `routing serve` migrates first; here the same through the command the Operator lists Families with.
    expect(await routing.run(["families"])).toMatchObject({ exitCode: 0 });
    const router = await routing.startRouter();

    expect((await fetch(`${router.url}/${familyId}/admin`)).status).toBe(200);
  });
});

describe("The command line", () => {
  it("has no roll-out command any more, and asks for no CORE_VERSION", async () => {
    const result = await routing.run(["roll-out"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown command roll-out");
    expect(result.stderr).not.toContain("CORE_VERSION");
    expect(routing.env).not.toHaveProperty("CORE_VERSION");
  });
});
