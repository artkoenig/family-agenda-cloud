import type { Writable } from "node:stream";

/**
 * Structured log lines on stderr. A line names a Family by its Family id only; callers never
 * pass a Context, a family key or a database password, and errors are logged by their message.
 */
export type Log = {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type LogFields = { familyId?: string; error?: unknown; [field: string]: unknown };

export function createLog(stream: Writable, now: () => Date = () => new Date()): Log {
  const write = (level: string, message: string, { error, ...fields }: LogFields = {}) => {
    const line = { time: now().toISOString(), level, message, ...fields, ...(error === undefined ? {} : { error: describe(error) }) };
    stream.write(`${JSON.stringify(line)}\n`);
  };
  return {
    info: (message, fields) => {
      write("info", message, fields);
    },
    error: (message, fields) => {
      write("error", message, fields);
    },
  };
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
