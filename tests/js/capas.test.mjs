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

test("una capa cuya actualización falló sigue visible con su versión anterior", async () => {
  const { familiasDibujables } = await import("../../js/capas.js");
  const catalogo = JSON.parse((await import("node:fs")).readFileSync(new URL("../../config/entities.json", import.meta.url)));
  const capas = JSON.parse((await import("node:fs")).readFileSync(new URL("../../config/capas.json", import.meta.url)));
  const fam = capas.familias.find((f) => f.habilitada && f.id === "recursos");
  const man = { familias: { recursos: { estado: "desactualizada", archivo: "data/capas/recursos.pmtiles", objetos: 10, bytes: 1, error: "falló" } } };
  const f = familiasDibujables(catalogo, capas, man).find((x) => x.id === fam.id);
  assert.equal(f.disponible, true);
  const sinArchivo = { familias: { recursos: { estado: "error", error: "falló" } } };
  assert.equal(familiasDibujables(catalogo, capas, sinArchivo).find((x) => x.id === fam.id).disponible, false);
});

test("ficha de cámara: enlace oficial, tipo de operador y sin imagen copiada", async () => {
  const { htmlFichaCamara } = await import("../../js/capas.js");
  const html = htmlFichaCamara({ n: "Etna", st: "volcanes_clima", o: "INGV", t: "organismo_publico", x: "https://www.ct.ingv.it", v: "ok (2026-10-08)", nota: "<b>x</b>" }, { nombre: { es: "Volcanes y clima" } });
  assert.match(html, /href="https:\/\/www.ct.ingv.it"/);
  assert.match(html, /Organismo público/);
  assert.ok(!html.includes("<img") && html.includes("&lt;b&gt;"));
  assert.doesNotMatch(html, /sin confirmar/);
  const mala = htmlFichaCamara({ n: "x", t: "operador_turistico", x: "javascript:alert(1)", v: "HTTP 404 (2026-10-08)" });
  assert.ok(mala.includes('href="#"') && mala.includes("sin confirmar") && mala.includes("Operador turístico"));
});

test("ficha de cámara de tráfico: imágenes del operador (también como texto JSON) y licencia", async () => {
  const { htmlFichaCamara } = await import("../../js/capas.js");
  const html = htmlFichaCamara({ n: "vt1", st: "trafico", o: "Fintraffic / digitraffic.fi", t: "organismo_publico", x: "https://www.digitraffic.fi/en/road-traffic/",
    imgs: JSON.stringify(["https://weathercam.digitraffic.fi/C0150200.jpg", "http://inseguro/x.jpg"]), lic: "CC BY 4.0" });
  assert.match(html, /<img src="https:\/\/weathercam.digitraffic.fi\/C0150200.jpg\?t=\d+"/);
  assert.equal((html.match(/<img /g) || []).length, 1); // la URL http se descarta
  assert.match(html, /licencia CC BY 4.0/);
  assert.doesNotMatch(html, /sin confirmar/);
});
