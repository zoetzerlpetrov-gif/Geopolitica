// Crimen en noticias por ventanas de 7 a 90 días y señales de seguridad del mundo.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const R = await import("../../js/riesgos.js");

const fc = { base: "2026-07-17", tipos: ["Narcotráfico", "Crimen organizado", "Mafia", "Terrorismo"], features: [
  { type: "Feature", geometry: { type: "Point", coordinates: [-107.5, 25] }, properties: { c: "25.0,-107.5", lugar: "Culiacán",
    d: [[89, 0, 3], [85, 1, 2], [60, 0, 5], [0, 3, 1]], notas: [["t1", "https://a", "M", "2026-10-14T01:00:00Z", "Narcotráfico"], ["t0", "https://b", "M", "2026-08-01T01:00:00Z", "Narcotráfico"]] } },
  { type: "Feature", geometry: { type: "Point", coordinates: [10, 10] }, properties: { c: "10.0,10.0", d: [[1, 2, 4]], notas: [] } }] };
const HOY = new Date("2026-10-14T12:00:00Z"); // índice 89

test("ventanas: suman solo los días dentro y quitan celdas vacías", () => {
  const v7 = R.ventanaCrimen(fc, 7, HOY);
  assert.equal(v7.features.length, 1);
  assert.equal(v7.features[0].properties.n, 5);
  assert.deepEqual(v7.features[0].properties.por, { Narcotráfico: 3, "Crimen organizado": 2 });
  assert.equal(v7.features[0].properties.dominante, "Narcotráfico");
  assert.equal(v7.features[0].properties.notas.length, 1); // el titular de agosto queda fuera de 7 días
  const v90 = R.ventanaCrimen(fc, 90, HOY);
  assert.equal(v90.features.length, 2);
  assert.equal(v90.features[0].properties.n, 11);
  assert.deepEqual(R.ventanaCrimen({ features: [] }, 7, HOY).features, []);
});

test("cinco capas de ventana, sin contar como amenaza", () => {
  const ids = R.CAPAS.filter((c) => c.id.startsWith("crimen_") && c.id.endsWith("d")).map((c) => c.id);
  assert.deepEqual(ids, ["crimen_7d", "crimen_15d", "crimen_30d", "crimen_60d", "crimen_90d"]);
  for (const c of R.VENTANAS_CRIMEN) {
    assert.ok(c.noAmenaza);
    const p = c.derivar(fc).features[0]?.properties;
    if (p) assert.match(c.ficha(p).titulo, /nota/);
  }
});

test("señales de seguridad del mundo: área seguridad, severidad 3+, 72 h, con coordenadas", () => {
  const ahora = Date.parse("2026-10-14T12:00:00Z");
  const ev = (o) => ({ area_principal: "seguridad", severidad: 3, fecha_utc: "2026-10-14T01:00:00Z", lat: "50.4", lon: "30.5", titulo: "Ataque en Kiev", fuente: "M", url: "https://u", pais_iso3: "UKR", ...o });
  const fs = R.seguridadMundo([ev({}), ev({ severidad: 2 }), ev({ area_principal: "clima" }), ev({ fecha_utc: "2026-10-10T00:00:00Z" }), ev({ lat: "x" }), ev({ severidad: "4" })], ahora);
  assert.equal(fs.length, 2);
  assert.deepEqual(fs[0].geometry.coordinates, [30.5, 50.4]);
  assert.equal(fs[1].properties.kind, "GRAVE");
  assert.deepEqual(R.seguridadMundo(undefined, ahora), []);
});
