import test from "node:test";
import assert from "node:assert/strict";
import { fila, recomendacion } from "../../js/cuotas.js";

test("la fila de cuotas escapa el texto y recomienda según el semáforo", () => {
  const s = { nombre: "<img src=x>", secreto: "K", usado: 9000, limite: 10000, unidad: "unidades", periodo: "día", pct: 0.9, semaforo: "rojo",
    verificado: true, real: null, detalle: [], si_excede: "Pedir aumento" };
  const h = fila(s);
  assert.ok(!h.includes("<img") && h.includes("&lt;img"));
  assert.match(recomendacion(s), /Actuar ya: Pedir aumento/);
  assert.match(recomendacion({ semaforo: "verde" }), /Nada que hacer/);
});

test("el mapa de continuidad proyecta y escapa", async () => {
  const { proyectar, svgTraslado } = await import("../../js/continuidad-mapa.js");
  const [x, y] = proyectar([-99.13, 19.43]);
  assert.ok(x > 0 && x < 960 && y > 0 && y < 470);
  const svg = svgTraslado({ ruta: { origen: { nombre: "<b>O</b>", coords: [-99, 19] } }, destinos: [{ id: "d", destino: "D", rol: "Principal", como: "x", coords: [-84, 10] }] }, { features: [] });
  assert.ok(svg.includes("&lt;b&gt;O") && !svg.includes("<b>O"));
});
