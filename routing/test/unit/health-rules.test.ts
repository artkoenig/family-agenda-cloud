import { describe, expect, it } from "vitest";
import { jsonLevel, ruleOf } from "../../src/health-rules";

const errorOf = (service: string, line: string) => ruleOf(service)(line);

describe("the rule file", () => {
  it("checks a service without a rule of its own for Node's errors", () => {
    expect(errorOf("plugin-new", "TypeError: x is undefined")).toBe("TypeError: x is undefined");
    expect(errorOf("plugin-new", "listening on 3000")).toBeUndefined();
  });
});

describe("the Routing module's JSON log", () => {
  it.each(["router", "scheduler", "receiver", "logto-log-retention"])("reports a line of level error of %s by its message", (service) => {
    expect(errorOf(service, '{"time":"2026-11-24T10:00:00.000Z","level":"error","message":"Core unreachable","familyId":"f"}')).toBe("Core unreachable");
    expect(errorOf(service, '{"time":"2026-11-24T10:00:00.000Z","level":"info","message":"Router listening"}')).toBeUndefined();
  });

  it("reports fatal and worse, in any case, and a line without a message as itself", () => {
    expect(errorOf("router", '{"level":"FATAL","msg":"down"}')).toBe("down");
    expect(errorOf("router", '{"level":"panic"}')).toBe('{"level":"panic"}');
    expect(errorOf("router", '{"level":"warn","message":"slow"}')).toBeUndefined();
    expect(errorOf("router", '{"message":"no level"}')).toBeUndefined();
    expect(errorOf("router", '{"level":3,"message":"numeric level"}')).toBeUndefined();
    for (const level of ["error", "fatal", "panic", "dpanic", "critical", "crit", "alert", "emerg"])
      expect(errorOf("router", JSON.stringify({ level, message: level }))).toBe(level);
    expect(errorOf("router", '{"level":"","message":"empty level"}')).toBeUndefined();
  });

  it("reports a line that is not JSON by Node's errors, such as the stack of a process that died", () => {
    expect(errorOf("scheduler", "Error: connect ECONNREFUSED 10.0.0.5:5432")).toBe("Error: connect ECONNREFUSED 10.0.0.5:5432");
    expect(errorOf("scheduler", "    at TCPConnectWrap.afterConnect (node:net:1607:16)")).toBeUndefined();
    expect(errorOf("scheduler", "{not json")).toBeUndefined();
    expect(errorOf("scheduler", "null")).toBeUndefined();
    expect(jsonLevel({ otherwise: () => "other" })("[1]")).toBe("other");
    expect(jsonLevel()("null")).toBeUndefined();
    expect(jsonLevel()("{}")).toBeUndefined();
    expect(jsonLevel({ otherwise: () => "other" })('"{"')).toBe("other");
    expect(jsonLevel({ otherwise: () => "other" })("{broken")).toBe("other");
    expect(jsonLevel({ ignore: /^x/ })('{"level":"error","message":"no logger"}')).toBe("no logger");
    expect(jsonLevel({ ignore: /^x/ })('{"level":"error","message":"logger","logger":"y.x"}')).toBe("logger");
  });
});

describe("Caddy", () => {
  it("reports its errors, and not the access log, whose 5xx lines are of level error", () => {
    expect(errorOf("caddy", '{"level":"error","ts":1764000000.1,"logger":"tls.obtain","msg":"could not get certificate from issuer"}')).toBe("could not get certificate from issuer");
    expect(errorOf("caddy", '{"level":"error","ts":1764000000.1,"logger":"http.log.access.log0","msg":"handled request","status":502}')).toBeUndefined();
    expect(errorOf("caddy", '{"level":"error","logger":"admin.http.log.access","msg":"not the access log"}')).toBe("not the access log");
    expect(errorOf("caddy", '{"level":"info","ts":1764000000.1,"logger":"tls","msg":"certificate obtained"}')).toBeUndefined();
  });
});

