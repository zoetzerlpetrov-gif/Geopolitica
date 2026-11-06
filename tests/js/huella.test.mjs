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
      assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("code"), "demo-code");
      assert.equal(body.get("redirect_uri"), root + "oauth/callback");
      const verifier = body.get("code_verifier");
      const sha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      assert.equal(Buffer.from(sha).toString("base64url"), authorization.searchParams.get("code_challenge"));
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authorization.searchParams.has("scope"), false);
      assert.equal(authorization.searchParams.get("prompt"), "select_account");
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
  assert.match(callback.headers.get("location"), /intento-vencido$/);
  assert.equal(callback.headers.getSetCookie().length, 1);
  const unauthorized = await signIn(t, 456);
  assert.equal(unauthorized.cookie, undefined);
  assert.match(unauthorized.callback.headers.get("location"), /sin-acceso$/);
});

test("OAuth distingue credenciales rechazadas y conserva los datos de GitHub fuera del aviso", async (t) => {
  const { state, oauthCookie } = await begin();
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: "incorrect_client_credentials", error_description: "detalle del proveedor"
  }, { status: 401 }));
  const callback = await serve(get("oauth/callback?code=demo-code&state=" + state, oauthCookie), env, assets);
  assert.equal(callback.headers.get("location"), "/admin/huella/ingreso?estado=credenciales-oauth");
  assert.equal(callback.headers.getSetCookie().length, 1);
  const page = await serve(get("ingreso?estado=credenciales-oauth"), env, assets);
  const html = await page.text();
  assert.match(html, /rechazó las credenciales/);
  assert.doesNotMatch(html, /detalle del proveedor/);
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
  assert.ok(read("../../sw.js").includes('if (p.includes("/admin/huella/") || p.startsWith("/cuenta/")) return'));
});

test("la sesión de clientes se separa de Admin y cada permiso usa el plan vigente de D1", async (t) => {
  let active = "recon";
  const pilot = {
    ...env,
    OSINT_PLANS_DB: {
      prepare(sql) {
        assert.match(sql, /active = 1.*expires_at/);
        return { bind: (id) => ({ first: async () => id === "456" && active ? { plan: active } : null }) };
      }
    }
  };
  const base = origin + "/cuenta/";
  const request = (path, cookie) => new Request(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal((await serve(request("sesion"), pilot, assets)).status, 403);
  assert.equal((await serve(request(""), env, assets)).status, 503);

  const start = await serve(request("ingreso"), pilot, assets);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const oauth = start.headers.getSetCookie()[0].split(";")[0];
  t.mock.method(globalThis, "fetch", async (url) => url.endsWith("/access_token")
    ? Response.json({ access_token: "prueba" }) : Response.json({ id: 456, type: "User" }));
  const callback = await serve(get("oauth/callback?code=demo-code&state=" + state, oauth), pilot, assets);
  assert.equal(callback.headers.get("location"), "/cuenta/");
  const session = callback.headers.getSetCookie().find(value => value.startsWith("__Host-dominus-planes=")).split(";")[0];
  assert.equal((await serve(get("sesion", session), pilot, assets)).status, 403);
  assert.equal((await serve(get("sesion", session.replace("-planes", "-huella")), pilot, assets)).status, 403);
  assert.deepEqual(await (await serve(request("sesion?plan=command", session), pilot, assets)).json(), { plan: "recon" });
  assert.equal((await serve(request("permiso?grupo=riesgos", session), pilot, assets)).status, 200);
  assert.equal((await serve(request("permiso?grupo=investigacion", session), pilot, assets)).status, 403);
  active = "analyst";
  assert.equal((await serve(request("permiso?grupo=investigacion", session), pilot, assets)).status, 200);
  assert.equal((await serve(request("permiso?grupo=seguimiento", session), pilot, assets)).status, 403);
  active = "command";
  assert.equal((await serve(request("permiso?grupo=seguimiento", session), pilot, assets)).status, 200);
  active = null;
  assert.equal((await serve(request("sesion", session), pilot, assets)).status, 403);
});

test("el mapa temporal pide sesión Admin y conserva el menú y las solicitudes Range", async (t) => {
  const worker = "https://geopolitica.zoetzerl-petrov.workers.dev";
  const previewEnv = { ...env, OSINT_ORIGIN: worker };
  const request = (path, headers) => new Request(worker + path, { headers });
  assert.equal((await serve(request("/"), previewEnv, assets)).headers.get("Location"), "/admin/huella/ingreso");
  assert.equal((await serve(request("/data/test.json"), previewEnv, assets)).status, 403);

  const start = await serve(request("/admin/huella/oauth/inicio"), previewEnv, assets);
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const oauth = start.headers.getSetCookie()[0].split(";")[0];
  const external = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "prueba" });
    if (url === "https://api.github.com/user") return Response.json({ id: 123, type: "User" });
    assert.equal(url.origin, "https://zoetzerlpetrov-gif.github.io");
    assert.equal(options.headers.get("Cookie"), null);
    if (url.pathname.endsWith("redirect.html")) {
      return new Response(null, { status: 302, headers: { Location: "/Geopolitica//externo.example/" } });
    }
    if (url.pathname.endsWith(".pmtiles")) {
      assert.equal(options.headers.get("Range"), "bytes=0-5");
      return new Response("abcdef", { status: 206, headers: { "Content-Range": "bytes 0-5/6" } });
    }
    assert.equal(url.pathname, "/Geopolitica/");
    return new Response('<template id="huella-admin-menu"></template>', { headers: { "Set-Cookie": "no=forward" } });
  });
  const complete = await serve(request("/admin/huella/oauth/callback?code=demo&state=" + state, { Cookie: oauth }), previewEnv, assets);
  const session = complete.headers.getSetCookie().find(x => x.startsWith("__Host-dominus-huella=")).split(";")[0];
  const page = await serve(request("/", { Cookie: session }), previewEnv, assets);
  assert.match(await page.text(), /huella-admin-menu/);
  assert.equal(page.headers.get("Set-Cookie"), null);
  assert.equal((await serve(request("/admin/huella/sesion", { Cookie: session }), previewEnv, assets)).status, 204);
  assert.equal((await serve(request("/data/test.pmtiles", { Cookie: session, Range: "bytes=0-5" }), previewEnv, assets)).status, 206);
  assert.equal((await serve(request("/redirect.html", { Cookie: session }), previewEnv, assets)).status, 502);
  assert.equal(external.mock.callCount(), 5);
});

