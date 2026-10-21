// Proyección de Peters: equivalente (conserva áreas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { proyectar, areaKm2 } from "../../js/peters.js";

test("el ecuador y los polos caen donde deben", () => {
  assert.deepEqual(proyectar(0, 0), [0, 0]);
  assert.ok(Math.abs(proyectar(0, 90)[1] - Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(proyectar(180, 0)[0] - Math.PI * Math.SQRT1_2) < 1e-9);
});

test("áreas reales: un cuadro de 1°×1° en el ecuador ≈ 12,364 km² y uno a 60° es la mitad", () => {
  const cuadro = (lat) => ({ type: "Polygon", coordinates: [[[0, lat], [1, lat], [1, lat + 1], [0, lat + 1], [0, lat]]] });
  const ecuador = areaKm2(cuadro(-0.5));
  assert.ok(Math.abs(ecuador - 12364) < 30, ecuador);
  assert.ok(Math.abs(areaKm2(cuadro(59.5)) / ecuador - 0.5) < 0.01);
  // Toda la Tierra: 4πR² ≈ 510 millones de km².
  const tierra = areaKm2({ type: "Polygon", coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] });
  assert.ok(Math.abs(tierra / 1e6 - 510.07) < 0.5, tierra);
});
