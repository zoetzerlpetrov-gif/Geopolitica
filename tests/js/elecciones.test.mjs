import { test } from "node:test";
import assert from "node:assert/strict";
import { eleccionesVisibles, htmlElecciones } from "../../js/elecciones.js";

const datos = { elecciones: [
  { id: "Q2", estado: "proxima", fecha: "2026-11-15", mostrar_desde: "2026-11-01", tope: "2026-12-06", pais: "Chile", tipo: "presidencial", nombre: "Chile", regla: "Más de la mitad", candidatos: ["A <b>"], url: "https://x.org", lat: 0, lon: 0 },
  { id: "Q5", estado: "proxima", fecha: "2026-12-30", mostrar_desde: "2026-12-16", tope: "2027-01-20", pais: "Lejos", tipo: "otra", nombre: "x", regla: "", url: "https://x.org" },
  { id: "Q1", estado: "conteo", fecha: "2026-11-03", tope: "2026-11-24", pais: "Estados Unidos", tipo: "legislativa", nombre: "Cámara", regla: "218", url: "https://x.org" },
  { id: "Q3", estado: "resultado", fecha: "2026-10-25", tope: "2026-11-15", mostrar_hasta_utc: "2026-11-05T12:00:00Z", pais: "Brasil", tipo: "presidencial", nombre: "B", regla: "r", ganador: "X", url: "https://x.org" },
] };

test("elecciones: qué se muestra y en qué orden", () => {
  assert.deepEqual(eleccionesVisibles(datos, "2026-11-04T10:00:00Z").map((e) => e.id), ["Q1", "Q3", "Q2"]);
  assert.deepEqual(eleccionesVisibles(datos, "2026-11-05T13:00:00Z").map((e) => e.id), ["Q1", "Q2"], "el resultado se quita a las 24 h");
  const tarde = eleccionesVisibles(datos, "2026-11-25T10:00:00Z");
  assert.deepEqual(tarde.map((e) => e.id), ["Q2"], "Q1 pasó su tope de 21 días");
  assert.equal(tarde[0].estado, "conteo", "una «próxima» ya pasada cuenta como conteo");
});

test("elecciones: ventana con regla, candidatos escapados y plegable", () => {
  const h = htmlElecciones(eleccionesVisibles(datos, "2026-11-04T10:00:00Z"), "Q2", "2026-11-04");
  assert.match(h, /3 elecciones · 1 en conteo/);
  assert.match(h, /data-id="Q2" open/);
  assert.match(h, /en 11 días/);
  assert.ok(h.includes("A &lt;b&gt;"));
  assert.match(h, /Qué se necesita para ganar/);
  assert.equal(htmlElecciones([]), "");
});
