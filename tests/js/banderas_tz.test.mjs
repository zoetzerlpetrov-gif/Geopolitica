import { test } from "node:test";
import assert from "node:assert/strict";
import { paisDeHex, paisDeGcat, htmlBandera } from "../../js/banderas.js";
import { horaFija, horaIana, puntosEtiquetaZona } from "../../js/riesgos.js";

test("banderas: país por dirección ICAO, código GCAT e imagen", () => {
  assert.equal(paisDeHex("0d0abc"), "MX");
  assert.equal(paisDeHex("A1B2C3"), "US");
  assert.equal(paisDeHex("~0d0abc"), "MX");
  assert.equal(paisDeHex("zz"), null);
  assert.equal(paisDeHex("fffff0"), null);
  assert.equal(paisDeGcat("UK"), "GB");
  assert.equal(paisDeGcat("I-ESA"), "EU");
  assert.equal(paisDeGcat("SU"), null);
  assert.equal(paisDeGcat("MX"), "MX");
  assert.match(htmlBandera("MX"), /flagcdn\.com\/20x15\/mx\.png/);
  assert.equal(htmlBandera("<b>"), "");
  assert.ok(!htmlBandera("MX").endsWith(" "));  // sin espacio: los títulos de ficha se comparan por su texto
});

test("zonas horarias: hora fija, hora IANA y puntos de etiqueta", () => {
  const t = new Date("2026-07-01T12:30:00Z");
  assert.equal(horaFija(-6, t), "06:30");
  assert.equal(horaFija(5.5, t), "18:00");
  assert.equal(horaIana("Europe/Paris", t)?.utc, "UTC+2");
  assert.equal(horaIana("Zona/Inexistente", t), null);
  const franja = { geometry: { type: "Polygon", coordinates: [[[-97.5, -60], [-82.5, -60], [-82.5, 70], [-97.5, 70], [-97.5, -60]]] } };
  assert.deepEqual(puntosEtiquetaZona(franja), [[-90, 15], [-90, 45]]);
  const isla = { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
  assert.deepEqual(puntosEtiquetaZona(isla), []);
});
