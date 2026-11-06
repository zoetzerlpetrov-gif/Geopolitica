import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { catalog, catalogInfo } from "../../cloudflare/huella/catalog.js";
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
  assert.deepEqual(results.slice(0, 7).map(({ source, status }) => [source, status]), [
    ["MX", "verificado"], ["SPF", "verificado"], ["DMARC", "indeterminado"],
    ["Have I Been Pwned · incidentes del sitio", "encontrado"],
    ["GitHub", "verificado"], ["Hacker News", "sin_resultado"], ["DEV Community", "limitado"]
  ]);
  assert.equal(results.filter(result => result.kind === "alias").length, 28);
  assert.match(results[0].detail, /no acepta correo/);
  assert.deepEqual(results[3].incidents, [{ title: "Ejemplo", date: "2024-01-01", classes: ["Email addresses"], verified: false }]);
  assert.equal(results[4].url, "https://github.com/github");
  assert.ok(seen.every(url => !url.href.includes("@")));
});

test("la consulta directa de Bluesky funciona con las opciones de fetch de Workers y descarta redirecciones", async (t) => {
  const { cookie } = await signIn(t);
  const targets = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    // Workers lanza antes de iniciar la petición si redirect es "error".
    if (options.redirect === "error") throw new TypeError("Modo de redirección incompatible con Workers");
    assert.equal(options.redirect, "manual");
    const url = new URL(input);
    targets.push(url);
    if (url.hostname === "public.api.bsky.app") {
      assert.equal(url.searchParams.get("actor"), "bsky.app");
      return Response.json({
        handle: "bsky.app", displayName: "Bluesky",
        avatar: "https://cdn.bsky.app/img/avatar/plain/did:plc:example/bafkreiexample"
      });
    }
    if (url.hostname === "api.github.com") return new Response(null, {
      status: 302, headers: { Location: "https://externo.example/perfil" }
    });
    return new Response(null, { status: 404 });
  });

  const response = await serve(post({ username: "@bsky.app" }, cookie), env, assets);
  const { results } = await response.json();
  const lookup = source => results.find(result => result.source === source);
  assert.equal(lookup("Bluesky").status, "verificado");
  assert.equal(lookup("Bluesky").url, "https://bsky.app/profile/bsky.app");
  assert.equal(lookup("Bluesky").avatar, "https://cdn.bsky.app/img/avatar/plain/did:plc:example/bafkreiexample");
  assert.equal(lookup("GitHub").status, "indeterminado");
  assert.ok(targets.some(url => url.hostname === "public.api.bsky.app"));
  assert.ok(!targets.some(url => url.hostname === "externo.example"));
});

test("distingue resultados directos de X y Tumblr de referencias editoriales por alias", async (t) => {
  const { cookie } = await signIn(t);
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "publish.x.com") {
      assert.equal(url.searchParams.get("url"), "https://x.com/ejemplo");
      return Response.json({ type: "rich", url: "https://twitter.com/Ejemplo" });
    }
    if (url.hostname === "www.tumblr.com") return new Response(
      '<link href="https://www.tumblr.com/ejemplo" rel="canonical">' +
      '<meta content="https://www.tumblr.com/ejemplo" property="og:url">',
      { headers: { "Content-Type": "text/html" } });
    if (url.hostname === "query.wikidata.org") return Response.json({ results: { bindings: [
      { item: { value: "http://www.wikidata.org/entity/Q123" },
        property: { value: "http://www.wikidata.org/prop/direct/P2003" }, handle: { value: "ejemplo" } },
      { item: { value: "http://www.wikidata.org/entity/Q456" },
        property: { value: "http://www.wikidata.org/prop/direct/P7085" }, handle: { value: "otro" } },
      { item: { value: "https://example.org/Q123" },
        property: { value: "http://www.wikidata.org/prop/direct/P2003" }, handle: { value: "ejemplo" } }
    ] } });
    return new Response(null, { status: 404 });
  });

  const response = await serve(post({ username: "ejemplo" }, cookie), env, assets);
  const { results } = await response.json();
  const source = name => results.find(result => result.source === name);
  assert.equal(source("X · cronología pública").url, "https://x.com/ejemplo");
  assert.equal(source("X · cronología pública").status, "verificado");
  assert.equal(source("Tumblr · blog público").status, "verificado");
  assert.equal(source("Wikidata · referencias de redes").status, "indicio");
  assert.deepEqual(source("Wikidata · referencias de redes").socialReferences, [
    { platform: "Instagram", url: "https://www.instagram.com/ejemplo", reference: "https://www.wikidata.org/wiki/Q123" }
  ]);
  assert.equal(source("X · cronología pública").avatar, undefined);
});

