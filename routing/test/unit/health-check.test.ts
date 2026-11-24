import { describe, expect, it } from "vitest";
import { EMPTY_STATE, QUIET_MS, check, parseInput, parseState, type ContainerState, type HealthState, type Input } from "../../src/health-check";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const FAMILY = "3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";

const journal = (container: string, service: string, message: string) => ({ container, service, message });
const core = (message: string) => journal("family-agenda-core-1", "core", message);
const input = (lines: Input["journal"], containers: ContainerState[] = []): Input => ({ journal: lines, cursor: undefined, containers });

const container = (fields: Partial<ContainerState> = {}): ContainerState => ({
  id: "c1",
  name: "family-agenda-router-1",
  service: "router",
  status: "running",
  health: "",
  restartCount: 0,
  restartPolicy: "unless-stopped",
  exitCode: 0,
  ...fields,
});

describe("parseInput", () => {
  it("reads the journal's lines, the last cursor and the containers' states, and skips anything else", () => {
    const text = [
      JSON.stringify({ id: "abc", name: "/family-agenda-core-1", service: "core", status: "running", health: "healthy", restartCount: 2, restartPolicy: "unless-stopped", exitCode: 0 }),
      JSON.stringify({ __CURSOR: "s=1", MESSAGE: "Error: one", CONTAINER_NAME: "family-agenda-core-1", COM_DOCKER_COMPOSE_SERVICE: "core" }),
      "",
      "not json",
      "[1]",
      JSON.stringify({ something: "else" }),
      JSON.stringify({ __CURSOR: "s=2", MESSAGE: [69, 114, 114, 111, 114, 58, 32, 255], CONTAINER_NAME: "family-agenda-plugin-ics-egress-1" }),
      JSON.stringify({ __CURSOR: "s=3", MESSAGE: 'level=error msg="x"' }),
      JSON.stringify({ __CURSOR: "s=4", MESSAGE: null, CONTAINER_NAME: "standalone" }),
      JSON.stringify({ id: "def" }),
    ].join("\n");

    expect(parseInput(text)).toEqual({
      cursor: "s=4",
      journal: [
        { container: "family-agenda-core-1", service: "core", message: "Error: one" },
        { container: "family-agenda-plugin-ics-egress-1", service: "plugin-ics-egress", message: "Error: �" },
        { container: "dockerd", service: "dockerd", message: 'level=error msg="x"' },
        { container: "standalone", service: "standalone", message: "" },
      ],
      containers: [
        { id: "abc", name: "family-agenda-core-1", service: "core", status: "running", health: "healthy", restartCount: 2, restartPolicy: "unless-stopped", exitCode: 0 },
        { id: "def", name: "", service: "", status: "", health: "", restartCount: 0, restartPolicy: "", exitCode: 0 },
      ],
    });
  });

  it("has no cursor without journal lines", () => {
    expect(parseInput("")).toEqual({ journal: [], cursor: undefined, containers: [] });
  });
});

