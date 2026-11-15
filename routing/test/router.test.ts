import { get, type IncomingMessage } from "node:http";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/cli";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { clientOf, startStandInCore, type StandInCore } from "./support/stand-in-core";

const ADDRESS = /^https:\/\/app\.family-agenda\.cloud\/([0-9a-f-]{36})\/$/;

let routing: TestRouting;
let router: Router;
beforeEach(async () => {
  routing = await setUpRouting();
  router = await routing.startRouter();
});
afterEach(async () => {
  await routing.close();
});

async function createFamily(): Promise<string> {
  const result = await routing.run(["create", "--admin-email", "first.admin@example.org"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  const familyId = ADDRESS.exec(result.stdout.trim())?.[1];
  expect(familyId, result.stdout).toBeDefined();
  return familyId!;
}

/** What a browser asks the Router for; `path` is below the Router's root. */
const browse = (path: string, init?: RequestInit) => fetch(`${router.url}${path}`, { redirect: "manual", ...init });

/** The requests that arrived at the stand-in core since creating the Families. */
const arrived = (since: number) => routing.core.requests.slice(since);

describe("a Family's request", () => {
  it("arrives at a core without the path prefix and with that Family's Context", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    const response = await browse(`/${familyId}/agendas/123?day=2026-11-15`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/agendas/123" });
    const [request, ...more] = arrived(since);
    expect(more).toEqual([]);
    expect(request).toMatchObject({ method: "GET", path: "/agendas/123", search: "?day=2026-11-15" });
    expect(request?.context).toMatchObject({
      familyId,
      pathPrefix: `/${familyId}`,
      publicUrl: `https://app.family-agenda.cloud/${familyId}`,
    });
  });

  it("arrives with the Context of its own Family, each naming its own database, key, blob location and prefix", async () => {
    const first = await createFamily();
    const second = await createFamily();
    const since = routing.core.requests.length;

    await browse(`/${first}/admin`);
    await browse(`/${second}/admin`);

    const [toFirst, toSecond] = arrived(since).map(({ context }) => context!);
    expect(toFirst).toMatchObject({ familyId: first, pathPrefix: `/${first}`, blobLocation: `/var/lib/family-agenda/blobs/${first}` });
    expect(toSecond).toMatchObject({ familyId: second, pathPrefix: `/${second}`, blobLocation: `/var/lib/family-agenda/blobs/${second}` });
    expect(toFirst!.database.name).not.toBe(toSecond!.database.name);
    expect(toFirst!.database.password).not.toBe(toSecond!.database.password);
    expect(toFirst!.familyKey).not.toBe(toSecond!.familyKey);
    // The Context the Router builds is the one Provisioning prepared the Family with.
    const prepared = routing.core.requests.find(({ path, context }) => path === "/operations/prepare-family" && context?.familyId === first);
    expect({ ...toFirst, iat: 0, exp: 0 }).toEqual({ ...prepared?.context, iat: 0, exp: 0 });
  });

  it("at the Family's address itself arrives at the core's root", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    await browse(`/${familyId}`);
    await browse(`/${familyId}?lang=de`);

    expect(arrived(since).map(({ path, search }) => `${path}${search}`)).toEqual(["/", "/?lang=de"]);
  });
});

describe("the core's answer", () => {
  it("reaches the client unchanged: status, headers and body", async () => {
    const familyId = await createFamily();
    // Bytes that are no valid gzip: the Router must neither unpack nor repack them.
    const body = Uint8Array.from([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
    routing.core.answerNext({
      status: 303,
      headers: [
        ["location", `/${familyId}/admin`],
        ["set-cookie", "session=abc; Path=/; HttpOnly"],
        ["set-cookie", "language=de; Path=/"],
        ["content-encoding", "gzip"],
        ["content-type", "text/html; charset=utf-8"],
        ["x-core-says", "hello"],
      ],
      body,
    });

    // As it comes over the wire: fetch would unpack the body.
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      get(`${router.url}/${familyId}/admin/sign-in`, resolve).on("error", reject);
    });
    const chunks: Buffer[] = [];
    for await (const chunk of response) chunks.push(chunk as Buffer);

    expect(response.statusCode).toBe(303);
    expect(response.headers).toMatchObject({
      location: `/${familyId}/admin`,
      "set-cookie": ["session=abc; Path=/; HttpOnly", "language=de; Path=/"],
      "content-encoding": "gzip",
      "content-type": "text/html; charset=utf-8",
      "x-core-says": "hello",
    });
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(body));
  });

  it("is what the core answered to the method, headers and body the browser sent", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    const response = await browse(`/${familyId}/admin/agendas`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "session=abc", "accept-language": "de" },
      body: JSON.stringify({ name: "Kitchen" }),
    });

    expect(response.status).toBe(200);
    const [request] = arrived(since);
    expect(request).toMatchObject({ method: "POST", path: "/admin/agendas", body: { name: "Kitchen" } });
    expect(request?.headers).toMatchObject({ cookie: "session=abc", "accept-language": "de" });
  });
});

