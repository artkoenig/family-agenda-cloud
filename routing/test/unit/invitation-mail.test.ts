import { describe, expect, it } from "vitest";
import { invitationMail } from "../../src/invitation-mail";

const LINK = "https://app.family-agenda.cloud/sign-in/invitation?one_time_token=tok&login_hint=anna%40example.org";
const ENVELOPE = { from: "Family Agenda <support@family-agenda.cloud>", replyTo: "support@family-agenda.cloud", to: "anna@example.org" };

describe("invitationMail", () => {
  it("invites in German, saying that it is a trial run", () => {
    expect(invitationMail("de", "anna@example.org", LINK)).toMatchObject({
      ...ENVELOPE,
      subject: "Einladung zum Testbetrieb von Family Agenda",
      text: `Du bist eingeladen, Family Agenda mit deiner Familie zu testen. Nimm die Einladung an, um dein Konto und deine eigene Familie anzulegen.

Öffne dazu diesen Link:

${LINK}

Der Link gilt 7 Tage und funktioniert einmal. Brich das Anlegen nicht ab: Dann brauchst du einen neuen Link.

Family Agenda ist noch im Testbetrieb. Es kann noch etwas fehlen oder nicht funktionieren.

Fragen oder Fehler gefunden? Antworte einfach auf diese Mail. Du kennst uns nicht? Dann ignoriere sie.

Family Agenda Cloud · betrieben in Deutschland · family-agenda.cloud
`,
    });
  });

  it("invites in English, saying that it is a trial run", () => {
    expect(invitationMail("en", "anna@example.org", LINK)).toMatchObject({
      ...ENVELOPE,
      subject: "Invitation to the Family Agenda trial run",
      text: `You are invited to try Family Agenda with your family. Accept the invitation to create your account and your own Family.

Open this link:

${LINK}

The link works once and expires in 7 days. Please finish signing up: if you cancel, you need a new link.

Family Agenda is still in its trial run. Some things may be missing or not work yet.

Questions, or found a bug? Just reply to this email. You don't know us? Then ignore it.

Family Agenda Cloud · run in Germany · family-agenda.cloud
`,
    });
  });

  it.each(["de", "en"] as const)("shows the card with the button, the link written out, and all of the text (%s)", (language) => {
    const { subject, text, html } = invitationMail(language, "anna@example.org", LINK);
    const escaped = LINK.replace("&", "&amp;");
    expect(html).toContain(`<html lang="${language}">`);
    expect(html).toContain(`<title>${subject}</title>`);
    expect(html!.split(`href="${escaped}"`)).toHaveLength(3);
    expect(html).toContain(`>${escaped}</a>`);
    expect(html).not.toContain("{{");
    const heading = { de: "Du bist eingeladen", en: "You are invited" }[language];
    const button = { de: "Einladung annehmen", en: "Accept invitation" }[language];
    const fallback = { de: "Klappt der Button nicht, kopiere diese Adresse in den Browser:", en: "If the button does not work, copy this address into your browser:" }[language];
    for (const said of [`>${heading}</h1>`, `>${button}</a>`, fallback]) expect(html).toContain(said);
    const [intro, , , ...rest] = text.trim().split("\n\n");
    for (const said of [intro, ...rest]) expect(html).toContain(said);
  });
});
