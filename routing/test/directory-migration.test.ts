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

/** The Directory's schema version now. */
const LATEST = 15;

/** The columns of a Family that #225 added. */
const TRIAL_COLUMNS = ["lock_reason", "locked_at", "registered_by", "trial_starts_at"];

/**
 * Turns the Directory back into the one the Routing module left before Trials, Locked Families and
 * Subscriptions (#225): at schema version 7.
 */
async function asBeforeTrials(): Promise<void> {
  await routing.directory("DROP TABLE stripe_event, subscription, setting");
  await routing.directory("ALTER TABLE family DROP COLUMN trial_starts_at, DROP COLUMN registered_by, DROP COLUMN locked_at, DROP COLUMN lock_reason");
  await routing.directory("DELETE FROM directory_migration WHERE version > 7");
}

/**
 * Turns the Directory back into the one the Routing module left before a core prepared a Family on
 * opening it (#119): at schema version 5, with the core version each Family was prepared for and
 * why preparing it last failed.
 */
async function asBeforeCoresPreparedOnOpening(): Promise<void> {
  await asBeforeTrials();
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
    const kept = columnsNow.filter((column) => !TRIAL_COLUMNS.includes(String(column)));
    expect(await columns()).toEqual([...kept, "core_version", "preparation_error", "preparation_failed_for"].sort());

    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });

    expect(await columns()).toEqual(columnsNow);
    expect(await routing.directory("SELECT max(version) AS version FROM directory_migration")).toEqual([{ version: LATEST }]);
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

/** Every column of the Directory's own tables, as information_schema describes it. */
const schema = () =>
  routing.directory(
    `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = 'public' ORDER BY table_name, column_name`,
  );

describe("A Directory from before Trials, Locked Families and Subscriptions", () => {
  it("migrates by adding nullable columns and new tables only, and its Families are as they were", async () => {
    const familyId = /\/([0-9a-f-]{36})\/$/.exec((await routing.run(["create", "--organization-id", ORG])).stdout.trim())![1]!;
    const before = await routing.run(["families"]);
    const latest = await schema();
    await asBeforeTrials();
    const older = await schema();

    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });

    expect(await schema()).toEqual(latest);
    expect(await routing.directory("SELECT max(version) AS version FROM directory_migration")).toEqual([{ version: LATEST }]);
    // What an older Routing module reads and writes stays as it was.
    const key = ({ table_name, column_name }: Record<string, unknown>) => `${String(table_name)}.${String(column_name)}`;
    const olderKeys = new Set(older.map(key));
    expect(latest.filter((column) => olderKeys.has(key(column)))).toEqual(older);
    const added = latest.filter((column) => !olderKeys.has(key(column)));
    const olderTables = new Set(older.map(({ table_name }) => table_name));
    expect(added.filter(({ table_name }) => olderTables.has(table_name))).toEqual(
      TRIAL_COLUMNS.map((column_name): unknown => expect.objectContaining({ table_name: "family", column_name, is_nullable: "YES", column_default: null })),
    );
    expect([...new Set(added.map(({ table_name }) => table_name))].filter((table) => !olderTables.has(table))).toEqual(["setting", "stripe_event", "subscription"]);
    expect(await routing.run(["families"])).toMatchObject({ exitCode: 0, stdout: before.stdout });
    expect(await routing.directory("SELECT trial_starts_at, registered_by, locked_at, lock_reason FROM family WHERE family_id = $1", [familyId])).toEqual([
      { trial_starts_at: null, registered_by: null, locked_at: null, lock_reason: null },
    ]);
  });

  it("refuses a lock reason it does not know, a Subscription of no Family, and a second setting", async () => {
    const familyId = /\/([0-9a-f-]{36})\/$/.exec((await routing.run(["create", "--organization-id", ORG])).stdout.trim())![1]!;

    await expect(routing.directory("UPDATE family SET lock_reason = 'bored' WHERE family_id = $1", [familyId])).rejects.toThrow(/check constraint/);
    await expect(
      routing.directory("INSERT INTO subscription (subscription_id, family_id, holder, status) VALUES ('sub_1', $1, 'user_1', 'active')", [crypto.randomUUID()]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      routing.directory("INSERT INTO subscription (subscription_id, family_id, holder, status, billing) VALUES ('sub_1', $1, 'user_1', 'active', 'weekly')", [familyId]),
    ).rejects.toThrow(/check constraint/);
    await routing.directory("INSERT INTO setting DEFAULT VALUES");
    await expect(routing.directory("INSERT INTO setting (id) VALUES (false)")).rejects.toThrow(/check constraint/);
    await expect(routing.directory("INSERT INTO setting DEFAULT VALUES")).rejects.toThrow(/duplicate key/);
  });
});

describe("A Directory without the mail outbox", () => {
  it("migrates: the outbox is added, empty, and its Families are as they were", async () => {
    await routing.run(["create", "--organization-id", ORG]);
    const before = await routing.run(["families"]);
    await routing.directory("DROP TABLE mail_outbox");
    await routing.directory("DELETE FROM directory_migration WHERE version >= 14");

    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });

    expect(await routing.directory("SELECT count(*)::int AS mails FROM mail_outbox")).toEqual([{ mails: 0 }]);
    expect(
      (await routing.directory("SELECT column_name FROM information_schema.columns WHERE table_name = 'mail_outbox' ORDER BY ordinal_position")).map(
        ({ column_name }) => column_name,
      ),
    ).toEqual([
      "id",
      "type",
      "family_id",
      "mail_from",
      "reply_to",
      "mail_to",
      "subject",
      "body",
      "created_at",
      "attempts",
      "next_attempt_at",
      "claimed_until",
      "last_error",
      "sent_at",
      "body_html",
    ]);
    expect(await routing.directory("SELECT max(version) AS version FROM directory_migration")).toEqual([{ version: LATEST }]);
    expect(await routing.run(["families"])).toMatchObject({ exitCode: 0, stdout: before.stdout });
  });
});

describe("A Directory whose outbox holds plain text alone", () => {
  it("migrates: its mails stay, without HTML", async () => {
    await routing.run(["migrate"]);
    await routing.directory("ALTER TABLE mail_outbox DROP COLUMN body_html");
    await routing.directory("DELETE FROM directory_migration WHERE version >= 15");
    await routing.directory("INSERT INTO mail_outbox (type, mail_from, reply_to, mail_to, subject, body) VALUES ('cancellation', 'a', 'b', 'c', 'd', 'e')");

    expect(await routing.run(["migrate"])).toMatchObject({ exitCode: 0 });

    expect(await routing.directory("SELECT body, body_html FROM mail_outbox")).toEqual([{ body: "e", body_html: null }]);
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
