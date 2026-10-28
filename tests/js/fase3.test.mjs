import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "../../js/tecnologia.js";
import * as L from "../../js/lugares.js";

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const PAT = json("config/patentes.json"), AG = json("config/tec_agencias.json"), CT = json("config/tec_crimen.json");

test("patentes: cada buscador recibe texto, clase, titular, país y año", () => {
  const e = Object.fromEntries(T.enlacesPatentes(PAT, { q: "drone swarm", titular: "Lockheed", pais: "us", cpc: "b64u", desde: "2020" }));
  const g = e[PAT.buscadores.find((b) => b.id === "google").nombre];
  assert.match(g, /^https:\/\/patents\.google\.com\/\?q=drone%20swarm&cpc=B64U&assignee=Lockheed&country=US&after=priority:20200101$/);
  const es = decodeURIComponent(e[PAT.buscadores.find((b) => b.id === "espacenet").nombre]);
  assert.ok(es.includes('ctxt all "drone swarm" AND cpc any "B64U" AND pa all "Lockheed" AND pd >= 20200101'));
  const ps = decodeURIComponent(e[PAT.buscadores.find((b) => b.id === "patentscope").nombre]);
  assert.ok(ps.endsWith("drone swarm AND IC:B64U AND PA:(Lockheed) AND OF:US"));
  for (const u of Object.values(e)) assert.ok(!u.includes("{"), u);
});

test("patentes: año inválido se ignora y sin filtros se pide escribir", () => {
  const [, g] = T.enlacesPatentes(PAT, { q: "radar", desde: "20x" })[0];
  assert.ok(!g.includes("after="));
  assert.match(T.htmlPatentes(PAT, { q: " " }), /Escribe una palabra/);
  assert.match(T.opcionesCpc(PAT), /<optgroup label="Defensa y armamento">/);
});

test("agencias: filtro por tipo y por texto, con ejemplos", () => {
  assert.ok(T.filtrarAgencias(AG, { tipo: "inteligencia" }).every((a) => a.tipo === "inteligencia"));
  const r = T.filtrarAgencias(AG, { q: "ghidra" });
  assert.deepEqual(r.map((a) => a.id), ["nsa"]);
  assert.match(T.htmlAgencias(r), /Ghidra/);
  assert.equal(T.filtrarAgencias(AG, { q: "gh" }).length, AG.agencias.length);  // menos de 3 letras: todas
  for (const a of AG.agencias) assert.match(a.url, /^https:\/\//);
});

test("crimen: catálogo defensivo con indicadores y contramedidas", () => {
  for (const t of CT.tecnologias) { assert.ok(t.indicadores.length && t.contramedidas.length, t.id); }
  assert.deepEqual(T.filtrarCrimen(CT, "EncroChat").map((t) => t.id), ["cifrados"]);
  assert.match(T.htmlCrimen(T.filtrarCrimen(CT, "NOM-107")), /Drones con explosivos/);
});

const EXT = { fuente: "Wikidata (CC0)", empresas: [
  { matriz: "Nestlé", matriz_qid: "Q160746", pais: "Suiza", iso: "CH", filial: "Nestlé México", filial_qid: "Q1", industrias: ["alimentos"], web: "https://www.nestle.com", vias: ["filial_en_mexico"] },
  { matriz: "Toyota", matriz_qid: "Q53268", pais: "Japón", iso: "JP", filial: "", filial_qid: "", industrias: ["automotriz"], web: "", vias: ["opera_en_mexico"] },
  { matriz: "Honda", matriz_qid: "Q9584", pais: "Japón", iso: "JP", filial: "Honda de México", filial_qid: "Q2", industrias: ["automotriz", "motocicletas"], web: "", vias: ["declara_filial"] },
] };

test("extranjeras: países, industrias y filtros", () => {
  assert.deepEqual(T.paisesExtranjeras(EXT).map((p) => [p.iso, p.n]), [["JP", 2], ["CH", 1]]);
  assert.equal(T.industriasExtranjeras(EXT)[0], "automotriz");
  assert.equal(T.filtrarExtranjeras(EXT, { iso: "JP" }).total, 2);
  assert.equal(T.filtrarExtranjeras(EXT, { industria: "motocicletas" }).filas[0].matriz, "Honda");
  assert.equal(T.filtrarExtranjeras(EXT, { q: "nestle" }).total, 1);
  const h = T.htmlExtranjeras(EXT, T.filtrarExtranjeras(EXT, {}), (iso) => ({ JP: "Japón", CH: "Suiza" })[iso]);
  assert.match(h, /3 registro/); assert.match(h, /Nestlé México/); assert.match(h, /wikidata\.org\/wiki\/Q53268/);
  assert.match(T.htmlExtranjeras(EXT, { total: 0, filas: [] }), /GLEIF/);
});

test("GLEIF: URL filtrada a México y matriz extranjera marcada", () => {
  const u = new URL(T.urlGleifMx(" bimbo "));
  assert.equal(u.searchParams.get("filter[fulltext]"), "bimbo");
  assert.equal(u.searchParams.get("filter[entity.legalAddress.country]"), "MX");
  const f = T.filaGleif({ id: "LEI1", attributes: { entity: { legalName: { name: "Ejemplo SA de CV" }, legalAddress: { city: "Monterrey" }, status: "ACTIVE" } } });
  f.matriz = T.matrizGleif({ data: { id: "LEI2", attributes: { entity: { legalName: { name: "Parent AG" }, legalAddress: { country: "DE" } } } } });
  assert.match(T.htmlGleif([f]), /Parent AG.*\(DE\).*extranjera/s);
  assert.equal(T.matrizGleif({ errors: [] }), null);
});

test("Photon: URL, idioma, cercanía y lectura de resultados", () => {
  const u = new URL(L.urlPhoton(" Paseo de la Reforma ", { lat: 19.4326, lon: -99.1332, idioma: "es" }));
  assert.equal(u.searchParams.get("q"), "Paseo de la Reforma");
  assert.equal(u.searchParams.get("lang"), null);  // Photon no traduce al español: nombre local
  assert.equal(u.searchParams.get("lat"), "19.433");
  assert.equal(new URL(L.urlPhoton("Paris", { idioma: "fr" })).searchParams.get("lang"), "fr");
  const ls = L.lugaresDe({ features: [
    { geometry: { coordinates: [-99.16, 19.42] }, properties: { name: "Ángel de la Independencia", osm_value: "monument", city: "Ciudad de México", country: "México" } },
    { geometry: { coordinates: [-89.62, 20.97] }, properties: { name: "Mérida", type: "city", state: "Yucatán", country: "México", extent: [-89.8, 21.1, -89.5, 20.8] } },
    { geometry: { coordinates: [] }, properties: { name: "sin coordenadas" } },
  ] });
  assert.equal(ls.length, 2);
  assert.equal(ls[0].tipo, "monument");
  assert.equal(ls[0].detalle, "Ciudad de México, México");
  assert.deepEqual(ls[1].bbox, [[-89.8, 20.8], [-89.5, 21.1]]);
  assert.equal(ls[1].tipo, "Ciudad");
  assert.match(L.htmlLugares(ls), /OpenStreetMap/);
  assert.ok(!L.listoParaBuscar("ab") && L.listoParaBuscar("abc"));
});
