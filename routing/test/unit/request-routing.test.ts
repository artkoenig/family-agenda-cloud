import { describe, expect, it } from "vitest";
import type { FamilyStatus } from "../../src/directory";
import { BAD_GATEWAY, routeRequest, UNAVAILABLE } from "../../src/request-routing";

const familyId = "0f8fad5b-d9cb-469f-a165-70867728950e";
type Entry = { familyId: string; status: FamilyStatus };

/** Routes the request with a Directory that knows these entries, and notes what was looked up. */
async function routed(method: string | undefined, target: string, ...entries: Entry[]) {
  const lookedUp: string[] = [];
  const find = (id: string) => {
    lookedUp.push(id);
    return Promise.resolve(entries.find((entry) => entry.familyId === id));
  };
  return { route: await routeRequest({ method, target }, find, "/sso/callback"), lookedUp };
}

const active: Entry = { familyId, status: "active" };

const notFound = { to: "refused", status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "Not found\n" };

describe("routeRequest", () => {
  describe("a request for every Family", () => {
    it.each([
      ["GET", "/api/health"],
      ["HEAD", "/api/health"],
      ["GET", "/api/health?probe=1"],
      ["GET", "/sso/callback?code=c&state=s"],
      ["HEAD", "/sso/callback"],
      ["POST", "/idp/events"],
    ])("passes %s %s on as it is, without a Family", async (method, target) => {
      const { route, lookedUp } = await routed(method, target);
      expect(route).toEqual({ to: "core", path: target });
      expect(lookedUp).toEqual([]);
    });

    it.each([
      ["GET", "/static/app.js"],
      ["GET", "/static/"],
      ["PUT", "/api/health"],
      [undefined, "/api/health"],
      ["GET", "/api/healthz"],
      ["GET", "/api/health/"],
      ["GET", "/static"],
      ["GET", "/x/static/app.js"],
      ["GET", "/?/static/"],
      ["POST", "/sso/callback"],
      ["GET", "/idp/events"],
      ["POST", "/idp/events/x"],
      ["POST", "/api/health"],
      ["GET", "/sso/callbackx"],
    ])("does not take %s %s for one", async (method, target) => {
      expect((await routed(method, target)).route).toEqual(notFound);
    });
  });

  describe("a request for a Family", () => {
    it("passes it on to the Family, with the path after the Family id", async () => {
      const { route, lookedUp } = await routed("POST", `/${familyId}/api/agendas?view=week`, active);
      expect(route).toEqual({ to: "family", familyId, path: "/api/agendas?view=week", entry: active });
      expect(lookedUp).toEqual([familyId]);
    });

    it("passes a request for a Family's static files on to the Family", async () => {
      expect((await routed("GET", `/${familyId}/static/app.js`, active)).route).toMatchObject({ to: "family", path: "/static/app.js" });
    });

    it("answers 404 for a path without a Family id, and looks nothing up", async () => {
      const { route, lookedUp } = await routed("GET", "/api/agendas", active);
      expect(route).toEqual(notFound);
      expect(lookedUp).toEqual([]);
    });

    it("answers 404 for a Family the Directory does not know", async () => {
      expect((await routed("GET", `/${familyId}/`)).route).toEqual(notFound);
    });

    it.each(["suspended", "deleted", "being_prepared"] as const)("answers 404 for a Family %s, the same as for an unknown one", async (status) => {
      expect((await routed("GET", `/${familyId}/`, { ...active, status })).route).toEqual(notFound);
    });

    it.each([
      "/operations",
      "/operations/",
      "/operations?x=1",
      "/operations/reset-admin-password",
      "//operations/run-due-work",
      "/\\operations/run-due-work",
      "/OPERATIONS/due-work",
      "/x/../operations/secret-sweep",
      "/./operations/purge-messages",
      "/%6Fperations/sweep-secrets",
      "/%2e/operations/x",
      "/%2F/operations/x",
      "/%zz/../operations/x",
    ])("answers 404 for a path to the core's triggered operations, %s, and looks nothing up", async (path) => {
      const { route, lookedUp } = await routed("POST", `/${familyId}${path}`, active);
      expect(route).toEqual(notFound);
      expect(lookedUp).toEqual([]);
    });

    it.each(["/admin/operations", "/operationsx", "/operations-log", "/static/operations", "/?operations", "/%zz/operations"])(
      "passes on a path that merely mentions operations, %s",
      async (path) => {
        expect((await routed("GET", `/${familyId}${path}`, active)).route).toMatchObject({ to: "family", path });
      },
    );
  });
});

describe("BAD_GATEWAY", () => {
  it("is the Router's answer when no core answered", () => {
    expect(BAD_GATEWAY).toEqual({ to: "refused", status: 502, headers: { "content-type": "text/plain; charset=utf-8" }, body: "Bad gateway\n" });
  });
});

describe("UNAVAILABLE", () => {
  it("is the Router's answer when every core that answered refused to open the Family: to be asked again, and not kept", () => {
    expect(UNAVAILABLE).toEqual({
      to: "refused",
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "30", "cache-control": "no-store" },
      body: "Not available right now. Try again in a moment.\n",
    });
  });
});
