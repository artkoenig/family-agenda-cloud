import { describe, expect, it } from "vitest";
import { contractSectionHtml, holderSectionHtml, noAccessSectionHtml, signInSectionHtml, type SectionContract } from "../../src/contract-section";
import type { Language } from "../../src/sign-in-pages";

const now = new Date("2026-11-20T10:00:00Z");

const none: SectionContract = { timeZone: "Europe/Berlin", trialEndsAt: null, lock: null, subscription: null, otherHolder: null, now };
const inTrial: SectionContract = { ...none, trialEndsAt: new Date("2026-11-30T10:00:00Z") };
const running: SectionContract = {
  ...none,
  subscription: { billing: "monthly", status: "active", orderedAt: new Date("2026-09-09T10:00:00Z"), currentPeriodEnd: new Date("2026-12-09T10:00:00Z"), cancelAt: null },
};
const withSubscription = (changes: Partial<NonNullable<SectionContract["subscription"]>>, of: SectionContract = running): SectionContract => ({ ...of, subscription: { ...running.subscription!, ...changes } });
const orderedInTrial = withSubscription({ orderedAt: new Date("2026-11-19T10:00:00Z"), currentPeriodEnd: new Date("2026-11-30T10:00:00Z") }, inTrial);

/** The rows of the description list, the text of each as it reads. */
const rowsOf = (html: string): Record<string, string> => Object.fromEntries([...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(([, name = "", value = ""]) => [name, value] as const));
const linksOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);
const shown = (contract: SectionContract, language: Language = "de") => {
  const html = contractSectionHtml(language, contract);
  return { rows: rowsOf(html), links: linksOf(html) };
};

