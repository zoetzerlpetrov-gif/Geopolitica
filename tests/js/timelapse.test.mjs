import { test } from "node:test";
import assert from "node:assert/strict";
import { ANIOS, FUENTES, urlAnio, atribucion, siguiente, diaValido, Timelapse, htmlBarra } from "../../js/timelapse.js";

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
  assert.deepEqual([...capas.entries()], [["tl-eox-2025", 1], ["tl-eox-2018", 0]]);
  t.setIndice(2);
  assert.deepEqual([...capas.keys()].sort(), ["tl-eox-2020", "tl-eox-2021"]);
  assert.equal(capas.get("tl-eox-2020"), 1);
  assert.equal(estados.at(-1).anio, 2020);
  t.desactivar();
  assert.equal(capas.size + fuentes.size, 0);
  assert.match(htmlBarra(), /max="7"/);
});

test("respaldo NASA: mismo año, día del año y cambio automático tras errores de EOX", () => {
  const capas = new Map(), fuentes = new Map(), oyentes = {}, avisos = [];
  const map = { on: (ev, f) => { oyentes[ev] = f; }, getSource: (id) => fuentes.has(id), getLayer: (id) => capas.has(id), addSource: (id, s) => fuentes.set(id, s), removeSource: (id) => fuentes.delete(id),
    addLayer: (l) => capas.set(l.id, l.paint["raster-opacity"]), removeLayer: (id) => capas.delete(id), setPaintProperty: (id, _k, v) => capas.set(id, v) };
  const t = new Timelapse(map, { onAviso: (x) => avisos.push(x) });
  t.activar(); t.setIndice(2);  // 2020
  t.setFuente("nasa");
  assert.equal(t.estado().anio, 2020);
  assert.ok(fuentes.get("tl-nasa-2020").tiles[0].includes("MODIS_Terra_CorrectedReflectance_TrueColor/default/2020-04-15/"));
  t.setDia("09-30");
  assert.ok(fuentes.get("tl-nasa-2020").tiles[0].includes("/2020-09-30/"));
  assert.equal(diaValido("13-40"), "04-15");
  t.setFuente("eox");
  for (let k = 0; k < 6; k++) oyentes.error({ sourceId: "tl-eox-2020" });
  assert.equal(t.fuente, "nasa");
  assert.match(avisos[0], /EOX no respondió/);
  assert.equal(FUENTES.nasa.anios[0], 2001);
});

test("play: no cambia de año hasta que bajan los mosaicos del siguiente", () => {
  const capas = new Map(), fuentes = new Set(), cargados = new Set();
  const map = { getSource: (id) => fuentes.has(id), getLayer: (id) => capas.has(id), addSource: (id) => fuentes.add(id), removeSource: (id) => fuentes.delete(id),
    addLayer: (l) => capas.set(l.id, 0), removeLayer: (id) => capas.delete(id), setPaintProperty: (id, _k, v) => capas.set(id, v), isSourceLoaded: (id) => cargados.has(id) };
  const t = new Timelapse(map);
  t.activar();
  assert.equal(t.listo(2018), false);
  cargados.add("tl-eox-2018");
  assert.equal(t.listo(2018), true);
  assert.equal(t.listo(1999), true);  // sin fuente instalada no hay nada que esperar
  t.desactivar();
});