test("el enlace requiere verificación del Worker y la ruta queda fuera de la caché del mapa", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../../index.html"), /id="menu-secciones"[\s\S]*?id="acceso-mapa-admin" href="https:\/\/geopolitica\.zoetzerl-petrov\.workers\.dev\/admin\/huella\/"[^>]* hidden/);
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
  const owner = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("equipo+qa"))).subarray(0, 28).toString("hex");
  const sha = "a".repeat(40);
  const seen = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    seen.push(url);
    switch (url.hostname) {
      case "dns.google": {
        const type = Number(url.searchParams.get("type"));
        if (type === 61 || type === 53) {
          const label = type === 61 ? "_openpgpkey" : "_smimecert";
          assert.equal(url.searchParams.get("name"), `${owner}.${label}.example.org`);
          return Response.json({ Status: 0, Answer: [{ type, data: "clave o certificado público" }] });
        }
        return Response.json({ Status: 0 });
      }
      case "haveibeenpwned.com": return Response.json([]);
      case "keys.openpgp.org":
        assert.equal(decodeURIComponent(url.pathname), "/vks/v1/by-email/" + email);
        return new Response("clave", { headers: { "Content-Type": "application/pgp-keys" } });
      case "api.gravatar.com":
        assert.equal(url.pathname, "/v3/profiles/" + hash);
        return Response.json({
          hash, profile_url: "https://gravatar.com/prueba", display_name: "Prueba",
          avatar_url: `https://0.gravatar.com/avatar/${hash}?s=128`
        });
      case "api.github.com":
        if (url.pathname === "/search/users") {
          assert.equal(url.searchParams.get("q"), email + " in:email");
          return Response.json({ items: [
            { login: "equipo", avatar_url: "https://avatars.githubusercontent.com/u/123?v=4", text_matches: [{ property: "email", fragment: email }] },
            { login: "otra", text_matches: [{ property: "name", fragment: email }] },
            { login: "prefijo", text_matches: [{ property: "email", fragment: "otro-" + email }] }
          ] });
        }
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
    ["GitHub · commits públicos", "verificado"],
    ["GitHub · correo del perfil público", "verificado"],
    ["DNS · clave OPENPGPKEY", "verificado"],
    ["DNS · certificado SMIMEA", "verificado"]
  ]);
  assert.equal(exact[1].url, "https://gravatar.com/prueba");
  assert.equal(exact[1].avatar, `https://0.gravatar.com/avatar/${hash}`);
  assert.deepEqual(exact[2].evidence, [`https://github.com/demo/proyecto/commit/${sha}`]);
  assert.deepEqual(exact[3].profileLinks, ["https://github.com/equipo"]);
  assert.equal(exact[3].avatar, "https://avatars.githubusercontent.com/u/123");
  assert.equal(exact[4].records, undefined);
  assert.equal(exact[5].records, undefined);
  assert.ok(seen.filter(url => /dns.google|haveibeenpwned.com|api.gravatar.com/.test(url.hostname))
    .every(url => !decodeURIComponent(url.href).includes(email)));
  assert.ok(!JSON.stringify(results).includes(email));
});