describe("check, of the journal", () => {
  it("reports nothing for lines that are no errors", () => {
    expect(check(input([core("Listening on 3002"), journal("family-agenda-router-1", "router", '{"level":"info","message":"ok"}')]), EMPTY_STATE, NOW)).toEqual({
      reported: [],
      state: { fingerprints: {}, restarts: {} },
    });
  });

  it("groups errors by container and normalized message, with a count and the first line as example", () => {
    const { reported } = check(
      input([
        core(`Polling Sources failed: Family ${FAMILY} at 10.0.0.5`),
        core("Polling Sources failed: Family 9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d at 10.0.0.6"),
        journal("family-agenda-core-2", "core", "Polling Sources failed: x"),
        journal("family-agenda-router-1", "router", '{"level":"error","message":"Core unreachable"}'),
        core("Error: boom"),
      ]),
      EMPTY_STATE,
      NOW,
    );

    expect(reported).toEqual([
      { container: "family-agenda-core-1", message: "Error: boom", example: "Error: boom", count: 1, suppressed: 0, lastMailed: undefined },
      {
        container: "family-agenda-core-1",
        message: "Polling Sources failed: Family <id> at <ip>",
        example: `Polling Sources failed: Family ${FAMILY} at <ip>`,
        count: 2,
        suppressed: 0,
        lastMailed: undefined,
      },
      { container: "family-agenda-core-2", message: "Polling Sources failed: x", example: "Polling Sources failed: x", count: 1, suppressed: 0, lastMailed: undefined },
      {
        container: "family-agenda-router-1",
        message: "Core unreachable",
        example: '{"level":"error","message":"Core unreachable"}',
        count: 1,
        suppressed: 0,
        lastMailed: undefined,
      },
    ]);
  });

  it("does not mail a fingerprint again within a day, counts it, and shows the count in the next mail after that day", () => {
    const first = check(input([core("Error: boom")]), EMPTY_STATE, NOW);
    expect(first.reported).toHaveLength(1);
    expect(first.state.fingerprints).toEqual({
      "family-agenda-core-1\nError: boom": { container: "family-agenda-core-1", message: "Error: boom", example: "Error: boom", lastMailed: NOW.toISOString(), suppressed: 0 },
    });

    const second = check(input([core("Error: boom"), core("Error: boom")]), first.state, later(QUIET_MS - 1));
    expect(second.reported).toEqual([]);
    expect(second.state.fingerprints["family-agenda-core-1\nError: boom"]).toMatchObject({ lastMailed: NOW.toISOString(), suppressed: 2 });

    const quiet = check(input([]), second.state, later(QUIET_MS - 1));
    expect(quiet).toEqual({ reported: [], state: second.state });

    const third = check(input([core("Error: boom")]), second.state, later(QUIET_MS));
    expect(third.reported).toEqual([{ container: "family-agenda-core-1", message: "Error: boom", example: "Error: boom", count: 1, suppressed: 2, lastMailed: NOW.toISOString() }]);
    expect(third.state.fingerprints["family-agenda-core-1\nError: boom"]).toMatchObject({ lastMailed: later(QUIET_MS).toISOString(), suppressed: 0 });
  });

  it("mails the count of a fingerprint not seen again a day after its mail, and then forgets it", () => {
    const first = check(input([core("Error: boom")]), EMPTY_STATE, NOW);
    const second = check(input([core("Error: boom")]), first.state, later(1000));

    const after = check(input([]), second.state, later(QUIET_MS));
    expect(after.reported).toEqual([{ container: "family-agenda-core-1", message: "Error: boom", example: "Error: boom", count: 0, suppressed: 1, lastMailed: NOW.toISOString() }]);

    const forgotten = check(input([]), after.state, later(2 * QUIET_MS));
    expect(forgotten).toEqual({ reported: [], state: { fingerprints: {}, restarts: {} } });
  });

  it("keeps the latest example of a fingerprint it counts", () => {
    const first = check(input([core("Error: boom 1")]), EMPTY_STATE, NOW);
    const second = check(input([core("Error: boom 2")]), first.state, later(1000));
    expect(second.state.fingerprints["family-agenda-core-1\nError: boom <n>"]?.example).toBe("Error: boom 2");
  });
});

describe("check, of the containers", () => {
  const messages = (containers: ContainerState[], state: HealthState = EMPTY_STATE) => check(input([], containers), state, NOW).reported.map(({ example, count }) => [example, count]);

  it("reports nothing for running, healthy containers and a one-shot one that ended well", () => {
    expect(messages([container(), container({ id: "c2", health: "healthy" }), container({ id: "c3", status: "exited", restartPolicy: "no", exitCode: 0 })])).toEqual([]);
  });

  it("reports an unhealthy container and one that is restarting", () => {
    expect(messages([container({ health: "unhealthy" }), container({ id: "c2", name: "family-agenda-core-1", status: "restarting" })])).toEqual([
      ["family-agenda-core-1 is restarting", 1],
      ["family-agenda-router-1 is unhealthy", 1],
    ]);
  });

  it("reports a container that stopped while it should run, or a one-shot one that failed", () => {
    expect(
      messages([
        container({ status: "exited", exitCode: 137 }),
        container({ id: "c2", name: "family-agenda-postgres-1", status: "dead", exitCode: 0 }),
        container({ id: "c3", name: "family-agenda-directory-database-1", status: "exited", restartPolicy: "no", exitCode: 3 }),
      ]),
    ).toEqual([
      ["family-agenda-directory-database-1 exited with code 3", 1],
      ["family-agenda-postgres-1 dead with code 0", 1],
      ["family-agenda-router-1 exited with code 137", 1],
    ]);
  });

  it("reports how often a container restarted since the last run, and keeps the counts", () => {
    const first = check(input([], [container({ restartCount: 4 }), container({ id: "c2", restartCount: 1 })]), EMPTY_STATE, NOW);
    expect(first.reported).toEqual([]);
    expect(first.state.restarts).toEqual({ c1: 4, c2: 1 });

    const second = check(input([], [container({ restartCount: 6 }), container({ id: "c3", restartCount: 9 })]), first.state, NOW);
    expect(second.reported).toEqual([
      { container: "family-agenda-router-1", message: "Container restarted", example: "family-agenda-router-1 restarted", count: 2, suppressed: 0, lastMailed: undefined },
    ]);
    expect(second.state.restarts).toEqual({ c1: 6, c3: 9 });
  });
});

describe("parseState", () => {
  it("reads the state the last run wrote", () => {
    const state: HealthState = { fingerprints: { a: { container: "c", message: "m", example: "e", lastMailed: NOW.toISOString(), suppressed: 1 } }, restarts: { c1: 2 } };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it("starts empty without a state, or with one it cannot read", () => {
    for (const text of [undefined, "", "{", "[]", "{}", '{"fingerprints":null,"restarts":{}}', '{"fingerprints":{},"restarts":[]}', '{"fingerprints":{}}'])
      expect(parseState(text)).toEqual(EMPTY_STATE);
  });
});
