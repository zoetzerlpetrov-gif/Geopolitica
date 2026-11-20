import test from "node:test";
import assert from "node:assert/strict";
import { validarInforme, igualesSeguro, ingesta, consulta } from "../../cloudflare/seguridad/service.js";
import { comparar, conteo, filaHallazgo, svgHistorial } from "../../js/vulnerabilidades.js";

const json = (v, status = 200) => Response.json(v, { status });
const h = (id, severidad = "alta") => ({ id, categoria: "X", severidad, titulo: `T ${id}`, detalle: "d", accion: "a", quien: "claude" });

test("el informe se limpia: severidad y responsable de listas cerradas, largos máximos", () => {
  const r = validarInforme({ fecha: "2026-11-20T10:47:00+00:00", hallazgos: [{ ...h("a"), severidad: "terrible", quien: "<script>", titulo: "x".repeat(900) }], revisiones: [] });
  assert.equal(r.hallazgos[0].severidad, "info");
  assert.equal(r.hallazgos[0].quien, "tu");
  assert.equal(r.hallazgos[0].titulo.length, 200);
  assert.equal(validarInforme({ fecha: "ayer", hallazgos: [] }), null);
  assert.equal(validarInforme({ fecha: "2026-11-20T10:47:00Z" }), null);
});

test("la ingesta exige el token (comparación en tiempo constante) y JSON", async () => {
  assert.equal(igualesSeguro("abc", "abc"), true);
  assert.equal(igualesSeguro("abc", "abd"), false);
  assert.equal(igualesSeguro("abc", "abcd"), false);
  const filas = [];
  const db = { prepare: (q) => ({ run: async () => ({}), first: async () => ({ n: 1 }), all: async () => ({ results: filas }),
    bind: (...v) => ({ run: async () => { if (q.startsWith("INSERT")) filas.unshift({ id: 1, fecha: v[0], datos: v[1] }); return {}; } }) }) };
  const env = { VULN_INGEST_TOKEN: "t".repeat(64), OSINT_PLANS_DB: db };
  const req = (token, cuerpo, tipo = "application/json") => new Request("https://admin.dominusosint.com/admin/huella/vulnerabilidades/ingesta", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": tipo }, body: cuerpo });
  assert.equal((await ingesta(req("malo", "{}"), env, json)).status, 401);
  assert.equal((await ingesta(req("t".repeat(64), "{}", "text/plain"), env, json)).status, 415);
  assert.equal((await ingesta(req("t".repeat(64), "no-json"), env, json)).status, 400);
  assert.equal((await ingesta(req("x", "{}"), { ...env, VULN_INGEST_TOKEN: "" }, json)).status, 401, "sin token configurado nadie entra");
  const informe = { fecha: "2026-11-20T10:47:00+00:00", hallazgos: [h("manual:datos-por-plan", "media")], revisiones: [] };
  const ok = await ingesta(req("t".repeat(64), JSON.stringify(informe)), env, json);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).clientes_pago, 2, "cuenta clientes de las dos tablas");
  assert.equal(JSON.parse(filas[0].datos).hallazgos[0].severidad, "alta", "con clientes de pago el control sube a alta");
  const lista = await (await consulta(env, json)).json();
  assert.equal(lista.corridas.length, 1);
});

test("la página compara corridas: nuevos, resueltos y desde cuándo", () => {
  const hoy = { fecha: "2026-11-20T10:47:00Z", hallazgos: [h("a"), h("c", "critica")] };
  const ayer = { fecha: "2026-11-19T10:47:00Z", hallazgos: [h("a"), h("b")] };
  const c = comparar([hoy, ayer]);
  assert.deepEqual(c.nuevos, ["c"]);
  assert.deepEqual(c.resueltos.map((x) => x.id), ["b"]);
  assert.equal(c.desde.a, "2026-11-19T10:47:00Z");
  assert.equal(conteo(hoy.hallazgos).critica, 1);
  const fila = filaHallazgo({ ...h("x"), titulo: "<img src=x onerror=alert(1)>" });
  assert.ok(!fila.includes("<img") && fila.includes("&lt;img"));
  assert.match(svgHistorial([hoy, ayer]), /<svg/);
});

test("historial: cada hallazgo con estado pendiente o resuelto y fecha de resolución", async () => {
  const { historial } = await import("../../js/vulnerabilidades.js");
  const h = (id) => ({ id, categoria: "X", severidad: "alta", titulo: id, detalle: "", accion: "", quien: "claude" });
  const r = historial([
    { fecha: "2026-11-21T10:47:00Z", hallazgos: [h("a")] },
    { fecha: "2026-11-20T10:47:00Z", hallazgos: [h("a"), h("b")] },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.estado, x.resuelto]), [["a", "pendiente", null], ["b", "resuelto", "2026-11-21T10:47:00Z"]]);
  assert.equal(r[0].primera, "2026-11-20T10:47:00Z");
});
