// Buscador de Organizaciones.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const B = await import("../../js/buscador_org.js");
const pais = (c) => ({ MX: "México", MEX: "México", JP: "Japón", JPN: "Japón", FRA: "Francia" }[c] || c);

const filas = [
  B.deFila("embajadas", ["Embassy of Japan", "embajadas_consulados", "MEX", -99.17, 19.42, "osm:n1", "embassy|JP"]),
  B.deFila("embajadas", ["Consulado de México en Lyon", "embajadas_consulados", "FRA", 4.83, 45.76, "osm:n2", "consulate|MX"]),
  B.deFila("empresas", ["Petróleos Mexicanos", "emp_energia", "MEX", -99.18, 19.43, "wd:Q1", ""]),
  B.deFila("empresas", ["Mexichem", "emp_quimica", "MEX", -99.2, 19.4, "wd:Q2", ""]),
];

test("busca sin acentos, en nombre, tipo diplomático y país representado", () => {
  assert.deepEqual(B.filtrar(filas, "petroleos", pais).map((r) => r.id), ["wd:Q1"]);
  assert.deepEqual(B.filtrar(filas, "embajada japon", pais).map((r) => r.id), ["osm:n1"]);   // «Embajada de Japón» sale del detalle
  assert.deepEqual(B.filtrar(filas, "consulado mexico", pais).map((r) => r.id), ["osm:n2"]);
  assert.deepEqual(B.filtrar(filas, "me", pais), []);                                     // menos de 3 letras
});

test("primero los que empiezan con la palabra buscada", () => {
  assert.deepEqual(B.filtrar(filas, "mexic", pais).map((r) => r.n).slice(0, 1), ["Mexichem"]);
});

test("detalle diplomático legible y features GeoJSON", () => {
  assert.equal(B.detalle(filas[1], pais), "Consulado de México");
  const r = B.deFeature("organismos", { geometry: { type: "Point", coordinates: [2.29, 48.86] }, properties: { n: "OCDE", st: "organismos_internacionales", id: "wd:Q41550" } });
  assert.equal(r.lon, 2.29);
  assert.equal(B.deFeature("organismos", { geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }), null);
});
