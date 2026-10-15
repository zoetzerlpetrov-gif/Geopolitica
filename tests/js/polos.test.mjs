// Polos: reclamos antárticos, rutas árticas, indicadores y gráficas.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECLAMOS, reclamosAntartida, traslapes, sector, rutasArticas, indicadoresFC, filasIndicador, etiquetaIndicador, extraIndicador, grafica, meridianos } from "../../js/polos.js";

test("reclamos: sectores cerrados entre meridianos y traslapes de la Península Antártica", () => {
  const anillo = sector(-20, 45)[0];
  assert.deepEqual(anillo[0], anillo.at(-1));
  assert.ok(anillo.every(([, lat]) => lat <= -60 && lat >= -85));
  const fc = reclamosAntartida();
  assert.equal(fc.features.length, RECLAMOS.length);
  const arg = RECLAMOS.findIndex((r) => r[0] === "Argentina");
  assert.deepEqual(traslapes(arg).sort(), ["Chile", "Reino Unido"]);
  const nor = RECLAMOS.findIndex((r) => r[0] === "Noruega");
  assert.deepEqual(traslapes(nor), []);  // Noruega empieza justo donde termina el reclamo británico (20° O)
  assert.equal(meridianos({ oeste: 160, este: 210 }), "de 160° E a 150° O");
});

test("rutas árticas: cruzan el antimeridiano sin cortar la línea", () => {
  const nsr = rutasArticas().features[0].geometry.coordinates;
  for (let i = 1; i < nsr.length; i++) assert.ok(Math.abs(nsr[i][0] - nsr[i - 1][0]) < 40);
});

test("indicadores: solo los que tienen dato, con etiqueta, filas y gráfica", () => {
  const d = { hielo: { artico: { mes: "septiembre", anio: 2026, valor: 4.81, anomalia: -0.77, media_1991_2020: 5.58, lugar_mas_bajo: 10, anios: 48,
    record_minimo: [2012, 3.57], serie: [[1979, 7.05], [2012, 3.57], [2026, 4.81]] }, fuente: "NOAA NCEI" },
    ozono: { fecha: "2026-10-11", area: 24.47, media: 17.41, p10: 8, p90: 23, maximo_anio: 26.1, fecha_maximo: "2026-09-20",
      serie: [["2026-07-01", 0, 0, 0, 0], ["2026-10-11", 24.47, 17.41, 8.05, 23.74], ["2026-10-12", null, 17.16, 8.39, 23.5]] } };
  const fc = indicadoresFC(d);
  assert.deepEqual(fc.features.map((f) => f.properties.kind), ["hielo_artico", "ozono"]);
  const [hielo, oz] = fc.features.map((f) => f.properties);
  assert.match(etiquetaIndicador(hielo), /4\.81 M km² \(−0\.77\)/);
  assert.match(filasIndicador(hielo).find((r) => r[0] === "Lugar")[1], /10\.º más bajo de 48 años/);
  assert.match(etiquetaIndicador(oz), /24\.5 M km²/);
  assert.match(filasIndicador(oz).find((r) => /promedio/.test(r[0]))[1], /\+7\.1/);
  assert.match(extraIndicador(oz), /<svg/);
  assert.match(extraIndicador(hielo), /promedio 1991-2020/);
  assert.equal(indicadoresFC(null).features.length, 0);
});

test("gráfica: sin datos no dibuja; con datos, una ruta por serie", () => {
  assert.equal(grafica({ series: [{ puntos: [], color: "#000" }] }), "");
  const svg = grafica({ series: [{ puntos: [[0, 1], [1, 2], [2, null], [3, 1.5]], color: "#123456" }], banda: [[0, 0, 3], [3, 0, 3]], unidad: "x" });
  assert.equal((svg.match(/stroke="#123456"/g) || []).length, 1);
  assert.match(svg, /<path d="M[^"]+Z" fill="currentColor"/);
});
