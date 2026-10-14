// Historia por país.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const H = await import("../../js/historia.js");

test("elige el artículo «Historia de …» correcto", () => {
  assert.equal(H.elegirArticulo(["Historia de Estados Unidos", ["Historia de Estados Unidos (libro)", "Historia de los Estados Unidos"]], "Estados Unidos"), "Historia de los Estados Unidos");
  assert.equal(H.elegirArticulo(["x", ["Historia de México", "Historia de la Ciudad de México"]], "México"), "Historia de México");
  assert.equal(H.elegirArticulo(["x", ["Mexicali"]], "México"), null);
});

test("etapas: solo nivel 1 y sin secciones de servicio", () => {
  const p = { parse: { sections: [{ toclevel: 1, line: "Época prehispánica", anchor: "Época_prehispánica" }, { toclevel: 2, line: "Olmecas", anchor: "Olmecas" },
    { toclevel: 1, line: "<i>Virreinato</i>", anchor: "Virreinato" }, { toclevel: 1, line: "Véase también", anchor: "V" }, { toclevel: 1, line: "Referencias", anchor: "R" }] } };
  assert.deepEqual(H.etapas(p), [{ titulo: "Época prehispánica", ancla: "Época_prehispánica" }, { titulo: "Virreinato", ancla: "Virreinato" }]);
});

test("fechas antes de Cristo y con precisión de día", () => {
  assert.equal(H.fechaHistorica("-0500-01-01T00:00:00Z", 9), "500 a. C.");
  assert.equal(H.fechaHistorica("+1810-09-16T00:00:00Z", 9), "1810");
  assert.match(H.fechaHistorica("1810-09-16T00:00:00Z", 11), /16 sep.* 1810/);
  assert.equal(H.anioDe("-0500-01-01T00:00:00Z"), -500);
});

test("hechos: orden cronológico, sin deporte ni etiquetas sin traducir, agrupados por época", () => {
  const r = H.hechos([["Q1", "Revolución mexicana", "1910-11-20T00:00:00Z", 11, "revolución", 69], ["Q2", "Fundación de Tenochtitlan", "1325-01-01T00:00:00Z", 9, "", 30],
    ["Q3", "Copa Mundial de Fútbol de 1970", "1970-05-31T00:00:00Z", 11, "", 82], ["Q4", "Q4", "1999-01-01T00:00:00Z", 9, "", 20], ["Q1", "Revolución mexicana", "1910-11-20T00:00:00Z", 11, "", 69]]);
  assert.deepEqual(r.map((h) => h.id), ["Q2", "Q1"]);
  assert.deepEqual(H.porEpoca(r).map((g) => g.titulo.slice(0, 9)), ["Antigüeda", "1900–1945"]);
});

test("ficha con atribución CC BY-SA y enlaces", () => {
  const html = H.htmlHistoria("México", { articulo: { titulo: "Historia de México", url: "https://es.wikipedia.org/wiki/Historia_de_M%C3%A9xico", extracto: "La historia <b>…</b>", etapas: [{ titulo: "Virreinato", ancla: "Virreinato" }] },
    hechos: [{ id: "Q1", nombre: "Revolución", fecha: "1910", anio: 1910, tipo: "" }], errores: [] });
  assert.match(html, /CC BY-SA 4\.0/);
  assert.match(html, /&lt;b&gt;/);  // el extracto se escapa
  assert.match(html, /Historia_de_M%C3%A9xico#Virreinato/);
});

test("listas representativas: une secciones y cronología, elige por Wikipedias y ordena por fecha", async () => {
  const H = await import("../../js/historia.js");
  const hs = H.hechos([["Q1", "Guerra de Reforma", "+1857-12-17T00:00:00Z", 11, "guerra", "Guerra de Reforma", 30],
    ["Q2", "Terremoto de 1985", "+1985-09-19T00:00:00Z", 11, "terremoto", "", 40]]);
  const l = H.listaRepresentativa([["Q3", "Revolución mexicana", "+1910-11-20T00:00:00Z", "revolución", "Revolución mexicana", 90],
    ["Q4", "Q4", "", "guerra", "", 99], ["Q5", "Guerra menor", "+1700-01-01T00:00:00Z", "guerra", "", 1]],
    hs, new Set(["guerra", "revolución"]), 2);
  assert.deepEqual(l.elegidos.map((x) => x.nombre), ["Guerra de Reforma", "Revolución mexicana"]); // sin terremoto ni «Q4»; corta por n y ordena por fecha
  assert.equal(l.total, 3);
  assert.match(l.elegidos[1].url, /es\.wikipedia\.org\/wiki\/Revoluci%C3%B3n_mexicana/);
  const o = H.listaOrganismos([["Q1065", "Organización de las Naciones Unidas", "+1945-11-07T00:00:00Z", "Organización de las Naciones Unidas", 300],
    ["Q7809", "UNESCO", "", "", 200], ["Q1065", "duplicado", "", "", 1]]);
  assert.deepEqual(o.map((x) => x.nombre), ["Organización de las Naciones Unidas", "UNESCO"]);
  assert.equal(o[0].desde, "1945");
  assert.match(o[1].url, /wikidata\.org\/wiki\/Q7809/);
});

test("ficha de historia con secciones de conflictos, tratados y organismos", async () => {
  const H = await import("../../js/historia.js");
  const c = { elegidos: [{ id: "Q3", nombre: "Revolución <x>", fecha: "1910", tipo: "revolución", url: "https://es.wikipedia.org/wiki/R" }], total: 5 };
  const h = H.htmlHistoria("México", { articulo: null, hechos: [], conflictos: c, tratados: { elegidos: [], total: 0 }, organismos: [{ nombre: "ONU", desde: "1945", url: "u" }], wpError: null, errores: [] });
  assert.match(h, /Guerras, conflictos, revoluciones e independencia \(1 más relevantes de 5\)/);
  assert.match(h, /Revolución &lt;x&gt;/);
  assert.doesNotMatch(h, /Tratados y acuerdos/); // vacía: no se muestra
  assert.match(h, /Organismos y alianzas de los que es miembro \(1\)/);
});
