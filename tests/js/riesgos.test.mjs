// Capas de riesgos integradas desde Clima Táctico (WarRoomViajero).
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPAS, preparar, textoEspacial, htmlRiesgo, BASES } from "../../js/riesgos.js";

const capa = (id) => CAPAS.find((c) => c.id === id);
const pt = (props, coords = [-99, 19]) => ({ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: props });

test("las capas leen el mismo dominio primero y GitHub como respaldo", () => {
  assert.match(BASES[0], /^https:\/\/zoetzerlpetrov-gif\.github\.io\/WarRoomViajero\/data\/$/);
  assert.match(BASES[1], /raw\.githubusercontent\.com/);
  assert.ok(CAPAS.every((c) => c.url || c.archivos?.length));
});

test("sismos: color y tamaño crecen con la magnitud; la ficha trae profundidad", () => {
  const gj = preparar(capa("sismos"), { features: [pt({ mag: 3 }), pt({ mag: 6.4, place: "Oaxaca", time: 0, tsunami: 1 }, [-96, 16, 35])] });
  assert.ok(gj.features[1].properties._r > gj.features[0].properties._r);
  assert.notEqual(gj.features[1].properties._c, gj.features[0].properties._c);
  const html = htmlRiesgo(capa("sismos"), gj.features[1].properties, gj.features[1].geometry);
  assert.match(html, /M6\.4 · bandera de tsunami/);
  assert.match(html, /Profundidad<\/dt><dd>35 km/);
});

test("ciclones: radios de viento más rojos cuanto más fuerte; trayectoria pasada gris", () => {
  const c = capa("ciclones");
  assert.notEqual(c.estilo({ kind: "wind_radii_current", wind_kt: 64 }).c, c.estilo({ kind: "wind_radii_current", wind_kt: 34 }).c);
  assert.equal(c.estilo({ kind: "past" }).c, c.estilo({ kind: "past_point" }).c);
  assert.match(htmlRiesgo(c, { layer: "storm_track", kind: "forecast_point", storm_name: "Isaias", wind_kt: 75, label: "Ahora" }), /75 nudos \(139 km\/h\)/);
});

test("señales de noticias: siempre marcadas como «verifica» y con enlace a la fuente", () => {
  const html = htmlRiesgo(capa("seguridad"), { title: "<b>Bloqueo</b>", url: "https://news.example/a", kind: "BLOQUEO", source: "N+" });
  assert.match(html, /señal de noticias, verifica/);
  assert.match(html, /no es un incidente confirmado/);
  assert.ok(html.includes("&lt;b&gt;Bloqueo") && html.includes('href="https://news.example/a"'));
  assert.doesNotMatch(htmlRiesgo(capa("seguridad"), { title: "x", url: "javascript:alert(1)" }), /javascript:/);
});

test("geometrías vacías se descartan; calidad del aire usa el color de origen si es válido", () => {
  const gj = preparar(capa("aire"), { features: [pt({ color: "#ffd23f", level: 1 }), { type: "Feature", geometry: null, properties: {} }, pt({ color: "red; x", level: 2 })] });
  assert.equal(gj.features.length, 2);
  assert.equal(gj.features[0].properties._c, "#ffd23f");
  assert.notEqual(gj.features[1].properties._c, "red; x");
});

test("clima espacial en texto", () => {
  assert.equal(textoEspacial({ G: { scale: 1 }, kp: { value: 5.67 }, flare: { class: "M6.7" }, R: { scale: 0 }, S: { scale: 0 } }),
    "Tormenta geomagnética G1 (menor) · Kp 5.7 · última llamarada M6.7");
  assert.equal(textoEspacial(null), null);
});