describe("routing serve", () => {
  it("brings the Directory up to date, routes until it is stopped, and then stops listening", async () => {
    let stderr = "";
    const sink = (append: (text: string) => void) =>
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          append(chunk.toString());
          done();
        },
      });
    let stop = () => {};
    const stopped = new Promise<void>((resolve) => (stop = resolve));
    const exitCode = run(["serve"], {
      env: { ...routing.env, PORT: "0", LISTEN_HOST: "127.0.0.1" },
      stdout: sink(() => {}),
      stderr: sink((text) => (stderr += text)),
      until: stopped,
    });
    await expect.poll(() => stderr).toContain("The Router listens");
    // Before any other command ran.
    expect(await routing.directory("SELECT count(*)::int AS families FROM family")).toEqual([{ families: 0 }]);
    const { url } = JSON.parse(stderr.split("\n").find((line) => line.includes("The Router listens"))!) as { url: string };
    const familyId = await createFamily();

    expect((await fetch(`${url}/${familyId}/admin`)).status).toBe(200);
    stop();

    expect(await exitCode).toBe(0);
    await expect(fetch(`${url}/${familyId}/admin`)).rejects.toThrow();
  });
});

describe("routing serve, when the Directory cannot be opened", () => {
  it("does not start, and says why", async () => {
    const result = await routing.run(["serve"], { DIRECTORY_DATABASE_PASSWORD: "not-the-password", PORT: "0" });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("The command failed");
    expect(result.stderr).not.toContain("The Router listens");
  });
});

describe("the log", () => {
  it("names the Family by its Family id, and holds no Context, family key, database password or page address", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!);
    await down.close();
    const throughBrokenPool = await routing.startRouter({ CORE_URLS: down.url });
    const logBefore = routing.log().length;
    const since = routing.core.requests.length;

    await browse(`/${familyId}/agendas/private-agenda-id`, { method: "POST", body: "x" });
    await browse(`/${familyId}/agendas/private-agenda-id`);
    await fetch(`${throughBrokenPool.url}/${familyId}/agendas/private-agenda-id`);

    const lines = routing
      .log()
      .slice(logBefore)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "info", familyId, method: "POST", status: 200 }),
        expect.objectContaining({ level: "info", familyId, method: "GET", status: 200 }),
        expect.objectContaining({ level: "error", familyId, message: "A core did not answer" }),
        expect.objectContaining({ level: "info", familyId, method: "GET", status: 502 }),
      ]),
    );
    const context = arrived(since)[0]!;
    const logged = routing.log();
    for (const secret of [context.sealedContext!, context.context!.familyKey, context.context!.database.password, "private-agenda-id"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("a pool of several cores", () => {
  let others: StandInCore[] = [];
  afterEach(async () => {
    for (const core of others) await core.close();
    others = [];
  });

  it("serves requests from any of them, each with the Family's Context", async () => {
    const familyId = await createFamily();
    others = [await startStandInCore(routing.env.CONTEXT_KEY!), await startStandInCore(routing.env.CONTEXT_KEY!)];
    const pool = [routing.core, ...others];
    const sinces = pool.map((core) => core.requests.length);
    const throughPool = await routing.startRouter({ CORE_URLS: pool.map(({ url }) => url).join(",") });

    for (let index = 0; index < 9; index++) expect((await fetch(`${throughPool.url}/${familyId}/agendas/${index}`)).status).toBe(200);

    const served = pool.map((core, index) => core.requests.slice(sinces[index]));
    for (const requests of served) {
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.map(({ context }) => context?.familyId)).toEqual(requests.map(() => familyId));
    }
    expect(served.flat().map(({ path }) => path).sort()).toEqual([...Array(9).keys()].map((index) => `/agendas/${index}`));
  });

  it("serves a page from another core while one of them is down", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!);
    await down.close();
    const throughPool = await routing.startRouter({ CORE_URLS: `${down.url},${routing.core.url}` });
    const since = routing.core.requests.length;

    const answers = await Promise.all([0, 1, 2, 3].map(async () => (await fetch(`${throughPool.url}/${familyId}/admin`)).status));

    expect(answers).toEqual([200, 200, 200, 200]);
    expect(arrived(since)).toHaveLength(4);
  });

  it("answers 502 when no core answers", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!);
    await down.close();
    const throughPool = await routing.startRouter({ CORE_URLS: down.url });

    expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(502);
    expect((await fetch(`${throughPool.url}/api/health`)).status).toBe(502);
  });
});

