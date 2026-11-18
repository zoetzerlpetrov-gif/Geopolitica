import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlComercio, htmlSeguridad, svgReparto, svgIndice } from "../../js/contraste_mx.js";

test("comercio: porcentaje sin país, tabla ONU vs Banxico y nota de confidencialidad", () => {
  const c = { meses: { "202606": { total: 2000, eua: 400, paises_identificados: 100, sin_pais: 1500, sin_pais_pct: 75, cuba: 0, banxico_petroleras: 1900 } } };
  const h = htmlComercio(c);
  assert.ok(h.includes("<b>75 %</b>") && h.includes("jun 2026") && h.includes("1,900") && h.includes("confidencialidad"));
  assert.ok(svgReparto(c.meses).includes("<rect"));
  assert.ok(htmlComercio({}).includes("Aún no hay"));
});

test("seguridad: señales, índice y mismo periodo", () => {
  const s = { anuales: { homicidio_doloso: { 2024: 100, 2025: 80 }, otros_vida: { 2024: 10, 2025: 20 } }, categorias: { homicidio_doloso: "Homicidio doloso", otros_vida: "Otros <vida>" },
    mismo_periodo: { homicidio_doloso: { 2025: 90, 2026: 63 } }, anio_actual: "2026", ultimo_mes: 9,
    senales: [{ baja: "homicidio_doloso", sube: "otros_vida", cambio_baja_pct: -30, cambio_sube_pct: 200, periodo: "enero a septiembre 2026 vs 2025", absorbe_pct: 67 }] };
  const h = htmlSeguridad(s);
  assert.ok(h.includes("Posible reclasificación") && h.includes("Otros &lt;vida&gt;") && h.includes("▼ 30 %") && h.includes("<polyline"));
  assert.equal(svgIndice({ a: { 2024: 1 } }, ["a"], {}), "");
});

test("INEGI vs SESNSP: brecha del último año y gráfica", async () => {
  const { htmlInegi } = await import("../../js/contraste_mx.js");
  const h = htmlInegi({ filas: [{ anio: "2024", inegi: 33241, sesnsp: 30918, brecha: 2323, brecha_pct: 7, sesnsp_con_otros: 47254 }, { anio: "2025", inegi: 27989, sesnsp: 24348, brecha: 3641, brecha_pct: 13, sesnsp_con_otros: 41458, preliminar: true }], enlaces: { 2025: "https://www.inegi.org.mx/x.pdf" } });
  assert.ok(h.includes("<b>3,641 (13 %)</b>") && h.includes("(preliminar)") && h.includes("<polyline") && h.includes("2025*"));
  assert.equal(htmlInegi({}), "");
});

test("petróleo a Cuba según Pemex", async () => {
  const { htmlPemexCuba, svgPemexCuba } = await import("../../js/contraste_mx.js");
  const d = { fuente: "Pemex SEC", periodos: [
    { periodo: "Año 2025", crudo_kbd: 15, petroliferos_kbd: 2.2, usd_millones: 500, mxn_millones: 9500, pct_crudo_exportado: 3.1, forma: "20-F", presentado: "2026-04-30", fuente: "https://www.sec.gov/x.htm" },
    { periodo: "6 meses a 2026-06", crudo_kbd: 0, petroliferos_kbd: 0.9, usd_millones: 14.7, pct_exportaciones: 0.1, forma: "6-K", presentado: "2026-09-08", fuente: "https://www.sec.gov/y.htm" }] };
  const h = htmlPemexCuba(d);
  assert.match(h, /3\.1 % del crudo exportado/);
  assert.match(h, /href="https:\/\/www\.sec\.gov\/y\.htm"/);
  assert.match(svgPemexCuba(d.periodos), /<svg/);
  assert.match(htmlPemexCuba(null), /Aún no hay datos/);
});
