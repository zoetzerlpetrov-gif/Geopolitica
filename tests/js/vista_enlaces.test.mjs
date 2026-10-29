import { test } from "node:test";
import assert from "node:assert/strict";
import { esInterno, paginaDe, conVista } from "../../js/vista_enlaces.js";

test("enlaces internos conservan la vista y el plan", () => {
  assert.equal(conVista("./", "demo"), "./?vista=pago&plan=demo");
  assert.equal(conVista("reporte.html?tipo=mexico", "recon"), "reporte.html?vista=pago&plan=recon&tipo=mexico");
  assert.equal(conVista("planes.html#analyst", "demo"), "planes.html?vista=pago&plan=demo#analyst");
  assert.equal(conVista("index.html?vista=pago&plan=command&lat=1", "demo"), "index.html?vista=pago&plan=demo&lat=1", "el plan no se cambia por otro");
  const una = conVista("herramientas.html#x", "analyst");
  assert.equal(conVista(una, "analyst"), una, "idempotente");
});

test("solo cambian los enlaces a páginas del sitio", () => {
  for (const h of ["./", "index.html", "reporte.html?tipo=global", "planes.html#demo", "?id=3"]) assert.ok(esInterno(h), h);
  for (const h of ["#mapa", "https://x.org/a.html", "//cdn.x/a.html", "mailto:a@b.c", "/otro/a.html", "javascript:void(0)", "data/x.json", ""]) assert.ok(!esInterno(h), h);
  assert.equal(paginaDe("./?vista=pago"), "index.html");
  assert.equal(paginaDe("matriz.html#a"), "matriz.html");
});

test("autoauditoría: tendencia contra la semana anterior", async () => {
  const { tendencia, barra } = await import("../../js/autoauditoria.js");
  assert.equal(tendencia([{ global: 40 }, { global: 45 }], "global"), "▲ 5");
  assert.equal(tendencia([{ global: 45 }, { global: 40 }], "global"), "▼ 5");
  assert.equal(tendencia([{ global: 45 }], "global"), "");
  assert.match(barra(72), /72 %/);
});

test("alertas cisne negro: solo activas, ya en vigor y sin desactivar", async () => {
  const { alertasActivas, htmlAlertas } = await import("../../js/alerta_cisne.js");
  const f = (p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: p });
  const fc = { features: [
    f({ titulo: "FORTRESS America", cisne_negro: true, fecha: "2026-09-30", nivel: 3, emisor: "Estados Unidos", afectacion: "Bases <militares>" }),
    f({ titulo: "Japón", cisne_negro: true, fecha: "2026-11-02", nivel: 1 }),
    f({ titulo: "Retirado", cisne_negro: true, fecha: "2026-01-01", desactivado: "2026-10-01" }),
    f({ titulo: "Aviso de viaje", cisne_negro: false, fecha: "2026-10-01", nivel: 4 }),
  ] };
  assert.deepEqual(alertasActivas(fc, "2026-10-29").map((x) => x.properties.titulo), ["FORTRESS America"]);
  assert.deepEqual(alertasActivas(fc, "2026-11-02").map((x) => x.properties.titulo), ["FORTRESS America", "Japón"], "Japón entra el día anunciado");
  const h = htmlAlertas(alertasActivas(fc, "2026-10-29"));
  assert.match(h, /Emite: <b>Estados Unidos<\/b>/);
  assert.ok(h.includes("Bases &lt;militares&gt;"), "texto escapado");
  assert.equal(htmlAlertas([]), "");
});
