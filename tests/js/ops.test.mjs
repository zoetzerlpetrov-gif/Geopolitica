import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as O from "../../js/ops-logica.js";

const cfg = JSON.parse(readFileSync(new URL("../../config/dominus_ops.json", import.meta.url)));

test("datos de DOMINUS OPS: 6 fases con etapas, cuestionario y plantillas; sin precios", () => {
  assert.equal(cfg.fases.length, 6);
  for (const f of cfg.fases) {
    assert.ok(f.etapas.length >= 5 && f.cuestionario.length >= 5 && f.plantillas.length === 5, f.nombre);
    for (const p of f.plantillas) for (const fila of p.ejemplo) assert.equal(fila.length, p.columnas.length, `${f.nombre}: ${p.titulo}`);
  }
  assert.equal(cfg.dmi.dimensiones.length, 9); assert.equal(cfg.gobernanza.length, 9);
  assert.doesNotMatch(JSON.stringify(cfg), /USD/);  // los ejemplos de presupuesto sí; los precios del servicio no
});

test("DMI, nivel y sugerencia desde el cuestionario", () => {
  assert.equal(O.dmi({ Estrategia: 4, Gobernanza: 2, x: 0 }), 3);
  assert.equal(O.dmi({ Estrategia: 4, Gobernanza: 2 }, { Estrategia: 3 }), 3.5);
  assert.equal(O.dmi({}), null);
  assert.equal(O.nivelDMI(3.6, cfg.dmi.niveles)[1], "Gestionado");
  const sec = cfg.fases[0].cuestionario;
  const prom = O.promediosCuestionario(sec, { "0-0": 4, "0-1": 5, "2-0": 2 });
  assert.equal(prom[sec[0].seccion], 4.5);
  assert.deepEqual(O.sugerirDMI(prom), { Estrategia: 5, "Cumplimiento normativo": 2 });
});

test("radar, gobernanza y remediación", () => {
  assert.deepEqual(O.puntosRadar([5, 0], 100, 50)[0], [100, 50]);
  assert.equal(O.colorGob(2), "rojo"); assert.equal(O.colorGob(3), "ambar"); assert.equal(O.colorGob(5), "verde");
  const plan = O.planRemediacion(cfg.gobernanza, { "Gobierno de datos": { nota: 1 }, "Gobierno de IA y ética": { nota: 3, esfuerzo: 1 }, "Alineación estrategia–ejecución": { nota: 5 } });
  assert.deepEqual(plan.map((x) => x.d), ["Gobierno de datos", "Gobierno de IA y ética"]);
});

test("SITREP con eventos del mapa y KPIs", () => {
  const ahora = new Date("2026-10-22T12:00:00Z");
  const ev = [{ pais_iso3: "MEX", severidad: 5, titulo: "Bloqueo", fuente: "X", fecha_utc: "2026-10-22T08:00:00Z" },
              { pais_iso3: "USA", severidad: 5, titulo: "Fuera", fuente: "Y", fecha_utc: "2026-10-22T08:00:00Z" },
              { pais_iso3: "MEX", severidad: 2, titulo: "Viejo", fuente: "Z", fecha_utc: "2026-10-19T08:00:00Z" }];
  const r = O.sitrep(ev, ["mex"], [{ nombre: "Entregas a tiempo", estado: "ambar" }], ahora);
  assert.equal(r.total, 1); assert.equal(r.condicion, "ÁMBAR"); assert.match(r.texto, /\[S5\] MEX · Bloqueo/);
  assert.equal(O.aCSV(["a", "b"], [["x\"y", 1]]), '"a","b"\n"x""y","1"');
});

