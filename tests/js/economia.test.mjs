import { test } from "node:test";
import assert from "node:assert/strict";
import { resumen, senal, viejo, linea, tarjeta, conteo } from "../../js/economia.js";

const pts = [["2025-09-01", 4.0], ...Array.from({ length: 11 }, (_, i) => [`2025-${String(10 + i).padStart(2, "0")}-01`.replace("2025-13", "2026-01").replace("2025-14", "2026-02").replace("2025-15", "2026-03").replace("2025-16", "2026-04").replace("2025-17", "2026-05").replace("2025-18", "2026-06").replace("2025-19", "2026-07").replace("2025-20", "2026-08"), 4.0]), ["2026-09-01", 4.6]];

test("resumen y señal según cómo se lee el indicador", () => {
  const r = resumen(pts, "mensual");
  assert.equal(r.valor, 4.6); assert.equal(r.previo, 4.0); assert.equal(r.haceAnio, 4.0); assert.equal(r.promedio, 4.0);
  assert.equal(senal(r, "sube_mal"), "rojo", "desempleo arriba de su promedio = rojo");
  assert.equal(senal(r, "sube_bien"), "verde");
  assert.equal(senal(r, "neutral"), "gris");
  assert.equal(senal({ valor: 4.01, promedio: 4.0 }, "sube_bien"), "gris", "cambio menor a 1 % = sin cambio");
  assert.equal(resumen([], "mensual"), null);
});

test("dato viejo según la frecuencia", () => {
  const hoy = new Date("2026-10-30T00:00:00Z");
  assert.equal(viejo("2026-08-01", "mensual", hoy), false);
  assert.equal(viejo("2023-12-01", "mensual", hoy), true, "la confianza de México vía FRED se quedó en dic-2023");
  assert.equal(viejo("2026-04-01", "trimestral", hoy), false);
});

test("tarjeta escapa textos de la fuente y muestra el error conservado", () => {
  const meta = { id: "x", nombre: "<b>Prueba</b>", que_mide: "Mide", lectura: "sube_bien", confiabilidad: "oficial", unidad: "%", frecuencia: "mensual",
    fuente: { tipo: "fred", enlace: "https://fred.stlouisfed.org/series/X", nombre: "FRED · X" } };
  const h = tarjeta(meta, { puntos: pts, error: "TimeoutError: <script>" });
  assert.ok(h.includes("&lt;b&gt;Prueba") && !h.includes("<script>") && h.includes("último dato bueno"));
  assert.ok(linea(pts).startsWith("<svg"));
  assert.deepEqual(conteo([meta], { x: { puntos: pts } }), { verde: 1, rojo: 0, gris: 0 });
});
