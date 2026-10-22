import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../../js/inmuebles-logica.js";

test("sismos y volcanes", () => {
  assert.equal(R.riesgoSismico([]).nivel, 1);
  assert.equal(R.riesgoSismico([{ properties: { mag: 7.1 } }]).nivel, 4);
  assert.equal(R.riesgoSismico([{ properties: { mag: 5.2 } }, { properties: { mag: 5.5 } }, { properties: { mag: 5.0 } }]).nivel, 2);
  const v = [["Popocatépetl", -98.622, 19.023]];
  assert.equal(R.riesgoVolcanico(19.05, -98.6, v).nivel, 4);   // ~4 km
  assert.equal(R.riesgoVolcanico(19.43, -99.13, v).nivel, 2);  // CDMX ~70 km
  assert.equal(R.riesgoVolcanico(40, 3, v).nivel, 1);
});

test("terreno: pendiente, deslave e inundación", () => {
  assert.equal(R.pendiente([100, 100, 100, 100, 100]), 0);
  assert.ok(R.pendiente([100, 250, 50, 100, 100]) > 15);
  assert.equal(R.pendiente([1, null, 2, 3, 4]), null);
  const p = R.puntosPendiente(20, -100); assert.equal(p.length, 5); assert.ok(p[1][0] > 20);
  assert.equal(R.riesgoTerreno(30, 500).deslave, 4);
  assert.equal(R.riesgoTerreno(1, 3).inundacion, 3);
});

test("político, inseguridad, global y precio por m²", () => {
  assert.equal(R.riesgoPolitico(1.1).nivel, 1); assert.equal(R.riesgoPolitico(-1.4).nivel, 4); assert.equal(R.riesgoPolitico(null).nivel, null);
  assert.equal(R.riesgoInseguridad(25, []).nivel, 4);
  assert.equal(R.riesgoInseguridad(1, [{ severidad: 5 }, { severidad: 4 }, { severidad: 4 }]).nivel, 2);
  assert.equal(R.riesgoGlobal([{ nivel: 1 }, { nivel: 1 }, { nivel: 4 }]), 3);
  assert.equal(R.riesgoGlobal([{ nivel: null }]), null);
  assert.deepEqual(R.precioM2(300000, 100, 2500), { m2: 3000, dif: 20 });
  assert.equal(R.precioM2(0, 100), null);
});

test("fuentes de inmuebles: 20 países con enlaces https", () => {
  const f = JSON.parse(readFileSync(new URL("../../config/inmuebles_fuentes.json", import.meta.url)));
  assert.equal(f.paises.length, 20);
  for (const p of f.paises) {
    assert.ok(p.iso3.length === 3 && p.extranjeros, p.nombre);
    for (const [, u] of [...p.precios, ...p.subastas, ...p.riesgo, ...p.portales]) assert.match(u, /^https?:\/\//, p.nombre);
  }
});
