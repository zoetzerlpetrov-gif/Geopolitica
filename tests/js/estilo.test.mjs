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

// Contraste: luminancia relativa (WCAG) de un color «#rrggbb».
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const [nombre, tono, fondo] of [["dark", "oscuro", "#0d1b24"], ["positron", "claro", "#f2f3f0"]]) {
  test(`${nombre}: todas las etiquetas del mapa base contrastan al menos 4.5:1 con el fondo`, () => {
    const st = aligerarEstilo(carga(nombre), { tono });
    const etiquetas = st.layers.filter((l) => l.type === "symbol" && l.layout?.["text-field"]);
    assert.ok(etiquetas.length > 5);
    for (const l of etiquetas) {
      assert.ok(razon(l.paint["text-color"], fondo) >= 4.5, `${l.id}: ${l.paint["text-color"]}`);
      assert.ok(l.paint["text-halo-width"] <= 1.3 && l.paint["text-halo-blur"] <= 0.5, l.id);
    }
  });
}
test("sin tono, los colores del estilo original no cambian", () => {
  const st = aligerarEstilo(carga("dark"));
  assert.equal(st.layers.find((l) => l.id === "place_city").paint["text-color"], "rgb(101,101,101)");
});

test("satélite: sin llave solo Sentinel-2; con llave, Esri nítido de cerca y su atribución", async () => {
  const { estiloSatelite, ESRI_DESDE } = await import("../../js/map.js");
  const sin = estiloSatelite();
  assert.ok(!sin.sources.esri && !sin.layers.some((l) => l.id === "satelite-esri"));
  const con = estiloSatelite("abc/123");
  assert.equal(con.sources.esri.maxzoom, 19);
  assert.match(con.sources.esri.tiles[0], /World_Imagery.*token=abc%2F123$/);
  assert.match(con.sources.esri.attribution, /Powered by Esri/);
  const capa = con.layers.find((l) => l.id === "satelite-esri");
  assert.equal(capa.minzoom, ESRI_DESDE);
  assert.ok(con.layers.indexOf(capa) === con.layers.findIndex((l) => l.id === "satelite") + 1, "va justo encima de Sentinel-2");
});

test("relieve: elevación coloreada y sombreado debajo del agua y los nombres", async () => {
  const { conRelieve, TINTAS_RELIEVE } = await import("../../js/map.js");
  const base = { version: 8, sources: { x: { type: "vector" } }, layers: [{ id: "fondo", type: "background" }, { id: "landcover", type: "fill", source: "x" },
    { id: "water", type: "fill", source: "x" }, { id: "nombres", type: "symbol", source: "x" }] };
  const s = conRelieve(base);
  assert.deepEqual(s.layers.map((l) => l.id), ["fondo", "landcover", "relieve-color", "relieve-sombra", "water", "nombres"]);
  assert.equal(s.sources["dem-relieve"].encoding, "terrarium");
  assert.equal(base.layers.length, 4); // no modifica el estilo original
  assert.ok(TINTAS_RELIEVE.every(([m], i, a) => i === 0 || m > a[i - 1][0])); // alturas en orden creciente
});
