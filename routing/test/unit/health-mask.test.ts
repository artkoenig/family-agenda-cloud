import { describe, expect, it } from "vitest";
import { cut, exampleOf, normalize } from "../../src/health-mask";

const FAMILY = "3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";
const AGENDA = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

describe("the example line", () => {
  it("masks IPv4 and IPv6 addresses", () => {
    expect(exampleOf("connect ECONNREFUSED 10.0.12.5:5432")).toBe("connect ECONNREFUSED <ip>:5432");
    expect(exampleOf("from 2001:0db8:0000:0000:0000:ff00:0042:8329 port")).toBe("from <ip> port");
    expect(exampleOf("from 2001:db8::8a2e:370:7334, ::1 and fe80:: there")).toBe("from <ip>, <ip> and <ip> there");
    expect(exampleOf("at 10:00:00 in Foo::bar and cafe::1x")).toBe("at 10:00:00 in Foo::bar and cafe::1x");
    expect(exampleOf("mapped ::ffff:192.0.2.1. And ::1.")).toBe("mapped <ip>. And <ip>.");
  });

  it("masks an Agenda's id and keeps a Family's", () => {
    expect(exampleOf(`GET /${FAMILY}/api/agendas/${AGENDA}/feed.ics failed`)).toBe(`GET /${FAMILY}/api/agendas/<id>/feed.ics failed`);
    expect(exampleOf(`"path":"/${FAMILY}/agendas/${AGENDA}"`)).toBe(`"path":"/${FAMILY}/agendas/<id>"`);
    expect(exampleOf(`{"message":"Due work failed","familyId":"${FAMILY}","agendaId":"${AGENDA}"}`)).toBe(
      `{"message":"Due work failed","familyId":"${FAMILY}","agendaId":"<id>"}`,
    );
    expect(exampleOf(`familyId=${FAMILY} agenda=${AGENDA}`)).toBe(`familyId=${FAMILY} agenda=<id>`);
    expect(exampleOf(`Family ${FAMILY} has no database`)).toBe(`Family ${FAMILY} has no database`);
    expect(exampleOf(`ENOENT /var/lib/family-agenda/blobs/bucket/families/${FAMILY}/x`)).toBe(`ENOENT /var/lib/family-agenda/blobs/bucket/families/${FAMILY}/x`);
    expect(exampleOf(`(/${FAMILY}) ${AGENDA}`)).toBe(`(/${FAMILY}) <id>`);
    expect(exampleOf(`${AGENDA.toUpperCase()} at start`)).toBe("<id> at start");
  });

  it("is cut to 300 characters", () => {
    const example = exampleOf("x".repeat(400));
    expect(example).toHaveLength(300);
    expect(example.endsWith("x…")).toBe(true);
    expect(exampleOf("x".repeat(300))).toBe("x".repeat(300));
    expect(cut("abcdef", 4)).toBe("abc…");
  });
});

describe("the normalized message", () => {
  it("is the same for the same error of another Family, time, address or process", () => {
    const one = normalize(`2026-11-24 10:00:00.123 UTC [57] FATAL:  database "family_${FAMILY}" does not exist (10.0.0.5)`);
    const other = normalize(`2026-11-25 11:30:59.999 UTC [6012] FATAL:  database "family_${AGENDA}" does not exist (10.0.0.17)`);
    expect(one).toBe(other);
    expect(one).toBe('<n>-<n>-<n> <n>:<n>:<n>.<n> UTC [<n>] FATAL:  database "family_<id>" does not exist (<ip>)');
  });

  it("masks hashes and hexadecimal numbers, not words", () => {
    expect(normalize("commit 3f2b8c1e5a6d at 0x7ffe12 in deadbeef and abcdefgh")).toBe("commit <hex> at <n> in deadbeef and abcdefgh");
  });

  it("is cut to 300 characters", () => {
    expect(normalize("y".repeat(500))).toHaveLength(300);
  });
});
