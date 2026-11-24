import { exampleOf, normalize } from "./health-mask";
import { ruleOf } from "./health-rules";

/**
 * The health check of the Cube (#208, docs/adr/0003), from what cube/health/health-check.sh
 * hands it: the journal's lines of the Docker daemon and its containers since the last run, and
 * each container's state. What it reports goes into at most one digest mail per run, each
 * fingerprint (container and normalized message) at most once a day. No I/O.
 */

/** A line of the journal, of a container or of the Docker daemon. */
export type JournalLine = { container: string; service: string; message: string };

/** A container of the Compose project, as `docker inspect` names its state. */
export type ContainerState = {
  id: string;
  name: string;
  service: string;
  status: string;
  health: string;
  restartCount: number;
  restartPolicy: string;
  exitCode: number;
};

/** What the checker was given: the journal since the last run, with the cursor of its last line, and the containers. */
export type Input = { journal: JournalLine[]; cursor: string | undefined; containers: ContainerState[] };

/** A fingerprint the last mails reported: when it was last mailed, and how often it was seen since. */
export type Remembered = { container: string; message: string; example: string; lastMailed: string; suppressed: number };

/** What the checker keeps from one run to the next. */
export type HealthState = {
  /** By fingerprint. */
  fingerprints: Record<string, Remembered>;
  /** How often each container (by its id) had restarted at the last run. */
  restarts: Record<string, number>;
};

/** One line of the digest: a container's message, how often it was seen in this run, and how often since the last mail of it. */
export type Reported = { container: string; message: string; example: string; count: number; suppressed: number; lastMailed: string | undefined };

export const EMPTY_STATE: HealthState = { fingerprints: {}, restarts: {} };

/** A fingerprint is mailed again a day after its last mail at the soonest. */
export const QUIET_MS = 24 * 60 * 60 * 1000;

type Occurrence = { container: string; message: string; example: string };

const journalLineOf = (entry: Record<string, unknown>): JournalLine => {
  const container = typeof entry.CONTAINER_NAME === "string" ? entry.CONTAINER_NAME : "dockerd";
  const service = typeof entry.COM_DOCKER_COMPOSE_SERVICE === "string" ? entry.COM_DOCKER_COMPOSE_SERVICE : (/^family-agenda-(.+)-\d+$/.exec(container)?.[1] ?? container);
  return { container, service, message: textOf(entry.MESSAGE) };
};

/** The journal keeps a message that is not valid UTF-8 as an array of bytes. */
const textOf = (message: unknown): string => {
  if (typeof message === "string") return message;
  return Array.isArray(message) ? Buffer.from(message as number[]).toString("utf8") : "";
};

const number = (value: unknown): number => (typeof value === "number" ? value : 0);
const string = (value: unknown): string => (typeof value === "string" ? value : "");

