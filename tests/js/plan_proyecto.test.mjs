// Plantilla de proyecto en Excel: contenido del plan (fases, base normativa, ruta de empresa extranjera) y archivo .xlsx válido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../../js/plan-proyecto.js";
import { excelPlan, excelPlanComprimido, jsonPlan, hojasPlan } from "../../js/plan-excel.js";
import { col, serialFecha, libroXLSX } from "../../js/xlsx-escritor.js";

const cfg = JSON.parse(readFileSync(new URL("../../config/plan_proyecto.json", import.meta.url)));
const cat = (i) => JSON.parse(readFileSync(new URL(`../../config/normativa/${i}.json`, import.meta.url)));
const catalogos = { MEX: cat("MEX"), USA: cat("USA") };
const duraciones = JSON.parse(readFileSync(new URL("../../config/plan_duraciones.json", import.meta.url))).reglas;
const OP = { cfg, titulo: "Prueba", inicio: new Date("2026-11-16T00:00:00Z"), sectorNombre: "Hidrocarburos", paises: ["México", "Estados Unidos"], extranjera: true, revisado: "2026-11" };

test("plantilla: cada tarea apunta a una fase, rol y predecesora válidos; las leyes citadas existen en el catálogo", () => {
  const fases = new Set(cfg.fases.map(([f]) => f)), roles = new Set(cfg.roles.map(([r]) => r)), ids = new Set(cfg.tareas.map((t) => t.id));
  for (const t of cfg.tareas) {
    assert.ok(fases.has(t.fase) && roles.has(t.rol), t.id);
    assert.ok(!t.pred || ids.has(t.pred), `${t.id}: predecesora ${t.pred}`);
    for (const k of t.leyes) {
      const [iso, id] = k.split(":");
      const n = cat(iso), todas = [...n.generales.flatMap((g) => g.leyes), ...Object.values(n.sectores).flatMap((s) => s.leyes)];
      assert.ok(todas.some((l) => l.id === id), `${t.id}: ley ${k}`);
    }
  }
  for (const f of cfg.fases) assert.ok(cfg.raci[f[0]], `RACI de ${f[0]}`);
});

test("plan: generales por país, ruta de empresa extranjera solo en México, trámites del sector en permisos y recurrentes en operación", () => {
  const p = P.construirPlan({ cfg, catalogos, jurisdicciones: ["MEX", "USA"], sector: "hidrocarburos", extranjera: true, duraciones });
  const ids = new Set(p.tareas.map((t) => t.id));
  assert.equal(ids.size, p.tareas.length);  // sin ID repetidos
  assert.ok(ids.has("G-F0-01") && !ids.has("MEX-G-F0-01"));  // diagnóstico: una sola vez
  assert.ok(ids.has("MEX-G-F1-04") && ids.has("USA-G-F1-04"));  // constitución en cada país
  assert.ok(ids.has("MEX-X-F1-05") && ![...ids].some((i) => i.startsWith("USA-X-")));  // RNIE solo en México
  const cne = p.tareas.find((t) => t.id === "MEX-T-lsh-1");
  assert.equal(cne.fase, "F3"); assert.match(cne.plazo, /antes de operar/i);
  assert.ok(p.tareas.filter((t) => t.fase === "F8").length > 20 && p.recurrentes.length > 20);
  for (const t of p.tareas) if (t.pred) assert.ok(ids.has(t.pred), `${t.id} → ${t.pred}`);
  const orden = cfg.fases.map(([f]) => f);
  assert.deepEqual([...new Set(p.tareas.map((t) => t.fase))], orden);  // ordenado por fase
  assert.ok(p.base.some((b) => b.id === "MEX:dacg_comercializacion_cne"));
  assert.ok(p.auditoria.length > 100 && p.riesgos.length > 50);
  const sinExt = P.construirPlan({ cfg, catalogos, jurisdicciones: ["MEX"], extranjera: false });
  assert.ok(!sinExt.tareas.some((t) => t.id.includes("-X-")));
});

