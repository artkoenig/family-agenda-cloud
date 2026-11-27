import { expect, it } from "vitest";
import { unpaidMail } from "../../src/unpaid-mail";

const values = { holder: { name: "Anna Muster", email: "anna@example.com" }, familyName: "Muster", lockedAt: new Date("2026-11-20T10:00:00Z") };
const imprint = { name: "Olga Operator", postalAddress: "Postflex 1" };

it("tells the holder in German", () => {
  const { subject, text } = unpaidMail("de", values, imprint);
  expect(subject).toBe("Deine Familie ist gesperrt: Zahlung ausgeblieben – Family Agenda Cloud");
  expect(text).toContain("Anna Muster");
  expect(text).toContain("Deine Familie Muster ist deshalb seit dem 20.11.2026 gesperrt.");
  expect(text).toContain("https://app.family-agenda.cloud/subscription");
  expect(text).toContain("Ohne Zahlung löschen wir die Familie am 20.12.2026 mit allen Daten.");
  expect(text).toContain("Olga Operator");
});

it("tells the holder in English", () => {
  const { subject, text } = unpaidMail("en", values, imprint);
  expect(subject).toBe("Your family is locked: payment missing – Family Agenda Cloud");
  expect(text).toContain("Your family Muster has therefore been locked since 20 November 2026.");
  expect(text).toContain("https://app.family-agenda.cloud/en/subscription");
  expect(text).toContain("on 20 December 2026. Admins can download");
});
