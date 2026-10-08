// Pruebas del registro de capas: solo se dibujan categorías "dibujable" y nunca personas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { familiasDibujables, urlFuente } from "../../js/capas.js";

const leer = (r) => JSON.parse(readFileSync(new URL(`../../${r}`, import.meta.url)));
const catalogo = leer("config/entities.json");
const capasCfg = leer("config/capas.json");

test("ninguna familia dibujable contiene subtipos de personas ni tipo 'ficha'", () => {
  const fams = familiasDibujables(catalogo, capasCfg, { familias: {} });
  const personas = new Set(catalogo.categorias.find((c) => c.id === "personas").subtipos.map((s) => s.id));
  for (const f of fams) {
    assert.notEqual(f.categoria, "personas");
    for (const s of f.subtipos) {
      assert.notEqual(s.tipo_capa, "ficha", `${f.id}/${s.id}`);
      assert.ok(!(personas.has(s.id) && f.categoria === "personas"));
    }
  }
});

test("aunque alguien declare una capa de personas en capas.json, no se dibuja", () => {
  const trampa = { familias: [...capasCfg.familias, { id: "personas_mapa", categoria: "personas", geometria: "punto", fuente: "wikidata", habilitada: true }] };
  const fams = familiasDibujables(catalogo, trampa, { familias: { personas_mapa: { estado: "ok", archivo: "x" } } });
  assert.ok(!fams.some((f) => f.id === "personas_mapa"));
});

test("una familia solo está disponible si está habilitada y construida sin error", () => {
  const ok = familiasDibujables(catalogo, capasCfg, { familias: { aeropuertos: { estado: "ok", archivo: "data/capas/aeropuertos.pmtiles" } } });
  assert.equal(ok.find((f) => f.id === "aeropuertos").disponible, true);
  assert.equal(ok.find((f) => f.id === "puertos").disponible, false);
  const err = familiasDibujables(catalogo, capasCfg, { familias: { aeropuertos: { estado: "error" } } });
  assert.equal(err.find((f) => f.id === "aeropuertos").disponible, false);
  const parcial = familiasDibujables(catalogo, capasCfg, { familias: { militar: { estado: "parcial", archivo: "data/capas/militar.pmtiles" } } });
  assert.equal(parcial.find((f) => f.id === "militar").disponible, true, "parcial se muestra con aviso");
  const desh = familiasDibujables(catalogo, capasCfg, { familias: { cables: { estado: "ok" } } });
  assert.equal(desh.find((f) => f.id === "cables").disponible, false, "cables está deshabilitada en capas.json");
});

test("cada familia habilitada tiene subtipos con zoom mínimo", () => {
  for (const f of familiasDibujables(catalogo, capasCfg, { familias: {} }).filter((x) => x.habilitada)) {
    assert.ok(f.subtipos.length > 0, f.id);
    for (const s of f.subtipos) assert.equal(typeof s.zoom_min, "number", `${f.id}/${s.id}`);
  }
});

test("enlaces a la fuente original", () => {
  assert.equal(urlFuente("osm:n123"), "https://www.openstreetmap.org/node/123");
  assert.equal(urlFuente("osm:w9"), "https://www.openstreetmap.org/way/9");
  assert.equal(urlFuente("ourairports:MMMX"), "https://ourairports.com/airports/MMMX/");
  assert.equal(urlFuente("raro:1"), null);
});
