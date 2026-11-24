import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * cube/health/health-check.sh, with docker, journalctl and curl stood in for on PATH. The stand-in
 * docker runs the real checker (routing/src/health-main.ts) with the mounts of `docker run`
 * turned into this machine's directories; curl records the mail it would send and the pings.
 */
const script = fileURLToPath(new URL("../../cube/health/health-check.sh", import.meta.url));
const routingDir = fileURLToPath(new URL("..", import.meta.url));

const DOCKER = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$STUB/calls"
case $1 in
ps) cut -d'"' -f4 "$STUB/containers.jsonl" ;;
inspect) cat "$STUB/containers.jsonl" ;;
run)
	shift
	mounts=()
	while [[ $# -gt 0 ]]; do
		case $1 in
		-v) mounts+=("$2"); shift 2 ;;
		--network | --tmpfs | --user | --cap-drop | --security-opt | -e | --entrypoint) shift 2 ;;
		--rm | -i | --read-only) shift ;;
		*) break ;;
		esac
	done
	shift
	[[ -z \${STUB_CHECKER_FAILS:-} ]] || exit 1
	args=()
	for arg in "$@"; do
		for mount in "\${mounts[@]}"; do
			host=\${mount%%:*} rest=\${mount#*:}
			[[ $arg == "\${rest%%:*}" ]] && arg=$host
		done
		args+=("$arg")
	done
	cd "$ROUTING" && exec node "\${args[@]}"
	;;
esac
`;

const JOURNALCTL = `#!/usr/bin/env bash
printf 'journalctl %s\\n' "$*" >> "$STUB/calls"
cat "$STUB/journal.jsonl"
`;

const CURL = `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "$STUB/calls"
while [[ $# -gt 0 ]]; do
	case $1 in
	--url) url=$2; shift 2 ;;
	--upload-file) mail=$2; shift 2 ;;
	*) shift ;;
	esac
done
if [[ -n \${mail:-} ]]; then
	cat > "$STUB/curl-config"
	[[ -z \${STUB_SMTP_FAILS:-} ]] || { echo "curl: (67) Login denied" >&2; exit 67; }
	cp "$mail" "$STUB/sent-mail.txt"
else
	echo "$url" >> "$STUB/pings"
