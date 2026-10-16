import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "../../js/cielo.js";

test("rumbo en español por octantes", () => {
  assert.equal(K.rumbo(0), "norte");
  assert.equal(K.rumbo(200), "sur");
  assert.equal(K.rumbo(-45), "noroeste");
});

test("intensidad del ONI con los umbrales de NOAA", () => {
  assert.equal(K.intensidadOni(0.3), "neutral");
  assert.equal(K.intensidadOni(-0.7), "débil");
  assert.equal(K.intensidadOni(2.16), "muy fuerte");
});

test("barras: sin datos no dibuja; con umbral colorea por nivel", () => {
  assert.equal(K.barras([]), "");
  const svg = K.barras([["2026-10-17T00:00", 55], ["2026-10-17T01:00", 95]], { umbrales: [[50, "#E0A100", "50"], [90, "#C62828", "90"]], unidad: "km/h" });
  assert.match(svg, /fill="#E0A100"/);
  assert.match(svg, /fill="#C62828"/);
  assert.match(svg, /2026-10-17 01:00 UTC: 95 km\/h/);
});

test("trayectoria del asteroide: Tierra, órbita lunar y punto más cercano", () => {
  const p = { dist_ld: 0.82, trayectoria_ld: [[0.76, -3.4], [0.82, 0], [0.76, 3.4]] };
  const svg = K.svgTrayectoria(p);
  assert.match(svg, /órbita de la Luna/);
  assert.match(svg, /0\.82 DL/);
  assert.equal(K.svgTrayectoria({ trayectoria_ld: [] }), "");
});

test("efectos de El Niño y gráfica del ONI en la ficha", () => {
  const html = K.extraEnso({ fase_oni: "nino", oni_serie: [["JJA 2026", 1.8], ["JAS 2026", 2.16]] });
  assert.match(html, /Efectos típicos de El Niño/);
  assert.match(html, /JAS 2026: \+2\.16 °C/);
});

test("ficha de lluvia de estrellas avisa cuando la Luna estorba", () => {
  const f = K.filasCielo({ kind: "lluvia", inicio: "2026-10-02", fin: "2026-11-07", activa: true, maximo: "2026-10-21", zhr: 20, vel_kms: 66,
    padre: "cometa 1P/Halley", luna_en_maximo: 0.75, lat_desde: -54, lat_hasta: 86 });
  assert.ok(f.find(([k]) => k === "Luna en el máximo")[1].includes("estorba"));
});

test("calendario: fases y eclipses", () => {
  const html = K.htmlCalendario({ luna_hoy: 0.23, fases: [{ fase: "Luna llena", fecha_utc: "2026-10-26T04:12:00Z" }],
    eclipses_solares: [{ nombre: "Eclipse solar anular del 6/2/2027" }] });
  assert.match(html, /23 % iluminada/);
  assert.match(html, /Luna llena: 2026-10-26 04:12 UTC/);
  assert.match(html, /anular del 6\/2\/2027/);
});