test("la consulta exacta exige autorización explícita y separa las evidencias de cada proveedor", async (t) => {
  const { cookie } = await signIn(t);
  const email = "equipo+qa@example.org";
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email))).toString("hex");
  const sha = "a".repeat(40);
  const seen = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    seen.push(url);
    switch (url.hostname) {
      case "dns.google": return Response.json({ Status: 0 });
      case "haveibeenpwned.com": return Response.json([]);
      case "keys.openpgp.org":
        assert.equal(decodeURIComponent(url.pathname), "/vks/v1/by-email/" + email);
        return new Response("clave", { headers: { "Content-Type": "application/pgp-keys" } });
      case "api.gravatar.com":
        assert.equal(url.pathname, "/v3/profiles/" + hash);
        return Response.json({ hash, profile_url: "https://gravatar.com/prueba", display_name: "Prueba" });
      case "api.github.com":
        assert.equal(url.searchParams.get("q"), "author-email:" + email);
        return Response.json({ total_count: 2, incomplete_results: false, items: [
          { sha, repository: { full_name: "demo/proyecto" }, commit: { author: { email } } },
          { sha, repository: { full_name: "demo/otro" }, commit: { author: { email: "otro@example.org" } } }
        ] });
      default: assert.fail("Proveedor inesperado");
    }
  });

  assert.equal((await serve(post({ domain: "example.org", email }, cookie), env, assets)).status, 400);
  assert.equal((await serve(post({ domain: "otro.example", email, searchEmail: true }, cookie), env, assets)).status, 400);
  assert.deepEqual(seen, []);
  const response = await serve(post({ domain: "example.org", email, searchEmail: true }, cookie), env, assets);
  const { results } = await response.json();
  const exact = results.slice(4);
  assert.deepEqual(exact.map(({ source, status }) => [source, status]), [
    ["keys.openpgp.org · clave pública", "verificado"],
    ["Gravatar · perfil público", "verificado"],
    ["GitHub · commits públicos", "verificado"]
  ]);
  assert.equal(exact[1].url, "https://gravatar.com/prueba");
  assert.deepEqual(exact[2].evidence, [`https://github.com/demo/proyecto/commit/${sha}`]);
  assert.ok(seen.filter(url => /dns.google|haveibeenpwned.com|api.gravatar.com/.test(url.hostname))
    .every(url => !decodeURIComponent(url.href).includes(email)));
  assert.ok(!JSON.stringify(results).includes(email));
});
