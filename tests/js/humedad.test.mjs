import { test } from "node:test";
import assert from "node:assert/strict";
import { aguaDelAire, puntoRocio, humedadRelativa, colorDe, expresionColor, htmlFicha, htmlCO2, htmlCalculo, MODOS } from "../../js/humedad.js";

test("mismos resultados que tools/clima/humedad.py", () => {
  const c = aguaDelAire(24, 21, 0, 0.45);   // MMCT del 17-nov-2026: lo calculó el script de Python
  assert.deepEqual([c.hr, c.humedad_abs_g_m3, c.condensacion, c.rocio_ml_m2_noche, c.generador_ml_m3, c.generador_l_dia], [83.3, 18.09, "media", 10, 11.3, 38]);
  assert.ok(Math.abs(puntoRocio(25, 50) - 13.9) < 0.2);
  assert.equal(humedadRelativa(10, 10), 100);
});

test("colores por modo y expresión de MapLibre con los mismos cortes", () => {
  assert.equal(colorDe("hr", { hr: 20 }), "#C8A15A");
  assert.equal(colorDe("hr", { hr: 95 }), "#1D4E89");
  assert.equal(colorDe("condensacion", { nivel: 3 }), "#1565C0");
  assert.equal(colorDe("hr", {}), "#9aa5ad");
  const e = expresionColor("condensacion");
  assert.equal(e[0], "step");
  assert.equal(e.length, 3 + 2 * (MODOS.condensacion.cortes.length - 1));
});

test("ficha, CO₂ y calculadora escapan texto y explican la estimación", () => {
  const h = htmlFicha({ id: "<b>X</b>", t_c: 20, rocio_c: 19, hr: 94, condensacion: "alta", rocio_ml_m2_noche: 500, generador_ml_m3: 9.5, generador_l_dia: 32, noche: false });
  assert.ok(h.includes("&lt;b&gt;X&lt;/b&gt;") && h.includes("NOM-127-SSA1-2021") && h.includes("así seguirá de noche"));
  assert.ok(htmlCO2(null).includes("Aún no hay datos"));
  const co2 = htmlCO2({ series: { mauna_loa: { ppm: 426.07, mes: "2026-09", ppm_anterior: 424.37, aumento_ppm: 1.7, url: "https://gml.noaa.gov/ccgg/trends/" } } });
  assert.ok(co2.includes("426.07") && co2.includes("+1.7"));
  assert.ok(htmlCalculo(25, 0).includes("Escribe"));
  assert.ok(htmlCalculo(30, 80).includes("mL por m³"));
});
