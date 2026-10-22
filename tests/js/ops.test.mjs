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
