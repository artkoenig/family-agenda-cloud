import { createServer, get, request, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/cli";
import type { Router } from "../src/router";
import { setUpRouting, type TestRouting } from "./support/routing";
import { CALLBACK_PATH, clientOf, poolOf, resolveStandIns, scalePool, STAND_IN_CORE_VERSION, startStandInCore, type StandInCore } from "./support/stand-in-core";

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
  const result = await routing.run(["create", "--organization-id", `org_${crypto.randomUUID().slice(0, 8)}`]);
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
    expect(toFirst).toMatchObject({ familyId: first, publicUrl: `https://app.family-agenda.cloud/${first}`, blobDirectory: "/var/lib/family-agenda/blobs" });
    expect(toSecond).toMatchObject({ familyId: second, publicUrl: `https://app.family-agenda.cloud/${second}`, blobDirectory: "/var/lib/family-agenda/blobs" });
    expect(toFirst!.database.name).not.toBe(toSecond!.database.name);
    expect(toFirst!.database.password).not.toBe(toSecond!.database.password);
    expect(toFirst!.familyKey).not.toBe(toSecond!.familyKey);
    // The Context the Router builds is the one Provisioning had a core open the Family with.
    const entered = routing.core.requests.find(({ path, context }) => path === "/operations/secret-sweep" && context?.familyId === first);
    expect({ ...toFirst, expiresAt: 0 }).toEqual({ ...entered?.context, expiresAt: 0 });
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

  it("breaks off when the core drops it mid-answer, is not asked of another core, and the Router serves on", async () => {
    const familyId = await createFamily();
    const other = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    try {
      const throughPool = await routing.startRouter(poolOf(routing.core, other));
      const logBefore = routing.log().length;
      const since = routing.core.requests.length;
      routing.core.dropNext();

      const response = await fetch(`${throughPool.url}/${familyId}/agendas/1`);
      expect(response.status).toBe(200);
      await expect(response.text()).rejects.toThrow();

      expect(other.requests).toEqual([]);
      expect((await fetch(`${throughPool.url}/${familyId}/agendas/2`)).status).toBe(200);
      expect((await fetch(`${throughPool.url}/${familyId}/agendas/3`)).status).toBe(200);
      const dropped = arrived(since)[0]!;
      expect(dropped.path).toBe("/agendas/1");
      // The error is logged by the Family id and what happened, never with the request it was about.
      const logged = routing.log().slice(logBefore);
      expect(logged).toContain(`"familyId":"${familyId}"`);
      expect(logged).toMatch(/"level":"error"/);
      for (const secret of [dropped.sealedContext!, dropped.context!.familyKey, dropped.context!.database.password]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      await other.close();
    }
  });
});

describe("the browser's headers", () => {
  it("arrive at a core without those of the browser's connection, a Forwarded header or a Context", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    // fetch refuses to send a Connection header.
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const toRouter = request(`${router.url}/${familyId}/admin`, {
        headers: {
          connection: "keep-alive, x-hop-secret",
          "x-hop-secret": "for the Router only",
          "keep-alive": "timeout=5",
          forwarded: "for=198.51.100.66;proto=https",
          "x-family-context": "forged",
          "x-end-to-end": "kept",
        },
      });
      toRouter.on("response", resolve).on("error", reject).end();
    });
    response.resume();

    expect(response.statusCode).toBe(200);
    const headers = arrived(since)[0]!.headers;
    expect(headers["x-end-to-end"]).toBe("kept");
    for (const name of ["x-hop-secret", "keep-alive", "forwarded"]) expect(headers[name], name).toBeUndefined();
    expect(headers["x-family-context"]).not.toBe("forged");
  });
});

