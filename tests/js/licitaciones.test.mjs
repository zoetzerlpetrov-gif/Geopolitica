import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/licitaciones-logica.js";
import * as R from "../../js/inmuebles-logica.js";

const avisos = [
  { fuente: "TED (UE)", id: "1-2026", titulo: "Servicios de ciberseguridad", comprador: "Ayuntamiento", pais: "ESP", publicado: "2026-10-01", cierre: "2026-11-30", cpv: ["72000000"] },
  { fuente: "TED (UE)", id: "2-2026", titulo: "Obra de agua potable", comprador: "Stadt", pais: "DEU", publicado: "2026-10-02", cierre: "2026-10-05", cpv: [] },
  { fuente: "Grants.gov (EUA)", id: "DE-1", titulo: "Water research", comprador: "DOE", pais: "USA", publicado: "2026-10-21", cierre: "", cpv: ["81.135"] },
];

test("filtro de licitaciones por palabras, fuente, país y vigencia", () => {
  const hoy = "2026-10-22";
  assert.deepEqual(L.filtrarAvisos(avisos, { q: "ciberseguridad", hoy }).map((a) => a.id), ["1-2026"]);
  assert.deepEqual(L.filtrarAvisos(avisos, { q: "agua", hoy }).map((a) => a.id), []);
  assert.deepEqual(L.filtrarAvisos(avisos, { q: "agua", soloAbiertas: false, hoy }).map((a) => a.id), ["2-2026"]);
  assert.deepEqual(L.filtrarAvisos(avisos, { fuente: "Grants", hoy }).map((a) => a.id), ["DE-1"]);
  assert.deepEqual(L.filtrarAvisos(avisos, { q: "72000000", pais: "ESP", hoy }).map((a) => a.id), ["1-2026"]);
  assert.equal(L.diasParaCierre("2026-10-25", new Date("2026-10-22T15:00:00Z")), 3);
  assert.equal(L.diasParaCierre("", new Date()), null);
  assert.ok(L.enlacesBusqueda("agua potable").some(([, u]) => u.includes("agua%20potable")));
  const c = L.consultaUSAspending("water", 12, new Date("2026-10-22T00:00:00Z"));
  assert.equal(c.filters.time_period[0].end_date, "2026-10-22");
  assert.deepEqual(c.filters.keywords, ["water"]);
});

test("geocodificación por ciudad y colonia", () => {
  assert.equal(R.urlGeocodificar("", ""), null);
  const u = new URL(R.urlGeocodificar("Ciudad de México", "Polanco", "MX"));
  assert.equal(u.searchParams.get("q"), "Polanco, Ciudad de México");
  assert.equal(u.searchParams.get("countrycodes"), "mx");
  const ops = R.opcionesGeocodificacion([
    { lat: "19.43", lon: "-99.19", display_name: "Polanco (estación)", addresstype: "railway" },
    { lat: "19.434", lon: "-99.196", display_name: "Polanco, CDMX", addresstype: "suburb" },
    { lat: "x", lon: "1" }]);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].nombre, "Polanco, CDMX");
});