test("separa coincidencias de alias y cruces respaldados por enlaces públicos", async (t) => {
  const { cookie } = await signIn(t);
  const email = "equipo@example.org";
  let active = 0;
  let max = 0;
  const seen = new Set();
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    seen.add(url.hostname);
    active++;
    max = Math.max(max, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    switch (url.hostname) {
      case "api.gravatar.com":
        return Response.json({
          hash: url.pathname.split("/").at(-1), profile_url: "https://gravatar.com/equipo",
          verified_accounts: [
            { url: "https://github.com/equipo/?ref=gravatar", is_hidden: false },
            { url: "https://codeberg.org/equipo", is_hidden: true },
            { url: "https://www.linkedin.com/in/equipo", is_hidden: false },
            { url: "https://github.com/login/oauth/authorize", is_hidden: false },
            { url: "https://privado.example/equipo", is_hidden: false }
          ]
        });
      case "gitlab.com": return Response.json([{ username: "equipo", public_email: email, avatar_url: "https://tracking.example/avatar.png" }]);
      case "codeberg.org": return Response.json({ login: "equipo", visibility: "public" });
      case "gitea.com": return Response.json({ login: "otro-alias" });
      case "api.github.com":
        return url.pathname.startsWith("/users/") ? Response.json({ login: "equipo" }) :
          Response.json({ items: [], total_count: 0, incomplete_results: false });
      case "public.api.bsky.app":
        assert.equal(url.searchParams.get("actor"), "equipo.bsky.social");
        return Response.json({ error: "InvalidRequest", message: "Profile not found" }, { status: 400 });
      case "mastodon.social": return Response.json({ acct: "equipo@otro.example" });
      case "users.roblox.com":
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { usernames: ["equipo"], excludeBannedUsers: true });
        return Response.json({ data: [{ name: "equipo", id: 123 }] });
      case "api.stackexchange.com": return Response.json({ items: [
        { display_name: "equipo", user_id: 4321 },
        { display_name: "equipo distinto", user_id: 1234 }
      ], has_more: false });
      case "public-api.wordpress.com": return Response.json({ ID: 11, URL: "https://equipo.wordpress.com", is_private: false });
      case "keybase.io": return Response.json({ status: { code: 0 }, them: { basics: { username: "equipo" } } });
      case "api.bitbucket.org": return Response.json({ slug: "equipo", is_private: true });
      case "api.chess.com": return new Response(null, { status: 429 });
      default: return new Response(null, { status: 404 });
    }
  });
  const response = await serve(post({ domain: "example.org", email, searchEmail: true, username: "equipo" }, cookie), env, assets);
  assert.equal(response.status, 200);
  const { results } = await response.json();
  const lookup = source => results.find(result => result.source === source);
  assert.equal(results.filter(result => result.kind === "alias").length, 28);
  assert.deepEqual(lookup("Gravatar · perfil público").declaredProfiles,
    ["https://github.com/equipo", "https://www.linkedin.com/in/equipo"]);
  assert.match(lookup("GitHub").correlation, /Gravatar/);
  assert.match(lookup("GitLab.com").correlation, /mismo correo/);
  assert.equal(lookup("GitLab.com").avatar, undefined);
  assert.equal(lookup("Codeberg").correlation, undefined);
  assert.equal(lookup("Gitea.com").status, "indeterminado");
  assert.equal(lookup("Bluesky").status, "sin_resultado");
  assert.equal(lookup("Mastodon · mastodon.social").status, "indeterminado");
  assert.equal(lookup("Roblox").url, "https://www.roblox.com/users/123/profile");
  assert.equal(lookup("Keybase").status, "verificado");
  assert.equal(lookup("Stack Overflow · nombre visible").status, "indicio");
  assert.deepEqual(lookup("Stack Overflow · nombre visible").profileLinks, ["https://stackoverflow.com/users/4321"]);
  assert.equal(lookup("WordPress.com · sitio público").url, "https://equipo.wordpress.com/");
  assert.equal(lookup("Bitbucket · espacio de trabajo").status, "indeterminado");
  assert.equal(lookup("Chess.com").status, "limitado");
  assert.ok(max > 1 && max <= 6, `Conexiones concurrentes observadas: ${max}`);
  assert.equal(seen.has("www.linkedin.com"), false);
  assert.ok(!JSON.stringify(results).includes(email));
});

