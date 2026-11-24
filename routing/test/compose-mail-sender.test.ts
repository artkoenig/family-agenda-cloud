import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The Cube's Compose project (cube/compose.yaml) as it hands out the mailbox's password (#233):
 * the mail sender alone gets it, and only the Directory's keys beside it.
 */
type Service = { environment?: Record<string, string>; command?: string[]; networks?: string[] | Record<string, unknown> };
const compose = parse(readFileSync(fileURLToPath(new URL("../../cube/compose.yaml", import.meta.url)), "utf8"), { merge: true }) as {
  services: Record<string, Service>;
};

describe("The Cube's Compose project", () => {
  it("gives the mailbox's password to the mail sender and to no other service", () => {
    const holders = Object.entries(compose.services)
      .filter(([, service]) => Object.keys(service.environment ?? {}).includes("SMTP_PASSWORD"))
      .map(([name]) => name);

    expect(holders).toEqual(["mail-sender"]);
  });

  it("runs the mail sender with the Directory's and the mail server's settings alone, where it reaches both", () => {
    const sender = compose.services["mail-sender"]!;

    expect(sender.command).toEqual(["routing", "send-mail"]);
    expect(Object.keys(sender.environment ?? {}).sort()).toEqual([
      "DIRECTORY_DATABASE_PASSWORD",
      "DIRECTORY_DATABASE_URL",
      "SMTP_HOST",
      "SMTP_PASSWORD",
      "SMTP_PORT",
      "SMTP_USER",
    ]);
    expect(sender.environment?.["SMTP_PASSWORD"]).toBe("${SMTP_PASSWORD:?}");
    expect(sender.networks).toEqual(["directory", "outbound"]);
  });
});