describe("the client's address and scheme", () => {
  /** A request as Caddy passes it on: it appends the address it saw to what the browser sent. */
  const throughCaddy = (url: string) =>
    fetch(url, {
      headers: {
        "x-forwarded-for": "198.51.100.66, 203.0.113.7",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.family-agenda.cloud",
      },
    });

  it("arrive at a core as forwarded by a trusted proxy, behind Caddy", async () => {
    const familyId = await createFamily();
    const behindCaddy = await routing.startRouter({ TRUST_PROXY: "true" });
    const since = routing.core.requests.length;

    await throughCaddy(`${behindCaddy.url}/${familyId}/admin/sign-in`);
    await throughCaddy(`${behindCaddy.url}/api/health`);

    expect(arrived(since).map(clientOf)).toEqual([
      { address: "203.0.113.7", scheme: "https", host: "app.family-agenda.cloud" },
      { address: "203.0.113.7", scheme: "https", host: "app.family-agenda.cloud" },
    ]);
  });

  it("are the Router's own peer's when it trusts no proxy, whatever the request claims", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    await throughCaddy(`${router.url}/${familyId}/admin/sign-in`);

    expect(arrived(since).map(clientOf)).toEqual([{ address: "127.0.0.1", scheme: "http", host: new URL(router.url).host }]);
  });
});

describe("static files and the health check", () => {
  it("arrive at a core without a Context, and without the Directory", async () => {
    // A Router that cannot open the Directory: whatever it serves, it serves without it.
    const withoutDirectory = await routing.startRouter({ DIRECTORY_DATABASE_PASSWORD: "not-the-password" });
    const since = routing.core.requests.length;

    const answers = await Promise.all(
      ["/static/app.css", "/static/icons/agenda-192.png", "/api/health"].map(async (path) => {
        const response = await fetch(`${withoutDirectory.url}${path}`, { headers: { "x-family-agenda-context": "forged" } });
        return { status: response.status, body: (await response.json()) };
      }),
    );

    expect(answers).toEqual([
      { status: 200, body: { familyIndependent: "/static/app.css" } },
      { status: 200, body: { familyIndependent: "/static/icons/agenda-192.png" } },
      { status: 200, body: { familyIndependent: "/api/health" } },
    ]);
    const requests = arrived(since);
    expect(requests.map(({ path }) => path).sort()).toEqual(["/api/health", "/static/app.css", "/static/icons/agenda-192.png"]);
    expect(requests.map(({ sealedContext }) => sealedContext)).toEqual([null, null, null]);
    // A Family's request through that Router fails, as it needs the Directory.
    const familyId = await createFamily();
    expect((await fetch(`${withoutDirectory.url}/${familyId}/admin`)).status).toBe(502);
  });

  it("are the only paths outside a Family that arrive at a core", async () => {
    const since = routing.core.requests.length;

    for (const path of ["/api/version", "/static", "/staticx/app.css"]) expect((await browse(path)).status, path).toBe(404);
    expect((await browse("/api/health", { method: "POST" })).status).toBe(404);

    expect(arrived(since)).toEqual([]);
  });
});

describe("a path that names no active Family", () => {
  /** Status, type and body of the answer: the same whatever the reason. */
  const answerTo = async (path: string) => {
    const response = await browse(path);
    return { status: response.status, type: response.headers.get("content-type"), body: await response.text() };
  };

  it("gets the same 404 for an unknown, a suspended and a deleted Family, and nothing arrives at a core", async () => {
    const suspended = await createFamily();
    const deleted = await createFamily();
    await routing.directory("UPDATE family SET status = 'suspended' WHERE family_id = $1", [suspended]);
    await routing.directory(
      "UPDATE family SET status = 'deleted', wrapped_family_key = NULL, wrapped_database_password = NULL WHERE family_id = $1",
      [deleted],
    );
    const since = routing.core.requests.length;

    const answers = [
      await answerTo(`/${crypto.randomUUID()}/admin`),
      await answerTo(`/${suspended}/admin`),
      await answerTo(`/${deleted}/admin`),
    ];

    expect(answers[0]).toMatchObject({ status: 404 });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    expect(arrived(since)).toEqual([]);
  });

  it("gets the same 404 when its first segment is no Family id at all", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;
    const unknown = await answerTo(`/${crypto.randomUUID()}`);

    for (const path of ["/", "/admin", `/${familyId.toUpperCase()}/admin`, `/${familyId}x/admin`, `/x/${familyId}/admin`, "/static"]) {
      expect(await answerTo(path), path).toEqual(unknown);
    }
    expect(arrived(since)).toEqual([]);
  });

  it("gets the same 404 for a Family still being prepared", async () => {
    routing.core.failNext("enter-admin");
    expect((await routing.run(["create", "--admin-email", "first.admin@example.org"])).exitCode).toBe(1);
    const [entry] = await routing.directory("SELECT family_id FROM family WHERE status = 'being_prepared'");
    const since = routing.core.requests.length;

    expect(await answerTo(`/${String(entry?.family_id)}/admin`)).toEqual(await answerTo(`/${crypto.randomUUID()}`));
    expect(arrived(since)).toEqual([]);
  });
});
