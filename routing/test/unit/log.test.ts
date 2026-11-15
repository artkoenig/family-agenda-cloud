import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLog, reasonOf } from "../../src/log";

/** A Log that writes to memory, at a fixed time unless `now` is null (the Log's own clock); `lines` are the lines written, parsed. */
const memoryLog = (now: (() => Date) | null = () => new Date("2026-05-01T10:00:00.000Z")) => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString("utf8"));
      done();
    },
  });
  const log = now ? createLog(stream, now) : createLog(stream);
  return { log, chunks, lines: () => chunks.map((chunk) => JSON.parse(chunk) as unknown) };
};

describe("createLog", () => {
  it("writes one JSON line per entry, with time, level and message", () => {
    const { log, chunks, lines } = memoryLog();
    log.info("Router listening");
    log.error("Core unreachable");
    expect(chunks.every((chunk) => chunk.endsWith("}\n") && !chunk.slice(0, -1).includes("\n"))).toBe(true);
    expect(lines()).toEqual([
      { time: "2026-05-01T10:00:00.000Z", level: "info", message: "Router listening" },
      { time: "2026-05-01T10:00:00.000Z", level: "error", message: "Core unreachable" },
    ]);
  });

  it("writes the fields it is given", () => {
    const { log, lines } = memoryLog();
    log.info("Family created", { familyId: "f-1", durationMs: 12 });
    expect(lines()).toEqual([{ time: "2026-05-01T10:00:00.000Z", level: "info", message: "Family created", familyId: "f-1", durationMs: 12 }]);
  });

  it("logs an error by its message only, never its stack or properties", () => {
    const { log, chunks, lines } = memoryLog();
    const error = Object.assign(new Error("connection refused"), { context: "sealed-context" });
    log.error("Request failed", { familyId: "f-1", error });
    expect(lines()).toEqual([{ time: "2026-05-01T10:00:00.000Z", level: "error", message: "Request failed", familyId: "f-1", error: "connection refused" }]);
    expect(chunks.join("")).not.toContain("sealed-context");
  });

  it("logs a thrown value that is not an Error as text", () => {
    const { log, lines } = memoryLog();
    log.info("Odd", { error: 42 });
    expect(lines()).toEqual([{ time: "2026-05-01T10:00:00.000Z", level: "info", message: "Odd", error: "42" }]);
  });

  it("writes the current time unless told otherwise", () => {
    const { log, lines } = memoryLog(null);
    const before = Date.now();
    log.info("now");
    const [{ time }] = lines() as [{ time: string }];
    expect(Date.parse(time)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(time)).toBeLessThanOrEqual(Date.now());
  });
});

describe("reasonOf", () => {
  it("is an error's code when it has one", () => {
    expect(reasonOf(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:3000"), { code: "ECONNREFUSED" }))).toBe("ECONNREFUSED");
  });

  it("is an error's message when it has no code", () => {
    expect(reasonOf(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("is a thrown value that is not an Error, as text", () => {
    expect(reasonOf("timeout")).toBe("timeout");
    expect(reasonOf({ code: "EPIPE" })).toBe("[object Object]");
  });
});
