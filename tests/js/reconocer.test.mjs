// Reconocimiento de lugares: partes que no necesitan el modelo (probabilidades, frases, empaquetado, avisos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../../js/reconocer.js";
import { avisoReplica } from "../../js/foto.js";

const lista = JSON.parse(readFileSync(new URL("../../config/monumentos.json", import.meta.url), "utf8")).monumentos;

test("lista de lugares: campos completos, coordenadas válidas y sin repetidos", () => {
  assert.ok(lista.length > 300);
  const nombres = new Set();
  for (const m of lista) {
    assert.equal(m.length, 9, m[0]);
    assert.ok(m[0] && m[1], `nombre vacío: ${m}`);
    assert.ok(Math.abs(m[3]) <= 90 && Math.abs(m[4]) <= 180, m[0]);
    assert.ok(!nombres.has(m[0]), `repetido: ${m[0]}`);
    nombres.add(m[0]);
  }
  const libertad = lista.find((m) => m[0] === "Statue of Liberty");
  assert.equal(libertad[7], "Nueva York");
  assert.ok(lista.some((m) => m[0].startsWith("Angel of Independence")));
});

test("probabilidades suman 1 y respetan el orden", () => {
  const p = R.probabilidades([0.30, 0.25, 0.10]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(p[0] > p[1] && p[1] > p[2]);
});

test("frases y agrupación: varias plantillas por lugar, luego réplica y real", () => {
  const dos = lista.slice(0, 2), k = R.PLANTILLAS.length;
  const f = R.frasesDe(dos);
  assert.equal(f.length, 2 * k + R.FRASES_REPLICA.length + R.FRASES_REAL.length);
  assert.match(f[1], /Eiffel Tower, Paris/);
  const vecs = f.map((_, i) => R.norma([1, i % 3, (i * 7) % 5]));
  const g = R.agrupar(vecs, 2);
  assert.equal(g.lugares.length, 2);
  assert.equal(g.replica.length, R.FRASES_REPLICA.length);
  assert.equal(g.real.length, R.FRASES_REAL.length);
  assert.ok(Math.abs(Math.hypot(...g.lugares[0]) - 1) < 1e-9);
});

test("clasificar: el vector más parecido gana y la réplica se suma aparte", () => {
  const mon = [["A"], ["B"], ["C"]];
  const textos = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const r = R.clasificar([0.1, 0.9, 0.05], textos, mon, [[0, 1, 0]], [[1, 0, 0]]);
  assert.equal(r.candidatos[0].m[0], "B");
  assert.ok(r.replica > 0.99);
  assert.equal(r.total, 3);
});

test("empacar/desempacar en int8 conserva los vectores y la huella cambia con las frases", () => {
  globalThis.atob ??= (s) => Buffer.from(s, "base64").toString("latin1");
  const v = [R.norma([0.1, -0.5, 0.3, 0.02]), R.norma([0.9, 0.1, -0.2, -0.4])];
  const d = R.desempacar(R.empacar(v));
  v.forEach((x, i) => x.forEach((y, j) => assert.ok(Math.abs(y - d[i][j]) < 0.01)));
  assert.notEqual(R.huella(["a"]), R.huella(["b"]));
  assert.equal(R.huella(["a"]), R.huella(["a"]));
});

test("aviso de réplica según la probabilidad", () => {
  assert.equal(avisoReplica(0.45), null);
  assert.equal(avisoReplica(0.6).nivel, "medio");
  assert.equal(avisoReplica(0.9).nivel, "alto");
});