describe("routing serve, when its configuration is wrong", () => {
  it.each([
    ["a list of cores", { CORE_URL: "http://core-1:3002,http://core-2:3002" }],
    ["a port that is no number", { PORT: "eighty" }],
    ["a port out of range", { PORT: "65536" }],
    ["a negative port", { PORT: "-1" }],
  ])("refuses to start with %s", async (_case, env) => {
    const result = await routing.run(["serve"], env);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("The configuration is incomplete");
    expect(result.stderr).not.toContain("The Router listens");
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
      resolve: resolveStandIns,
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
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const throughBrokenPool = await routing.startRouter(poolOf(down));
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
    others = [await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!), await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!)];
    const pool = [routing.core, ...others];
    const sinces = pool.map((core) => core.requests.length);
    const throughPool = await routing.startRouter(poolOf(...pool));

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
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const throughPool = await routing.startRouter(poolOf(down, routing.core));
    const since = routing.core.requests.length;

    const answers = await Promise.all([0, 1, 2, 3].map(async () => (await fetch(`${throughPool.url}/${familyId}/admin`)).status));

    expect(answers).toEqual([200, 200, 200, 200]);
    expect(arrived(since)).toHaveLength(4);
  });

  it("takes a core the pool was scaled up by into its turns, without a restart", async () => {
    const familyId = await createFamily();
    others = [await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!)];
    const pool = poolOf(routing.core);
    const throughPool = await routing.startRouter(pool);
    expect((await fetch(`${throughPool.url}/${familyId}/agendas/0`)).status).toBe(200);
    expect(others[0]!.requests).toEqual([]);

    scalePool(pool, routing.core, others[0]!);
    const since = routing.core.requests.length;
    for (let index = 1; index <= 4; index++) expect((await fetch(`${throughPool.url}/${familyId}/agendas/${index}`)).status).toBe(200);

    expect(others[0]!.requests).toHaveLength(2);
    expect(arrived(since)).toHaveLength(2);
  });

  it("asks nothing of a core the pool was scaled down by, without a restart", async () => {
    const familyId = await createFamily();
    others = [await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!)];
    const pool = poolOf(routing.core, others[0]!);
    const throughPool = await routing.startRouter(pool);

    scalePool(pool, others[0]!);
    const since = routing.core.requests.length;
    const logBefore = routing.log().length;
    for (let index = 0; index < 4; index++) expect((await fetch(`${throughPool.url}/${familyId}/agendas/${index}`)).status).toBe(200);

    expect(arrived(since)).toEqual([]);
    expect(others[0]!.requests).toHaveLength(4);
    expect(routing.log().slice(logBefore)).not.toContain("did not answer");
  });

  it("answers 502 while the pool's name stands for no core, says so in the log, and serves again once it does", async () => {
    const familyId = await createFamily();
    const pool = poolOf();
    const throughPool = await routing.startRouter(pool);

    expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(502);
    expect(routing.log()).toContain(`"message":"The pool's name stands for no core","pool":"${new URL(pool.CORE_URL).host}"`);

    scalePool(pool, routing.core);
    expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(200);
  });

  it("answers 502 when the pool's name does not resolve, and says why in the log", async () => {
    const familyId = await createFamily();
    const throughPool = await routing.startRouter({ CORE_URL: "http://no-such-pool.invalid:3002" });

    expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(502);
    expect(routing.log()).toMatch(/"message":"The pool's name did not resolve","pool":"no-such-pool.invalid:3002","reason":"E[A-Z_]+"/);
  });

  it("sends a request with a body on to the next core when one could not be connected to, as it then did not arrive", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const throughPool = await routing.startRouter(poolOf(down, routing.core));
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/admin/agendas`, { method: "POST", body: "name=Kitchen" });

    expect(response.status).toBe(200);
    expect(arrived(since).map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /admin/agendas"]);
  });

  // The counterexamples of spec/failover.qnt: a call that may have run is not sent again.
  it("does not send a request with a body to another core when the connection broke after it arrived, as it may have run", async () => {
    const familyId = await createFamily();
    const dying = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others = [dying];
    dying.dropNextUnanswered();
    const throughPool = await routing.startRouter(poolOf(dying, routing.core));
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/admin/agendas`, { method: "POST", body: "name=Kitchen" });

    expect(response.status).toBe(502);
    expect(dying.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /admin/agendas"]);
    expect(arrived(since)).toEqual([]);
  });

  it("has a page whose connection broke after it arrived served by the next core, as a page may be asked again", async () => {
    const familyId = await createFamily();
    const dying = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    others = [dying];
    dying.dropNextUnanswered();
    const throughPool = await routing.startRouter(poolOf(dying, routing.core));
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/1`);

    expect(response.status).toBe(200);
    expect(dying.requests.map(({ path }) => path)).toEqual(["/agendas/1"]);
    expect(arrived(since).map(({ path }) => path)).toEqual(["/agendas/1"]);
  });

  it("answers 502 to a body longer than the Router holds when the one core it was sent to could not be connected to", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const throughPool = await routing.startRouter(poolOf(down, routing.core));
    const since = routing.core.requests.length;
    const upload = Buffer.alloc(3 * 1024 * 1024, "u");

    const response = await fetch(`${throughPool.url}/${familyId}/admin/upload`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: upload });

    expect(response.status).toBe(502);
    expect(arrived(since)).toEqual([]);
  });

  it("answers 502 when no core answers", async () => {
    const familyId = await createFamily();
    const down = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    await down.close();
    const throughPool = await routing.startRouter(poolOf(down));

    expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(502);
    expect((await fetch(`${throughPool.url}/api/health`)).status).toBe(502);
  });
});

describe("a core that refuses to open the Family", () => {
  let older: StandInCore;
  let throughPool: Router;
  let familyId: string;
  beforeEach(async () => {
    familyId = await createFamily();
    // A core of an older release than the one that migrated the Family's database, asked first.
    older = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    older.refuseFamily(familyId, "migrated-by-newer-release");
    throughPool = await routing.startRouter(poolOf(older, routing.core));
  });
  afterEach(async () => {
    await older.close();
  });

  const hostOf = (core: StandInCore) => new URL(core.url).host;

  it("has a page served by the next core of the pool, and the browser sees only that core's answer", async () => {
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/7?day=2026-11-16`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/agendas/7" });
    expect(older.requests.map(({ path }) => path)).toEqual(["/agendas/7"]);
    expect(arrived(since).map(({ path, search }) => `${path}${search}`)).toEqual(["/agendas/7?day=2026-11-16"]);
    expect(routing.log()).toContain(
      `"message":"A core refused to open the Family; the next one of the pool is tried","familyId":"${familyId}","core":"${hostOf(older)}","reason":"409 migrated-by-newer-release"`,
    );
  });

  it.each(["migrating", "unavailable"] as const)("because it is %s has a page served by the next core too", async (problem) => {
    older.refuseFamily(familyId, problem);

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/7`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/agendas/7" });
    expect(older.requests).toHaveLength(1);
  });

  it("has a request with a body served by the next core, with the same method, headers and body", async () => {
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/admin/agendas`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "session=abc" },
      body: JSON.stringify({ name: "Kitchen" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/admin/agendas" });
    const sent = { method: "POST", path: "/admin/agendas", body: { name: "Kitchen" }, headers: { cookie: "session=abc", "content-length": "18" } };
    expect(older.requests).toMatchObject([sent]);
    expect(arrived(since)).toMatchObject([sent]);
  });

  it("is asked once per request: every core of the pool is tried at most once", async () => {
    const third = await startStandInCore(routing.env.CONTEXT_KEY!, routing.env.TRIGGER_TOKEN!);
    try {
      third.refuseFamily(familyId, "migrated-by-newer-release");
      routing.core.refuseFamily(familyId, "migrating");
      const pool = [older, third, routing.core];
      const through = await routing.startRouter(poolOf(...pool));
      const sinces = pool.map((core) => core.requests.length);

      const response = await fetch(`${through.url}/${familyId}/admin`, { method: "POST", body: "name=Kitchen" });

      expect(response.status).toBe(503);
      expect(pool.map((core, index) => core.requests.length - sinces[index]!)).toEqual([1, 1, 1]);
    } finally {
      await third.close();
    }
  });

  it("on every core of the pool gets the browser a 503 to try again, which says nothing of the cores, and the log what each core answered", async () => {
    routing.core.refuseFamily(familyId, "migrating");

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/7`);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Not available right now. Try again in a moment.\n");
    expect(routing.log()).toContain(
      `"message":"Every core that answered refused to open the Family","familyId":"${familyId}","refused":"${hostOf(older)} 409 migrated-by-newer-release, ${hostOf(routing.core)} 503 migrating"`,
    );
    // Preparing is done: the browser's next try is served.
    routing.core.refuseFamily(familyId, undefined);
    expect((await fetch(`${throughPool.url}/${familyId}/agendas/7`)).status).toBe(200);
  });

  it("does not stand in the way of a 409 or 503 that is the Family's own answer, which reaches the browser unchanged", async () => {
    older.refuseFamily(familyId, undefined);
    const since = routing.core.requests.length;
    const conflict = Buffer.from("old-data-model: the database the Context names holds the data model from before its rebuild.");
    older.answerNext({ status: 409, headers: [["content-type", "text/plain; charset=utf-8"], ["x-core-says", "conflict"]], body: conflict });

    const response = await fetch(`${throughPool.url}/${familyId}/admin/agendas`, { method: "POST", body: "name=Kitchen" });

    expect(response.status).toBe(409);
    expect(response.headers.get("x-core-says")).toBe("conflict");
    expect(await response.text()).toBe(conflict.toString());
    expect(arrived(since)).toEqual([]);
  });

  it("does not send a request with a body to another core after a 503 that does not say the core refused the Family", async () => {
    older.refuseFamily(familyId, undefined);
    const since = routing.core.requests.length;
    older.answerNext({ status: 503, headers: [["content-type", "text/plain; charset=utf-8"]], body: Buffer.from("The mail server is busy.") });

    const response = await fetch(`${throughPool.url}/${familyId}/admin/agendas`, { method: "POST", body: "name=Kitchen" });

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("The mail server is busy.");
    expect(arrived(since)).toEqual([]);
  });

  it("has a page served by the next core after any 503, as a page may always be asked again", async () => {
    older.refuseFamily(familyId, undefined);
    older.answerNext({ status: 503, headers: [], body: Buffer.from("Service unavailable") });

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/7`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId, path: "/agendas/7" });
  });

  it("has a HEAD request, whose refusal has no body to say why, served by the next core", async () => {
    const since = routing.core.requests.length;

    const response = await fetch(`${throughPool.url}/${familyId}/agendas/7`, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(older.requests.map(({ method }) => method)).toEqual(["HEAD"]);
    expect(arrived(since).map(({ method, path }) => `${method} ${path}`)).toEqual(["HEAD /agendas/7"]);
  });

  it("passes on a 409 longer than any refusal unchanged, even one that begins like a refusal", async () => {
    older.refuseFamily(familyId, undefined);
    const long = Buffer.from(`migrated-by-newer-release: ${"x".repeat(5000)}`);
    older.answerNext({ status: 409, headers: [["content-type", "text/plain; charset=utf-8"]], body: long });

    const response = await fetch(`${throughPool.url}/${familyId}/admin`);

    expect(response.status).toBe(409);
    expect(await response.text()).toBe(long.toString());
  });

  it("gets a body longer than the Router holds, which cannot be sent twice, a 503 from the one core it was sent to", async () => {
    const since = routing.core.requests.length;
    const upload = Buffer.alloc(3 * 1024 * 1024, "u");

    const response = await fetch(`${throughPool.url}/${familyId}/admin/upload`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: upload });

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Not available right now. Try again in a moment.\n");
    expect(older.requests.map(({ path, headers }) => [path, headers["content-length"]])).toEqual([["/admin/upload", String(upload.length)]]);
    expect(arrived(since)).toEqual([]);
  });
});

