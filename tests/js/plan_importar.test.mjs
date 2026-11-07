// Importación del plan de proyecto (Excel guardado por una hoja de cálculo, Excel recién generado y JSON) y su tablero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../../js/plan-proyecto.js";
import * as I from "../../js/plan-importar.js";
import { excelPlanComprimido, jsonPlan } from "../../js/plan-excel.js";
import { leerXLSX, fechaDeSerie, numCol } from "../../js/xlsx-lector.js";
import { widgetsPlan, ganttFasesSVG } from "../../js/plan-tablero.js";
import { widgetHTML, WIDGETS, PREDEFINIDOS } from "../../js/tableros-logica.js";

const cfg = JSON.parse(readFileSync(new URL("../../config/plan_proyecto.json", import.meta.url)));
const CHL = JSON.parse(readFileSync(new URL("../../config/normativa/CHL.json", import.meta.url)));
const HOY = new Date("2026-04-15T12:00:00Z");

test("lector de .xlsx: guardado por LibreOffice (cadenas compartidas y valores de fórmulas)", async () => {
  assert.equal(numCol("A1"), 0); assert.equal(numCol("AB12"), 27);
  assert.equal(fechaDeSerie(46342), "2026-11-16"); assert.equal(fechaDeSerie("x"), null);
  const h = await leerXLSX(readFileSync(new URL("./fixtures/plan-chile-recalculado.xlsx", import.meta.url)));
  assert.ok(["Plan", "Gantt", "Vencimientos", "Calendario"].every((k) => h[k]));
  const plan = I.desdeHojas(h);
  assert.equal(plan.inicio, "2026-03-02");
  assert.equal(plan.titulo, "Prueba Chile");
  const t1 = plan.tareas.find((t) => t.id === "G-F0-01"), t2 = plan.tareas.find((t) => t.id === "G-F0-02");
  assert.equal(t1.estado, "Hecho"); assert.equal(t1.avance, 1);
  assert.equal(t2.estado, "En curso"); assert.equal(t2.avance, 0.5);
  assert.equal(t1.inicio, "2026-03-02"); assert.equal(t1.fin, "2026-03-04");  // valor guardado por la hoja de cálculo
  assert.ok(plan.tareas.some((t) => t.hito) && plan.leyes.some((x) => x.startsWith("CHL:")));
  assert.ok(plan.recurrentes.length > 5 && plan.riesgos.length > 5 && plan.auditoria.total > 20);
});

test("Excel recién generado (sin valores guardados): las fechas se calculan igual que las fórmulas", async () => {
  const p = P.construirPlan({ cfg, catalogos: { CHL }, jurisdicciones: ["CHL"], nombres: { CHL: "Chile" } });
  const bytes = await excelPlanComprimido(p, { cfg, titulo: "Recién generado", inicio: new Date("2026-03-02T00:00:00Z"), paises: ["Chile"], revisado: "2026-11" });
  const fijo = I.desdeHojas(await leerXLSX(readFileSync(new URL("./fixtures/plan-chile-recalculado.xlsx", import.meta.url))));
  const plan = await I.importarArchivo("plan.xlsx", bytes);
  assert.equal(plan.tareas.length, fijo.tareas.length);
  const porId = Object.fromEntries(fijo.tareas.map((t) => [t.id, t]));
  const distintas = plan.tareas.filter((t) => t.fin !== porId[t.id].fin || t.inicio !== porId[t.id].inicio);
  assert.deepEqual(distintas.map((t) => t.id), []);  // mismo calendario que calculó la hoja de cálculo
  await assert.rejects(() => I.importarArchivo("x.csv", new Uint8Array(4)), /Formato no admitido/);
  await assert.rejects(() => I.importarArchivo("x.xlsx", new Uint8Array(30)), /Excel|ZIP/);
});

