// Satélites: tipo de órbita, huella de cobertura, trayectoria y ficha.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { semieje, tipoOrbita, radioHuella, circulo, continuo, geojsonOrbita, lanzamiento, edadTleHoras, htmlSatelite } from "../../js/satelites.js";

test("Kepler: un período de 1436 min da la altura geoestacionaria (~35,786 km)", () => {
  assert.ok(Math.abs(semieje(1436.07) - 6378.137 - 35786) < 20);
});

test("tipos de órbita: EEI baja, GPS media, geoestacionaria, Molniya muy elíptica", () => {
  assert.equal(tipoOrbita({ periodo_min: 92.9, excentricidad: 0.0007, inclinacion: 51.6 }).id, "leo");
  assert.equal(tipoOrbita({ periodo_min: 717.9, excentricidad: 0.01, inclinacion: 55 }).id, "meo");
  assert.equal(tipoOrbita({ periodo_min: 1436.1, excentricidad: 0.0002, inclinacion: 0.05 }).id, "geo");
  assert.equal(tipoOrbita({ periodo_min: 1436.1, excentricidad: 0.0002, inclinacion: 12 }).id, "gso");
  assert.equal(tipoOrbita({ periodo_min: 717.7, excentricidad: 0.72, inclinacion: 63.4 }).id, "heo");
  const iss = tipoOrbita({ periodo_min: 92.9, excentricidad: 0.0007, inclinacion: 51.6 });
  assert.ok(iss.perigeo > 380 && iss.apogeo < 440);
});

test("huella: la EEI se ve a ~2,200 km; un geoestacionario a ~9,000 km", () => {
  assert.ok(Math.abs(radioHuella(420) - 2250) < 150);
  assert.ok(Math.abs(radioHuella(35786) - 9050) < 200);
  assert.ok(radioHuella(420, 10) < radioHuella(420, 0));
});

test("círculo cerrado y con longitudes continuas cerca del antimeridiano", () => {
  const c = circulo([179, 0], 2000);
  assert.deepEqual(c[0], c[c.length - 1]);
  for (let i = 1; i < c.length; i++) assert.ok(Math.abs(c[i][0] - c[i - 1][0]) < 180);
});

test("trayectoria: pasado, futuro y huella; sin saltos de 360°", () => {
  const muestras = [[170, 10, 420, -10], [179, 20, 420, -5], [-172, 30, 420, 0], [-160, 40, 420, 5], [-150, 45, 420, 10]];
  const gj = geojsonOrbita({ muestras }, [-172, 30, 420]);
  assert.deepEqual(gj.features.map((f) => f.properties.k), ["recorrido", "rumbo", "al_destino"]);
  const pasado = gj.features[0].geometry.coordinates;
  assert.equal(pasado[2][0], 188); // continúa al otro lado de 180°
  assert.deepEqual(continuo([[179, 0], [-179, 0]]), [[179, 0], [181, 0]]);
});

test("lanzamiento y antigüedad del TLE", () => {
  assert.deepEqual(lanzamiento("98067A"), { anio: 1998, numero: 67, pieza: "A" });
  assert.equal(lanzamiento("24001B").anio, 2024);
  assert.equal(lanzamiento(""), null);
  const jd = Date.UTC(2026, 9, 8) / 86400000 + 2440587.5;
  assert.equal(Math.round(edadTleHoras(jd, Date.UTC(2026, 9, 8, 6))), 6);
});

test("ficha: explica los geoestacionarios y escapa el nombre", () => {
  const orb = { elementos: { inclinacion: 0.04, excentricidad: 0.0002, periodo_min: 1436.1, vel_kms: 3.07, epoca_jd: Date.now() / 86400000 + 2440587.5 - 0.25, designador: "19049A" } };
  const html = htmlSatelite({ n: "<b>SAT</b>", norad: "44479", grupo: "Geoestacionarios", alt: 35786 }, orb);
  assert.match(html, /Geoestacionaria/);
  assert.match(html, /sobre el Ecuador/);
  assert.match(html, /Lanzamiento<\/dt><dd>2019/);
  assert.ok(html.includes("&lt;b&gt;SAT"));
  assert.match(htmlSatelite({ n: "ISS", norad: "25544", grupo: "Estaciones", alt: 420 }, null), /Calculando la trayectoria/);
});
