import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setUpRouting, type TestRouting } from "./support/routing";

let routing: TestRouting;
beforeEach(async () => {
  routing = await setUpRouting();
});
afterEach(async () => {
  await routing.close();
});

describe("mail-templates", () => {
  it("puts every template type, German and English, into Logto in one call", async () => {
    const result = await routing.run(["mail-templates"]);
    expect(result, result.stderr).toMatchObject({ exitCode: 0, stdout: "Logto has 18 email templates\n" });
    expect(routing.logto.emailTemplatePuts).toHaveLength(1);
    const [{ templates }] = routing.logto.emailTemplatePuts as [{ templates: { languageTag: string; templateType: string; details: { contentType: string } }[] }];
    expect(templates.filter(({ languageTag }) => languageTag === "de")).toHaveLength(9);
    expect(templates.filter(({ languageTag }) => languageTag === "en")).toHaveLength(9);
    expect(templates.every(({ details }) => details.contentType === "text/html")).toBe(true);
  });

  it("fails when Logto refuses the templates", async () => {
    routing.logto.failWith(422);
    const result = await routing.run(["mail-templates"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("putting the email templates with 422");
  });

  it("is a configuration error without IDP_MANAGEMENT_*", async () => {
    const result = await routing.run(["mail-templates"], {
      IDP_MANAGEMENT_ENDPOINT: undefined,
      IDP_MANAGEMENT_CLIENT_ID: undefined,
      IDP_MANAGEMENT_CLIENT_SECRET: undefined,
    });
    expect(result.exitCode).toBe(2);
    expect(routing.logto.emailTemplatePuts).toEqual([]);
  });
});