test("el catálogo ampliado usa destinos HTTPS y opera en lotes autenticados sin reenviar correos", async (t) => {
  const { cookie } = await signIn(t);
  const url = root + "consulta/catalogo";
  const request = (value, session = cookie, originOverride = origin) => new Request(url, {
    method: "POST", headers: { Origin: originOverride, Cookie: session, "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  const hosts = catalog.map(([, , target, link]) => {
    for (const template of [target, link || target]) {
      const parsed = new URL(template.replace("{account}", "demo-qa"));
      assert.equal(parsed.protocol, "https:");
      assert.equal(parsed.username + parsed.password + parsed.port + parsed.hash, "");
      assert.match(parsed.hostname, /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i);
      assert.ok(parsed.href.includes("demo-qa"));
    }
    return new URL((link || target).replace("{account}", "demo-qa")).hostname.replace(/^www\./, "");
  });
  assert.equal(new Set(hosts).size, catalogInfo.total);
  assert.ok(catalogInfo.total >= 300);
  assert.equal(catalogInfo.sections.reduce((total, section) => total + section.total, 0), catalogInfo.total);

  let requests = 0;
  t.mock.method(globalThis, "fetch", async (target, options) => {
    const index = catalog.findIndex(rule => rule[2].replace("{account}", "demo-qa") === target);
    assert.ok(index >= 0);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Cookie, undefined);
    requests++;
    const [, , , , positive, missingCode, negative] = catalog[index];
    if (index === 0) return new Response(positive);
    if (index === 1) return new Response(negative, { status: missingCode });
    if (index === 2) return new Response(positive, { status: 302, headers: { Location: "https://example.org/" } });
    if (index === 3) return new Response(positive, { status: 429 });
    if (index === 4) return new Response("x".repeat(200 * 1024) + positive);
    return new Response("respuesta inesperada");
  });

  const query = { username: "@demo-qa", offset: 0 };
  assert.equal((await serve(request(query, ""), env, assets)).status, 403);
  assert.equal((await serve(request(query, cookie, "https://otra.example"), env, assets)).status, 403);
  for (const value of [{ ...query, offset: 1 }, { ...query, email: "qa@example.org" },
    { ...query, username: "../../admin" }, { ...query, url: "https://otra.example" }, { ...query, category: "desconocida" }]) {
    assert.equal((await serve(request(value), env, assets)).status, 400);
  }
  assert.equal(requests, 0);

  const first = await serve(request(query), env, assets);
  const { results } = await first.json();
  assert.equal(results.length, catalogInfo.batchSize);
  assert.deepEqual(results.slice(0, 5).map(entry => entry.status),
    ["indicio", "sin_resultado", "indeterminado", "limitado", "indeterminado"]);
  assert.ok(results.every(entry => entry.kind === "catalogo"));
  assert.ok(results.every(entry => !("body" in entry)));

  const lastOffset = Math.floor((catalogInfo.total - 1) / catalogInfo.batchSize) * catalogInfo.batchSize;
  const last = await serve(request({ ...query, offset: lastOffset }), env, assets);
  assert.equal((await last.json()).results.length, catalogInfo.total - lastOffset);
  assert.equal(requests, catalogInfo.batchSize + catalogInfo.total - lastOffset);
  const music = await serve(request({ ...query, category: "music" }), env, assets);
  const selection = (await music.json()).results;
  assert.equal(selection.length, catalogInfo.batchSize);
  assert.ok(selection.every(entry => entry.category === "music"));
});

test("cada categoría del catálogo usa sus destinos y el buscador de correo no la activa", async (t) => {
  const { cookie } = await signIn(t);
  const destinations = [];
  t.mock.method(globalThis, "fetch", async input => {
    destinations.push(String(input));
    return new Response(null, { status: 404 });
  });
  for (const section of catalogInfo.sections) {
    assert.ok(section.total > 0);
    destinations.length = 0;
    const request = new Request(root + "consulta/catalogo", {
      method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ejemplo", offset: 0, category: section.id })
    });
    const response = await serve(request, env, assets);
    assert.equal(response.status, 200);
    const { results } = await response.json();
    assert.equal(results.length, Math.min(section.total, catalogInfo.batchSize));
    assert.equal(destinations.length, results.length);
    assert.ok(destinations.every(url => url.includes("ejemplo")));
  }
  destinations.length = 0;
  const response = await serve(post({ email: "equipo@example.org", domain: "example.org", searchEmail: true }, cookie), env, assets);
  const { results, catalog: available } = await response.json();
  assert.equal(results.filter(result => result.kind === "correo").length, 6);
  assert.equal(available, undefined);
  assert.ok(destinations.every(input => ["dns.google", "haveibeenpwned.com", "api.gravatar.com", "keys.openpgp.org", "api.github.com"].includes(new URL(input).hostname)));
});

