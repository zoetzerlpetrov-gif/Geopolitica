import { test } from "node:test";
import assert from "node:assert/strict";
import { alturaVisual, cuadro, construir, adelante, EXAGERA_AVION } from "../../js/altura3d.js";

test("alturas visuales: aviones exagerados, satélites comprimidos con tope", () => {
  assert.equal(alturaVisual("avion", 10000), 10000 * EXAGERA_AVION);
  assert.equal(alturaVisual("avion", -50), 0);
  assert.equal(alturaVisual("satelite", 420), 150000 + 0.4 * 420000);
  assert.equal(alturaVisual("satelite", 35786), alturaVisual("satelite", 2000));
});

test("cuadro cerrado y más ancho en longitud a latitud alta", () => {
  const [anillo] = cuadro(10, 60, 1);
  assert.deepEqual(anillo[0], anillo[4]);
  assert.ok(anillo[1][0] - anillo[0][0] > anillo[2][1] - anillo[1][1]);
});

test("construir: poste y cabeza por objeto, se omiten los que están en tierra", () => {
  const fc = construir([{ tipo: "avion", lon: -99, lat: 19, alt: 10000, color: "#E0A100" }, { tipo: "avion", lon: 0, lat: 0, alt: 0 }, { tipo: "satelite", lon: 1, lat: 1, alt: 550, color: "#4FC3F7" }], 3);
  assert.equal(fc.features.length, 4);
  const [poste, cabeza] = fc.features;
  assert.equal(poste.properties.k, "poste");
  assert.equal(poste.properties.top, 250000);
  assert.equal(cabeza.properties.base, 250000);
});

test("adelante: 111 km al norte ≈ 1° de latitud", () => {
  const [lon, lat] = adelante(-99, 19, 0, 111.2);
  assert.ok(Math.abs(lat - 20) < 0.01 && Math.abs(lon + 99) < 1e-9);
});
