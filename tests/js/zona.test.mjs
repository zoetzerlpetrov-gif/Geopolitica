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

import { estiloSismo, categoriaCiclon, sevAlertaVolcan, destino, conoCeniza, nombreRumbo, haciaDonde } from "../../js/amenazas.js";

test("sismos: color y tamaño crecen con la magnitud", () => {
  const a = estiloSismo(2.7), b = estiloSismo(7.9), c = estiloSismo(4.5);
  assert.ok(b.r > c.r && c.r > a.r);
  assert.notEqual(a.c, b.c);
  assert.equal(estiloSismo(7.9).c, "#6A1B9A");
});

test("ciclones: categoría Saffir-Simpson por viento", () => {
  assert.equal(categoriaCiclon(30).texto, "Depresión tropical");
  assert.equal(categoriaCiclon(50).texto, "Tormenta tropical");
  assert.equal(categoriaCiclon(85).texto, "Categoría 2");
  assert.equal(categoriaCiclon(140).n, 5);
  assert.equal(categoriaCiclon(0), null);
});

test("volcanes: severidad desde el semáforo de CENAPRED o el nivel de USGS", () => {
  assert.equal(sevAlertaVolcan({ semaforo: "Amarillo", fase: 2 }), 3);
  assert.equal(sevAlertaVolcan({ semaforo: "Amarillo", fase: 3 }), 4);
  assert.equal(sevAlertaVolcan({ semaforo: "Rojo", fase: 1 }), 5);
  assert.equal(sevAlertaVolcan({ nivel_usgs: "WATCH" }), 4);
  assert.equal(sevAlertaVolcan({}), null);
});

test("ceniza: el cono apunta hacia donde sopla el viento y su largo es velocidad × horas", () => {
  assert.equal(haciaDonde(270), 90);  // viento del oeste → la ceniza va al este
  assert.equal(nombreRumbo(90), "este");
  const [lon, lat] = destino([-98.62, 19.02], 90, 111.2);
  assert.ok(Math.abs(lon - -97.56) < 0.05 && Math.abs(lat - 19.02) < 0.05);
  const c = conoCeniza([-98.62, 19.02], 270, 20, 6);
  assert.equal(c.largo, 120);
  assert.equal(c.rumbo, 90);
  assert.ok(c.coordinates[0].every(([x]) => x >= -98.63));
});

test("ceniza: dirección meteorológica desde U y V", async () => {
  const { vientoDeUV } = await import("../../js/ceniza.js");
  const oeste = vientoDeUV(10, 0);   // sopla hacia el este → viene del oeste
  assert.equal(Math.round(oeste.desde), 270);
  assert.equal(Math.round(oeste.kmh), 36);
  assert.equal(Math.round(vientoDeUV(0, -5).desde), 0);  // sopla hacia el sur → viene del norte
});
