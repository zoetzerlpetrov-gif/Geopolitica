// Pruebas de la ficha de vuelo y su trayectoria.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { aerolinea, squawkInfo, categoria, cardinal, granCirculo, etaMin, avance, geojsonTrayectoria, htmlVuelo, datosVuelo, CON_TRAYECTORIA } from "../../js/vuelos.js";
import { proyectar, vueloDeFila } from "../../js/movimiento.js";

const CAMPOS = ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s", "vs_ms", "squawk", "cat", "tipo_av", "matricula", "ruta"];
const MEX = { icao: "MMMX", iata: "MEX", nombre: "Benito Juárez Intl", ciudad: "Mexico City", pais: "MX", lat: 19.436, lon: -99.072 };
const JFK = { icao: "KJFK", iata: "JFK", nombre: "John F Kennedy Intl", ciudad: "New York", pais: "US", lat: 40.64, lon: -73.78 };

const vuelo = (over = {}) => ({ ...vueloDeFila(["0d0d0d", "AMX0410", -90, 30, 10668, 45, 830, "civil_comercial", "Mexico", 20, -5.1, "1234", "A3", "", "", "MMMX-KJFK"], CAMPOS), ...over });

test("aerolínea por prefijo OACI del indicativo", () => {
  assert.deepEqual(aerolinea("AMX0410"), { codigo: "AMX", nombre: "Aeroméxico" });
  assert.deepEqual(aerolinea("ZZZ12"), { codigo: "ZZZ", nombre: null });
  assert.equal(aerolinea("N123AB"), null); // aviación general: sin aerolínea
});

test("squawk, categoría y punto cardinal", () => {
  assert.equal(squawkInfo("7700").alerta, true);
  assert.equal(squawkInfo("7500").texto, "Interferencia ilícita (secuestro)");
  assert.equal(squawkInfo("1234"), null);
  assert.equal(categoria("A5"), "Pesada (más de 136 t)");
  assert.deepEqual([0, 45, 90, 200, 359, -90].map(cardinal), ["N", "NE", "E", "SSO", "N", "O"]);
});

test("gran círculo: extremos correctos y sin saltos de 360° en el antimeridiano", () => {
  const p = granCirculo([-99.07, 19.44], [-73.78, 40.64], 32);
  assert.equal(p.length, 33);
  assert.deepEqual(p[0], [-99.07, 19.44]);
  assert.ok(Math.abs(p[32][0] + 73.78) < 1e-3 && Math.abs(p[32][1] - 40.64) < 1e-3);
  const pac = granCirculo([139.78, 35.55], [-118.41, 33.94], 32); // Tokio → Los Ángeles
  for (let i = 1; i < pac.length; i++) assert.ok(Math.abs(pac[i][0] - pac[i - 1][0]) < 30, `salto en ${i}`);
});

test("llegada estimada y avance del vuelo", () => {
  assert.equal(etaMin(830, 830), 60);
  assert.equal(etaMin(500, 10), null); // detenido
  assert.equal(avance(MEX, JFK, MEX.lon, MEX.lat), 0);
  assert.equal(avance(MEX, JFK, JFK.lon, JFK.lat), 100);
});

test("trayectoria: recorrido, rumbo de 30 min, arco al destino y aeropuertos", () => {
  const gj = geojsonTrayectoria(vuelo(), { origen: MEX, destino: JFK, rastro: [[-95, 25, 10000, 1], [-92, 28, 10600, 2]] }, proyectar);
  const k = gj.features.map((f) => f.properties.k);
  assert.deepEqual(k.filter((x) => x !== "punto"), ["recorrido", "rumbo", "al_destino", "aeropuerto", "aeropuerto"]);
  const rec = gj.features.find((f) => f.properties.k === "recorrido").geometry.coordinates;
  assert.deepEqual(rec.at(-1), [-90, 30]); // termina en la posición actual
  const rumbo = gj.features.find((f) => f.properties.k === "rumbo").geometry.coordinates;
  assert.equal(rumbo.length, 7); // cada 5 min durante 30 min
  assert.ok(rumbo.at(-1)[1] > 30 && rumbo.at(-1)[0] > -90); // rumbo 45°: hacia el noreste
  assert.ok(gj.features.some((f) => f.properties.n === "Destino: JFK"));
});

test("sin rastro previo se dibuja el arco desde el origen", () => {
  const gj = geojsonTrayectoria(vuelo(), { origen: MEX, destino: JFK, rastro: [] }, proyectar);
  assert.ok(gj.features.some((f) => f.properties.k === "desde_origen"));
});

test("aviación general: sin ruta ni trayectoria y sin pedir datos", async () => {
  assert.equal(CON_TRAYECTORIA.has("aviacion_general"), false);
  const d = await datosVuelo(vuelo({ subtipo: "aviacion_general", ruta: "" }));
  assert.deepEqual(d, { origen: null, destino: null, rastro: [], fuenteRastro: null });
  const html = htmlVuelo(vuelo({ subtipo: "aviacion_general", matricula: "N123AB", ruta: "" }), d, { subtipoNombre: "Aviación general" });
  assert.ok(!html.includes("N123AB") || html.indexOf("N123AB") === -1);
  assert.match(html, /aviación general \(privacidad\)/);
});

test("ficha con ruta: origen, destino, distancia restante, squawk de emergencia y texto escapado", () => {
  const html = htmlVuelo(vuelo({ squawk: "7700", indicativo: "AMX<b>" }), { origen: MEX, destino: JFK, rastro: [[-95, 25, 1, 1]], fuenteRastro: "instantaneas" },
    { subtipoNombre: "Comercial", edadMin: 3, paisEs: (x) => (x === "Mexico" ? "México" : x) });
  assert.match(html, /<b>MEX<\/b> Benito Juárez Intl, Mexico City \(MX\)/);
  assert.match(html, /<b>JFK<\/b>/);
  assert.match(html, /Faltan [\d,]+ km en línea recta/);
  assert.match(html, /Squawk 7700: Emergencia general/);
  assert.match(html, /registrado en México/);
  assert.match(html, /Bajando 1,004 pies\/min/);
  assert.ok(html.includes("AMX&lt;b&gt;") && !html.includes("AMX<b>"));
});

test("instantáneas viejas (10 campos) siguen funcionando", () => {
  const v = vueloDeFila(["abc", "UAL1", 0, 0, 1000, 90, 500, "civil_comercial", "United States", 5], CAMPOS.slice(0, 10));
  const html = htmlVuelo(v, null, { subtipoNombre: "Comercial" });
  assert.match(html, /United Airlines/);
});

test("límites de la trayectoria para encuadrar el mapa", async () => {
  const { limites } = await import("../../js/vuelos.js");
  const gj = geojsonTrayectoria(vuelo(), { origen: MEX, destino: JFK, rastro: [[-95, 25, 1, 1]] }, proyectar);
  const [[o, s], [e, n]] = limites(gj);
  assert.ok(o <= -99.07 && e >= -73.78 && s <= 19.44 && n >= 40.64);
  assert.equal(limites({ features: [] }), null);
});
