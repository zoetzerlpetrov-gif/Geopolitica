import { test } from "node:test";
import assert from "node:assert/strict";
import { ANIOS, urlAnio, atribucion, siguiente, Timelapse, htmlBarra } from "../../js/timelapse.js";

test("años, URL de EOX y atribución", () => {
  assert.deepEqual(ANIOS, [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  assert.equal(urlAnio(2020), "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg");
  assert.match(atribucion(2020), /EOX IT Services GmbH \(contiene datos modificados de Copernicus Sentinel 2020\)/);
  assert.equal(siguiente(ANIOS.length - 1), 0);
});

test("solo quedan instaladas la capa del año y la del siguiente", () => {
  const capas = new Map(), fuentes = new Set(), estados = [];
  const map = { getSource: (id) => fuentes.has(id), getLayer: (id) => capas.has(id), addSource: (id) => fuentes.add(id), removeSource: (id) => fuentes.delete(id),
    addLayer: (l) => capas.set(l.id, l.paint["raster-opacity"]), removeLayer: (id) => capas.delete(id), setPaintProperty: (id, _k, v) => capas.set(id, v) };
  const t = new Timelapse(map, { onCambio: (s) => estados.push(s) });
  t.activar();
  assert.deepEqual([...capas.entries()], [["tl-2025", 1], ["tl-2018", 0]]);
  t.setIndice(2);
  assert.deepEqual([...capas.keys()].sort(), ["tl-2020", "tl-2021"]);
  assert.equal(capas.get("tl-2020"), 1);
  assert.equal(estados.at(-1).anio, 2020);
  t.desactivar();
  assert.equal(capas.size + fuentes.size, 0);
  assert.match(htmlBarra(), /max="7"/);
});
