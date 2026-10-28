import { test } from "node:test";
import assert from "node:assert/strict";
import { grupoDe, aplicar, capaEstados, ID_ESTADOS, POR_OMISION } from "../../js/base_capas.js";

test("etiquetas del mapa base: cada capa de OpenFreeMap cae en su grupo", () => {
  const casos = { place_country_1: "paises", "label_country_2": "paises", "paises-nombre": "paises", place_state: "estados", place_city: "ciudades",
    place_town: "ciudades", "sat-lugares": "ciudades", highway_name_motorway: "calles", "sat-calles-nombre": "calles", water_name_point_label: "agua",
    waterway_line_label: "agua", poi_r1: "otros", airport: "otros", mountain_peak: "otros", building: "otros" };
  for (const [id, g] of Object.entries(casos)) assert.equal(grupoDe(id), g, id);
  assert.equal(grupoDe("clusters"), null);
});

test("aplicar: oculta solo etiquetas del mapa base y agrega/quita contornos de estados", () => {
  const capas = [
    { id: "agua", type: "fill", source: "openmaptiles" },
    { id: "place_city", type: "symbol", source: "openmaptiles" },
    { id: "place_country_1", type: "symbol", source: "openmaptiles" },
    { id: "clusters-cuenta", type: "symbol", source: "eventos" },  // del monitor: no se toca
  ];
  const vis = {};
  const map = {
    getStyle: () => ({ sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" }, eventos: { type: "geojson" } }, layers: capas }),
    getLayoutProperty: (id) => vis[id], setLayoutProperty: (id, _p, v) => { vis[id] = v; },
    getLayer: (id) => capas.find((l) => l.id === id), addLayer: (l, antes) => capas.splice(capas.findIndex((x) => x.id === antes), 0, l),
    removeLayer: (id) => capas.splice(capas.findIndex((x) => x.id === id), 1),
  };
  const cfg = { estados: true, etiquetas: { ...POR_OMISION.etiquetas, ciudades: false } };
  assert.equal(aplicar(map, cfg), true);
  assert.equal(vis.place_city, "none");
  assert.equal(vis.place_country_1 ?? "visible", "visible");
  assert.equal(vis["clusters-cuenta"], undefined);
  assert.equal(capas[1].id, ID_ESTADOS);  // debajo de la primera etiqueta del mapa base
  assert.deepEqual(capas[1].filter[1], ["==", ["get", "admin_level"], 4]);
  aplicar(map, { ...cfg, estados: false });
  assert.ok(!capas.some((l) => l.id === ID_ESTADOS));
  assert.equal(capaEstados(undefined, false), null);
});