const containerOf = (entry: Record<string, unknown>): ContainerState => ({
  id: string(entry.id),
  name: string(entry.name).replace(/^\//, ""),
  service: string(entry.service),
  status: string(entry.status),
  health: string(entry.health),
  restartCount: number(entry.restartCount),
  restartPolicy: string(entry.restartPolicy),
  exitCode: number(entry.exitCode),
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const parseLine = (line: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The checker's input: one JSON object per line, either a line of `journalctl -o json` (which has
 * a `__CURSOR`) or a container's state. Other lines are skipped.
 */
export function parseInput(text: string): Input {
  const input: Input = { journal: [], cursor: undefined, containers: [] };
  for (const entry of text.split("\n").map(parseLine)) {
    if (entry === undefined) continue;
    if (typeof entry.__CURSOR === "string") {
      input.journal.push(journalLineOf(entry));
      input.cursor = entry.__CURSOR;
    } else if (typeof entry.id === "string") input.containers.push(containerOf(entry));
  }
  return input;
}

const errorsInJournal = (journal: JournalLine[]): Occurrence[] =>
  journal.flatMap(({ container, service, message }) => {
    const error = ruleOf(service)(message);
    return error === undefined ? [] : [{ container, message: error, example: message }];
  });

/** Whether the container has stopped while it should run: with a restart policy, or with an error. */
const stoppedFinding = ({ status, restartPolicy, exitCode }: ContainerState): string[] =>
  (status === "exited" || status === "dead") && (restartPolicy !== "no" || exitCode !== 0) ? [`${status} with code ${exitCode}`] : [];

/** What is wrong with the container: unhealthy, restarting or restarted since the last run, or stopped while it should run. */
function containerFindings(container: ContainerState, restartsBefore: number | undefined): string[] {
  const findings: string[] = [];
  if (container.health === "unhealthy") findings.push("is unhealthy");
  if (container.status === "restarting") findings.push("is restarting");
  const restarts = container.restartCount - (restartsBefore ?? container.restartCount);
  for (let restart = 0; restart < restarts; restart++) findings.push("restarted");
  return [...findings, ...stoppedFinding(container)];
}

const errorsOfContainers = (containers: ContainerState[], state: HealthState): Occurrence[] =>
  containers.flatMap((container) =>
    containerFindings(container, state.restarts[container.id]).map((finding) => ({ container: container.name, message: `Container ${finding}`, example: `${container.name} ${finding}` })),
  );

/** Container and normalized message. */
const fingerprintOf = ({ container, message }: Occurrence): string => `${container}\n${normalize(message)}`;

type Group = { container: string; message: string; example: string; count: number };

function grouped(occurrences: Occurrence[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const occurrence of occurrences) {
    const key = fingerprintOf(occurrence);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { container: occurrence.container, message: normalize(occurrence.message), example: exampleOf(occurrence.example), count: 1 });
  }
  return groups;
}

const quietUntilOver = (remembered: Remembered, now: Date) => now.getTime() - Date.parse(remembered.lastMailed) < QUIET_MS;

/**
 * One run: what to mail, at most once a day per fingerprint, and the state to keep. A fingerprint
 * seen again within a day of its mail is counted instead, and its count is shown with it in the
 * next mail after that day, together with this run's, or alone if it was not seen again.
 */
export function check(input: Input, state: HealthState, now: Date): { reported: Reported[]; state: HealthState } {
  const groups = grouped([...errorsInJournal(input.journal), ...errorsOfContainers(input.containers, state)]);
  const reported: Reported[] = [];
  const fingerprints: Record<string, Remembered> = {};
  const mail = (key: string, group: Group, before: Remembered | undefined) => {
    reported.push({ ...group, suppressed: before?.suppressed ?? 0, lastMailed: before?.lastMailed });
    fingerprints[key] = { container: group.container, message: group.message, example: group.example, lastMailed: now.toISOString(), suppressed: 0 };
  };
  for (const [key, group] of groups) {
    const before = state.fingerprints[key];
    if (before && quietUntilOver(before, now)) fingerprints[key] = { ...before, example: group.example, suppressed: before.suppressed + group.count };
    else mail(key, group, before);
  }
  for (const [key, before] of Object.entries(state.fingerprints)) {
    if (groups.has(key)) continue;
    if (quietUntilOver(before, now)) fingerprints[key] = before;
    else if (before.suppressed > 0) mail(key, { ...before, count: 0 }, before);
  }
  const restarts = Object.fromEntries(input.containers.map(({ id, restartCount }) => [id, restartCount]));
  return { reported: reported.toSorted(byContainerAndMessage), state: { fingerprints, restarts } };
}

const byContainerAndMessage = (a: Reported, b: Reported) => a.container.localeCompare(b.container) || a.message.localeCompare(b.message);

/** The state as the last run wrote it; an empty one for none or one that cannot be read. */
export function parseState(text: string | undefined): HealthState {
  const parsed = text === undefined ? undefined : parseLine(text);
  return isRecord(parsed?.fingerprints) && isRecord(parsed.restarts) ? (parsed as HealthState) : EMPTY_STATE;
}
