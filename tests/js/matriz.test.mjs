import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../../js/matriz-logica.js";

const cuadro = { type: "Polygon", coordinates: [[[-100, 20], [-90, 20], [-90, 30], [-100, 30], [-100, 20]]] };
const ctx = { iso2: "MX", nombres: ["mexico", "méxico"], poligono: cuadro, areas: { seguridad: "Seguridad" } };

test("severidad, probabilidad y pertenencia al país", () => {
  assert.equal(M.severidadDe({ alertlevel: "Red" }), 5);
  assert.equal(M.severidadDe({ magnitud: 6.2 }), 4);
  assert.equal(M.severidadDe({ nivel: 2 }), 3);
  assert.equal(M.severidadDe({}, 2), 2);
  assert.equal(M.probabilidadDe({ delta: "escala", verificado: true }, "eventos"), 5);
  assert.equal(M.probabilidadDe({ en_curso: true }), 4);
  assert.ok(M.esDelPais({ pais_iso3: "MEX" }, null, "MEX", ctx));
  assert.ok(!M.esDelPais({ pais_iso3: "USA" }, { type: "Point", coordinates: [-95, 25] }, "MEX", ctx));
  assert.ok(M.esDelPais({ pais_iso2: "mx" }, null, "MEX", ctx));
  assert.ok(M.esDelPais({ country: "Guatemala, Mexico" }, null, "MEX", ctx));
  assert.ok(M.esDelPais({ title: "x" }, { type: "Point", coordinates: [-95, 25] }, "MEX", ctx));
  assert.ok(!M.esDelPais({ title: "x" }, { type: "Point", coordinates: [-80, 25] }, "MEX", ctx));
  const hueco = { type: "Polygon", coordinates: [cuadro.coordinates[0], [[-96, 24], [-94, 24], [-94, 26], [-96, 26], [-96, 24]]] };
  assert.ok(!M.puntoEnGeometria([-95, 25], hueco));
});

test("construir matriz con varias fuentes", () => {
  const datos = {
    eventos: [{ pais_iso3: "MEX", severidad: 4, area_principal: "seguridad", titulo: "A", delta: "escala" }, { pais_iso3: "USA", severidad: 5, titulo: "B" }],
    gdacs: [{ properties: { alertlevel: "Orange", country: "Mexico", name: "Huracán" }, geometry: { type: "Point", coordinates: [-95, 25] } }],
    anomalias: [{ properties: { titulo: "Luces" }, geometry: { type: "Point", coordinates: [-95, 25] } }],
  };
  const r = M.construir(datos, "MEX", ctx, ["eventos", "gdacs"]);
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].titulo, "A");
  assert.equal(r.filas[0].tema, "Seguridad");
  assert.equal(r.celdas[3][3].length, 1);
  assert.ok(r.indice > 0 && r.indice <= 100);
  assert.equal(M.construir(datos, "MEX", ctx, ["eventos", "gdacs", "anomalias"]).filas.length, 3);
  assert.equal(M.nivelDe(16), "crítico");
  assert.match(M.promptMatriz("México", r)[1].content, /Índice de riesgo DOMINUS \(0-100\): \d+/);
});
