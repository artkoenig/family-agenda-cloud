import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { check, parseInput, parseState } from "./health-check";
import { digestMail } from "./health-mail";

/**
 * The health check's checker (#208), which cube/health/health-check.sh runs in the Routing
 * module's image with `docker run`, without docker.sock, the journal or a network: it reads the
 * journal and the containers' states on stdin and the last run's state from `<state dir>`, and
 * writes into `<out dir>` the state to keep (state.json), the journal's cursor to go on from
 * (cursor, when there were lines) and the digest mail (mail.txt, when there is something new).
 * The script sends the mail and keeps the state only when the mail went out.
 */
export type CheckerIo = {
  env: Record<string, string | undefined>;
  stdin: string;
  stdout: Writable;
  now?: Date;
};

const readState = (stateDir: string) => readFile(join(stateDir, "state.json"), "utf8").catch(() => undefined);

export async function runHealthChecker([stateDir, outDir]: string[], { env, stdin, stdout, now = new Date() }: CheckerIo): Promise<number> {
  const to = env.OPERATOR_ALERT_ADDRESS;
  if (!stateDir || !outDir || !to) {
    stdout.write("Usage: OPERATOR_ALERT_ADDRESS=<address> health-checker <state dir> <out dir>, the input on stdin\n");
    return 2;
  }
  const input = parseInput(stdin);
  const { reported, state } = check(input, parseState(await readState(stateDir)), now);
  await writeFile(join(outDir, "state.json"), JSON.stringify(state));
  if (input.cursor !== undefined) await writeFile(join(outDir, "cursor"), input.cursor);
  if (reported.length > 0) await writeFile(join(outDir, "mail.txt"), digestMail({ reported, to, now, messageId: randomUUID() }));
  stdout.write(`${JSON.stringify({ time: now.toISOString(), level: "info", message: "Checked the Cube", lines: input.journal.length, containers: input.containers.length, reported: reported.length })}\n`);
  return 0;
}
