import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixVigente, precioMxn, textoPrecio, preciosPlanes, paginaSoloAdmin, hoyMexico, fechaIso } from "../../js/planes.js";

const cat = JSON.parse(readFileSync(new URL("../../config/planes.json", import.meta.url)));
const SIE = [{ fecha: "27/10/2026", dato: "18.3900" }, { fecha: "28/10/2026", dato: "18.4215" }, { fecha: "29/10/2026", dato: "N/E" }];

test("FIX vigente: el de hoy si existe; si no, el último anterior; nunca uno futuro", () => {
  assert.deepEqual(fixVigente(SIE, "2026-10-28"), { fecha: "2026-10-28", valor: 18.4215 });
  assert.deepEqual(fixVigente(SIE, "2026-10-29"), { fecha: "2026-10-28", valor: 18.4215 }, "hoy dice N/E: se usa el de ayer");
  assert.deepEqual(fixVigente(SIE, "2026-10-27"), { fecha: "2026-10-27", valor: 18.39 });
  assert.equal(fixVigente(SIE, "2026-10-26"), null);
  assert.deepEqual(fixVigente([{ fecha: "2026-11-02", valor: 18.5 }, { fecha: "2026-10-30", valor: 18.4 }], "2026-11-01"), { fecha: "2026-10-30", valor: 18.4 }, "fin de semana: el viernes");
  assert.equal(fechaIso("02/11/2026"), "2026-11-02");
});

test("precio en pesos: dólares × FIX, hacia arriba al peso entero", () => {
  assert.equal(precioMxn(4.99, 18.4215), 92);   // 91.92…
  assert.equal(precioMxn(8.99, 18.4215), 166);  // 165.61…
  assert.equal(precioMxn(12.99, 18.4215), 240); // 239.29…
  assert.equal(precioMxn(5, 18.4), 92, "92.000 exacto no sube a 93");
  assert.equal(precioMxn(4.99, 0), null);
  assert.equal(precioMxn(0, 18.4), 0);
  assert.equal(textoPrecio(cat.planes[0], null), "Gratis, con registro");
});

test("texto del precio y precios de los tres planes", () => {
  const fix = { fecha: "2026-10-28", valor: 18.4215 };
  assert.equal(textoPrecio(cat.planes[1], fix, cat.cobro.texto), "92 MXN al mes (USD 4.99 al tipo de cambio FIX de Banxico del 28 de octubre de 2026)");
  assert.match(textoPrecio(cat.planes[1], null), /^USD 4\.99 al mes/);
  const p = preciosPlanes(cat, fix);
  assert.deepEqual(p.map((x) => [x.id, x.usd, x.mxn]), [["demo", 0, 0], ["recon", 4.99, 92], ["analyst", 8.99, 166], ["command", 12.99, 240]]);
  assert.match(hoyMexico(new Date("2026-10-29T03:00:00Z")), /^2026-10-28$/, "a las 21:00 de CDMX todavía es el 28");
});

test("secciones solo para quien administra", () => {
  for (const h of ["noticiero.html", "corporativo.html", "herramientas.html", "ops.html", "inmuebles.html?zona=x", "analitica.html", "marco.html"]) assert.ok(paginaSoloAdmin(cat, h), h);
  for (const h of ["index.html", "reporte.html?tipo=mexico", "tutorial.html", "matriz.html"]) assert.ok(!paginaSoloAdmin(cat, h), h);
});
