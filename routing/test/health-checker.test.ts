import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHealthChecker } from "../src/health-checker";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const env = { OPERATOR_ALERT_ADDRESS: "operator@example.org" };

let dir: string;
let stateDir: string;
let outDir: string;

const output = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString("utf8"));
      done();
    },
  });
  return { stream, text: () => chunks.join("") };
};

const line = (cursor: string, message: string) => JSON.stringify({ __CURSOR: cursor, MESSAGE: message, CONTAINER_NAME: "family-agenda-core-1", COM_DOCKER_COMPOSE_SERVICE: "core" });

async function check(stdin: string, args = [stateDir, outDir], environment: Record<string, string | undefined> = env) {
  const stdout = output();
  const exitCode = await runHealthChecker(args, { env: environment, stdin, stdout: stdout.stream, now: NOW });
  return { exitCode, stdout: stdout.text(), files: (await readdir(outDir)).sort() };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "health-checker-"));
  stateDir = join(dir, "state");
  outDir = join(dir, "out");
  await mkdir(stateDir);
  await mkdir(outDir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the health check's checker", () => {
  it("writes the state, the cursor and the digest mail of what it found", async () => {
    const result = await check(`${line("s=1", "Error: boom")}\n${line("s=2", "fine")}\n`);

    expect(result.exitCode).toBe(0);
    expect(result.files).toEqual(["cursor", "mail.txt", "state.json"]);
    expect(await readFile(join(outDir, "cursor"), "utf8")).toBe("s=2");
    expect(await readFile(join(outDir, "mail.txt"), "utf8")).toMatch(/^From: Family Agenda Cube <no-reply@family-agenda\.cloud>\r\nTo: operator@example\.org\r\n/);
    expect(JSON.parse(await readFile(join(outDir, "state.json"), "utf8"))).toMatchObject({ fingerprints: { "family-agenda-core-1\nError: boom": { suppressed: 0 } } });
    expect(JSON.parse(result.stdout)).toEqual({ time: NOW.toISOString(), level: "info", message: "Checked the Cube", lines: 2, containers: 0, reported: 1 });
  });

  it("reads the last run's state: the same error within a day is counted, not mailed", async () => {
    await check(line("s=1", "Error: boom"));
    await writeFile(join(stateDir, "state.json"), await readFile(join(outDir, "state.json")));
    await rm(join(outDir, "mail.txt"));

    const result = await check(line("s=2", "Error: boom"));

    expect(result.files).toEqual(["cursor", "state.json"]);
    expect(JSON.parse(await readFile(join(outDir, "state.json"), "utf8"))).toMatchObject({ fingerprints: { "family-agenda-core-1\nError: boom": { suppressed: 1 } } });
  });

  it("writes only the state when there is neither a journal line nor a finding", async () => {
    expect((await check("")).files).toEqual(["state.json"]);
  });

  it("refuses to run without its directories or the Operator's address", async () => {
    for (const [args, environment] of [
      [[stateDir], env],
      [[], env],
      [[stateDir, outDir], {}],
    ] as const) {
      const result = await check("", [...args], environment);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toMatch(/^Usage: /);
      expect(result.files).toEqual([]);
    }
  });
});
