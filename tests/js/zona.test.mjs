// Consola de zona (ciudades del mundo), feed agrupado, Hoy No Circula por semana y bandas del índice de aire.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidatosZona, agruparFeed, semanaHNC, bandaAQI, RADIO_ZONA_KM } from "../../js/amenazas.js";

const leer = (r) => JSON.parse(readFileSync(new URL(`../../${r}`, import.meta.url)));
const MX = leer("config/mx_estados.json");
const F = { estados: MX.estados, ciudadesMx: MX.ciudades, ciudades: leer("config/ciudades.json").ciudades, paises: leer("config/gazetteer.json").paises };

test("zona: estados, países y ciudades del mundo con radio de 200 km", () => {
  assert.equal(candidatosZona("Guerrero", F)[0].clase, "estado");
  const mx = candidatosZona("méxico", F)[0];
  assert.equal(mx.iso3, "MEX");
  const zihua = candidatosZona("Zihuatanejo", F)[0];
  assert.equal(zihua.radio_km, RADIO_ZONA_KM);
  assert.ok(Math.abs(zihua.lat - 17.64) < 0.3);
  const paris = candidatosZona("paris", F)[0];
  assert.match(paris.etiqueta, /Francia/);
  assert.ok(Math.abs(paris.lon - 2.35) < 0.3);
  // «Ciudad, País» desambigua: Guadalajara de España y no la de Jalisco.
  const gdl = candidatosZona("Guadalajara, España", F)[0];
  assert.ok(gdl.lat > 40);
  assert.equal(candidatosZona("Guadalajara", F)[0].lat < 25, true);
  assert.deepEqual(candidatosZona("", F), []);
  assert.deepEqual(candidatosZona("zzzzqqq", F), []);
});

test("feed de seguridad agrupado por tipo", () => {
  const g = agruparFeed([{ title: "Bloqueo en la México-Toluca" }, { title: "Derrumbe bloquea la carretera" }, { title: "Lluvias inundan Villahermosa" },
    { title: "Houthi attacks on Saudi airports" }, { title: "Premio Nobel de Química" }]);
  assert.deepEqual(g.map(([i, l]) => [i.id, l.length]), [["deslave", 1], ["clima", 1], ["ataque", 1], ["bloqueo", 1], ["otro", 1]]);
  assert.match(agruparFeed([{ title: "Cárceles: CNDH alerta en salud" }])[0][0].id, /otro/);
});

test("Hoy No Circula: semana con el día de hoy marcado", () => {
  const lunes = semanaHNC(new Date("2026-10-05T18:00:00Z"));
  assert.equal(lunes.length, 5);
  assert.deepEqual(lunes.find((d) => d.hoy), { ...lunes[0], hoy: true });
  assert.equal(lunes[0].engomado, "Amarillo");
  assert.equal(semanaHNC(new Date("2026-10-04T18:00:00Z")).some((d) => d.hoy), false); // domingo
});

test("bandas del índice de calidad del aire (EPA)", () => {
  assert.equal(bandaAQI(30).etiqueta, "Buena");
  assert.equal(bandaAQI(61).etiqueta, "Moderada");
  assert.equal(bandaAQI(151).i, 3);
  assert.equal(bandaAQI(400).etiqueta, "Peligrosa");
  assert.equal(bandaAQI(400).pos, 1);
  assert.equal(bandaAQI("x"), null);
});
