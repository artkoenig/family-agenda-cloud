import { describe, expect, it } from "vitest";
import { checkoutTexts, CUSTOM_TEXT_LIMIT, firstPayment } from "../../src/checkout-texts";
import type { Language } from "../../src/contract-wording";

/** 23:30 in Berlin on 19 March, already the 20th: the summary names Berlin's date. */
const firstPaymentAt = new Date("2026-03-19T23:30:00Z");

/** The summaries of #215, with `<Datum>` filled, for both billings at once: Checkout offers the yearly one as its upsell. */
const SUMMARIES: Record<Language, string> = {
  de: `Wichtig: Termine in E-Mails und Dokumenten erkennt ein KI-Modell. Die Erkennung kann unvollständig oder fehlerhaft sein.

Family Agenda Cloud für deine Familie: jedes Mitglied mit eigener Agenda, Stundenplan, Kalender, E-Mails und Dokumente als Quellen, Betrieb in Deutschland.
Preis: 4,99 € pro Monat (Monatsabo) oder 49,90 € pro Jahr, entspricht 4,16 € pro Monat (Jahresabo), jeweils inkl. USt.
Erste Zahlung am 20.03.2026, danach monatlich bzw. jährlich.
Laufzeit: ein Monat bzw. ein Jahr, verlängert sich jeweils um dieselbe Zeit.
Kündigung: Monatsabo jederzeit zum Monatsende; Jahresabo zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung; online im Admin-Bereich.
14 Tage Widerrufsrecht; bei Widerruf erstatten wir alles Gezahlte.`,
  en: `Important: an AI model detects dates in emails and documents. Detection may be incomplete or wrong.

Family Agenda Cloud for your family: every member with their own agenda, timetable, calendars, emails and documents as sources, run in Germany.
Price: €4.99 per month (monthly subscription) or €49.90 per year, equal to €4.16 per month (yearly subscription), VAT included.
First payment on 20 March 2026, then monthly or yearly.
Term: one month or one year, renewing for the same term at a time.
Cancellation: monthly subscription any time with effect from the end of the month; yearly subscription with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund; online in the Admin area.
14-day right of withdrawal; on withdrawal we refund everything you paid.`,
};

const TERMS_ACCEPTANCE: Record<Language, string> = {
  de: "Ich stimme den [AGB](https://family-agenda.cloud/agb) zu. Die [Widerrufsbelehrung](https://family-agenda.cloud/widerrufsbelehrung) und die [Datenschutzerklärung](https://family-agenda.cloud/datenschutz) habe ich zur Kenntnis genommen.",
  en: "I agree to the [terms](https://family-agenda.cloud/agb) (German, binding; [English translation](https://family-agenda.cloud/en/terms)). I have read the [withdrawal policy](https://family-agenda.cloud/en/withdrawal) and the [privacy policy](https://family-agenda.cloud/en/privacy).",
};

describe("checkoutTexts", () => {
  it.each(["de", "en"] as const)("words the Checkout in %s for both billings, as #215 does", (language) => {
    expect(checkoutTexts(language, firstPaymentAt)).toEqual({
      locale: language,
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        submit: { message: SUMMARIES[language] },
        terms_of_service_acceptance: { message: TERMS_ACCEPTANCE[language] },
      },
    });
  });

  it.each(["de", "en"] as const)("keeps each custom_text in %s under Stripe's 1200 characters", (language) => {
    const { custom_text } = checkoutTexts(language, new Date("2026-09-30T12:00:00Z"));

    expect(CUSTOM_TEXT_LIMIT).toBe(1200);
    for (const { message } of Object.values(custom_text)) expect(message.length).toBeLessThan(CUSTOM_TEXT_LIMIT);
  });
});

describe("firstPayment", () => {
  const now = new Date("2026-03-10T08:00:00Z");

  it("is at the Trial's end, the Session's billing_cycle_anchor, when that is a minute away or more", () => {
    const trialEndsAt = new Date("2026-03-10T08:01:00Z");

    expect(firstPayment({ case: "trial", trialEndsAt }, now)).toEqual({ billingCycleAnchor: trialEndsAt, dueAt: trialEndsAt });
  });

  it("is now, with no billing_cycle_anchor, when the Trial ends sooner, or has ended", () => {
    expect(firstPayment({ case: "trial", trialEndsAt: new Date("2026-03-10T08:00:59.999Z") }, now)).toEqual({ billingCycleAnchor: null, dueAt: now });
    expect(firstPayment({ case: "trial", trialEndsAt: new Date("2026-03-01T08:00:00Z") }, now)).toEqual({ billingCycleAnchor: null, dueAt: now });
  });

  it("is now, with no billing_cycle_anchor, for a Locked Family", () => {
    expect(firstPayment({ case: "locked" }, now)).toEqual({ billingCycleAnchor: null, dueAt: now });
  });
});