test("biblioteca: búsqueda y documento de plantilla", async () => {
  const O = await import("../../js/ops-logica.js");
  const lista = [{ id: "scrum", nombre: "Scrum", organismo: "Scrum.org", para_que: "Marco ágil", conceptos: [["Sprint", "Iteración"]], plantillas: [{ nombre: "Product Backlog" }] },
    { id: "iso27001", nombre: "ISO/IEC 27001", organismo: "ISO", para_que: "Seguridad de la información", conceptos: [], plantillas: [{ nombre: "Declaración de Aplicabilidad" }] }];
  assert.deepEqual(O.buscarMetodologias(lista, "sprint").map((m) => m.id), ["scrum"]);
  assert.deepEqual(O.buscarMetodologias(lista, "aplicabilidad").map((m) => m.id), ["iso27001"]);
  assert.equal(O.buscarMetodologias(lista, "").length, 2);
  const pl = { nombre: "Backlog", proposito: "Priorizar", campos: [{ k: "p", etiqueta: "Producto", tipo: "texto" }, { k: "t", etiqueta: "Elementos", tipo: "tabla", columnas: ["ID", "Historia"] }] };
  const d = O.documentoPlantilla(lista[0], pl, { p: "App <X>", t: [["1", "Como cliente | quiero"]] }, { nombre: "ACME" });
  assert.match(d.md, /\*\*Producto:\*\* App <X>/);
  assert.match(d.md, /\| 1 \| Como cliente \\\| quiero \|/);
  assert.match(d.html, /App &lt;X&gt;/);
  assert.match(d.html, /Cliente:<\/b> ACME/);
  assert.equal(O.vacioDe({ tipo: "tabla" }).length, 0);
});

test("informe: estado de fases, hallazgos, propuestas, plan y presupuesto", async () => {
  const I = await import("../../js/ops-informe-logica.js");
  const cfg = JSON.parse(readFileSync(new URL("../../config/dominus_ops.json", import.meta.url)));
  const d = { cliente: { nombre: "ACME", empleados: 300, ingresos: 500000000, moneda: "MXN" },
    dmi: { puntos: { "Estrategia": 4, "Gobernanza": 2, "Seguridad y privacidad": 3 }, evidencia: {}, cuest: {} },
    gob: { [cfg.gobernanza[0][0]]: { nota: "1", hallazgo: "Todo lo aprueba el director" } },
    raci: { filas: [{ d: "Aprobar compras", v: ["R", "R"] }] }, pl: { "0-0": [["a", "b"]] },
    kpi: [{ nombre: "Entregas", meta: "95 %", valor: "90 %", dueno: "", estado: "rojo" }],
    esc: [{ nombre: "Ransomware", nivel: "alto", prob: 0.15, perdida: 1000000, var95: 9000000, nivel_prob: 3, nivel_imp: 4 }] };
  const est = I.estadoFases(cfg, d);
  assert.equal(est.length, 6);
  assert.ok(est[0].pct > 0 && est[0].pct <= 100);
  const h = I.hallazgos(cfg, d);
  assert.ok(h.positivos.some((x) => x.startsWith("Estrategia")));
  assert.ok(h.negativos.some((x) => x.includes("Gobernanza: madurez 2")));
  assert.ok(h.negativos.some((x) => x.includes("Aprobar compras")));
  assert.ok(h.negativos.some((x) => x.includes("Ransomware")));
  assert.ok(h.mejorar.some((x) => x.includes("sin dueño") || x.includes("no tiene dueño")));
  const p = I.propuestas(cfg, d, [{ id: "cobit2019", nombre: "COBIT 2019" }]);
  assert.equal(p[0].nivel, 1);
  assert.ok(p.some((x) => x.dimension === "Gobernanza" && x.metodologias.includes("COBIT 2019")));
  assert.ok(!p.some((x) => x.dimension === "Estrategia"));
  const plan = I.planTrabajo(cfg, d, est);
  assert.equal(plan.length, 6);
  assert.ok(plan[3].inicio < plan[2].fin, "la fase IV arranca antes de que termine la III");
  const pres = I.presupuesto(plan, I.TARIFAS, { contingencia: 0.1, impuesto: 0.16 });
  assert.ok(Math.abs(pres.total - pres.subtotal * 1.1 * 1.16) < 1);
  const html = I.informeHTML(cfg, d, { opciones: { consultor: "Firma X" } });
  for (const t of ["Resumen ejecutivo", "Estado de las 6 fases", "Propuestas de DOMINUS OPS", "Servicios que no ofrecemos", "Plan de trabajo", "Presupuesto estimado"]) assert.match(html, new RegExp(t));
  assert.match(html, /Firma X/);
  assert.match(I.promptInforme(cfg, d)[1].content, /===DETALLE===/);
});
