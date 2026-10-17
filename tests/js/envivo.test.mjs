import { test } from "node:test";
import assert from "node:assert/strict";
import { ruta, caja, deOpensky, ORIGENES } from "../../cloudflare/vuelos/logica.js";
import { subtipoAvion, filaDeVivo, consulta, fusionar, distanciaKm } from "../../js/envivo.js";

test("intermediario: solo acepta /punto/lat/lon/radio con radios permitidos", () => {
  assert.deepEqual(ruta("/punto/19.25/-99.25/100"), { lat: 19.25, lon: -99.25, nm: 100 });
  assert.equal(ruta("/punto/19.25/-99.25/300"), null);   // radio no permitido
  assert.equal(ruta("/punto/95/10/50"), null);           // latitud imposible
  assert.equal(ruta("/v2/mil"), null);                   // no reenvía otras rutas de adsb.lol
  assert.equal(ruta("/punto/19.25/-99.25/100?x=1"), null);
  assert.ok(ORIGENES.includes("https://zoetzerlpetrov-gif.github.io"));
});

test("intermediario: rectángulo de consulta alrededor del punto", () => {
  const b = caja({ lat: 19.5, lon: -99.25, nm: 100 });
  assert.ok(Math.abs(b.lamax - b.lamin - 3.327) < 0.01);              // 2 × 185.2 km / 111.32
  assert.ok(b.lomax - b.lomin > b.lamax - b.lamin);                     // más ancho en longitud fuera del ecuador
  assert.deepEqual(caja({ lat: 89.9, lon: 0, nm: 250 }).lamax, 90);     // no se sale del polo
});

test("intermediario: vectores de OpenSky → mismos campos y unidades que adsb.lol", () => {
  const d = { time: 1792213253, states: [
    ["0d12ad", "VIV1108 ", "Mexico", 1792213250, 1792213253, -99.0022, 19.4774, 3055.62, false, 98.73, 59.29, 7.15, null, 3230.88, "1234", false, 0, 4],
    ["0d135a", "VOI105  ", "Mexico", 1792212954, 1792212954, -99.0686, 19.4412, null, true, 5.14, 239.06, null, null, null, null, false, 0, 0],
    ["abc123", "", "United States", null, 1792213253, null, null, null, false, 0, 0, null, null, null, null, false, 0, 0]] }; // sin posición
  const out = deOpensky(d);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { hex: "0d12ad", flight: "VIV1108", lat: 19.4774, lon: -99.0022, gs: 191.9, track: 59.29, seen_pos: 3, mil: 0, pais: "Mexico",
    alt_baro: 10025, alt_geom: 10600, baro_rate: 1407, squawk: "1234", category: "A3" });
  assert.equal(out[1].alt_baro, "ground");
  assert.deepEqual(deOpensky(null), []);
  // de vuelta en el mapa: 10025 pies ≈ 3056 m y 191.9 nudos ≈ 355 km/h
  const f = filaDeVivo(out[0], new Set());
  assert.deepEqual([f[4], f[6], f[8]], [3231, 355, "Mexico"]);
});

test("subtipos iguales a los del servidor", () => {
  const sanc = new Set(["EP123"]);
  assert.equal(subtipoAvion("AMX123", false, false, "EP-123", sanc), "sancionada");
  assert.equal(subtipoAvion("AMX123", false, true, "", sanc), "en_tierra");
  assert.equal(subtipoAvion("SAM44", true, false, "", sanc), "estado");
  assert.equal(subtipoAvion("RCH801", true, false, "", sanc), "militar");
  assert.equal(subtipoAvion("FDX12", false, false, "", sanc), "carga");
  assert.equal(subtipoAvion("VIV1108", false, false, "", sanc), "civil_comercial");
  assert.equal(subtipoAvion("N755TV", false, false, "", sanc), "aviacion_general");
});

test("fila en vivo con las unidades de aeronaves.json", () => {
  const f = filaDeVivo({ hex: "0d12ad", flight: "VIV1108 ", lat: 19.4774, lon: -99.0022, alt_baro: 10000, alt_geom: 10025, gs: 100, track: 59.3, baro_rate: 1000, squawk: "1234", category: "A3", t: "A320", r: "XA-VIV", seen_pos: 1.4 }, new Set());
  assert.deepEqual(f, ["0d12ad", "VIV1108", -99.002, 19.477, 3056, 59, 185, "civil_comercial", "", 1, 5.1, "1234", "A3", "A320", "XA-VIV", ""]);
  assert.equal(filaDeVivo({ hex: "x", lat: 1, lon: 1, alt_baro: "ground" }, new Set())[4], 0);
});

test("consulta: centro redondeado a 0.25° y radio que cubre la vista", () => {
  assert.deepEqual(consulta({ lat: 19.43, lng: -99.13 }, { lat: 19.9, lng: -98.6 }), { lat: 19.5, lon: -99.25, nm: 50 });
  assert.equal(consulta({ lat: 20, lng: -100 }, { lat: 30, lng: -90 }).nm, 250); // vista grande: tope 250
  assert.equal(consulta({ lat: 0, lng: 190 }, { lat: 1, lng: 191 }).lon, -170);    // longitud normalizada
  assert.ok(Math.abs(distanciaKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.2) < 0.5);
});

test("fusionar: dentro del círculo manda lo en vivo; fuera sigue la instantánea", () => {
  const campos = ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s"];
  const filas = [["a", "", -99.1, 19.4, 0, 0, 0, "civil_comercial", "", 30],   // dentro: ya no aparece en vivo → se quita
    ["b", "", -99.2, 19.5, 0, 0, 0, "civil_comercial", "", 30],                 // dentro y en vivo → se reemplaza
    ["c", "", -80, 25, 0, 0, 0, "civil_comercial", "", 30]];                    // fuera → se queda
  const vivas = [["b", "", -99.21, 19.51, 0, 0, 0, "civil_comercial", "", 2], ["d", "", -99.3, 19.3, 0, 0, 0, "carga", "", 1]];
  const gen = Date.parse("2026-10-17T05:00:00Z"), t = gen + 600000;
  const r = fusionar(filas, campos, vivas, { lat: 19.5, lon: -99.25, nm: 50 }, gen, t);
  assert.deepEqual(r.filas.map((f) => f[0]).sort(), ["b", "c", "d"]);
  assert.deepEqual([...r.hex].sort(), ["b", "d"]);
  // edad respecto a la instantánea: 2 s − 600 s, para que (ahora − generado) + edad = edad real
  assert.equal(r.filas.find((f) => f[0] === "b")[9], 2 - 600);
  assert.equal(vivas[0][9], 2); // no modifica la entrada
});
