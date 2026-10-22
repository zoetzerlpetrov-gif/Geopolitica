import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../../js/tableros-logica.js";

const d = { dmi: { total: 2.4, nivel: [2, "Definido"], puntos: { A: 2, B: 3 }, dimensiones: ["A", "B", "C"] },
  fases: [{ fase: "Fase I — Estrategia", pct: 80 }, { fase: "Fase II — Diseño", pct: 0 }],
  kpi: [{ nombre: "OTIF", meta: "95", valor: "90", dueno: "Ops", estado: "rojo" }, { nombre: "Caja", meta: "1", valor: "1", dueno: "CFO", estado: "verde" }],
  esc: [{ nombre: "Ransomware", categoria: "Ciber", prob: 0.15, perdida: 1000, var95: 9000, nivel: "alto", nivel_prob: 3, nivel_imp: 4 }],
  gob: { G1: { nota: "2" } }, gobDims: ["G1", "G2"], eventos: [{ titulo: "Bloqueo <x>", severidad: 4, area_principal: "seguridad", pais_iso3: "MEX", url: "https://e.x", fecha_utc: "2026-10-22T01:00Z" }],
  paises: { MEX: "México" }, indice: { MEX: { indice: 61 } }, paisesCliente: ["MEX"], nombresArea: { seguridad: "Seguridad" } };

test("todos los widgets se dibujan y escapan el texto", () => {
  for (const tipo of Object.keys(T.WIDGETS)) {
    const h = T.widgetHTML({ tipo, titulo: `T ${tipo}`, texto: "a<b>" }, d);
    assert.match(h, /^<section class="tb-w"/, tipo);
    assert.doesNotMatch(h, /a<b>/);
  }
  assert.match(T.widgetHTML({ tipo: "eventos_graves" }, d), /Bloqueo &lt;x&gt;/);
  assert.match(T.widgetHTML({ tipo: "dmi_total" }, d), /2\.4/);
  assert.match(T.widgetHTML({ tipo: "indice_pais" }, d), /México/);
  for (const t of T.PREDEFINIDOS) assert.ok(t.widgets.every((w) => T.WIDGETS[w.tipo]));
});

test("diseño de la IA validado y empaquetado del War Room", async () => {
  const r = T.leerTableroIA('Aquí va: {"nombre":"Comité","widgets":[{"tipo":"riesgos_matriz","titulo":"Matriz","ancho":5},{"tipo":"hackear","titulo":"x"}]}');
  assert.deepEqual(r, { nombre: "Comité", widgets: [{ tipo: "riesgos_matriz", titulo: "Matriz", ancho: 3 }] });
  assert.equal(T.leerTableroIA("sin json"), null);
  assert.match(T.promptTablero("comité")[1].content, /riesgos_matriz/);
  const obj = { tablero: T.PREDEFINIDOS[3], datos: T.instantanea({ ...d, cliente: { nombre: "ACME", pais: "MEX" } }) };
  const txt = await T.empaquetar(obj);
  assert.match(txt, /^[\w-]+$/);
  assert.deepEqual(await T.desempaquetar(txt), JSON.parse(JSON.stringify(obj)));
  assert.equal(obj.datos.esc[0].params, undefined);
});
