// Organización DOMINUS: catálogo de áreas (config/organizacion.json) y cálculo de avance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avance, csv } from "../../js/organizacion.js";

const cat = JSON.parse(readFileSync(new URL("../../config/organizacion.json", import.meta.url), "utf8"));

test("catálogo: ids únicos y válidos para la API, etapas conocidas, cada área con objetivo y tareas", () => {
  const ids = new Set();
  for (const a of cat.areas) {
    assert.ok(a.objetivo && a.tareas.length && Array.isArray(a.normas) && a.herramientas.length, a.id);
    for (const t of a.tareas) {
      const k = `${a.id}.${t.id}`;
      assert.match(k, /^[a-z0-9_]{1,30}\.[a-z0-9_]{1,30}$/);
      assert.ok(!ids.has(k), k); ids.add(k);
      assert.ok(cat.etapas[t.etapa], `${k}: etapa ${t.etapa}`);
    }
  }
  assert.ok(ids.has("legal.sociedad"), "recordatorio de constituir sociedad");
  assert.ok(cat.areas.length >= 12);
});

test("avance: no cuenta «no aplica» y filtra por etapa", () => {
  const a = { id: "x", tareas: [{ id: "a", etapa: "ahora" }, { id: "b", etapa: "ahora" }, { id: "c", etapa: "escala" }] };
  const r = { "x.a": { estado: "cumple" }, "x.b": { estado: "no_aplica" } };
  assert.equal(avance(a, r).pct, 50);
  assert.equal(avance(a, r, "ahora").pct, 100);
  assert.match(csv({ etapas: { ahora: "Ahora", escala: "Escala" }, areas: [{ ...a, nombre: "X" }].map((x) => ({ ...x, tareas: x.tareas.map((t) => ({ ...t, texto: t.id })) })) }, r), /Hecho/);
});
