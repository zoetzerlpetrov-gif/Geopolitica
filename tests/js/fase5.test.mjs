import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Z from "../../js/inmuebles-zonas.js";

const cat = JSON.parse(readFileSync(new URL("../../config/inmuebles_zonas_mx.json", import.meta.url)));
const pedidas = ["Mérida", "Manzanillo", "Pachuca de Soto", "Acapulco", "Ixtapa", "Zihuatanejo", "Puerto Escondido", "Santa María Huatulco", "Boca del Río", "Morelia"];

test("zonas: todas las ciudades pedidas, ids únicos, coordenadas dentro de México", () => {
  const ciudades = Z.ciudadesZonas(cat);
  for (const c of pedidas) assert.ok(ciudades.includes(c), c);
  assert.equal(new Set(cat.zonas.map((z) => z.id)).size, cat.zonas.length);
  for (const z of cat.zonas) {
    assert.ok(z.lat > 14 && z.lat < 33 && z.lon > -118 && z.lon < -86, z.id);
    assert.ok(z.radio_km > 0 && z.tipos.length && z.colonias.length && z.riesgos.length, z.id);
    for (const r of z.referencias) assert.match(r.url, /^https:\/\//);
  }
});

test("zonas: Mérida excluye el sur salvo haciendas", () => {
  const mer = cat.zonas.filter((z) => z.ciudad === "Mérida" && !z.tipos.includes("hacienda"));
  assert.ok(mer.every((z) => /sur de Mérida/.test(z.excluir) && /haciendas/.test(z.excluir)));
  assert.ok(cat.zonas.some((z) => z.tipos.includes("hacienda")));
});

test("enlaces: solo búsquedas, un enlace por portal más dos generales", () => {
  const z = cat.zonas.find((x) => x.id === "mer-cholul-conkal");
  const l = Z.enlacesZona(z, cat.portales, { tipo: "terreno", colonia: "Cholul" });
  assert.equal(l.length, cat.portales.length + 2);
  assert.ok(l.every(([, u]) => u.startsWith("https://www.google.com/search?q=")));
  assert.match(decodeURIComponent(l[0][1]), /site:inmuebles24\.com terreno en venta Cholul Mérida Yucatán/);
});

test("ofertas en zona: radio y orden por distancia", () => {
  const z = { lat: 21.05, lon: -89.55, radio_km: 7 };
  const o = Z.ofertasEnZona(z, [{ id: "lejos", lat: 20.5, lon: -89 }, { id: "b", lat: 21.07, lon: -89.55 }, { id: "a", lat: 21.051, lon: -89.551 }, { id: "sin", lat: null, lon: null }]);
  assert.deepEqual(o.map((x) => x.id), ["a", "b"]);
});

test("filtro y html escapan texto", () => {
  assert.ok(Z.filtrarZonas(cat, { tipo: "hacienda" }).every((z) => z.tipos.includes("hacienda")));
  const z = { ...cat.zonas[0], zona: "<script>x</script>" };
  const h = Z.htmlZona(z, cat.portales, []);
  assert.ok(!h.includes("<script>x"));
  assert.match(h, /data-evaluar=/);
});

const mundo = JSON.parse(readFileSync(new URL("../../config/inmuebles_zonas_mundo.json", import.meta.url)));

test("mundo: todos los países pedidos, ids únicos con México, idioma y portales por país", () => {
  const pedidos = ["ARE", "ITA", "MLT", "FRA", "CHE", "AUT", "SMR", "RUS", "NOR", "SWE", "FIN", "DEU", "LIE", "GRC", "USA", "CAN", "ISL", "LUX", "BEL", "NLD", "DNK", "POL", "EST", "LVA", "LTU", "ESP", "MNE"];
  const enZonas = new Set(mundo.zonas.map((z) => z.pais_iso3));
  for (const iso of pedidos) { assert.ok(enZonas.has(iso), iso); assert.ok(mundo.paises[iso].portales.length >= 2, iso); assert.ok(mundo.venta[mundo.paises[iso].idioma], iso); }
  const u = Z.unirCatalogos(cat, mundo);
  assert.equal(new Set(u.zonas.map((z) => z.id)).size, u.zonas.length);
  for (const z of mundo.zonas) {
    assert.ok(Math.abs(z.lat) <= 90 && Math.abs(z.lon) <= 180 && z.radio_km > 0, z.id);
    for (const t of z.tipos) assert.ok(mundo.tipos_idioma[mundo.paises[z.pais_iso3].idioma][t], `${z.id} ${t}`);
  }
  for (const c of ["Positano", "Taormina", "Zermatt", "Hallstatt", "Courchevel", "Frisco, TX", "Niagara Falls, ON", "Rovaniemi"]) assert.ok(mundo.zonas.some((z) => z.ciudad === c), c);
  assert.ok(mundo.zonas.some((z) => z.id === "rus-anapa" && z.radio_km >= 10));
});

test("mundo: búsqueda en el idioma del país y nombre del país en la tarjeta", () => {
  const u = Z.unirCatalogos(cat, mundo);
  const z = u.zonas.find((x) => x.id === "ita-positano");
  const l = Z.enlacesZona(z, u.paises.ITA.portales, { tipo: "departamento", idioma: u.idiomaDe("ITA") });
  assert.match(decodeURIComponent(l[0][1]), /site:immobiliare\.it appartamento vendita Positano/);
  assert.equal(u.idiomaDe("MEX"), null);
  const h = Z.htmlZona(z, u.paises.ITA.portales, [], "", { idioma: u.idiomaDe("ITA"), pais: u.paises.ITA, compra: "Prueba" });
  assert.match(h, /Italia · <b>Positano/);
  assert.match(h, /Para una persona mexicana:<\/b> Prueba/);
  assert.equal(Z.filtrarZonas(u, { pais: "AUT" }).length, 3);
});

import * as T from "../../js/tecnologia.js";
const curadas = JSON.parse(readFileSync(new URL("../../config/extranjeras_curadas.json", import.meta.url)));

test("empresas extranjeras: Wikidata + GLEIF + lista curada; ODIS Asversa aparece y trae fuentes", () => {
  const wd = { fuente: "Wikidata (CC0)", empresas: [{ matriz: "Iberdrola", matriz_qid: "Q1", iso: "ES", pais: "España", filial: "", industrias: ["energía"], vias: ["opera_en_mexico"] }] };
  const gl = { empresas: [{ filial: "Banco X Mexico SA", lei: "L1", matriz: "Banco X AG", matriz_lei: "L2", iso: "DE", pais: "Alemania", industrias: [] }] };
  const d = T.unirExtranjeras(wd, gl, curadas);
  assert.equal(d.fuente, "Wikidata + GLEIF + lista curada");
  const odis = T.filtrarExtranjeras(d, { q: "asversa" });
  assert.equal(odis.total, 1);
  const h = T.htmlExtranjeras(d, odis);
  assert.match(h, /bnamericas\.com/);
  assert.match(h, /agregada a mano con fuente pública/);
  assert.equal(T.filtrarExtranjeras(d, { iso: "IL" }).total, curadas.empresas.length);
  assert.match(T.htmlExtranjeras(d, T.filtrarExtranjeras(d, { q: "banco x" })), /search\.gleif\.org\/#\/record\/L1/);
  for (const c of curadas.empresas) for (const [, u] of c.fuentes) assert.match(u, /^https:\/\//);
});

test("empresas extranjeras: sin resultado ofrece búsquedas para seguir investigando", () => {
  const h = T.htmlExtranjeras({ empresas: [] }, { total: 0, filas: [] }, undefined, "Empresa Inexistente", "Israel");
  assert.match(h, /google\.com\/search/);
  assert.match(decodeURIComponent(h), /cámara de comercio México Israel/);
  assert.deepEqual(T.enlacesSinResultado("ab"), []);
});