describe("a core whose 409 breaks off before its body arrived", () => {
  it("gets the browser a 502, and the Router serves on", async () => {
    const familyId = await createFamily();
    const dying = createServer((_incoming, outgoing) => {
      outgoing.writeHead(409, { "content-type": "text/plain", "content-length": "100" });
      outgoing.flushHeaders();
      outgoing.socket?.destroy();
    });
    await new Promise<void>((resolve) => dying.listen(0, "127.0.0.1", resolve));
    try {
      const throughPool = await routing.startRouter(poolOf({ url: `http://127.0.0.1:${(dying.address() as AddressInfo).port}`, triggerUrl: "http://127.0.0.1:9" }, routing.core));
      const since = routing.core.requests.length;

      // A request with a body: the core may have run it, so no other core is asked.
      const response = await fetch(`${throughPool.url}/${familyId}/admin`, { method: "POST", body: "name=Kitchen" });

      expect(response.status).toBe(502);
      expect(arrived(since)).toEqual([]);
      expect(routing.log()).toContain(`"message":"A core's answer broke off","familyId":"${familyId}"`);
      expect((await fetch(`${throughPool.url}/${familyId}/admin`)).status).toBe(200);
    } finally {
      dying.closeAllConnections();
      await new Promise((resolve) => dying.close(resolve));
    }
  });
});

