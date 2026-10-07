// Genera la capa base de países y el gazetteer de países.
//
// Entrada:  world-atlas (Natural Earth 1:50m, dominio público) + i18n-iso-countries (nombres)
//           + ../config/regions.json (país -> región del área 10)
// Salida:   ../data/base/countries.geojson   polígonos con {iso3, nombre, region}
//           ../config/gazetteer.json         centroide, nombres ES/EN y región por país
//
// Uso:  cd tools && npm ci && npm run countries
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { presimplify, simplify, quantile } from "topojson-simplify";

const require = createRequire(import.meta.url);
const countries = require("i18n-iso-countries");
countries.registerLocale(require("i18n-iso-countries/langs/es.json"));
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
// Simplificación Visvalingam: conserva el 20 % de los vértices más significativos.
// Mantiene los países pequeños de la escala 1:50m y reduce el archivo a una fracción.
const topoRaw = require("world-atlas/countries-50m.json");
const pre = presimplify(topoRaw);
const topo = simplify(pre, quantile(pre, 0.2));
const regions = JSON.parse(readFileSync("../config/regions.json", "utf8")).regiones;

// Natural Earth deja sin código ISO a algunos territorios; se asignan aquí.
const SIN_ID = {
  "Somaliland": "SOM",
  "Kosovo": "XKX",
  "N. Cyprus": "CYP",
  "Indian Ocean Ter.": "CXR",
  "Siachen Glacier": "IND",
};
const NOMBRES_EXTRA = { XKX: { es: "Kosovo", en: "Kosovo" }, TWN: { es: "Taiwán", en: "Taiwan" } };

const regionDe = {};
for (const [id, r] of Object.entries(regions)) for (const iso of r.paises) regionDe[iso] = id;

const PREC = 100; // 2 decimales ≈ 1.1 km: suficiente para un mapa mundial y reduce el peso.
const round = (c) => (typeof c[0] === "number" ? [Math.round(c[0] * PREC) / PREC, Math.round(c[1] * PREC) / PREC] : c.map(round));

// Centroide del anillo exterior más grande (aproxima un punto "dentro" del país principal).
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function ringCentroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f;
  }
  return a ? [x / (3 * a), y / (3 * a)] : r[0];
}
function labelPoint(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = polys[0][0], bestA = 0;
  for (const p of polys) { const a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p[0]; } }
  return ringCentroid(best);
}

// Al simplificar se pierden los vértices sobre el meridiano 180°, y algunos anillos (Rusia, Fiyi)
// "saltan" de -180 a 180 dibujando una línea recta a través de todo el mapa. Se corrige
// desenvolviendo la longitud (lon < 0 -> lon + 360); MapLibre dibuja bien longitudes > 180.
function desenvolver(ring) {
  const salta = ring.some((c, i) => i && Math.abs(c[0] - ring[i - 1][0]) > 180);
  return salta ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : ring;
}
function corregirAntimeridiano(g) {
  if (g.type === "Polygon") return { type: g.type, coordinates: g.coordinates.map(desenvolver) };
  return { type: g.type, coordinates: g.coordinates.map((p) => p.map(desenvolver)) };
}

const fc = feature(topo, topo.objects.countries);
const out = { type: "FeatureCollection", features: [] };
const gaz = {};
const sinRegion = [];

for (const f of fc.features) {
  // La Antártida rodea el polo y no se puede desenvolver; se omite (no aporta al mapa de eventos).
  if (!f.geometry || f.id === "010") continue;
  const iso3 = f.id ? countries.numericToAlpha3(f.id) : SIN_ID[f.properties.name];
  if (!iso3) { console.warn("sin ISO3:", f.id, f.properties.name); continue; }
  const es = NOMBRES_EXTRA[iso3]?.es || countries.getName(iso3, "es") || f.properties.name;
  const en = NOMBRES_EXTRA[iso3]?.en || countries.getName(iso3, "en") || f.properties.name;
  const region = regionDe[iso3] || null;
  if (!region && iso3 !== "ATA") sinRegion.push(iso3);
  out.features.push({ type: "Feature", properties: { iso3, nombre: es, region }, geometry: corregirAntimeridiano({ type: f.geometry.type, coordinates: round(f.geometry.coordinates) }) });
  if (!gaz[iso3]) {
    const [lon, lat] = labelPoint(f.geometry);
    gaz[iso3] = { es, en, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, region };
  }
}

writeFileSync("../data/base/countries.geojson", JSON.stringify(out));
writeFileSync("../config/gazetteer.json", JSON.stringify({
  descripcion: "Centroide aproximado (anillo más grande), nombres y región por país. Generado por tools/build_countries.mjs desde Natural Earth 1:50m. Se usa para geocodificar eventos sin coordenadas.",
  paises: Object.fromEntries(Object.entries(gaz).sort()),
}, null, 1));
console.log(`países: ${out.features.length} · gazetteer: ${Object.keys(gaz).length}`);
if (sinRegion.length) console.log("sin región asignada:", sinRegion.join(", "));
