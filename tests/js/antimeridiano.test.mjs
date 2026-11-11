import { test } from "node:test";
import assert from "node:assert/strict";
import { cortarLinea, desenvolverAnillo, geometriaSegura, geojsonSeguro, protegerMapLibre } from "../../js/antimeridiano.js";
import { CAPAS, preparar } from "../../js/riesgos.js";

const saltoMax = (pts) => Math.max(0, ...pts.slice(1).map((c, i) => Math.abs(c[0] - pts[i][0])));
function sinRayas(g) {
  const lineas = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates
    : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
  return lineas.every((l) => saltoMax(l) <= 180);
}

test("pronóstico que cruza la línea de cambio de fecha (caso ciclón Pena) → dos tramos que terminan en ±180°", () => {
  const g = geometriaSegura({ type: "LineString", coordinates: [[175, 10], [177.5, 11], [-176.5, 13], [-172, 15]] });
  assert.equal(g.type, "MultiLineString");
  assert.equal(g.coordinates.length, 2);
  assert.deepEqual(g.coordinates[0].at(-1).map((x) => +x.toFixed(3)), [180, 11.833]);
  assert.deepEqual(g.coordinates[1][0].map((x) => +x.toFixed(3)), [-180, 11.833]);
  assert.ok(sinRayas(g));
});

test("en sentido contrario (de oeste a este por el Pacífico) también se corta", () => {
  const t = cortarLinea([[-178, 0], [178, 4]]);
  assert.equal(t.length, 2);
  assert.equal(t[0].at(-1)[0], -180); assert.equal(t[1][0][0], 180);
  assert.equal(t[0].at(-1)[1], 2);
});

test("líneas y polígonos normales no se tocan (misma referencia)", () => {
  const l = { type: "LineString", coordinates: [[-100, 20], [-90, 25]] };
  const p = { type: "Polygon", coordinates: [[[-10, 0], [10, 0], [10, 10], [-10, 0]]] };
  const pt = { type: "Point", coordinates: [179.9, 0] };
  for (const g of [l, p, pt]) assert.equal(geometriaSegura(g), g);
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: l, properties: {} }] };
  assert.equal(geojsonSeguro(fc), fc);
  assert.equal(geojsonSeguro("data/x.geojson"), "data/x.geojson");
});

test("polígono que cruza (radio de viento en el Pacífico) → anillo continuo; rectángulo de mundo completo → igual", () => {
  const r = desenvolverAnillo([[178, 0], [-178, 0], [-178, 4], [178, 4], [178, 0]]);
  assert.deepEqual(r.map((c) => c[0]), [178, 182, 182, 178, 178]);
  const mundo = [[-180, -10], [180, -10], [180, 10], [-180, 10], [-180, -10]];
  assert.equal(desenvolverAnillo(mundo), mundo);
  assert.ok(sinRayas(geometriaSegura({ type: "MultiPolygon", coordinates: [[[[178, 0], [-178, 0], [-178, 4], [178, 0]]]] })));
});

test("todas las capas de riesgos pasan por la protección (preparar)", () => {
  const capa = CAPAS.find((c) => c.id === "ciclones");
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "storm_track", kind: "forecast", storm_name: "Pena" },
    geometry: { type: "LineString", coordinates: [[177.5, 11], [-176.5, 13]] } }] };
  const gj = preparar(capa, fc);
  assert.ok(sinRayas(gj.features[0].geometry));
  assert.equal(fc.features[0].geometry.type, "LineString", "no modifica los datos originales");
});

test("protegerMapLibre corrige addSource y setData de cualquier fuente GeoJSON", () => {
  const vistos = [];
  class Map { addSource(id, s) { vistos.push(s.data); } }
  class GeoJSONSource { setData(d) { vistos.push(d); } }
  const ml = { Map, GeoJSONSource };
  protegerMapLibre(ml); protegerMapLibre(ml); // dos veces no lo envuelve doble
  const linea = { type: "LineString", coordinates: [[179, 0], [-179, 0]] };
  new Map().addSource("a", { type: "geojson", data: { type: "Feature", geometry: linea, properties: {} } });
  new GeoJSONSource().setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: linea, properties: {} }] });
  new Map().addSource("b", { type: "geojson", data: "data/archivo.geojson" });
  assert.equal(vistos[0].geometry.type, "MultiLineString");
  assert.equal(vistos[1].features[0].geometry.type, "MultiLineString");
  assert.equal(vistos[2], "data/archivo.geojson");
});
