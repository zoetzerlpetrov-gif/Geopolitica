import test from "node:test";
import assert from "node:assert/strict";
import { pistasDe, metrosLocales, rumboAGiro, metrosPorPixel, TIPOS } from "../../js/mapa3d.js";
import { modeloPara } from "../../js/modelos3d.js";

test("metros locales: este positivo en X y sur positivo en Z", () => {
  const [x, z] = metrosLocales([-99, 19], [-98.99, 19.01]);
  assert.ok(x > 1000 && x < 1060, `x=${x}`);
  assert.ok(z < -1100 && z > -1110, `z=${z}`);
});

test("rumbo → giro: norte apunta a −Z, este a +X", () => {
  const dir = (r) => { const a = rumboAGiro(r); return [Math.cos(a), -Math.sin(a)]; }; // +X girado sobre Y
  const [nx, nz] = dir(0); assert.ok(Math.abs(nx) < 1e-9 && nz < -0.99);
  const [ex, ez] = dir(90); assert.ok(ex > 0.99 && Math.abs(ez) < 1e-9);
});

test("pistas reales: extremos más alejados, se descartan las cortas y lejanas", () => {
  const o = [-99.072, 19.436];
  const pista = { geometry: { type: "LineString", coordinates: [[-99.09, 19.44], [-99.06, 19.43]] } };
  const corta = { geometry: { type: "LineString", coordinates: [[-99.072, 19.436], [-99.071, 19.436]] } };
  const lejana = { geometry: { type: "LineString", coordinates: [[-98.5, 19.4], [-98.45, 19.4]] } };
  const p = pistasDe([pista, corta, lejana], o);
  assert.equal(p.length, 1);
  assert.ok(Math.hypot(p[0].x2 - p[0].x1, p[0].z2 - p[0].z1) > 3000);
});

test("metros por píxel bajan a la mitad con cada nivel de zoom", () => {
  assert.ok(Math.abs(metrosPorPixel(0, 10) / metrosPorPixel(0, 11) - 2) < 1e-9);
});

test("todo modelo que se pide tiene constructor (o es flujo sobre línea)", () => {
  const ejemplos = [{ fuente: "entidad", st: "central_gas" }, { fuente: "entidad", st: "helipuerto" }, { fuente: "entidad", st: "mineria" },
    { fuente: "riesgo", capa: "incendios", props: {} }, { fuente: "riesgo", capa: "sismos", props: { mag: 6 } }, { fuente: "buque", subtipo: "carga" }];
  for (const e of ejemplos) { const m = modeloPara(e); assert.ok(m.tipo === "flujo" || TIPOS.includes(m.tipo), m.tipo); }
});
