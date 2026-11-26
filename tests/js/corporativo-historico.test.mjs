// Inteligencia corporativa: probabilidad por sede con el último año y matriz por país.
import test from "node:test";
import assert from "node:assert/strict";
import { historicoCerca, probabilidadHistorica, probabilidadCombinada, riesgoPais, htmlMatriz } from "../../js/corporativo.js";

const hist = { celda_grados: 0.5, celdas: { "25.5,-100.5": { "2026-10": { n: 40, sev: 120, tipos: { conflicto: 30, clima: 10 } } }, "19.0,-99.5": { "2026-11": { n: 3, sev: 6, tipos: { otro: 3 } } } },
  paises: { MEX: { "2026-11": { n: 7000, sev: 15000, tipos: {} } }, ISL: { "2026-11": { n: 2, sev: 3, tipos: {} } } } };

test("dos sedes en ciudades distintas quedan con probabilidades distintas", () => {
  const mty = historicoCerca({ lat: 25.67, lon: -100.31 }, hist, 50), cdmx = historicoCerca({ lat: 19.43, lon: -99.13 }, hist, 50), nada = historicoCerca({ lat: 60, lon: 10 }, hist, 50);
  assert.equal(mty.n, 40); assert.equal(cdmx.n, 3); assert.equal(nada.n, 0);
  assert.deepEqual([probabilidadHistorica(mty), probabilidadHistorica(cdmx), probabilidadHistorica(nada)], [3, 2, 1]);
  // Con 52 días de datos, la severidad se lleva a un año (120 × 365/52 ≈ 842 → 4)
  assert.equal(probabilidadHistorica(mty, 52), 4);
  assert.equal(probabilidadCombinada(1, 4), 3);
  assert.equal(probabilidadCombinada(5, 2), 5);
});

test("riesgo por país y matriz con etiquetas de país", () => {
  assert.equal(riesgoPais("MEX", hist, { MEX: { indice: 55 } }).prob, 4);
  assert.equal(riesgoPais("ISL", hist, {}).prob, 2);
  assert.equal(riesgoPais("XXX", null, {}).prob, 1);
  const svg = htmlMatriz([{ prob: 5, impacto: 4, etiqueta: "MEX" }, { prob: 2, impacto: 4, etiqueta: "ISL" }]);
  assert.match(svg, />MEX</); assert.match(svg, />ISL</);
});