fi
`;

const ENV = [
  "OPERATOR_KEY=x",
  "OPERATOR_ALERT_ADDRESS=operator@example.org",
  "HEALTH_HEARTBEAT_URL='https://hc-ping.com/1234'",
  "SMTP_PASSWORD=\"pa\\ss\"word\"",
  "",
].join("\n");

let stub: string;
let state: string;

const container = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "c1", name: "/family-agenda-core-1", service: "core", status: "running", health: "healthy", restartCount: 0, restartPolicy: "unless-stopped", exitCode: 0, ...fields });
const journalLine = (cursor: string, message: string) => JSON.stringify({ __CURSOR: cursor, MESSAGE: message, CONTAINER_NAME: "family-agenda-core-1", COM_DOCKER_COMPOSE_SERVICE: "core" });

async function given({ journal = [] as string[], containers = [container()], env = ENV } = {}) {
  await writeFile(join(stub, "journal.jsonl"), journal.map((line) => `${line}\n`).join(""));
  await writeFile(join(stub, "containers.jsonl"), containers.map((line) => `${line}\n`).join(""));
  await writeFile(join(stub, ".env"), env);
  await rm(join(stub, "calls"), { force: true });
  await rm(join(stub, "pings"), { force: true });
  await rm(join(stub, "sent-mail.txt"), { force: true });
}

type Run = { exitCode: number; stdout: string; calls: string[]; pings: string[]; mail: string | undefined };

async function run(extra: Record<string, string> = {}): Promise<Run> {
  const env = { PATH: `${join(stub, "bin")}:${process.env.PATH ?? ""}`, STUB: stub, ROUTING: routingDir, HEALTH_ENV_FILE: join(stub, ".env"), HEALTH_STATE_DIR: state, ...extra };
  const { exitCode, stdout } = await promisify(execFile)("bash", [script], { env }).then(
    ({ stdout }) => ({ exitCode: 0, stdout }),
    (error: unknown) => {
      const { code, stdout } = error as { code: number; stdout: string };
      return { exitCode: code, stdout };
    },
  );
  const lines = async (file: string) => (await readFile(join(stub, file), "utf8").catch(() => "")).split("\n").filter(Boolean);
  const mail = await readFile(join(stub, "sent-mail.txt"), "utf8").catch(() => undefined);
  return { exitCode, stdout, calls: await lines("calls"), pings: await lines("pings"), mail };
}

const textOf = (mail: string) => Buffer.from(mail.split("\r\n\r\n")[1]!.replaceAll("\r\n", ""), "base64").toString("utf8");

beforeEach(async () => {
  stub = await mkdtemp(join(tmpdir(), "health-check-"));
  state = join(stub, "state");
  await mkdir(join(stub, "bin"));
  for (const [name, content] of Object.entries({ docker: DOCKER, journalctl: JOURNALCTL, curl: CURL })) {
    await writeFile(join(stub, "bin", name), content);
    await chmod(join(stub, "bin", name), 0o755);
  }
});
afterEach(async () => {
  await rm(stub, { recursive: true, force: true });
});

describe("the health check of the Cube", () => {
  it("mails the errors of the journal to the Operator through the mailbox, keeps the state and pings the heartbeat", async () => {
    await given({ journal: [journalLine("s=1", "Polling Sources failed: connect ECONNREFUSED 10.0.0.5:443"), journalLine("s=2", "Listening on 3002")] });

    const result = await run();

    expect(result.exitCode).toBe(0);
    expect(result.calls).toContainEqual("journalctl -u docker.service -o json --no-pager --since -15min --output-fields=MESSAGE,CONTAINER_NAME,COM_DOCKER_COMPOSE_SERVICE");
    const dockerRun = result.calls.find((call) => call.startsWith("docker run"));
    expect(dockerRun).toMatch(/^docker run --rm -i --network none --read-only --tmpfs \/tmp --user 0:0 --cap-drop ALL --security-opt no-new-privileges -e OPERATOR_ALERT_ADDRESS /);
    expect(dockerRun).toContain(`-v ${state}:/state:ro`);
    expect(dockerRun).not.toContain("docker.sock");
    expect(dockerRun).not.toContain("journal");
    expect(dockerRun).toMatch(/--entrypoint node family-agenda-routing:local --import tsx src\/health-main.ts \/state \/out$/);

    const smtp = result.calls.find((call) => call.includes("--mail-rcpt"));
    expect(smtp).toMatch(
      /^curl -sS -m 60 --ssl-reqd --url smtps:\/\/smtp\.ionos\.de:465 --mail-from support@family-agenda\.cloud --mail-rcpt operator@example\.org --upload-file \S+\/out\/mail\.txt -K -$/,
    );
    expect(smtp).not.toContain("pa\\ss");
    expect(await readFile(join(stub, "curl-config"), "utf8")).toBe('user = "support@family-agenda.cloud:pa\\\\ss\\"word"\n');

    expect(result.mail).toContain("To: operator@example.org\r\n");
    const text = textOf(result.mail!);
    expect(text).toContain("family-agenda-core-1: once since the last run");
    expect(text).toContain("Example: Polling Sources failed: connect ECONNREFUSED <ip>:443");
    expect(await readFile(join(state, "cursor"), "utf8")).toBe("s=2");
    expect(JSON.parse(await readFile(join(state, "state.json"), "utf8"))).toMatchObject({ restarts: { c1: 0 } });
    expect(result.pings).toEqual(["https://hc-ping.com/1234"]);
  });

  it("goes on after the cursor of the last run, and does not mail the same error again within a day", async () => {
    await given({ journal: [journalLine("s=1", "Error: boom")] });
    await run();
    await given({ journal: [journalLine("s=2", "Error: boom")] });

    const second = await run();

    expect(second.exitCode).toBe(0);
    expect(second.calls).toContainEqual("journalctl -u docker.service -o json --no-pager --after-cursor s=1 --output-fields=MESSAGE,CONTAINER_NAME,COM_DOCKER_COMPOSE_SERVICE");
    expect(second.mail).toBeUndefined();
    expect(second.calls.some((call) => call.includes("--mail-rcpt"))).toBe(false);
    expect(await readFile(join(state, "cursor"), "utf8")).toBe("s=2");
    expect(JSON.parse(await readFile(join(state, "state.json"), "utf8"))).toMatchObject({ fingerprints: { "family-agenda-core-1\nError: boom": { suppressed: 1 } } });
    expect(second.pings).toEqual(["https://hc-ping.com/1234"]);
  });

  it("sends no mail and pings the heartbeat when nothing is wrong, keeping the cursor without new lines", async () => {
    await given({ journal: [journalLine("s=1", "Listening on 3002")] });
    await run();
    await given();

    const result = await run();

    expect(result.exitCode).toBe(0);
    expect(result.mail).toBeUndefined();
    expect(await readFile(join(state, "cursor"), "utf8")).toBe("s=1");
    expect(result.pings).toEqual(["https://hc-ping.com/1234"]);
  });

  it("reports a container that restarted since the last run", async () => {
    await given({ containers: [container({ restartCount: 1 })] });
    await run();
    await given({ containers: [container({ restartCount: 2 }), container({ id: "c2", name: "/family-agenda-postgres-1", health: "unhealthy" })] });

    const result = await run();

    const text = textOf(result.mail!);
    expect(text).toContain("Example: family-agenda-core-1 restarted");
    expect(text).toContain("Example: family-agenda-postgres-1 is unhealthy");
  });

  it("fails, pings /fail and keeps neither state nor cursor when the mail cannot be sent, so that the next run mails again", async () => {
    await given({ journal: [journalLine("s=1", "Error: boom")] });

    const failed = await run({ STUB_SMTP_FAILS: "1" });

    expect(failed.exitCode).not.toBe(0);
    expect(failed.pings).toEqual(["https://hc-ping.com/1234/fail"]);
    expect(existsSync(join(state, "cursor"))).toBe(false);
    expect(existsSync(join(state, "state.json"))).toBe(false);

    await given({ journal: [journalLine("s=1", "Error: boom")] });
    const next = await run();

    expect(next.exitCode).toBe(0);
    expect(next.calls).toContainEqual(expect.stringContaining("--since -15min"));
    expect(textOf(next.mail!)).toContain("Error: boom");
    expect(next.pings).toEqual(["https://hc-ping.com/1234"]);
  });

  it("fails and pings /fail when the checker fails", async () => {
    await given({ journal: [journalLine("s=1", "Error: boom")] });

    const result = await run({ STUB_CHECKER_FAILS: "1" });

    expect(result.exitCode).not.toBe(0);
    expect(result.pings).toEqual(["https://hc-ping.com/1234/fail"]);
    expect(existsSync(join(state, "cursor"))).toBe(false);
  });

  it("fails and pings /fail without OPERATOR_ALERT_ADDRESS or SMTP_PASSWORD", async () => {
    await given({ env: "HEALTH_HEARTBEAT_URL=https://hc-ping.com/1234\n" });
    const noAddress = await run();
    expect(noAddress.exitCode).not.toBe(0);
    expect(noAddress.stdout).toContain("OPERATOR_ALERT_ADDRESS is not set");
    expect(noAddress.pings).toEqual(["https://hc-ping.com/1234/fail"]);

    await given({ journal: [journalLine("s=1", "Error: boom")], env: "HEALTH_HEARTBEAT_URL=https://hc-ping.com/1234\nOPERATOR_ALERT_ADDRESS=o@example.org\n" });
    const noPassword = await run();
    expect(noPassword.exitCode).not.toBe(0);
    expect(noPassword.stdout).toContain("SMTP_PASSWORD is not set");
    expect(noPassword.pings).toEqual(["https://hc-ping.com/1234/fail"]);
  });

  it("sends through the SMTP server, port and login the .env names, with STARTTLS on a port other than 465", async () => {
    await given({
      journal: [journalLine("s=1", "Error: boom")],
      env: `${ENV}SMTP_HOST=mail.example.org\nSMTP_PORT=587\nSMTP_USER=alerts@example.org\n`,
    });

    const result = await run();

    expect(result.calls.find((call) => call.includes("--mail-rcpt"))).toContain("--ssl-reqd --url smtp://mail.example.org:587 ");
    expect(await readFile(join(stub, "curl-config"), "utf8")).toMatch(/^user = "alerts@example.org:/);
  });
});