describe("Postgres", () => {
  it.each(["postgres", "directory-database"])("reports ERROR, FATAL and PANIC of %s", (service) => {
    expect(errorOf(service, '2026-11-24 10:00:00.123 UTC [57] ERROR:  relation "x" does not exist')).toBeDefined();
    expect(errorOf(service, "2026-11-24 10:00:00.123 UTC [57] FATAL:  password authentication failed for user \"logto\"")).toBeDefined();
    expect(errorOf(service, "2026-11-24 10:00:00.123 UTC [1] PANIC:  could not write to file")).toBeDefined();
    expect(errorOf(service, "psql:/directory-database.sql:12: ERROR:  syntax error at or near \"x\"")).toBeDefined();
    expect(errorOf(service, "2026-11-24 10:00:00.123 UTC [57] LOG:  checkpoint complete")).toBeUndefined();
    expect(errorOf(service, "2026-11-24 10:00:00.123 UTC [57] STATEMENT:  SELECT 'ERROR:x'")).toBeUndefined();
  });
});

describe("rclone, the blob mount", () => {
  it("reports ERROR and CRITICAL", () => {
    expect(errorOf("blob-mount", "2026/11/24 10:00:00 ERROR : families/x: WriteFileHandle: Write: failed")).toBeDefined();
    expect(errorOf("blob-mount", "2026/11/24 10:00:00.123456 CRITICAL: Failed to create file system")).toBeDefined();
    expect(errorOf("blob-mount", "ERROR : Attempt 1/1 failed with 1 errors")).toBeDefined();
    expect(errorOf("blob-mount", "2026/11/24 10:00:00 NOTICE: Serving remote control on http://localhost:5572/")).toBeUndefined();
    expect(errorOf("blob-mount", "2026/11/24 10:00:00 INFO  : ERROR : quoted")).toBeUndefined();
  });
});

describe("Logto", () => {
  it("reports its console log's error and fatal lines, with or without a prefix, in colour or not", () => {
    expect(errorOf("logto", "core    error Error: connect ECONNREFUSED")).toBe("core    error Error: connect ECONNREFUSED");
    expect(errorOf("logto", "\u001b[90mcore\u001b[39m    \u001b[31merror\u001b[39m Something broke")).toBe("core    error Something broke");
    expect(errorOf("logto", "fatal Could not connect to the database")).toBeDefined();
    expect(errorOf("logto", "core    info  error codes are listed")).toBeUndefined();
    expect(errorOf("logto", "info error handling enabled")).toBeUndefined();
    expect(errorOf("logto", "core    warn  Deprecated setting")).toBeUndefined();
    expect(errorOf("logto", "TypeError: fetch failed")).toBe("TypeError: fetch failed");
  });
});

describe("the core, the plugins and the Egress Proxies", () => {
  it.each(["core", "plugin-ics", "plugin-ics-egress", "plugin-imap", "plugin-imap-egress", "plugin-webuntis", "plugin-webuntis-egress"])(
    "report Node's errors and the core's failed jobs of %s",
    (service) => {
      for (const line of [
        "Error: something broke",
        "TypeError: Cannot read properties of undefined (reading 'x')",
        "AggregateError [ECONNREFUSED]: ",
        "Uncaught Error: boom",
        "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
        "Running due Sources and Extraction failed: connect ECONNREFUSED",
        "Polling Sources failed:",
        'Loading the plugin of Source Type "webuntis" failed: built for plugin contract 3.3, but the core implements 3.2',
        "Could not carry the pending registrations through: x",
        "Could not deliver the pending family.created webhooks: x",
      ])
        expect(errorOf(service, line)).toBe(line);
      for (const line of [
        "Source 0b0f… failed (ics): 404 Not Found",
        "Refused https://example.com/: not in the Ticket",
        "Refused a request without a valid Context",
        "    at Object.<anonymous> (/app/src/x.ts:1:1)",
        "Listening on 3002",
        "error handling enabled",
        "my Error: in the middle",
        "error: lower case",
        "Retrying FATAL ERROR: later",
        " Polling Sources failed: indented",
        "We Could not deliver it",
      ])
        expect(errorOf(service, line)).toBeUndefined();
    },
  );
});

describe("the Docker daemon", () => {
  it("reports its lines of level error and worse", () => {
    expect(errorOf("dockerd", 'time="2026-11-24T10:00:00Z" level=error msg="Handler for POST failed"')).toBeDefined();
    expect(errorOf("dockerd", 'time="2026-11-24T10:00:00Z" level=info msg="Loading containers: done."')).toBeUndefined();
  });
});