test("duración de trámites según la norma: reglas citadas, plazo legal escrito y estimación marcada", () => {
  const ley = { sigla: "LGEEPA", nombre: "Ley General del Equilibrio Ecológico" };
  assert.match(P.duracionTramite({ que: "Autorización de impacto ambiental (MIA)", plazo: "Antes de construir" }, { iso: "MEX", fase: "F4", ley }, duraciones).base, /LGEEPA art\. 35 Bis/);
  assert.equal(P.duracionTramite({ que: "Permiso de la CNE", plazo: "Antes de operar" }, { iso: "MEX", sector: true, fase: "F3", ley: {} }, duraciones).dias, 63);
  assert.match(P.duracionTramite({ que: "Permiso", plazo: "Antes de operar" }, { iso: "USA", sector: true, fase: "F3", ley: {} }, duraciones).base, /^Estimación/);
  assert.deepEqual(P.duracionTramite({ que: "Registro", plazo: "30 días desde el acuerdo" }, { iso: "MEX", fase: "F1", ley: {} }, duraciones), { dias: 22, base: "Plazo legal: 30 días naturales (≈22 hábiles)" });
  assert.equal(P.duracionTramite({ que: "Aviso", plazo: "5 días hábiles" }, { iso: "MEX", fase: "F2", ley: {} }, duraciones).dias, 5);
  assert.equal(P.duracionTramite({ que: "Alta de trabajadores en el seguro social", plazo: "Al contratar" }, { iso: "MEX", fase: "F5", ley: {} }, duraciones).dias, 5);
  assert.equal(P.duracionTramite({ que: "Declaración", plazo: "Día 17 del mes siguiente" }, { iso: "MEX", fase: "F8", ley: {} }, duraciones).dias, 1);
  assert.deepEqual(P.proximaFecha("Día 17 del mes siguiente"), { tipo: "mensual", dia: 17 });
  assert.deepEqual(P.proximaFecha("31 de marzo"), { tipo: "anual", mes: 3, dia: 31 });
  assert.deepEqual(P.proximaFecha("Último día de abril (año calendario)"), { tipo: "anual", mes: 4, dia: 0 });
  assert.equal(P.proximaFecha("Anual"), null);
  const p = P.construirPlan({ cfg, catalogos, jurisdicciones: ["MEX"], sector: "hidrocarburos", duraciones });
  const tr = p.tareas.filter((t) => t.id.includes("-T-"));
  assert.ok(tr.every((t) => t.base_dias && t.dias >= 1));
  assert.ok(tr.filter((t) => !/^Estimación/.test(t.base_dias)).length > tr.length * 0.8);  // casi todas salen de la norma
});

test("clasificación de trámites por plazo y feriados de México", () => {
  assert.equal(P.faseDeTramite("Día 17 del mes siguiente", "F2"), "F8");
  assert.equal(P.faseDeTramite("1 hora al gobierno local", "F5"), "F9");
  assert.equal(P.faseDeTramite("Antes de operar", "F3"), "F3");
  assert.equal(P.faseDeTramite("Según permiso", "F3", "Reportes periódicos"), "F8");
  assert.equal(P.frecuenciaDe("Día 17 del mes siguiente"), "Mensual");
  assert.deepEqual(P.feriadosMexico([2026]), ["2026-01-01", "2026-02-02", "2026-03-16", "2026-05-01", "2026-09-16", "2026-11-16", "2026-12-25"]);
  assert.ok(P.feriadosMexico([2030]).includes("2030-10-01"));
});

test("Excel: hojas, fórmulas de fechas y Gantt, y ZIP válido (con y sin compresión)", async () => {
  assert.equal(col(0), "A"); assert.equal(col(25), "Z"); assert.equal(col(26), "AA"); assert.equal(col(128), "DY");
  assert.equal(serialFecha(new Date("2026-11-16T00:00:00Z")), 46342);
  const p = P.construirPlan({ cfg, catalogos, jurisdicciones: ["MEX", "USA"], sector: "hidrocarburos", extranjera: true, duraciones });
  const hojas = hojasPlan(p, OP);
  assert.deepEqual(hojas.map((h) => h.nombre), ["Instrucciones", "Plan", "Gantt", "Vencimientos", "Tablero", "Calendario", "Base normativa", "Auditoría", "Riesgos", "RACI", "Días inhábiles", "Diccionario"]);
  const plan = hojas[1], f7 = plan.filas[6];
  assert.match(f7[17].f, /WORKDAY\(INDEX/); assert.match(f7[18].f, /IF\(T7="No",R7,WORKDAY/);
  assert.ok(plan.validaciones.some((v) => v.lista?.includes("No")));
  const gantt = hojas[2], ven = hojas[3];
  assert.match(gantt.filas[5][4].f, /INDEX\(Plan!\$R:\$R,ROW\(\)\)/);  // misma fila del Plan
  assert.ok(["gantt", "ganttHecho", "ganttVencido", "ganttCurso", "ganttHito", "hoy"].every((e) => gantt.condicionales.some((c) => c.estilo === e)));
  assert.match(ven.filas[15][7].f, /Vencido/); assert.match(ven.filas[15][4].f, /ROW\(\)-10/);
  assert.match(hojas[5].filas.slice(4).map((f) => f[8].f || "").join(" "), /DATE\(YEAR\(TODAY\(\)\)/);  // próxima fecha calculada
  const crudo = excelPlan(p, OP), comp = await excelPlanComprimido(p, OP);
  for (const b of [crudo, comp]) {
    assert.deepEqual([...b.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    const fin = b.length - 22;
    assert.deepEqual([...b.slice(fin, fin + 4)], [0x50, 0x4b, 0x05, 0x06]);
    assert.equal(b[fin + 10], 18);  // 6 partes del paquete + 12 hojas
  }
  assert.ok(comp.length < crudo.length / 4);
  const txt = new TextDecoder().decode(crudo);
  assert.match(txt, /<sheet name="Base normativa"/);
  assert.doesNotMatch(txt, /<t xml:space="preserve">[^<]*&(?!amp;|lt;|gt;|quot;)/);  // texto escapado
  assert.throws(() => libroXLSX([{ nombre: "A", filas: [] }, { nombre: "A", filas: [] }]));
  const j = jsonPlan(p, { titulo: "x", inicio: OP.inicio, sector: "hidrocarburos", paises: ["MEX", "USA"], extranjera: true });
  assert.equal(j.formato, "dominus-plan-proyecto"); assert.equal(j.columnas[0].clave, "id"); assert.equal(j.tareas.length, p.tareas.length);
});
