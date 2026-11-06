import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { serve } from "../../cloudflare/huella/service.js";

const origin = "https://dominus.example";
const root = origin + "/admin/huella/";
const env = {
  OSINT_ORIGIN: origin, OSINT_GITHUB_CLIENT_ID: "client-id",
  OSINT_GITHUB_CLIENT_SECRET: "client-secret", OSINT_SESSION_SECRET: "a-test-key-with-at-least-32-characters",
  OSINT_ADMIN_GITHUB_IDS: "123"
};
const assets = new Map([
  ["", ["Consola de prueba", "text/html"]], ["ingreso", ["<h1>Ingreso administrativo</h1>", "text/html"]],
  ["huella.js", ["script", "text/javascript"]]
]);
const get = (route = "", cookie) => new Request(root + route, { headers: cookie ? { Cookie: cookie } : {} });
const post = (value, cookie, requestOrigin = origin) => new Request(root + "consulta", {
  method: "POST", headers: { Origin: requestOrigin, Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify(value)
});

async function begin() {
  const redirect = await serve(get("oauth/inicio"), env, assets);
  const authorization = new URL(redirect.headers.get("location"));
  const state = authorization.searchParams.get("state");
  const oauthCookie = redirect.headers.getSetCookie()[0].split(";")[0];
  return { authorization, state, oauthCookie };
}

async function signIn(t, id = 123) {
  const { authorization, state, oauthCookie } = await begin();
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "https://github.com/login/oauth/access_token") {
      assert.equal(options.body.get("code"), "demo-code");
      assert.equal(options.body.get("redirect_uri"), root + "oauth/callback");
      const verifier = options.body.get("code_verifier");
      const sha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      assert.equal(Buffer.from(sha).toString("base64url"), authorization.searchParams.get("code_challenge"));
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authorization.searchParams.has("scope"), false);
      return Response.json({ access_token: "token-never-in-browser" });
    }
    assert.equal(url, "https://api.github.com/user");
    assert.equal(options.headers.Authorization, "Bearer token-never-in-browser");
    return Response.json({ id, type: "User" });
  });
  const callback = await serve(get("oauth/callback?code=demo-code&state=" + state, oauthCookie), env, assets);
  fetchMock.mock.restore();
  const session = callback.headers.getSetCookie().find(value => value.startsWith("__Host-dominus-huella="));
  if (session) {
    assert.match(session, /Secure; HttpOnly; SameSite=Lax; Max-Age=3600/);
    assert.doesNotMatch(session, /token-never-in-browser/);
  }
  return { callback, cookie: session?.split(";")[0] };
}

test("la consola y la API requieren sesión válida. La URL y las cabeceras no confieren permisos", async (t) => {
  assert.equal((await serve(get(), {}, assets)).status, 503);
  assert.equal((await serve(get("?vista=admin"), env, assets)).headers.get("location"), "/admin/huella/ingreso");
  for (const request of [get("huella.js"), get("sesion", "__Host-dominus-huella=falso"), post({ domain: "example.org" }, "")]) {
    assert.equal((await serve(request, env, assets)).status, 403);
  }
  const { cookie } = await signIn(t);
  const check = await serve(get("sesion", cookie), env, assets);
  assert.equal(check.status, 204);
  assert.equal(check.headers.get("x-dominus-huella"), "admin");
  const page = await serve(get("", cookie), env, assets);
  assert.equal(await page.text(), "Consola de prueba");
  assert.match(page.headers.get("cache-control"), /no-store/);
  const tampered = cookie.replace(/\.(.)/, (_, first) => "." + (first === "1" ? "2" : "1"));
  assert.equal((await serve(get("sesion", tampered), env, assets)).status, 403);
  assert.equal((await serve(get("sesion", cookie), { ...env, OSINT_ADMIN_GITHUB_IDS: "456" }, assets)).status, 403);
});

test("OAuth rechaza estado inválido y cuentas fuera de la lista", async (t) => {
  const { oauthCookie } = await begin();
  const callback = await serve(get("oauth/callback?code=demo-code&state=invalido", oauthCookie), env, assets);
  assert.match(callback.headers.get("location"), /sin-acceso$/);
  assert.equal(callback.headers.getSetCookie().length, 1);
  const unauthorized = await signIn(t, 456);
  assert.equal(unauthorized.cookie, undefined);
  assert.match(unauthorized.callback.headers.get("location"), /sin-acceso$/);
});

test("rechaza consultas de otro origen y cuerpos inválidos", async (t) => {
  const { cookie } = await signIn(t);
  assert.equal((await serve(post({ domain: "example.org" }, cookie, "https://externo.example"), env, assets)).status, 403);
  for (const query of [{}, { domain: "x.org/a" }, { username: "../foo" }, { email: "x@example.org" },
    { domain: "example.org", pad: "a".repeat(2048) }]) {
    assert.equal((await serve(post(query, cookie), env, assets)).status, 400);
  }
  const logout = await serve(new Request(root + "salir", { method: "POST", headers: { Cookie: cookie, Origin: origin } }), env, assets);
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("combina DNS, alias e incidentes del sitio sin enviar un correo a los proveedores", async (t) => {
  const { cookie } = await signIn(t);
  const seen = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    seen.push(url);
    if (url.hostname === "dns.google") {
      const type = Number(url.searchParams.get("type"));
      if (type === 15) return Response.json({ Status: 0, Answer: [{ type, data: "0 ." }] });
      if (url.searchParams.get("name").startsWith("_dmarc")) return Response.json({ Status: 2 });
      return Response.json({ Status: 0, Answer: [{ type, data: '"v=spf1 -all"' }] });
    }
    if (url.hostname === "api.github.com") return Response.json({ login: "github", type: "Organization" });
    if (url.hostname === "haveibeenpwned.com") return Response.json([
      { Domain: "example.org", Title: "Ejemplo", BreachDate: "2024-01-01", DataClasses: ["Email addresses"], IsVerified: false },
      { Domain: "other.org", Title: "Otro" }
    ]);
    if (url.hostname === "dev.to") return new Response(null, { status: 429 });
    return Response.json(null);
  });
  const response = await serve(post({ domain: "EXAMPLE.org", username: "@github" }, cookie), env, assets);
  const { results } = await response.json();
  assert.deepEqual(results.map(({ source, status }) => [source, status]), [
    ["MX", "verificado"], ["SPF", "verificado"], ["DMARC", "indeterminado"],
    ["Have I Been Pwned · incidentes del sitio", "encontrado"],
    ["GitHub", "verificado"], ["Hacker News", "sin_resultado"], ["DEV Community", "limitado"]
  ]);
  assert.match(results[0].detail, /no acepta correo/);
  assert.deepEqual(results[3].incidents, [{ title: "Ejemplo", date: "2024-01-01", classes: ["Email addresses"], verified: false }]);
  assert.equal(results[4].url, "https://github.com/github");
  assert.ok(seen.every(url => !url.href.includes("@")));
});

test("el enlace requiere verificación del Worker y la ruta queda fuera de la caché del mapa", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../../index.html"), /<template id="huella-admin-menu" data-solo-admin><a href="admin\/huella\/" data-solo-admin>/);
  assert.match(read("../../js/huella-menu.js"), /r\.status === 204 && r\.headers\.get\("X-Dominus-Huella"\) === "admin"/);
  assert.match(read("../../sw.js"), /p\.includes\("\/admin\/huella\/"\)\) return/);
});
