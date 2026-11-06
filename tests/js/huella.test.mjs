import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { serve } from "../../cloudflare/huella/service.js";

const root = "https://dominus.example/admin/huella/";
const env = { OSINT_ADMIN_EMAILS: "admin@example.org" };
const context = (email) => ({ access: { getIdentity: async () => ({ email }) } });
const admin = context("Admin@example.org");
const assets = new Map([["", ["Consola de prueba", "text/html"]], ["huella.js", ["script", "text/javascript"]]]);
const get = (route = "", headers) => new Request(root + route, { headers });
const post = (value, origin = "https://dominus.example") => new Request(root + "consulta", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify(value)
});

test("la ruta, recursos, sesión y API requieren identidad autenticada en la lista de administradores", async () => {
  for (const ctx of [{}, context("recon@example.org"), context("analyst@example.org"), context("command@example.org")]) {
    for (const request of [
      get("?vista=admin&plan=command", { "Cf-Access-Authenticated-User-Email": "admin@example.org" }),
      get("huella.js"), get("sesion"), post({ domain: "example.org" })
    ]) {
      assert.equal((await serve(request, env, ctx, assets)).status, 403);
    }
  }
  assert.equal((await serve(get(), {}, admin, assets)).status, 403);
  const check = await serve(get("sesion"), env, admin, assets);
  assert.equal(check.status, 204);
  assert.equal(check.headers.get("x-dominus-huella"), "admin");
  const page = await serve(get(), env, admin, assets);
  assert.equal(await page.text(), "Consola de prueba");
  assert.match(page.headers.get("cache-control"), /no-store/);
});

test("rechaza consultas de otro origen, entrada inválida y cuerpos sobredimensionados", async () => {
  assert.equal((await serve(post({ domain: "example.org" }, "https://externo.example"), env, admin, assets)).status, 403);
  for (const query of [{}, { domain: "x.org/a" }, { username: "../foo" }, { email: "x@example.org" },
    { domain: "example.org", pad: "a".repeat(2048) }]) {
    assert.equal((await serve(post(query), env, admin, assets)).status, 400);
  }
});

test("combina resultados DNS y alias sin convertir fallos en ausencia ni confundir Null MX", async (t) => {
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
    if (url.hostname === "dev.to") return new Response(null, { status: 429 });
    return Response.json(null);
  });
  const response = await serve(post({ domain: "EXAMPLE.org", username: "@github" }), env, admin, assets);
  const { results } = await response.json();
  assert.deepEqual(results.map(({ source, status }) => [source, status]), [
    ["MX", "verificado"], ["SPF", "verificado"], ["DMARC", "indeterminado"],
    ["GitHub", "verificado"], ["Hacker News", "sin_resultado"], ["DEV Community", "limitado"]
  ]);
  assert.match(results[0].detail, /no acepta correo/);
  assert.equal(results[3].url, "https://github.com/github");
  assert.ok(seen.every(url => !url.href.includes("@")));
});

test("el enlace requiere verificación del Worker y la ruta queda fuera de la caché del mapa", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../../index.html"), /<template id="huella-admin-menu" data-solo-admin><a href="admin\/huella\/" data-solo-admin>/);
  assert.match(read("../../js/huella-menu.js"), /r\.status === 204 && r\.headers\.get\("X-Dominus-Huella"\) === "admin"/);
  assert.match(read("../../sw.js"), /p\.includes\("\/admin\/huella\/"\)\) return/);
});
