// Etiquetas de las capas: sin contorno (halo) y con pastilla de fondo.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

globalThis.document = globalThis.document || { documentElement: { dataset: {} } };
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false }));
const { layoutEtiqueta, pinturaEtiqueta, asegurarFondoEtiqueta } = await import("../../js/util.js");

test("ninguna capa del sitio usa text-halo (solo el mapa base en map.js)", () => {
  const dir = new URL("../../js/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "map.js")) {
    assert.ok(!readFileSync(new URL(f, dir), "utf8").includes("text-halo"), `${f} usa text-halo: usa pinturaEtiqueta() y layoutEtiqueta(map)`);
  }
});

test("la pintura de etiquetas no tiene halo y la pastilla se crea una vez por tema", () => {
  assert.ok(!Object.keys(pinturaEtiqueta()).some((k) => k.startsWith("text-halo")));
  const imgs = new Map();
  const map = { hasImage: (id) => imgs.has(id), addImage: (id, img, opc) => imgs.set(id, { img, opc }) };
  const l = layoutEtiqueta(map);
  assert.equal(l["icon-text-fit"], "both");
  assert.equal(l["text-optional"], false);
  assert.equal(asegurarFondoEtiqueta(map), l["icon-image"]);
  assert.equal(imgs.size, 1);
  const { img, opc } = imgs.get(l["icon-image"]);
  assert.equal(img.data.length, img.width * img.height * 4);
  assert.ok(opc.stretchX && opc.content);
  const centro = (12 * 24 + 12) * 4;
  assert.deepEqual([...img.data.slice(centro, centro + 4)], [255, 255, 255, 255]);   // centro: blanco opaco en tema claro
});
