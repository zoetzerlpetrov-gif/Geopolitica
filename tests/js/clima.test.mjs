// Capa de clima: muestreo del viento, decodificación de la textura, colores y etiquetas.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { muestrear, decodificar, colorVelocidad, etiquetaPaso, leyenda, VELOCIDADES } from "../../js/clima.js";

function rejilla(fn) {
  const ancho = 360, alto = 181, u = new Float32Array(ancho * alto), v = new Float32Array(ancho * alto);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) { const [a, b] = fn(x - 180, 90 - y); u[y * ancho + x] = a; v[y * ancho + x] = b; }
  return { u, v, ancho, alto };
}

test("muestreo bilineal: valores exactos en nodos e interpolados entre ellos", () => {
  const c = rejilla((lon, lat) => [lon, lat]);
  assert.deepEqual(muestrear(c, -99, 19).map((x) => Math.round(x * 100) / 100), [-99, 19]);
  const [u, v] = muestrear(c, -98.5, 19.25);
  assert.ok(Math.abs(u + 98.5) < 1e-4 && Math.abs(v - 19.25) < 1e-4);
});

test("muestreo cruza el antimeridiano sin saltos y recorta los polos", () => {
  const c = rejilla(() => [5, -3]);
  assert.deepEqual(muestrear(c, 179.6, 0), [5, -3]);
  assert.deepEqual(muestrear(c, -180, 0), [5, -3]);
  assert.deepEqual(muestrear(c, 0, 95), [5, -3]);
});

test("decodificación de la textura RGBA (R = U, G = V) con escala ±40 m/s", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 128, 128, 0, 255]);
  const d = decodificar(rgba, 2, 1, 40);
  assert.equal(d.u[0], 40); assert.equal(d.v[0], -40);
  assert.ok(Math.abs(d.u[1]) < 0.2 && Math.abs(d.v[1]) < 0.2);
});

test("colores por velocidad y leyenda", () => {
  assert.equal(colorVelocidad(0), VELOCIDADES[0][1]);
  assert.equal(colorVelocidad(25), "#d23b3b");
  assert.equal(colorVelocidad(40), "#a5367a");
  const html = leyenda([[0, "#000000"], [10, "#ffffff"]], "°C");
  assert.match(html, /linear-gradient\(90deg, #000000 0%, #ffffff 100%\)/);
  assert.match(html, /<span>°C<\/span>/);
});

test("etiqueta del horizonte: ahora, +h", () => {
  const t0 = Date.parse("2026-10-08T18:00:00Z");
  assert.match(etiquetaPaso("2026-10-08T19:00:00Z", t0), /^≈ ahora · /);
  assert.match(etiquetaPaso("2026-10-09T18:00:00Z", t0), /^\+24 h · /);
});
