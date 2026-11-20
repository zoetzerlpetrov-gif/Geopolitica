import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCorrida, ingesta, consulta } from "../../cloudflare/pruebas/service.js";
import { totales, matrizComprobaciones, svgHistorial, esc } from "../../js/pruebas.js";

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
const corrida = {
  fecha: "2026-11-20T11:37:00Z", commit: "abc123", corrida: "https://github.com/x/y/actions/runs/1",
  roles: [
    { rol: "demo", grave: 1, capas: 40, comprobaciones: [{ nombre: "Tema claro/oscuro cambia y regresa", ok: true }, { nombre: "Botón «Mejorar plan»", ok: false, detalle: "no abre" }], problemas: ["Falló «Botón «Mejorar plan»»: no abre"] },
    { rol: "intruso", grave: 99 },
    { rol: "command", grave: 0, comprobaciones: [{ nombre: "Tema claro/oscuro cambia y regresa", ok: true }] },
  ],
  unitarias: { python: { pasan: 912, fallan: 0 }, js: { pasan: 784, fallan: 2 } },
};

test("el Worker limpia la corrida: roles conocidos, números acotados y textos cortos", () => {
  const c = validarCorrida({ ...corrida, commit: "abc123;DROP", roles: [...corrida.roles, { rol: "admin", grave: -5, problemas: ["x".repeat(999)] }] });
  assert.deepEqual(c.roles.map((r) => r.rol), ["demo", "command", "admin"]);
  assert.equal(c.commit, "abc123DROP".replace(/[^a-f0-9]/gi, ""));
  assert.equal(c.roles[2].grave, 0);
  assert.equal(c.roles[2].problemas[0].length, 240);
  assert.equal(validarCorrida({ fecha: "ayer", roles: [] }), null);
  assert.equal(validarCorrida({ fecha: "2026-11-20T00:00:00Z" }), null);
});

test("la ingesta exige el token propio y guarda; la consulta devuelve la más reciente primero", async () => {
  const filas = [];
  const db = { prepare: (q) => ({ run: async () => ({}), all: async () => ({ results: filas }),
    bind: (...v) => ({ run: async () => { if (q.startsWith("INSERT")) filas.unshift({ id: filas.length + 1, fecha: v[0], datos: v[1] }); return {}; } }) }) };
  const env = { PRUEBAS_INGEST_TOKEN: "p".repeat(64), OSINT_PLANS_DB: db };
  const req = (token, cuerpo, tipo = "application/json") => new Request("https://admin.dominusosint.com/admin/huella/pruebas/ingesta", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": tipo }, body: cuerpo });
  assert.equal((await ingesta(req("malo", "{}"), env, json)).status, 401);
  assert.equal((await ingesta(req("p".repeat(64), "{}", "text/plain"), env, json)).status, 415);
  assert.equal((await ingesta(req("p".repeat(64), "{}"), env, json)).status, 400);
  assert.equal((await ingesta(req("x", "{}"), { ...env, PRUEBAS_INGEST_TOKEN: "" }, json)).status, 401);
  assert.equal((await ingesta(req("t".repeat(64), JSON.stringify(corrida)), { ...env, VULN_INGEST_TOKEN: "t".repeat(64) }, json)).status, 401, "el token de vulnerabilidades no sirve aquí");
  assert.equal((await ingesta(req("p".repeat(64), JSON.stringify(corrida)), env, json)).status, 200);
  const lista = await (await consulta(env, json)).json();
  assert.equal(lista.corridas.length, 1);
  assert.equal(lista.corridas[0].roles.length, 2);
});

test("la página resume la corrida, arma la matriz de comprobaciones y escapa el texto", () => {
  const c = validarCorrida(corrida);
  assert.deepEqual(totales(c), { graves: 1, rolesMal: 1, roles: 2, pasan: 1696, fallan: 2 });
  const m = matrizComprobaciones(c);
  assert.equal(m.length, 2);
  assert.equal(m[0][1][1].ok, true);   // demo
  assert.equal(m[1][1][4], null);      // command no tiene «Mejorar plan»
  assert.match(svgHistorial([c]), /<svg/);
  assert.equal(esc("<img>"), "&lt;img&gt;");
});

test("la lista de datos por plan solo acepta rutas de data/ y planes válidos", () => {
  const c = validarCorrida({ ...corrida, datos_plan: { "data/vivos/trenes.geojson": "recon", "data/../secreto": "recon", "/etc/passwd": "admin", "data/x.json": "dios" } });
  assert.deepEqual(c.datos_plan, { "data/vivos/trenes.geojson": "recon" });
});
