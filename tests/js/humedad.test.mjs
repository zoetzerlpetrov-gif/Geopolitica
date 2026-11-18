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

test("historial: promedio mensual, litros por mes y meses sin noches", async () => {
  const { resumenMensual, htmlHistorial } = await import("../../js/humedad.js");
  const [nov] = resumenMensual({ m: { "2026-11": [2, 20, 1, 300] } });
  assert.equal(nov.ml_m3, 10);
  assert.equal(nov.l_dia, 33.6);                 // 10 mL/m³ × 200 m³/h × 24 h × 0.7
  assert.equal(nov.l_mes, Math.round(33.6 * 30));
  assert.equal(nov.rocio_ml_noche, 300);
  assert.equal(nov.rocio_l_m2_mes, 9);
  assert.equal(resumenMensual({ m: { "2026-12": [1, 5, 0, 0] } })[0].rocio_ml_noche, null);
  assert.ok(htmlHistorial(undefined, "2026-11-17").includes("Todavía no hay historial"));
  assert.ok(htmlHistorial({ m: { "2026-11": [2, 20, 1, 300] } }, "2026-11-17").includes("nov 2026"));
});

test("CO₂ y metano: cortes por percentiles, expresión, leyenda y ficha", async () => {
  const { cortesGei, expresionGei, htmlLeyendaGei, htmlFichaGei } = await import("../../js/humedad.js");
  const resumen = { co2_sup: { p10: 420, p90: 432, promedio: 425 } };
  const c = cortesGei(resumen, "co2_sup");
  assert.deepEqual(c, [420, 424, 428, 432]);
  assert.equal(cortesGei(resumen, "ch4_sup"), null);
  assert.equal(expresionGei("co2_sup", c)[0], "case");
  assert.ok(htmlLeyendaGei("co2_sup", c).includes("432 o más ppm"));
  const h = htmlFichaGei({ name: "<CDMX>", co2_sup: 430, corrida: "2026-11-18" }, { resumen, atribucion: "Copernicus" });
  assert.ok(h.includes("&lt;CDMX&gt;") && h.includes("+5 vs. promedio") && h.includes("CC BY 4.0"));
});

test("flujo de CO₂ de la vegetación: colores y ficha", async () => {
  const { colorFlujo, expresionFlujo, htmlFichaFlujo, htmlLeyendaFlujo, GEI } = await import("../../js/humedad.js");
  assert.equal(colorFlujo(-5), "#1B7837");
  assert.equal(colorFlujo(0), "#F2F2F2");
  assert.equal(colorFlujo(5), "#8C510A");
  assert.equal(colorFlujo(null), "#9aa5ad");
  assert.equal(expresionFlujo()[0], "step");
  assert.match(htmlFichaFlujo({ nee: -2.1, gpp: 6, reco: 3.9, lat: 19, lon: -99 }, { corrida: "2026-11-18", malla_grados: 2 }), /absorbe CO₂/);
  assert.match(htmlFichaFlujo({ nee: 1.5 }, null), /emite CO₂/);
  assert.match(htmlLeyendaFlujo(), /casi neutro/);
  assert.ok(GEI.co_sup && GEI.nee.soloFicha);
});
