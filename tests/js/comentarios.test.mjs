import { test } from "node:test";
import assert from "node:assert/strict";
import { separar, publicadasPorVideo, cabe, guardarHecho, leerHechos, MAX_POR_VIDEO } from "../../js/comentarios.js";

const memoria = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test("separa propuestas y retenidos y oculta lo ya resuelto", () => {
  const b = [{ comentario: "a", video: "v", categoria: "ok" }, { comentario: "b", video: "v", categoria: "retenido" }, { comentario: "c", video: "v", categoria: "ok" }];
  const h = { c: "publicado" };
  assert.deepEqual(separar(b, h).propuestas.map((x) => x.comentario), ["a"]);
  assert.deepEqual(separar(b, h, true).propuestas.map((x) => x.comentario), ["a", "c"]);
  assert.deepEqual(separar(b, h).retenidos.map((x) => x.comentario), ["b"]);
});

test("tope de respuestas por video", () => {
  const b = Array.from({ length: 11 }, (_, i) => ({ comentario: `c${i}`, video: "v", categoria: "ok" }));
  const almacen = memoria();
  for (let i = 0; i < MAX_POR_VIDEO; i++) guardarHecho(almacen, `c${i}`, "publicado");
  const pv = publicadasPorVideo(b, leerHechos(almacen));
  assert.equal(pv.v, MAX_POR_VIDEO);
  assert.equal(cabe("v", pv), false);
  assert.equal(cabe("otro", pv), true);
});
