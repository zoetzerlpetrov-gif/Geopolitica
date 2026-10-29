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
