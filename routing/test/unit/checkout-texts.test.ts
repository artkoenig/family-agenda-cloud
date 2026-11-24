import { describe, expect, it } from "vitest";
import { checkoutTexts, CUSTOM_TEXT_LIMIT, firstPayment } from "../../src/checkout-texts";
import type { Billing, Language } from "../../src/contract-wording";

/** 23:30 in Berlin on 19 March, already the 20th: the summary names Berlin's date. */
const firstPaymentAt = new Date("2026-03-19T23:30:00Z");

/** The summaries of #215, verbatim, with `<Datum>` filled. */
const SUMMARIES: Record<Language, Record<Billing, string>> = {
  de: {
    monthly: `Wichtig: Termine in E-Mails und Dokumenten erkennt ein KI-Modell. Die Erkennung kann unvollständig oder fehlerhaft sein.

Family Agenda Cloud für Ihre Familie: jedes Mitglied mit eigener Agenda, Stundenplan, Kalender, E-Mails und Dokumente als Quellen, Betrieb in Deutschland.
Preis: 4,99 € pro Monat inkl. USt.
Erste Zahlung am 20.03.2026, danach monatlich.
Laufzeit: ein Monat, verlängert sich jeweils um einen Monat.
Kündigung: jederzeit zum Monatsende, online im Admin-Bereich.
14 Tage Widerrufsrecht; bei Widerruf erstatten wir alles Gezahlte.`,
    yearly: `Wichtig: Termine in E-Mails und Dokumenten erkennt ein KI-Modell. Die Erkennung kann unvollständig oder fehlerhaft sein.

Family Agenda Cloud für Ihre Familie: jedes Mitglied mit eigener Agenda, Stundenplan, Kalender, E-Mails und Dokumente als Quellen, Betrieb in Deutschland.
Preis: 49,90 € pro Jahr inkl. USt.
Erste Zahlung am 20.03.2026, danach jährlich.
Laufzeit: ein Jahr, verlängert sich jeweils um ein Jahr.
Kündigung: zum Ende des ersten Jahres, danach jederzeit zum Monatsende mit anteiliger Erstattung, online im Admin-Bereich.
14 Tage Widerrufsrecht; bei Widerruf erstatten wir alles Gezahlte.`,
  },
  en: {
    monthly: `Important: an AI model detects dates in emails and documents. Detection may be incomplete or wrong.

Family Agenda Cloud for your family: every member with their own agenda, timetable, calendars, emails and documents as sources, run in Germany.
Price: €4.99 per month, VAT included.
First payment on 20 March 2026, then monthly.
Term: one month, renewing for one month at a time.
Cancellation: any time with effect from the end of the month, online in the Admin area.
14-day right of withdrawal; on withdrawal we refund everything you paid.`,
    yearly: `Important: an AI model detects dates in emails and documents. Detection may be incomplete or wrong.

Family Agenda Cloud for your family: every member with their own agenda, timetable, calendars, emails and documents as sources, run in Germany.
Price: €49.90 per year, VAT included.
First payment on 20 March 2026, then yearly.
Term: one year, renewing for one year at a time.
Cancellation: with effect from the end of the first year, after that any time with effect from the end of the month with a pro-rata refund, online in the Admin area.
14-day right of withdrawal; on withdrawal we refund everything you paid.`,
  },
};

const TERMS_ACCEPTANCE: Record<Language, string> = {
  de: "Ich stimme den [AGB](https://family-agenda.cloud/agb) zu. Die [Widerrufsbelehrung](https://family-agenda.cloud/widerrufsbelehrung) und die [Datenschutzerklärung](https://family-agenda.cloud/datenschutz) habe ich zur Kenntnis genommen.",
  en: "I agree to the [terms](https://family-agenda.cloud/agb) (German, binding; [English translation](https://family-agenda.cloud/en/terms)). I have read the [withdrawal policy](https://family-agenda.cloud/en/withdrawal) and the [privacy policy](https://family-agenda.cloud/en/privacy).",
};

const CASES = (["de", "en"] as const).flatMap((language) => (["monthly", "yearly"] as const).map((billing) => ({ language, billing })));

describe("checkoutTexts", () => {
  it.each(CASES)("words the Checkout in $language for the Tariff billed $billing, as #215 does", ({ language, billing }) => {
    expect(checkoutTexts(language, billing, firstPaymentAt)).toEqual({
      locale: language,
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        submit: { message: SUMMARIES[language][billing] },
        terms_of_service_acceptance: { message: TERMS_ACCEPTANCE[language] },
      },
    });
  });

  it.each(CASES)("keeps each custom_text in $language, $billing under Stripe's 1200 characters", ({ language, billing }) => {
    const { custom_text } = checkoutTexts(language, billing, new Date("2026-09-30T12:00:00Z"));

    expect(CUSTOM_TEXT_LIMIT).toBe(1200);
    for (const { message } of Object.values(custom_text)) expect(message.length).toBeLessThan(CUSTOM_TEXT_LIMIT);
  });
});

describe("firstPayment", () => {
  const now = new Date("2026-03-10T08:00:00Z");

  it("is at the Trial's end, the Session's trial_end, when that is 48 hours away or more", () => {
    const trialEndsAt = new Date("2026-03-12T08:00:00Z");

    expect(firstPayment({ case: "trial", trialEndsAt }, now)).toEqual({ trialEnd: trialEndsAt, dueAt: trialEndsAt });
  });

  it("is 48 hours from now when the Trial ends sooner, or has ended", () => {
    const inTwoDays = new Date("2026-03-12T08:00:00Z");

    expect(firstPayment({ case: "trial", trialEndsAt: new Date("2026-03-12T07:59:59.999Z") }, now)).toEqual({ trialEnd: inTwoDays, dueAt: inTwoDays });
    expect(firstPayment({ case: "trial", trialEndsAt: new Date("2026-03-01T08:00:00Z") }, now)).toEqual({ trialEnd: inTwoDays, dueAt: inTwoDays });
  });

  it("is now, with no trial_end, for a Locked Family", () => {
    expect(firstPayment({ case: "locked" }, now)).toEqual({ trialEnd: null, dueAt: now });
  });
});
