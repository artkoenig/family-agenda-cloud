// Two throwaway OIDC clients ("core" and "routing") for the trial, on http://localhost:8228.
// GET /start/<client>?<extra auth params> starts a code flow with PKCE; the callback shows the
// decoded ID token, or the error Logto returned. GET /last returns the last result as JSON.
// Client ids and secrets come from CORE_ID/CORE_SECRET and ROUTING_ID/ROUTING_SECRET.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
const issuer = process.env.LOGTO ?? "http://localhost:3201";
const clients = {
  core: { id: process.env.CORE_ID, secret: process.env.CORE_SECRET },
  routing: { id: process.env.ROUTING_ID, secret: process.env.ROUTING_SECRET },
};
const scope = "openid email profile custom_data urn:logto:scope:organizations";
const pending = new Map();
let last = null;
const b64 = (buf) => buf.toString("base64url");
const decode = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8228");
  const [, first, second] = url.pathname.split("/");
  const show = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body, null, 2)); };
  if (first === "last") return show(200, last);
  if (first === "start" && clients[second]) {
    const state = b64(randomBytes(12)), verifier = b64(randomBytes(32));
    pending.set(state, { client: second, verifier });
    const auth = new URL(`${issuer}/oidc/auth`);
    const params = { client_id: clients[second].id, redirect_uri: `http://localhost:8228/${second}/callback`, response_type: "code", scope, state,
      code_challenge: b64(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256" };
    for (const [k, v] of Object.entries(params)) auth.searchParams.set(k, v);
    for (const [k, v] of url.searchParams) auth.searchParams.set(k, v);
    res.writeHead(302, { location: auth.href });
    return res.end();
  }
  if (clients[first] && second === "callback") {
    const flow = pending.get(url.searchParams.get("state"));
    if (url.searchParams.get("error") || !flow) return show(200, (last = { client: first, error: Object.fromEntries(url.searchParams) }));
    const c = clients[flow.client];
    const token = await fetch(`${issuer}/oidc/token`, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: `http://localhost:8228/${flow.client}/callback`, code_verifier: flow.verifier }) }).then((r) => r.json());
    return show(200, (last = { client: flow.client, idToken: token.id_token ? decode(token.id_token) : null, tokenError: token.error ?? null }));
  }
  show(404, { error: "unknown path" });
}).listen(8228, () => console.log("rp on http://localhost:8228"));
