/**
 * The health check's rule file (#208, docs/adr/0003): for each service of cube/compose.yaml, which
 * of its log lines report an error. A rule takes one line as the journal holds it and gives the
 * error's message, or undefined for a line that reports none. No I/O.
 */
export type Rule = (line: string) => string | undefined;

/** The levels of a JSON log line that the Operator is told of: error and worse. */
const ERROR_LEVELS = new Set(["error", "fatal", "panic", "dpanic", "critical", "crit", "alert", "emerg"]);

/**
 * What Node prints when something fails: a thrown error ("Error: …", "TypeError: …",
 * "AggregateError [ECONNREFUSED]: …", "Uncaught …"), an aborted process ("FATAL ERROR: …"),
 * and the core's own reports of a job that failed ("Polling Sources failed: …", "Could not
 * deliver the pending family.created webhooks …"). Not the core's warnings, such as "Source X
 * failed (ics): …" or an Egress Proxy's "Refused <url>: …".
 */
const NODE_ERRORS = [
  /^(?:Uncaught )?\w*Error(?: \[[\w.-]+\])?: /,
  /^FATAL ERROR: /,
  /^\S.*? failed:(?: |$)/,
  /^Could not (?:carry|deliver) /,
];

/** The Node error a line of plain text reports. */
export const nodeErrors: Rule = (line) => (NODE_ERRORS.some((pattern) => pattern.test(line)) ? line : undefined);

type JsonLine = { level?: unknown; message?: unknown; msg?: unknown; logger?: unknown };

const parseJson = (line: string): JsonLine | undefined => {
  if (!line.startsWith("{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const messageOf = (entry: JsonLine, line: string): string => {
  if (typeof entry.message === "string") return entry.message;
  return typeof entry.msg === "string" ? entry.msg : line;
};

/**
 * A JSON log line of level error or worse, by its message; a line that is not JSON, such as the
 * stack Node prints when the process dies, by `otherwise`. Lines of a logger that `ignore` names
 * are none.
 */
export const jsonLevel =
  ({ otherwise = nodeErrors, ignore }: { otherwise?: Rule; ignore?: RegExp } = {}): Rule =>
  (line) => {
    const entry = parseJson(line);
    if (entry === undefined) return otherwise(line);
    if (typeof entry.level !== "string" || !ERROR_LEVELS.has(entry.level.toLowerCase())) return undefined;
    if (ignore && typeof entry.logger === "string" && ignore.test(entry.logger)) return undefined;
    return messageOf(entry, line);
  };

/** Postgres's server log, and psql's: `… ERROR:  …`, FATAL or PANIC. */
export const postgres: Rule = (line) => (/\b(?:ERROR|FATAL|PANIC):\s/.test(line) ? line : undefined);

/** rclone's log: `2026/11/24 10:00:00 ERROR : …`, or CRITICAL. */
export const rclone: Rule = (line) => (/^(?:[\d/:. ]+ )?(?:ERROR|CRITICAL) ?: /.test(line) ? line : undefined);

// Colours, which Logto writes only to a terminal, all the same.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[\d;]*m/g;

/**
 * Logto's console log, which is not JSON: `<prefix> <level> …` with the prefix (`core`, `cli`)
 * left out at times, of level error or fatal; and Node's errors from its start.
 */
export const logto: Rule = (line) => {
  const plain = line.replace(ANSI, "");
  return /^(?:(?!info|warn|error|fatal)\S+\s+)?(?:error|fatal)\s/.test(plain) ? plain : nodeErrors(plain);
};

/** The Docker daemon's own lines (logfmt), which the journal holds beside the containers'. */
export const dockerd: Rule = (line) => (/\blevel=(?:error|fatal|panic)\b/.test(line) ? line : undefined);

/** The rule of each service of cube/compose.yaml; a test checks that every service has one. */
export const RULES: Readonly<Record<string, Rule>> = {
  // Caddy's JSON log; access lines (a 5xx is of level error) are not its errors.
  caddy: jsonLevel({ ignore: /^http\.log\.access/ }),
  // The Routing module's JSON log (routing/src/log.ts).
  router: jsonLevel(),
  scheduler: jsonLevel(),
  receiver: jsonLevel(),
  "mail-sender": jsonLevel(),
  logto,
  // One JSON line per run (cube/logto-log-retention.sh).
  "logto-log-retention": jsonLevel(),
  core: nodeErrors,
  "blob-mount": rclone,
  postgres,
  "directory-database": postgres,
  "plugin-ics": nodeErrors,
  "plugin-ics-egress": nodeErrors,
  "plugin-imap": nodeErrors,
  "plugin-imap-egress": nodeErrors,
  "plugin-webuntis": nodeErrors,
  "plugin-webuntis-egress": nodeErrors,
  dockerd,
};

/** The rule of the service; Node's errors for one that has no rule of its own, such as a new plugin. */
export const ruleOf = (service: string): Rule => RULES[service] ?? nodeErrors;