test("el formulario distingue correo exacto, dominio y catálogo por alias", async (t) => {
  const { cookie } = await signIn(t);
  const email = "ejemplo@example.org";
  const sent = [];
  const browserRequests = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    sent.push(url);
    if (url.hostname === "dns.google") return Response.json({ Status: 0, Answer: [] });
    if (url.hostname === "haveibeenpwned.com") return Response.json([]);
    if (url.hostname === "api.github.com" && url.pathname === "/users/github") return Response.json({ login: "github" });
    if (url.hostname === "api.github.com" && url.pathname.startsWith("/search/")) {
      return Response.json({ total_count: 0, incomplete_results: false, items: [] });
    }
    return new Response(null, { status: 404 });
  });

  const create = () => ({
    value: "", checked: false, children: [], listeners: {},
    addEventListener(event, listener) { this.listeners[event] = listener; },
    append(node) { this.children.push(node); },
    replaceChildren() { this.children.length = 0; }
  });
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, create());
    return nodes.get(id);
  };
  node("modo-correo").value = "exacto";
  node("catalogo-categoria").value = "social";
  const client = readFileSync(new URL("../../cloudflare/huella/assets/huella.js.txt", import.meta.url), "utf8");
  runInNewContext(client, {
    AbortController, queueMicrotask,
    document: { getElementById: node, createElement: create },
    fetch(path, options) {
      browserRequests.push({ path, query: JSON.parse(options.body) });
      return serve(new Request(root + path, {
        ...options, headers: { ...options.headers, Origin: origin, Cookie: cookie }
      }), env, assets);
    }
  });

  const input = node("consulta").listeners.input;
  const submit = () => node("consulta").listeners.submit({ preventDefault() {} });
  node("correo").value = email;
  node("catalogo-ampliado").checked = true;
  input();
  assert.equal(node("catalogo-ampliado").disabled, true);
  assert.equal(node("catalogo-categoria").disabled, true);
  assert.match(node("alcance-consulta").textContent, /6 comprobaciones por correo exacto/);
  await submit();
  assert.deepEqual(browserRequests.splice(0), [{
    path: "consulta", query: { username: "", domain: "example.org", email, searchEmail: true }
  }]);
  assert.match(node("resultados").children[0].textContent, /0 de 6 comprobaciones/);
  assert.match(node("resultados").children[1].textContent, /escribe un alias público/);
  assert.ok(sent.some(url => url.hostname === "keys.openpgp.org"));

  node("modo-correo").value = "dominio";
  input();
  sent.length = 0;
  await submit();
  assert.deepEqual(browserRequests.splice(0), [{
    path: "consulta", query: { username: "", domain: "example.org" }
  }]);
  assert.equal(sent.length, 4);
  assert.ok(sent.every(url => !url.href.includes("ejemplo")));

  node("modo-correo").value = "exacto";
  node("alias").value = "@github";
  input();
  assert.equal(node("catalogo-categoria").disabled, false);
  await submit();
  const [main, ...batches] = browserRequests;
  assert.deepEqual(main.query, { username: "github", domain: "example.org", email, searchEmail: true });
  const total = catalogInfo.sections.find(section => section.id === "social").total;
  assert.equal(batches.length, Math.ceil(total / catalogInfo.batchSize));
  assert.ok(batches.every(({ query }) => query.username === "github" && query.category === "social" && !("email" in query)));
  assert.match(node("estado").textContent, new RegExp(`${total} de ${total}`));

  const html = readFileSync(new URL("../../cloudflare/huella/assets/index.html", import.meta.url), "utf8");
  assert.match(html, /id="catalogo-ampliado"[^>]*\bchecked\b/);
  assert.match(html, /<option value="all">Todas las categorías<\/option>/);
  node("correo").value = "";
  node("alias").value = "elonmusk";
  node("catalogo-categoria").value = "all";
  browserRequests.length = 0;
  sent.length = 0;
  input();
  await submit();
  const [direct, ...allBatches] = browserRequests;
  assert.equal(direct.query.username, "elonmusk");
  assert.equal(allBatches.length, Math.ceil(catalogInfo.total / catalogInfo.batchSize));
  assert.ok(allBatches.every(({ query }) => query.username === "elonmusk" && query.category === "all"));
  const sentUrls = new Set(sent.map(url => url.href));
  for (const [, , target] of catalog) assert.ok(sentUrls.has(new URL(target.replace("{account}", "elonmusk")).href));
  assert.ok(!sent.some(url => url.hostname === "www.instagram.com"));
  const instagram = node("redes-manuales").children[0];
  assert.equal(instagram.children[0].textContent, "Instagram · revisión manual");
  assert.equal(instagram.children[2].href, "https://www.instagram.com/elonmusk/");
  const table = node("resultados-catalogo").children[0];
  const rows = table.children[2].children;
  assert.equal(rows.length, catalogInfo.sections.length);
  for (const [index, section] of catalogInfo.sections.entries()) {
    assert.equal(rows[index].children[0].textContent, section.label);
    assert.equal(rows[index].children[1].textContent, `${section.total} de ${section.total}`);
  }
});

