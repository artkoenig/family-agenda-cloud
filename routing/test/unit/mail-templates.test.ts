import { describe, expect, it } from "vitest";
import { LANGUAGES, LOGO_URL } from "../../src/mail-card";
import { mailTemplates, TEMPLATE_TYPES } from "../../src/mail-templates";

const templates = mailTemplates();
const template = (languageTag: string, templateType: string) => templates.find((each) => each.languageTag === languageTag && each.templateType === templateType)!;

describe("mailTemplates", () => {
  it("has one HTML template per type and language", () => {
    expect(templates.map(({ languageTag, templateType }) => `${languageTag}/${templateType}`).sort()).toEqual(
      LANGUAGES.flatMap((language) => TEMPLATE_TYPES.map((type) => `${language}/${type}`)).sort(),
    );
    for (const { languageTag, details } of templates) {
      expect(details.contentType).toBe("text/html");
      expect(details.content).toContain(`<html lang="${languageTag}">`);
      expect(details.content).toContain(`<img src="${LOGO_URL}"`);
    }
  });

  it("shows the code in every mail but the invitation, which links instead", () => {
    for (const { templateType, details } of templates) {
      const invitation = templateType === "OrganizationInvitation";
      expect(details.content.includes("{{code}}"), templateType).toBe(!invitation);
      expect(details.content.includes('href="{{link}}"'), templateType).toBe(invitation);
    }
  });

  it("uses no placeholder Logto might leave unfilled", () => {
    for (const { details } of templates) {
      const placeholders = [...`${details.subject}${details.content}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]);
      expect(placeholders.every((name) => name === "code" || name === "link")).toBe(true);
    }
  });

  it("says how long a code and an invitation hold, in the reader's language", () => {
    expect(template("de", "Register").details.content).toContain("Der Code gilt 10 Minuten.");
    expect(template("en", "ForgotPassword").details.content).toContain("The code expires in 10 minutes.");
    expect(template("de", "OrganizationInvitation").details.content).toContain("Der Link gilt 7 Tage und funktioniert einmal.");
    expect(template("en", "OrganizationInvitation").details.content).toContain("The link works once and expires in 7 days.");
    expect(template("de", "Register").details.subject).toBe("Dein Code für Family Agenda: {{code}}");
  });
});
