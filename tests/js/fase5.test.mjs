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
