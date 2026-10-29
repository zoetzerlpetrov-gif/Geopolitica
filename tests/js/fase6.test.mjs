import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlInventario, coincide, cuentaOpciones } from "../../js/tutorial-logica.js";

const inv = JSON.parse(readFileSync(new URL("../../config/tutorial_inventario.json", import.meta.url)));
const html = readFileSync(new URL("../../tutorial.html", import.meta.url), "utf8");

test("inventario: todos los grupos del menú izquierdo y cientos de opciones", () => {
  for (const g of ["Eventos y noticias", "Capas del mapa", "En movimiento", "Riesgos y clima", "Fenómenos anómalos", "Historia por país", "Reportes diarios", "Herramientas", "Investigación", "Seguimiento"])
    assert.ok(inv.panel.some((b) => b.titulo.includes(g)), g);
  assert.ok(inv.panel.reduce((s, b) => s + cuentaOpciones(b), 0) > 500);
  assert.ok(inv.secciones.some((s) => s.href === "tutorial.html"));
});

test("tutorial: cada grupo con inventario tiene su bloque y cada sección de la barra se explica", () => {
  for (const m of html.matchAll(/data-inv="([^"]+)"/g)) assert.ok(inv.panel.some((b) => b.titulo.includes(m[1])), m[1]);
  for (const t of ["Noticiero DOMINUS", "Narrativas", "Inteligencia corporativa", "DOMINUS OPS", "Inmuebles y riesgo", "Analítica", "Marco normativo", "Caja del analista"])
    assert.ok(html.includes(t), t);
  assert.ok((html.match(/class="ejemplo"/g) || []).length >= 15);
});

test("lógica: html escapado y búsqueda por todas las palabras", () => {
  const h = htmlInventario({ titulo: "X", opciones: [{ t: "<b>a</b>", ayuda: "" }], sub: [{ titulo: "Sub", opciones: [{ t: "c", ayuda: "d" }], sub: [] }] });
  assert.ok(!h.includes("<b>a</b>") && h.includes("<b>Sub</b>"));
  assert.ok(coincide("sismos de hoy en mexico", "sismos mexico"));
  assert.ok(!coincide("sismos de hoy", "sismos mexico"));
});