describe("the Contract section", () => {
  it("shows the Trial, its end and the days left, and the way to order", () => {
    expect(shown(inTrial)).toEqual({ rows: { Status: "Testzeitraum", "Endet am": "30.11.2026 (noch 10 Tage)" }, links: ["/order"] });
    expect(shown(inTrial, "en")).toEqual({ rows: { Status: "Trial", "Ends on": "30 November 2026 (10 days left)" }, links: ["/en/order"] });
  });

  it("counts whole days, and says today on the last", () => {
    const at = (iso: string, language: Language = "de") => Object.values(shown({ ...inTrial, now: new Date(iso) }, language).rows)[1];
    expect(at("2026-11-28T23:30:00Z")).toBe("30.11.2026 (noch 1 Tag)");
    expect(at("2026-11-29T12:00:00Z", "en")).toBe("30 November 2026 (1 day left)");
    expect(at("2026-11-29T23:00:00Z")).toBe("30.11.2026 (heute)");
    expect(at("2026-11-30T09:59:59Z", "en")).toBe("30 November 2026 (today)");
  });

  it("dates in the Family's time zone", () => {
    const late = { ...inTrial, trialEndsAt: new Date("2026-11-30T23:30:00Z") };
    expect(shown({ ...late, timeZone: "Europe/Lisbon" }).rows["Endet am"]).toBe("30.11.2026 (noch 10 Tage)");
    expect(shown({ ...late, timeZone: "Asia/Tokyo" }).rows["Endet am"]).toBe("01.12.2026 (noch 11 Tage)");
  });

  it("shows a running Subscription and the way to cancel", () => {
    expect(shown(running)).toEqual({ rows: { Tarif: "Monatsabo", Status: "aktiv", "Verlängert sich am": "09.12.2026" }, links: ["/cancel"] });
    expect(shown(withSubscription({ billing: "yearly" }), "en")).toEqual({ rows: { Tariff: "Yearly subscription", Status: "active", "Renews on": "9 December 2026" }, links: ["/en/cancel"] });
    expect(shown(running, "en").rows["Tariff"]).toBe("Monthly subscription");
    expect(shown(withSubscription({ billing: "yearly" })).rows["Tarif"]).toBe("Jahresabo");
  });

  it("leaves out what the Directory does not know", () => {
    expect(shown(withSubscription({ billing: null, currentPeriodEnd: null, orderedAt: null }))).toEqual({ rows: { Status: "aktiv" }, links: ["/cancel"] });
  });

  it("names who ordered if it is not the reader", () => {
    expect(shown({ ...running, otherHolder: "Erika & Max" }).rows["Bestellt von"]).toBe("Erika &amp; Max");
    expect(shown({ ...running, otherHolder: "<b>E</b>" }, "en").rows["Ordered by"]).toBe("&lt;b&gt;E&lt;/b&gt;");
  });

  it("links the Withdrawal within its period alone", () => {
    const withdrawable = (orderedAt: string) => shown(withSubscription({ orderedAt: new Date(orderedAt) })).links;
    expect(withdrawable("2026-11-06T10:00:00Z")).toEqual(["/cancel", "/withdraw"]);
    expect(withdrawable("2026-11-05T10:00:00Z")).toEqual(["/cancel"]);
  });

  it("keeps the German labels of cancelling and withdrawing in both languages", () => {
    for (const language of ["de", "en"] as const) {
      const html = contractSectionHtml(language, orderedInTrial);
      expect(html).toMatch(/<a [^>]*lang="de"[^>]*>Verträge hier kündigen<\/a>/);
      expect(html).toMatch(/<a [^>]*lang="de"[^>]*>Vertrag widerrufen<\/a>/);
    }
  });

  it("shows when a cancelled Subscription ends instead of its renewal", () => {
    const cancelled = withSubscription({ cancelAt: new Date("2027-01-09T10:00:00Z") });
    expect(shown(cancelled)).toEqual({ rows: { Tarif: "Monatsabo", Status: "aktiv", "Endet am": "09.01.2027" }, links: ["/cancel"] });
    expect(shown(cancelled, "en").rows["Ends on"]).toBe("9 January 2027");
  });

  it("shows a Subscription ordered within the Trial with its first charge", () => {
    expect(shown(orderedInTrial)).toEqual({
      rows: { Tarif: "Monatsabo", Status: "Testzeitraum bis 30.11.2026", "Erste Abbuchung am": "30.11.2026" },
      links: ["/cancel", "/withdraw"],
    });
    expect(shown(orderedInTrial, "en").rows).toMatchObject({ Status: "Trial until 30 November 2026", "First charge on": "30 November 2026" });
  });

  it("shows no first charge for one cancelled to the Trial's end, which Stripe keeps in whole seconds", () => {
    const of = { ...orderedInTrial, trialEndsAt: new Date("2026-11-30T10:00:00.400Z") };
    const status = "Testzeitraum bis 30.11.2026";
    expect(shown(withSubscription({ cancelAt: new Date("2026-11-30T10:00:01Z") }, of)).rows).toEqual({ Tarif: "Monatsabo", Status: status, "Endet am": "30.11.2026" });
    expect(shown(withSubscription({ cancelAt: new Date("2026-12-30T10:00:01Z") }, of)).rows).toEqual({ Tarif: "Monatsabo", Status: status, "Erste Abbuchung am": "30.11.2026", "Endet am": "30.12.2026" });
  });

  it("takes a Trial over at its end for no Trial", () => {
    expect(shown({ ...orderedInTrial, now: new Date("2026-11-30T10:00:00Z") }).rows["Status"]).toBe("aktiv");
  });

  it.each(["past_due", "unpaid"])("says the payment is open while %s", (status) => {
    expect(shown(withSubscription({ status }))).toEqual({ rows: { Tarif: "Monatsabo", Status: "Zahlung offen", "Verlängert sich am": "09.12.2026" }, links: ["/cancel"] });
    expect(shown(withSubscription({ status }), "en").rows["Status"]).toBe("payment outstanding");
    expect(shown(withSubscription({ status }, orderedInTrial)).rows["Status"]).toBe("Zahlung offen");
  });

  it.each([
    ["trial_ended", "der Testzeitraum ist abgelaufen", "the trial has ended"],
    ["subscription_ended", "das Abo ist beendet", "the subscription has ended"],
    ["unpaid", "die Zahlung ist offen", "the payment is outstanding"],
  ] as const)("shows since when and why (%s) a Family is locked, when it is deleted, and the way to order", (reason, de, en) => {
    const locked = { ...inTrial, lock: { since: new Date("2026-11-18T10:00:00Z"), reason } };
    expect(shown(locked)).toEqual({ rows: { Status: `gesperrt seit 18.11.2026 (${de})`, "Löschung am": "18.12.2026" }, links: ["/order"] });
    expect(shown(locked, "en")).toEqual({ rows: { Status: `locked since 18 November 2026 (${en})`, "Deletion on": "18 December 2026" }, links: ["/en/order"] });
  });

  it("gives no reason for a lock without one", () => {
    expect(shown({ ...none, lock: { since: new Date("2026-11-18T10:00:00Z"), reason: null } }).rows["Status"]).toBe("gesperrt seit 18.11.2026");
  });

  it("deletes 30 calendar days after the lock, whatever daylight saving does in between", () => {
    const since = new Date("2026-10-01T22:30:00Z");
    expect(shown({ ...none, lock: { since, reason: null } }).rows["Löschung am"]).toBe("01.11.2026");
  });

  it("links cancelling for a locked Family whose Subscription still runs, as it cannot be ordered again", () => {
    expect(shown({ ...withSubscription({ status: "unpaid" }), lock: { since: now, reason: "unpaid" } }).links).toEqual(["/cancel"]);
  });

  it("says there is no contract without Trial and Subscription", () => {
    expect(shown(none)).toEqual({ rows: { Status: "kein Vertrag" }, links: [] });
    expect(shown({ ...inTrial, now: new Date("2026-11-30T10:00:00Z") }, "en")).toEqual({ rows: { Status: "no contract" }, links: [] });
    expect(contractSectionHtml("de", none)).toBe(
      '<div class="fam-sheet"><section class="fam-group"><h2 class="fam-group__title">Vertrag</h2><dl><dt>Status</dt><dd>kein Vertrag</dd></dl></section></div>',
    );
  });

  it("leaves nothing between rows and links", () => {
    const html = contractSectionHtml("de", orderedInTrial);
    expect(html).toContain("<dl><dt>Tarif</dt><dd>Monatsabo</dd><dt>Status</dt><dd>Testzeitraum bis 30.11.2026</dd><dt>Erste Abbuchung am</dt><dd>30.11.2026</dd></dl>");
    expect(html).toContain("</a><a ");
  });
});

