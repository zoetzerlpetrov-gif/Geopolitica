// Inteligencia corporativa: amenazas cercanas, probabilidad, matriz 5×5, escenarios, validación y radar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../js/corporativo.js";

const cfg = JSON.parse(readFileSync(new URL("../../config/corporativo.json", import.meta.url)));
const ahora = Date.parse("2026-10-21T12:00:00Z");
const planta = { id: "corp:x", nombre: "Planta Saltillo", lat: 25.42, lon: -101.0, iso3: "MEX", impacto: 4 };

test("normalizar une eventos y capas en vivo con severidad y tipo", () => {
  const a = C.normalizar({
    eventos: [{ lat: 25.5, lon: -101.0, fecha_utc: "2026-10-20T00:00:00Z", titulo: "E", severidad: 4, area_principal: "seguridad" }, { titulo: "sin coordenadas" }],
    crimen: { features: [{ geometry: { type: "Point", coordinates: [-101.1, 25.4] }, properties: { date: "2026-10-19T00:00:00Z", title: "Robo de carga", severidad: 4 } }] },
    cortes: { features: [{ geometry: { type: "Point", coordinates: [-99, 19] }, properties: { date: "2026-10-19T00:00:00Z", title: "Apagón", severe: true } }] },
  });
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((x) => x.tipo), ["conflicto", "crimen", "corte"]);
  assert.equal(a[2].sev, 4);
});

test("cercanas filtra por radio y periodo, y ordena por severidad y distancia", () => {
  const am = [
    { lat: 25.43, lon: -101.0, fecha: "2026-10-20T00:00:00Z", sev: 3, tipo: "crimen" },
    { lat: 25.6, lon: -101.0, fecha: "2026-10-20T00:00:00Z", sev: 5, tipo: "clima" },
    { lat: 19.4, lon: -99.1, fecha: "2026-10-20T00:00:00Z", sev: 5, tipo: "crimen" },      // ~700 km
    { lat: 25.42, lon: -101.0, fecha: "2026-08-01T00:00:00Z", sev: 5, tipo: "crimen" },    // fuera del periodo
  ];
  const c = C.cercanas(planta, am, { radioKm: 100, dias: 30, ahora });
  assert.equal(c.length, 2);
  assert.equal(c[0].sev, 5);
  assert.ok(c[1].km <= 2);
});

test("probabilidad crece con eventos graves y cercanos y con un país inestable", () => {
  assert.equal(C.probabilidad([]), 1);
  assert.equal(C.probabilidad([], 60), 2);
  const graves = Array.from({ length: 10 }, () => ({ sev: 5, km: 10 }));
  assert.equal(C.probabilidad(graves), 5);
});

test("nivel usa las bandas de la matriz 5×5", () => {
  assert.equal(C.nivel(1, 4).id, "bajo");
  assert.equal(C.nivel(3, 3).id, "medio");
  assert.equal(C.nivel(4, 4).id, "alto");
  assert.equal(C.nivel(5, 4).id, "critico");
  const svg = C.htmlMatriz([{ prob: 5, impacto: 4, num: 1 }]);
  assert.equal((svg.match(/<rect/g) || []).length, 25);
  assert.match(svg, />1</);
});

test("escenarios por tipo de amenaza, más sanciones si el país las tiene", () => {
  const e = C.escenariosPara([{ tipo: "crimen" }, { tipo: "crimen" }, { tipo: "clima" }], cfg.sanciones_pais.MEX, cfg);
  assert.deepEqual(e.map((x) => x.id).sort(), ["clima", "crimen", "sancion"]);
  assert.ok(e.every((x) => x.acciones.length && x.indicador));
});

test("validar rechaza datos incompletos y limpia lo capturado", () => {
  assert.match(C.validar({ nombre: "", lat: 1, lon: 1, impacto: 3 })[1], /nombre/);
  assert.match(C.validar({ nombre: "A", lat: 100, lon: 1, impacto: 3 })[1], /Coordenadas/);
  const [x] = C.validar({ nombre: " Planta ", lat: "25.123456", lon: "-101.5", iso3: "mex", impacto: "5", tipo: "desconocido" });
  assert.equal(x.nombre, "Planta");
  assert.equal(x.lat, 25.1235);
  assert.equal(x.iso3, "MEX");
  assert.equal(x.tipo, "planta");
  assert.match(x.id, /^corp:/);
});

test("exposición por país y radar de competidores", () => {
  const e = C.exposicionPais("RUS", { indice: { RUS: { indice: 70, eventos: 12 } }, cfg, pagos: { paises: { RUS: { cbdc: { e: "piloto" } } } } });
  assert.equal(e.indice, 70);
  assert.ok(e.sanciones.length >= 1);
  assert.ok(e.pagos.cbdc);
  const notas = { notas: [{ t: "Pemex reporta producción", u: "https://x" }, { t: "Otro tema" }] };
  assert.equal(C.enNoticias("PEMEX", notas).length, 1);
  assert.equal(C.enNoticias("pe", notas).length, 0);
  const l = C.enlacesRadar("Grupo Bimbo", cfg);
  assert.ok(l.some((x) => x.u.includes("Grupo%20Bimbo")));
  // Toda fila de sanciones cita una fuente con enlace.
  for (const filas of Object.values(cfg.sanciones_pais)) for (const s of filas) assert.match(s.url, /^https:\/\//);
});
