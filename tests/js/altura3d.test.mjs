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

test("cabina: estado simulado con inclinación por velocidad vertical y alabeo por ritmo de giro", async () => {
  const { estadoCabina, haciaDestino } = await import("../../js/altura3d.js");
  const v = { lon: -99, lat: 19, alt: 3000, rumbo: 90, kmh: 720, vs: 10 };
  const e = estadoCabina(v, 60);
  assert.ok(Math.abs(e.alt_m - 3600) < 1e-6 && e.lon > -99 && Math.abs(e.lat - 19) < 0.01);   // sube 10 m/s, va al este
  assert.ok(Math.abs(e.gs_kt - 388.8) < 0.1 && Math.abs(e.vs_fpm - 1968.5) < 0.1);
  assert.ok(e.pitch > 5 && e.pitch < 6);                         // atan(10/200) ≈ 2.9° + 2.5°
  assert.equal(e.bank, 0);
  assert.ok(estadoCabina(v, 0, 3).bank > 25);                     // giro estándar (3°/s) a 200 m/s ≈ 46° → tope 35°
  assert.equal(estadoCabina({ ...v, rumbo: -10 }, 0).rumbo, 350);
  const d = haciaDestino({ lon: -99, lat: 19, gs_kmh: 600 }, [-99, 20]);
  assert.ok(Math.abs(d.km - 111.2) < 0.5 && Math.abs(d.min - 11.1) < 0.1);
  assert.equal(haciaDestino({ lon: 0, lat: 0, gs_kmh: 10 }, [1, 1]), null);  // en tierra o casi parado: sin ETA
});
