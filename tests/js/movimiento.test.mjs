// Pruebas de la lógica de capas en movimiento (sin navegador).
import { test } from "node:test";
import assert from "node:assert/strict";
import { proyectar, recortar, MAX_OBJETOS } from "../../js/movimiento.js";

test("proyectar: 800 km/h hacia el norte durante 1 h avanza ~7.2° de latitud", () => {
  const [lon, lat] = proyectar(-99, 19, 0, 800, 3600);
  assert.ok(Math.abs(lon + 99) < 1e-9);
  assert.ok(Math.abs(lat - (19 + 800 / 111.32)) < 1e-6);
});

test("proyectar: cruza el antimeridiano sin salirse de ±180", () => {
  const [lon] = proyectar(179.9, 0, 90, 900, 3600);
  assert.ok(lon < -170 && lon >= -180, String(lon));
});

const idx = { iLon: 2, iLat: 3, iSt: 7 };
const fila = (lon, lat, st = "militar") => ["h", "C", lon, lat, 0, 0, 0, st];

test("recortar: solo lo que está dentro de la vista y de los subtipos activos", () => {
  const filas = [fila(-99, 19), fila(10, 50), fila(-98, 20, "carga")];
  const r = recortar(filas, idx, [[-110, 10], [-90, 30]], new Set(["militar"]));
  assert.equal(r.filas.length, 1);
  assert.equal(r.total, 1);
});

test("recortar: vista que cruza el antimeridiano", () => {
  const filas = [fila(179, 0), fila(-179, 0), fila(0, 0)];
  const r = recortar(filas, idx, [[170, -10], [-170, 10]], new Set(["militar"]));
  assert.equal(r.total, 2);
});

test("recortar: respeta el tope y avisa", () => {
  const filas = Array.from({ length: MAX_OBJETOS + 10 }, () => fila(0, 0));
  const r = recortar(filas, idx, [[-1, -1], [1, 1]], new Set(["militar"]));
  assert.equal(r.filas.length, MAX_OBJETOS);
  assert.equal(r.recortado, true);
});

import { urlGIBS, IMAGENES, ayerUTC } from "../../js/imagenes.js";
test("GIBS: URL con la fecha de ayer y la matriz de cada capa", () => {
  assert.equal(ayerUTC(new Date("2026-10-08T03:00:00Z")), "2026-10-07");
  assert.equal(urlGIBS(IMAGENES.modis_color, "2026-10-07"),
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-10-07/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg");
});

test("luces nocturnas: usa la primera candidata con imagen real; la anual tiene fecha fija", async () => {
  const { elegirCandidata } = await import("../../js/imagenes.js");
  const def = IMAGENES.viirs_noche;
  const vistos = [];
  const pedir = async (url) => {
    vistos.push(url);
    if (url.includes("VIIRS_SNPP_DayNightBand_ENCC")) return { ok: true, tipo: "image/png", bytes: 800 }; // transparente: no sirve
    if (url.includes("NOAA20_DayNightBand")) return { ok: false, tipo: "text/xml", bytes: 300 };
    if (url.includes("At_Sensor_Radiance")) throw new Error("red");
    return { ok: true, tipo: "image/png", bytes: 52000 };
  };
  const r = await elegirCandidata(def, "2026-10-07", pedir);
  assert.equal(r.capa, "VIIRS_Black_Marble");
  assert.equal(r.fecha, "2016-01-01");
  assert.ok(vistos.some((u) => u.includes("/2026-10-07/") && u.includes("/2/1/1.png")));
  const diaria = await elegirCandidata(def, "2026-10-07", async () => ({ ok: true, tipo: "image/png", bytes: 9000 }));
  assert.equal(diaria.capa, "VIIRS_SNPP_DayNightBand_ENCC");
  assert.equal(diaria.fecha, "2026-10-07");
  assert.equal(await elegirCandidata(def, "2026-10-07", async () => ({ ok: false })), null);
});
