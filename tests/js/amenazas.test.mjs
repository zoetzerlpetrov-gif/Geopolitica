// Amenazas: severidad, país, enjambres, tsunami, auroras, Hoy No Circula, nuevos y filtros.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clasificar, paisDeLugar, indicePaises, paisEn, enjambres, radiosTsunami, lineasAurora, latAurora, hoyNoCircula,
  registrarVistos, claveDe, filtrar, ordenar, distanciaKm } from "../../js/amenazas.js";

const FRONTERAS = JSON.parse(readFileSync(new URL("../../data/base/countries-110m.geojson", import.meta.url)));
const pt = (props, c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: props });

test("severidad por capa", () => {
  assert.equal(clasificar("sismos", { mag: 7.2 }).sev, 5);
  assert.equal(clasificar("sismos", { mag: 4.6 }).ic, "🫨");
  assert.equal(clasificar("sismos", { mag: 3, tsunami: 1 }).tipo, "Tsunami");
  assert.equal(clasificar("ciclones", { layer: "storm", intensity_kt: 120 }).sev, 5);
  assert.equal(clasificar("ciclones", { layer: "storm", intensity_kt: 40 }).sev, 2);
  assert.equal(clasificar("gdacs", { alertlevel: "Orange", eventtype: "FL" }).sev, 4);
  assert.equal(clasificar("pronostico", { level: 0, temp_level: 2, temp_kind: "calor" }).tipo, "Calor extremo");
  assert.equal(clasificar("seguridad", { kind: "BLOQUEO" }).ic, "🚧");
  assert.equal(clasificar("nws", { severity: "Extreme", event: "Tornado Warning" }).sev, 5);
});

test("país: por nombre de USGS y por polígono", () => {
  assert.equal(paisDeLugar("12 km SW of Tecpan, Mexico"), "Mexico");
  assert.equal(paisDeLugar("Southern East Pacific Rise"), null);
  const idx = indicePaises(FRONTERAS);
  assert.equal(paisEn(idx, -99.13, 19.43), "MEX");
  assert.equal(paisEn(idx, 2.35, 48.85), "FRA");
  assert.equal(paisEn(idx, -140, 0), null); // océano
});

test("enjambre: 5 sismos en la misma celda de México; fuera de México no cuenta", () => {
  const cerca = [0, 1, 2, 3, 4].map((i) => pt({ mag: 3 + i * 0.2, time: i }, [-98.1 + i * 0.01, 16.5]));
  const e = enjambres([...cerca, pt({ mag: 5 }, [140, 35])]);
  assert.equal(e.length, 1);
  assert.equal(e[0].properties.eventos, 5);
  assert.equal(e[0].properties.mag_max, 3.8);
  assert.equal(enjambres([0, 1, 2, 3, 4].map(() => pt({ mag: 3 }, [140, 35]))).length, 0);
});

test("tsunami: tres anillos de 700, 1400 y 2100 km", () => {
  const r = radiosTsunami(pt({ place: "Chile", time: 0 }, [-72, -33]));
  assert.deepEqual(r.map((f) => f.properties._tsunami_radio), [1, 2, 3]);
  const [lon, lat] = r[0].geometry.coordinates[0];
  assert.ok(Math.abs(distanciaKm(-33, -72, lat, lon) - 700) < 5);
});

test("auroras: Kp 5 → 54.5°; líneas norte y sur, actual marcada", () => {
  assert.equal(latAurora(5), 54.5);
  const fc = lineasAurora(5.67);
  assert.ok(fc.features.some((f) => f.properties.actual && f.properties.hemisferio === "sur"));
  assert.equal(fc.features.length, 8);
});

test("Hoy No Circula en hora de la CDMX", () => {
  assert.match(hoyNoCircula(new Date("2026-10-05T18:00:00Z")).texto, /Amarillo: placas con terminación 5 y 6/); // lunes
  assert.match(hoyNoCircula(new Date("2026-10-09T18:00:00Z")).texto, /Azul/); // viernes
  assert.equal(hoyNoCircula(new Date("2026-10-11T18:00:00Z")).aplica, false); // domingo
  assert.match(hoyNoCircula(new Date("2026-10-06T03:00:00Z")).texto, /Amarillo/); // martes 03:00 UTC = lunes 21:00 en CDMX
});

