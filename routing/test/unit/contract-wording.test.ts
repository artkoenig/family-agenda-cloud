import { describe, expect, it } from "vitest";
import {
  amountOf,
  cancelledLine,
  CONTRACT_LINKS,
  CONTRACT_PATHS,
  contractOf,
  dateAfter,
  dateOf,
  deleterLine,
  holderLine,
  mailLanguageOf,
  orderedContractOf,
  timeOf,
} from "../../src/contract-wording";

describe("mailLanguageOf", () => {
  it("writes German for a German Logto locale or none, English for any other", () => {
    expect(["de", "de-DE", "DE-at", "de_CH"].map(mailLanguageOf)).toEqual(["de", "de", "de", "de"]);
    expect(["", null, undefined].map(mailLanguageOf)).toEqual(["de", "de", "de"]);
    expect(["en", "en-US", "fr", "deu"].map(mailLanguageOf)).toEqual(["en", "en", "en", "en"]);
  });
});

describe("dates, times and amounts", () => {
  // 23:30 UTC on 5 March is already 6 March in Berlin.
  const lateEvening = new Date("2026-03-05T23:30:00Z");

  it("dates TT.MM.JJJJ and D Month YYYY, in Berlin", () => {
    expect(dateOf(lateEvening, "de")).toBe("06.03.2026");
    expect(dateOf(lateEvening, "en")).toBe("6 March 2026");
    expect(dateOf(new Date("2026-11-24T12:00:00Z"), "en")).toBe("24 November 2026");
  });

  it("times HH:MM Uhr and HH:MM (Berlin time), in Berlin, summer or winter", () => {
    expect(timeOf(lateEvening, "de")).toBe("00:30 Uhr");
    expect(timeOf(lateEvening, "en")).toBe("00:30 (Berlin time)");
    expect(timeOf(new Date("2026-07-01T07:05:00Z"), "de")).toBe("09:05 Uhr");
    expect(timeOf(new Date("2026-07-01T16:05:00Z"), "en")).toBe("18:05 (Berlin time)");
  });

  it("counts days after a date in Berlin's calendar, across the change from summer time", () => {
    expect(dateAfter(lateEvening, 30, "de")).toBe("05.04.2026");
    expect(dateAfter(lateEvening, 0, "en")).toBe("6 March 2026");
    // 00:30 on 25 October in Berlin; 24 hours later it is still 25 October there.
    expect(dateAfter(new Date("2026-10-24T22:30:00Z"), 1, "de")).toBe("26.10.2026");
    expect(dateAfter(new Date("2026-12-20T10:00:00Z"), 14, "en")).toBe("3 January 2027");
  });

  it("writes euros with cents, after the number in German and before it in English", () => {
    expect(amountOf(4567, "de")).toBe("45,67 €");
    expect(amountOf(4567, "en")).toBe("€45.67");
    expect(amountOf(123_400, "de")).toBe("1.234,00 €");
    expect(amountOf(5, "en")).toBe("€0.05");
    expect(amountOf(1250, "en")).toBe("€12.50");
  });
});

describe("contractOf", () => {
  const contract = { billing: "monthly", familyName: "Muster", orderedOn: new Date("2026-03-05T09:05:00Z") } as const;

  it("names the contract, with its order date when asked", () => {
    expect(contractOf(contract, "de")).toBe("Family Agenda, monatlich, Familie Muster");
    expect(contractOf({ ...contract, billing: "yearly" }, "en")).toBe("Family Agenda, yearly, family Muster");
    expect(orderedContractOf(contract, "de")).toBe("Family Agenda, monatlich, Familie Muster, bestellt am 05.03.2026");
    expect(orderedContractOf({ ...contract, billing: "yearly" }, "en")).toBe("Family Agenda, yearly, family Muster, ordered on 5 March 2026");
    expect(contractOf({ ...contract, billing: "yearly" }, "de")).toBe("Family Agenda, jährlich, Familie Muster");
    expect(contractOf(contract, "en")).toBe("Family Agenda, monthly, family Muster");
  });
});

describe("Admin area and Locked page", () => {
  it("links the contract pages, keeping the German labels but for deleting", () => {
    expect(CONTRACT_LINKS).toEqual({
      de: { cancel: "Verträge hier kündigen", withdraw: "Vertrag widerrufen", delete: "Familie löschen" },
      en: { cancel: "Verträge hier kündigen", withdraw: "Vertrag widerrufen", delete: "Delete family" },
    });
    expect(CONTRACT_PATHS).toEqual({
      cancel: { de: "/cancel", en: "/en/cancel" },
      withdraw: { de: "/withdraw", en: "/en/withdraw" },
      delete: { de: "/delete", en: "/en/delete" },
    });
  });

  it("names the holder and the one who may delete to other Admins", () => {
    expect(holderLine("Erika Muster", "de")).toBe("Vertragsinhaber: Erika Muster");
    expect(holderLine("Erika Muster", "en")).toBe("Contract holder: Erika Muster");
    expect(deleterLine("Erika Muster", "de")).toBe("Löschen kann nur: Erika Muster");
    expect(deleterLine("Erika Muster", "en")).toBe("Only Erika Muster can delete the family");
  });

  it("shows a Cancellation with the German way to take it back", () => {
    const endsOn = new Date("2026-04-05T09:05:00Z");
    expect(cancelledLine(endsOn, "de")).toEqual({ status: "Gekündigt zum 05.04.2026", undo: "Kündigung zurücknehmen", undoNote: null });
    expect(cancelledLine(endsOn, "en")).toEqual({ status: "Cancelled as of 5 April 2026", undo: "Kündigung zurücknehmen", undoNote: "(undo cancellation)" });
  });
});
