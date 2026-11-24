import { describe, expect, it } from "vitest";
import { invitationMail } from "../../src/invitation-mail";

const LINK = "https://app.family-agenda.cloud/sign-in/invitation?one_time_token=tok&login_hint=anna%40example.org";
const ENVELOPE = { from: "Family Agenda <support@family-agenda.cloud>", replyTo: "support@family-agenda.cloud", to: "anna@example.org" };

describe("invitationMail", () => {
  it("invites in German, saying that it is a trial run", () => {
    expect(invitationMail("de", "anna@example.org", LINK)).toEqual({
      ...ENVELOPE,
      subject: "Einladung zum Testbetrieb von Family Agenda",
      text: `Hallo,

du bist eingeladen, Family Agenda mit deiner Familie zu testen. Öffne diesen Link, um dein Konto und deine eigene Familie anzulegen:

${LINK}

Der Link gilt 7 Tage und funktioniert einmal. Brich das Anlegen nicht ab: Dann brauchst du einen neuen Link.

Family Agenda ist noch im Testbetrieb. Er ist kostenlos. Es kann noch etwas fehlen oder nicht funktionieren.

Fragen oder Fehler gefunden? Antworte einfach auf diese Mail. Du kennst uns nicht? Dann ignoriere sie.

Family Agenda Cloud · betrieben in Deutschland · family-agenda.cloud
`,
    });
  });

  it("invites in English, saying that it is a trial run", () => {
    expect(invitationMail("en", "anna@example.org", LINK)).toEqual({
      ...ENVELOPE,
      subject: "Invitation to the Family Agenda trial run",
      text: `Hello,

you are invited to try Family Agenda with your family. Open this link to create your account and your own Family:

${LINK}

The link works once and expires in 7 days. Please finish signing up: if you cancel, you need a new link.

Family Agenda is still in its trial run, which is free of charge. Some things may be missing or not work yet.

Questions, or found a bug? Just reply to this email. You don't know us? Then ignore it.

Family Agenda Cloud · run in Germany · family-agenda.cloud
`,
    });
  });
});