test("nuevos: la primera carga no marca nada; lo que aparece después sí", () => {
  let r = registrarVistos({}, "sismos", ["a", "b"], 1000);
  assert.equal(r.nuevas.size, 0);
  r = registrarVistos(r.vistos, "sismos", ["a", "b", "c"], 2000);
  assert.deepEqual([...r.nuevas], ["c"]);
  r = registrarVistos(r.vistos, "sismos", ["a", "c"], 3000);
  assert.equal(r.nuevas.size, 0);
  const viejo = registrarVistos({ "_capa:x": 1, z: 1 }, "x", [], 8 * 86400000);
  assert.ok(!("z" in viejo.vistos)); // se olvida tras 7 días
});

test("clave estable, filtros y orden", () => {
  assert.equal(claveDe("sismos", { code: "us7000" }, { type: "Point", coordinates: [-99.123, 19.456] }), "sismos|us7000|-99.12,19.46");
  const L = [{ k: "a", sev: 2, pais: "MEX", tipo: "Sismo", lat: 19, lon: -99, t: 1 }, { k: "b", sev: 5, pais: "USA", tipo: "Tornado", lat: 35, lon: -97, t: 2 },
    { k: "c", sev: 3, pais: "MEX", tipo: "Sismo", lat: 17, lon: -96, t: 3 }];
  assert.deepEqual(filtrar(L, { sevMin: 3 }).map((a) => a.k), ["b", "c"]);
  assert.deepEqual(filtrar(L, { pais: "MEX", tipo: "Sismo" }).map((a) => a.k), ["a", "c"]);
  assert.deepEqual(filtrar(L, { zona: { lat: 19.4, lon: -99.1, radio_km: 100 } }).map((a) => a.k), ["a"]);
  assert.deepEqual(ordenar(L, new Set(["a"])).map((a) => a.k), ["a", "b", "c"]);
});

test("titulares del feed → lugar en México (ciudad antes que estado; apellidos no cuentan)", async () => {
  const { ubicarTitulo, feedAPuntos } = await import("../../js/amenazas.js");
  const est = JSON.parse(readFileSync(new URL("../../config/mx_estados.json", import.meta.url)));
  assert.equal(ubicarTitulo("Deslave bloquea la carretera Acapulco-Zihuatanejo", est).lugar, "Acapulco, Guerrero");
  assert.equal(ubicarTitulo("Bloqueo en la México-Toluca", est).lugar, "Toluca, Estado de México");
  assert.equal(ubicarTitulo("Balacera en Michoacán deja tres heridos", est).precision, "estado");
  assert.equal(ubicarTitulo("Miguel Hidalgo inauguró la obra", est), null);
  assert.equal(ubicarTitulo("Enfrentamiento en Hidalgo", est).lugar, "Hidalgo");
  const pts = feedAPuntos([{ title: "Secuestran a comerciante en Celaya", url: "https://x" }, { title: "Sin lugar", url: "https://y" }], est);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].properties.kind, "SECUESTRO");
});

test("auroras: líneas de −540° a 540° para no cortarse en las copias del mundo", () => {
  const c = lineasAurora(5).features[0].geometry.coordinates;
  assert.equal(c[0][0], -540); assert.equal(c[c.length - 1][0], 540);
});

test("ataques: ícono y tipo por arma", async () => {
  const { iconoArma } = await import("../../js/amenazas.js");
  assert.equal(iconoArma("Misiles o cohetes"), "🚀");
  assert.equal(iconoArma("Drones"), "🛸");
  assert.equal(iconoArma("Coche bomba"), "🚗");
  assert.equal(iconoArma("Bomba en carretera (IED)"), "💣");
  assert.equal(iconoArma(null), "");
  assert.deepEqual(clasificar("ataques", { arma: "Drones", severidad: 4 }), { sev: 4, tipo: "Ataque: Drones", ic: "🛸" });
  assert.equal(clasificar("crimen", { tipo: "Narcotráfico", arma: "Drones" }).ic, "🛸");
});
