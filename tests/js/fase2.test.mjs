import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoSesnsp, htmlOficialVial, htmlRecursosDesap, CAPAS, GRUPOS } from "../../js/riesgos.js";
import { bolsasDe, htmlVortice } from "../../js/clima.js";

const ESTADOS = ["Guanajuato", "México", "Ciudad de México", "Veracruz de Ignacio de la Llave", "Michoacán de Ocampo"];

test("estado del SESNSP a partir del lugar del titular", () => {
  assert.equal(estadoSesnsp("Celaya, Guanajuato", ESTADOS), "Guanajuato");
  assert.equal(estadoSesnsp("Ecatepec, Estado de México", ESTADOS), "México");
  assert.equal(estadoSesnsp("Iztapalapa, Ciudad de México", ESTADOS), "Ciudad de México");
  assert.equal(estadoSesnsp("Xalapa, Veracruz", ESTADOS), "Veracruz de Ignacio de la Llave");
  assert.equal(estadoSesnsp("Uruapan, Michoacán", ESTADOS), "Michoacán de Ocampo");
  assert.equal(estadoSesnsp("Madrid", ESTADOS), null);
});

test("ficha de robos: cifra oficial y señales de noticias por separado", () => {
  const of = { anio: "2026", meses: ["Enero", "Febrero"], grupos: { transportista: "Robo a transportista" }, fuente: "SESNSP", pagina: "https://www.gob.mx/sesnsp",
    nacional: { transportista: [100, 120] }, por_estado: { Guanajuato: { transportista: [10, 12] } } };
  const fc = { features: [{ properties: { st: "robo_carga", lugar: "Celaya, Guanajuato" } }, { properties: { st: "robo_carga", lugar: "Puebla, Puebla" } }] };
  const h = htmlOficialVial({ pais_iso3: "MEX", lugar: "León, Guanajuato" }, "vial_robo_carga", of, fc);
  assert.match(h, /Oficial SESNSP en Guanajuato, Enero–febrero 2026[^<]*<\/td><td class="num">22</);
  assert.match(h, /nacional[^<]*<\/td><td class="num">220</);
  assert.match(h, /Señales de noticias en el mapa \(72 h\), Guanajuato<\/td><td class="num">1</);
  assert.equal(htmlOficialVial({}, "vial_bloqueo", of, fc), "");
});

test("desaparecidos: grupo propio, sin amenazas ni datos personales, con registros oficiales", () => {
  assert.ok(GRUPOS.some(([g]) => g === "Personas desaparecidas y fosas clandestinas"));
  const capas = CAPAS.filter((c) => c.id.startsWith("desap_"));
  assert.equal(capas.length, 4);
  assert.ok(capas.every((c) => c.noAmenaza));
  assert.match(htmlRecursosDesap("MEX"), /versionpublicarnpdno\.segob\.gob\.mx/);
  assert.match(htmlRecursosDesap("FRA"), /familylinks\.icrc\.org/);
  assert.ok(CAPAS.some((c) => c.id === "gps_interferencia") && CAPAS.some((c) => c.id === "eclipses"));
});

test("clima: bolsas del momento más cercano y resumen del vórtice en °C y °F", () => {
  const meta = { pasos: [{ bolsas: "a.geojson" }, { bolsas: "b.geojson" }, {}, {}] };
  assert.equal(bolsasDe(meta, 1), "b.geojson");
  assert.equal(bolsasDe(meta, 3), "b.geojson");
  assert.equal(bolsasDe({ pasos: [{}] }, 0), null);
  const h = htmlVortice({ norte: { estado: "normal", u60_ms: 25, t_polo_c: -70, centro: [10, 85] } });
  assert.match(h, /-70 °C \/ -94 °F/);
  assert.match(h, /90 km\/h/);
});

test("agrupación: solo capas hechas únicamente de puntos (las franjas de zonas horarias no se pierden)", async () => {
  const { agrupable } = await import("../../js/riesgos.js");
  const pt = { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} };
  const pol = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} };
  assert.equal(agrupable({ id: "crimen" }, { features: Array(30).fill(pt) }), true);
  assert.equal(agrupable({ id: "zonas_horarias" }, { features: [...Array(40).fill(pt), pol] }), false);
  assert.equal(agrupable({ id: "crimen" }, { features: Array(10).fill(pt) }), false);
  assert.equal(agrupable({ id: "sismos" }, { features: Array(30).fill(pt) }), false);
  assert.equal(agrupable({ id: "x", agrupar: false }, { features: Array(30).fill(pt) }), false);
});