test("YouTube confirma el canal por alias y mantiene la clave en la petición al proveedor", async (t) => {
  const { cookie } = await signIn(t);
  const youtubeEnv = { ...env, HUELLA_YOUTUBE_API_KEY: "clave-local-de-prueba" };
  const search = { username: "@GoogleDevelopers" };
  const id = "UC" + "a".repeat(22);
  const avatar = "https://yt3.googleusercontent.com/ytc/foto-publica=s88-c-k-c0x00ffffff-no-rj";
  let calls = 0;
  let response = Response.json({ items: [{
    id, snippet: { title: "Google for Developers", customUrl: "@googledevelopers", thumbnails: { medium: { url: avatar } } }
  }] });
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    if (url.origin !== "https://www.googleapis.com") {
      assert.equal(options.headers["x-goog-api-key"], undefined);
      return new Response(null, { status: 404 });
    }
    calls++;
    assert.equal(url.pathname, "/youtube/v3/channels");
    assert.equal(url.searchParams.get("forHandle"), "@GoogleDevelopers");
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(options.headers["x-goog-api-key"], youtubeEnv.HUELLA_YOUTUBE_API_KEY);
    assert.equal(options.redirect, "manual");
    return response;
  });

  const run = async bindings => {
    const result = await serve(post(search, cookie), bindings, assets);
    const body = await result.text();
    assert.ok(!body.includes(youtubeEnv.HUELLA_YOUTUBE_API_KEY));
    return JSON.parse(body).results.find(result => result.source === "YouTube · API oficial");
  };
  assert.equal(await run(env), undefined);
  assert.equal(calls, 0);
  assert.deepEqual(await run(youtubeEnv), {
    source: "YouTube · API oficial", kind: "alias", category: "social", status: "verificado",
    url: "https://www.youtube.com/channel/" + id, name: "Google for Developers", avatar,
    detail: "YouTube devolvió un canal público para el identificador consultado."
  });
  response = Response.json({ items: [] });
  assert.equal((await run(youtubeEnv)).status, "sin_resultado");
  response = Response.json({ error: { message: "Acceso denegado" } }, { status: 403 });
  assert.equal((await run(youtubeEnv)).status, "indeterminado");
  response = Response.json({ items: [{ id, snippet: { title: "Otra cuenta", customUrl: "@otro" } }] });
  assert.equal((await run(youtubeEnv)).status, "indeterminado");

  const pageAssets = new Map(assets);
  const template = readFileSync(new URL("../../cloudflare/huella/assets/index.html", import.meta.url), "utf8");
  pageAssets.set("", [template, "text/html"]);
  const page = await serve(get("", cookie), youtubeEnv, pageAssets);
  const html = await page.text();
  assert.match(html, /YouTube Data API · clave configurada/);
  assert.doesNotMatch(html, /clave-local-de-prueba/);
  assert.match(page.headers.get("content-security-policy"), /https:\/\/yt3\.googleusercontent\.com/);
});
