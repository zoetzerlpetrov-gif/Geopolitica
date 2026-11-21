import { test } from "node:test";
import assert from "node:assert/strict";
import { planRequerido, alcanza, servirDatos } from "../../cloudflare/planes/datos.js";

const M = { activo: true, archivos: { "data/vivos/trenes.geojson": "recon", "data/vivos/rastros/": "recon", "data/vivos/seguimiento.json": "command", "data/vivos/borradores.json": "admin" } };

test("plan requerido por archivo o carpeta; nada si la lista está apagada o la ruta es rara", () => {
  assert.equal(planRequerido("data/vivos/trenes.geojson", M), "recon");
  assert.equal(planRequerido("data/vivos/rastros/a1.json", M), "recon");
  assert.equal(planRequerido("data/vivos/sismos.geojson", M), null);
  assert.equal(planRequerido("data/vivos/../x", M), null);
  assert.equal(planRequerido("data/vivos/trenes.geojson", { ...M, activo: false }), null);
});

test("solo alcanza el plan igual o superior; «admin» solo para Admin", () => {
  assert.ok(alcanza("analyst", "recon") && !alcanza("demo", "recon") && !alcanza(null, "recon"));
  assert.ok(!alcanza("command", "admin") && alcanza("demo", "admin", true));
});

test("el Worker entrega desde R2 solo con el plan, con tipo correcto y caché privada", async () => {
  const env = { DATOS_PLAN: { get: async (k) => (k === "data/vivos/trenes.geojson" ? { body: '{"type":"FeatureCollection"}' } : null) } };
  assert.equal((await servirDatos(env, "data/vivos/trenes.geojson", "demo", false, {}, M)).status, 403);
  const ok = await servirDatos(env, "data/vivos/trenes.geojson", "recon", false, { "Access-Control-Allow-Origin": "https://dominusosint.com" }, M);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Content-Type"), "application/geo+json");
  assert.match(ok.headers.get("Cache-Control"), /private/);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://dominusosint.com");
  assert.equal((await servirDatos(env, "data/vivos/sismos.geojson", "command", false, {}, M)).status, 404);
  assert.equal((await servirDatos(env, "data/vivos/borradores.json", "command", false, {}, M)).status, 403);
});

test("el cliente reconoce las rutas protegidas solo con la lista activa", async () => {
  const { rutaProtegida } = await import("../../js/util.js");
  assert.equal(rutaProtegida("data/vivos/rastros/x.json", M), "data/vivos/rastros/x.json");
  assert.equal(rutaProtegida("data/vivos/sismos.geojson", M), null);
  assert.equal(rutaProtegida("data/vivos/trenes.geojson", { ...M, activo: false }), null);
  assert.equal(rutaProtegida("config/x.json", M), null);
});

test("un archivo no publicado (404) cuenta como 0, no como falla", async () => {
  const { esNoPublicado } = await import("../../js/riesgos.js");
  assert.ok(esNoPublicado(new Error("data/vivos/x.geojson: HTTP 404")));
  assert.ok(!esNoPublicado(new Error("Failed to fetch")) && !esNoPublicado(new Error("x: HTTP 500")) && !esNoPublicado(new Error("x: tu plan no incluye estos datos")));
});