describe("a request with a body", () => {
  it.each([
    ["shorter than the Router holds", 64 * 1024],
    ["longer than the Router holds", 3 * 1024 * 1024],
  ])("%s arrives at a core whole", async (_case, length) => {
    const familyId = await createFamily();
    const echo = await startEcho();
    try {
      const throughEcho = await routing.startRouter({ CORE_URL: echo.url });
      const upload = Buffer.from(Array.from({ length }, (_, index) => index % 251));

      const response = await fetch(`${throughEcho.url}/${familyId}/admin/upload`, { method: "POST", body: upload });

      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(upload)).toBe(true);
    } finally {
      await echo.close();
    }
  });
});

/** A core that answers every request with the body it was sent. */
async function startEcho(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((incoming, outgoing) => {
    outgoing.writeHead(200, { "content-type": "application/octet-stream" });
    incoming.pipe(outgoing);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

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

describe("the health check", () => {
  it("arrives at a core without a Context, and without the Directory", async () => {
    // A Router that cannot open the Directory: whatever it serves, it serves without it.
    const withoutDirectory = await routing.startRouter({ DIRECTORY_DATABASE_PASSWORD: "not-the-password" });
    const since = routing.core.requests.length;

    const answers = await Promise.all(
      ["/api/health"].map(async (path) => {
        const response = await fetch(`${withoutDirectory.url}${path}`, { headers: { "x-family-context": "forged" } });
        return { status: response.status, body: (await response.json()) };
      }),
    );

    expect(answers).toEqual([{ status: 200, body: { status: "ok", version: STAND_IN_CORE_VERSION } }]);
    const requests = arrived(since);
    expect(requests.map(({ path }) => path)).toEqual(["/api/health"]);
    expect(requests.map(({ sealedContext }) => sealedContext)).toEqual([null]);
    // A Family's request through that Router fails, as it needs the Directory.
    const familyId = await createFamily();
    expect((await fetch(`${withoutDirectory.url}/${familyId}/admin`)).status).toBe(502);
  });

  it("is the only path outside a Family that arrives at a core", async () => {
    const since = routing.core.requests.length;

    // Static files too: the core serves them below a Family's prefix only, with its Context.
    for (const path of ["/api/version", "/static", "/static/app.css", "/staticx/app.css"]) expect((await browse(path)).status, path).toBe(404);
    expect((await browse("/api/health", { method: "POST" })).status).toBe(404);

    expect(arrived(since)).toEqual([]);
  });
});

describe("the sign-in callback and the Identity Provider's events", () => {
  it("arrive at a core without a Context, with their query and body, and without the Directory", async () => {
    const withoutDirectory = await routing.startRouter({ DIRECTORY_DATABASE_PASSWORD: "not-the-password" });
    const since = routing.core.requests.length;

    const callback = await fetch(`${withoutDirectory.url}${CALLBACK_PATH}?code=abc&state=xyz`, { headers: { "x-family-context": "forged" }, redirect: "manual" });
    const event = await fetch(`${withoutDirectory.url}/idp/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "logto-signature-sha-256": "signed" },
      body: JSON.stringify({ event: "PostRegister" }),
    });

    expect([callback.status, await callback.json()]).toEqual([200, { familyIndependent: CALLBACK_PATH }]);
    expect([event.status, await event.json()]).toEqual([200, { familyIndependent: "/idp/events" }]);
    const [toCallback, toEvents, ...more] = arrived(since);
    expect(more).toEqual([]);
    expect(toCallback).toMatchObject({ method: "GET", path: CALLBACK_PATH, search: "?code=abc&state=xyz", sealedContext: null });
    expect(toEvents).toMatchObject({ method: "POST", path: "/idp/events", sealedContext: null });
    expect(toEvents?.headers["logto-signature-sha-256"]).toBe("signed");
  });

  it("are the callback OIDC_CALLBACK_URL names, with GET, and the events only with POST", async () => {
    const elsewhere = await routing.startRouter({ OIDC_CALLBACK_URL: "https://app.family-agenda.cloud/auth/back" });
    const since = routing.core.requests.length;

    expect((await fetch(`${elsewhere.url}${CALLBACK_PATH}`)).status).toBe(404);
    expect((await fetch(`${elsewhere.url}/auth/back`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${elsewhere.url}/idp/events`)).status).toBe(404);
    await fetch(`${elsewhere.url}/auth/back`, { redirect: "manual" });

    expect(arrived(since).map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /auth/back"]);
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

  it("gets the same 404 when it names a core's triggered operations, however it is spelt, and nothing arrives at a core", async () => {
    // Only the Routing module triggers them; through the Router a browser could reset an Admin's password.
    const familyId = await createFamily();
    const since = routing.core.requests.length;
    const unknown = await answerTo(`/${crypto.randomUUID()}`);

    const spellings = ["/operations", "/operations/reset-admin-password", "//operations/due-work", "/OPERATIONS/secret-sweep"];
    const disguised = ["/x/../operations/secret-sweep", "/./operations/purge", "/%6Fperations/sweep-secrets", "/%2e/operations/x", "/%zz/../operations/x"];
    for (const path of [...spellings, ...disguised]) {
      expect(await answerTo(`/${familyId}${path}`), path).toEqual(unknown);
      const response = await browse(`/${familyId}${path}`, { method: "POST", body: JSON.stringify({}) });
      expect(response.status, path).toBe(404);
    }
    expect(arrived(since)).toEqual([]);
  });

  it("still reaches the core for a page whose path merely mentions operations", async () => {
    const familyId = await createFamily();
    const since = routing.core.requests.length;

    expect((await browse(`/${familyId}/admin/operations`)).status).toBe(200);
    expect((await browse(`/${familyId}/operationsx`)).status).toBe(200);
    expect(arrived(since).map(({ path }) => path)).toEqual(["/admin/operations", "/operationsx"]);
  });

  it("gets the same 404 for a Family still being prepared", async () => {
    routing.core.failNext("secret-sweep");
    expect((await routing.run(["create", "--organization-id", `org_${crypto.randomUUID().slice(0, 8)}`])).exitCode).toBe(1);
    const [entry] = await routing.directory("SELECT family_id FROM family WHERE status = 'being_prepared'");
    const since = routing.core.requests.length;

    expect(await answerTo(`/${String(entry?.family_id)}/admin`)).toEqual(await answerTo(`/${crypto.randomUUID()}`));
    expect(arrived(since)).toEqual([]);
  });
});
