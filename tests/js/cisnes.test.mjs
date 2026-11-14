import { test } from "node:test";
import assert from "node:assert/strict";
import { pct, unoEn, htmlEvento, filtrar } from "../../js/cisnes.js";

test("Cisnes: porcentajes legibles, «1 en N», sin número inventado y HTML escapado", () => {
  assert.equal(pct(0.0127), "1.3 %");
  assert.equal(pct(0.9592), "96 %");
  assert.equal(pct(0.0018), "0.18 %");
  assert.equal(pct(0.000002), "0.0002 %");
  assert.equal(pct(null), "sin tasa histórica");
  assert.equal(unoEn(0.0127), "≈ 1 en 79 por año");
  const h = htmlEvento({ id: "x", nombre: "<b>Prueba</b>", tipo: "negro", nivel: "elevado", impacto: "i", base_texto: "b", fuentes: [["F", "javascript:alert(1)"]],
    prob_base_12m: null, prob_ajustada_12m: null, menciones_72h: 2, promedio_72h: 1, razon: 1.5, dias_historial: 10, alertas: [], n_alertas: 0, notas: [] });
  assert.match(h, /&lt;b&gt;Prueba/);
  assert.match(h, /sin tasa histórica/);
  assert.doesNotMatch(h, /javascript:/);
  assert.deepEqual(filtrar([{ tipo: "negro", nivel: "alto" }, { tipo: "blanco", nivel: "alto" }], { tipo: "negro" }).length, 1);
});