test("JSON de la plantilla y semáforo de vencimientos", () => {
  const p = P.construirPlan({ cfg, catalogos: { CHL }, jurisdicciones: ["CHL"] });
  const j = jsonPlan(p, { titulo: "JSON Chile", inicio: new Date("2026-03-02T00:00:00Z"), sector: "", paises: ["CHL"], extranjera: false });
  const plan = I.desdeJSON(JSON.parse(JSON.stringify(j)));
  assert.equal(plan.tareas.find((t) => t.id === "G-F0-01").fin, "2026-03-04");
  assert.throws(() => I.desdeJSON({ tareas: [] }), /dominus-plan-proyecto/);
  assert.equal(I.grupoSemaforo("2026-04-10", "Pendiente", "Sí", HOY), "vencido");
  assert.equal(I.grupoSemaforo("2026-04-20", "Pendiente", "Sí", HOY), "7");
  assert.equal(I.grupoSemaforo("2026-05-10", "Pendiente", "Sí", HOY), "30");
  assert.equal(I.grupoSemaforo("2026-06-10", "Pendiente", "Sí", HOY), "60");
  assert.equal(I.grupoSemaforo("2026-09-10", "En curso", "Sí", HOY), "proceso");
  assert.equal(I.grupoSemaforo("2026-04-10", "Hecho", "Sí", HOY), "hecho");
  assert.equal(I.grupoSemaforo("2026-04-10", "Pendiente", "No", HOY), null);
  assert.equal(I.sumarHabiles("2026-03-06", 1), "2026-03-09");  // viernes + 1 hábil = lunes
  assert.equal(I.proximaDe({ tipo: "mensual", dia: 20 }, HOY), "2026-04-20");
  assert.equal(I.proximaDe({ tipo: "anual", mes: 3, dia: 31 }, HOY), "2027-03-31");
  assert.equal(I.proximaDe({ tipo: "anual", mes: 4, dia: 0 }, HOY), "2026-04-30");
});

test("resumen y tablero: avance, fases, por vencer, cambios normativos y widgets de OPS", async () => {
  const plan = I.desdeHojas(await leerXLSX(readFileSync(new URL("./fixtures/plan-chile-recalculado.xlsx", import.meta.url))));
  const r = I.resumenPlan(plan, HOY);
  assert.ok(r.total > 50 && r.hechas === 1 && r.enCurso === 1);
  assert.ok(r.semaforo.vencido > 0 && r.semaforo.hecho >= 1);
  assert.ok(r.proximos.every((x) => ["vencido", "7", "30", "60"].includes(x.grupo)));
  assert.ok(r.proximos[0].dias <= r.proximos.at(-1).dias);  // del más vencido al más lejano
  assert.equal(r.fases[0].fase, "0. Diagnóstico, viabilidad y decisión");
  const ley = plan.leyes[0].split(":")[1];
  const cambios = I.cambiosQueTocan(plan, [{ pais: "CHL", fecha: "2026-04-01", titulo: "Reforma", url: "https://x", impacto: "alto", leyes: [{ id: ley, sigla: "X" }] },
    { pais: "MEX", fecha: "2026-04-01", titulo: "Otra", leyes: [{ id: ley }] }], HOY);
  assert.equal(cambios.length, 1);
  const h = widgetsPlan(plan, r, { cambios, hoy: HOY });
  assert.match(h, /Vencido y por vencer/); assert.match(h, /Reforma/); assert.match(h, /<svg/);
  assert.match(ganttFasesSVG(r.fases, HOY), /hoy/);
  assert.ok(PREDEFINIDOS.some((t) => t.id === "proyecto") && WIDGETS.plan_gantt);
  assert.match(widgetHTML({ tipo: "plan_avance" }, {}), /Importa un plan/);
  assert.match(widgetHTML({ tipo: "plan_semaforo" }, { plan: { plan, resumen: r } }), /Vencido/);
  assert.match(widgetHTML({ tipo: "plan_vencimientos" }, { plan: { plan, resumen: r } }), /<table/);
});
