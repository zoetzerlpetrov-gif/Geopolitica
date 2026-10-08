// Pruebas del aligerado del estilo de OpenFreeMap.  Ejecutar:  node --test "tests/js/*.test.mjs"
// Las fixtures son copias de los estilos de github.com/hyperknot/openfreemap-styles (MIT).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || {};
const { aligerarEstilo } = await import("../../js/map.js");
const carga = (n) => JSON.parse(readFileSync(new URL(`./fixtures/ofm-${n}.json`, import.meta.url)));

for (const nombre of ["dark", "positron"]) {
  test(`${nombre}: ninguna etiqueta pide el nombre en alfabeto no latino`, () => {
    const st = aligerarEstilo(carga(nombre));
    for (const l of st.layers) assert.ok(!JSON.stringify(l.layout?.["text-field"] ?? "").includes("nonlatin"), l.id);
  });
  test(`${nombre}: sin cursivas (una familia tipográfica menos)`, () => {
    const fuentes = new Set(aligerarEstilo(carga(nombre)).layers.flatMap((l) => l.layout?.["text-font"] ?? []));
    assert.ok(![...fuentes].some((f) => f.includes("Italic")), [...fuentes].join());
  });
  test(`${nombre}: etiquetas de carreteras y pueblos no antes de zoom 9`, () => {
    for (const l of aligerarEstilo(carga(nombre)).layers) {
      if (l.type === "symbol" && /highway|road|village|suburb/.test(l.id)) assert.ok(l.minzoom >= 9, `${l.id}: ${l.minzoom}`);
    }
  });
  test(`${nombre}: LITE quita capas y elimina fuentes sin uso`, () => {
    const base = carga(nombre);
    const lite = aligerarEstilo(carga(nombre), { lite: true });
    assert.ok(lite.layers.length < base.layers.length);
    assert.ok(!("ne2_shaded" in lite.sources));
  });
}