describe("the Contract section without a card", () => {
  it("links the sign-in that comes back to it", () => {
    expect(signInSectionHtml("de")).toContain('href="/sign-in?back=%2Fadmin%2Fsections%2Fcontract"');
    expect(signInSectionHtml("de")).toContain(">Anmelden</a>");
    expect(signInSectionHtml("de")).toContain("Bitte melden Sie sich an");
    expect(signInSectionHtml("en")).toContain("Please sign in");
    expect(signInSectionHtml("en")).toContain(">Sign in</a>");
  });

  it("names the holder, escaped", () => {
    expect(holderSectionHtml("de", "<b>E</b>")).toContain("Vertragsinhaber: &lt;b&gt;E&lt;/b&gt;");
    expect(holderSectionHtml("en", "Erika")).toContain("Contract holder: Erika");
  });

  it("tells who is no Admin so", () => {
    expect(noAccessSectionHtml("de")).toContain("Nur Admins der Familie können diese Seite sehen.");
    expect(noAccessSectionHtml("en")).toContain("Only the family&#39;s admins can see this page.");
  });

  it("is a fragment of the core's own classes", () => {
    const fragments = (["de", "en"] as const).flatMap((language) => [
      contractSectionHtml(language, orderedInTrial),
      contractSectionHtml(language, inTrial),
      signInSectionHtml(language),
      holderSectionHtml(language, "E"),
      noAccessSectionHtml(language),
    ]);
    for (const fragment of fragments) {
      expect(fragment).toMatch(/^<div class="fam-sheet">/);
      expect(fragment).not.toMatch(/<(html|body|form|script|style)/);
      for (const [, classes] of fragment.matchAll(/class="([^"]*)"/g)) {
        for (const name of classes!.split(" ")) expect(["fam-sheet", "fam-group", "fam-group__title", "fam-group__actions", "fam-button", "fam-button--primary", "fam-button--secondary"]).toContain(name);
      }
    }
    expect(contractSectionHtml("de", inTrial)).toContain('<h2 class="fam-group__title">Vertrag</h2>');
    expect(contractSectionHtml("en", inTrial)).toContain('<h2 class="fam-group__title">Contract</h2>');
    expect(contractSectionHtml("de", inTrial)).toContain('<a class="fam-button fam-button--primary" href="/order">Abo bestellen</a>');
    expect(contractSectionHtml("en", inTrial)).toContain(">Order subscription</a>");
  });
});
