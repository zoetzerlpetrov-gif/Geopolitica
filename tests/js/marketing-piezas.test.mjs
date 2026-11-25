// Piezas de la campaña (tools/marketing/piezas.mjs) y secciones nuevas de marketing.html.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elegir } from "../../tools/marketing/piezas.mjs";
import { htmlPiezas, htmlLanzamiento } from "../../js/marketing_admin.js";

const b = (id, fecha, tema, pilar) => ({ id, fecha, tema, pilar, titular: `T ${id}` });

test("elegir: solo el día más reciente, sin temas repetidos, alertas primero y con tope", () => {
  const lista = [b("a", "2026-11-24", "x", "alerta"), b("b", "2026-11-25", "y", "herramienta"), b("c", "2026-11-25", "z", "alerta"),
    b("d", "2026-11-25", "z", "contraste"), b("e", "2026-11-25", "w", "contraste")];
  assert.deepEqual(elegir(lista, 3).map((x) => x.id), ["c", "e", "b"]);
  assert.deepEqual(elegir([], 3), []);
});

test("htmlPiezas: sin piezas explica cómo se generan; con piezas da descargas y escapa el texto", () => {
  assert.match(htmlPiezas(null), /Piezas de marketing/);
  const h = htmlPiezas({ fecha: "2026-11-25", generado_utc: "2026-11-25T13:50:00Z", piezas: [{ titular: "<b>x</b>", pilar: "alerta", fuente: "SESNSP",
    archivos: { post: "post-1.png", historia: "historia-1.png", short: "short-1.mp4" } }] });
  assert.match(h, /data\/marketing\/piezas\/post-1\.png/);
  assert.match(h, /short-1\.mp4/);
  assert.ok(!h.includes("<b>x</b>"));
});

test("el plan de lanzamiento existe y se dibuja con sus redes y pasos", () => {
  const plan = JSON.parse(readFileSync(new URL("../../config/marketing.json", import.meta.url), "utf8"));
  const l = plan.lanzamiento;
  assert.ok(l.redes.length >= 3 && l.pasos.length >= 3 && l.segmentos.length >= 2);
  const h = htmlLanzamiento(l, { tareas: {} });
  for (const r of l.redes) assert.ok(h.includes(r.nombre.replace(/&/g, "&amp;")), r.nombre);
  assert.match(h, /data-tarea="lanz-0-0"/);
});
