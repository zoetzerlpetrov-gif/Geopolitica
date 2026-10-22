import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../../js/analitica-logica.js";

const dias = Array.from({ length: 28 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, total: i < 21 ? 100 + (i % 3) : 160,
  areas: { seguridad: i < 21 ? 20 : 50 }, sev: { 4: 3 }, paises: { MEX: i < 21 ? 2 : 8, USA: 10 } }));

test("series y anomalía", () => {
  assert.equal(A.serie(dias, "area:seguridad")[25].n, 50);
  assert.equal(A.serie(dias, "pais:MEX")[0].n, 2);
  assert.equal(A.serie(dias, "sev:4")[0].n, 3);
  const z = A.anomalia(A.serie(dias, "total").map((p) => p.n));
  assert.ok(z.z > 2 && z.cambio_pct > 50);
  assert.equal(A.anomalia([1, 2, 3]), null);
});

test("países en alza, polilínea, perfil y frescura", () => {
  const alza = A.paisesAlza(dias);
  assert.equal(alza[0].pais, "MEX"); assert.equal(alza[0].razon, 4);
  assert.equal(A.polilinea([0, 10], 100, 50, 0), "0,50 100,0");
  const p = A.perfilPais([{ pais_iso3: "MEX", severidad: 5, area_principal: "seguridad" }, { pais_iso3: "USA", severidad: 1 }], "MEX");
  assert.deepEqual(p, { total: 1, graves: 1, areas: { seguridad: 1 } });
  const ahora = new Date("2026-10-22T12:00:00Z");
  const f = A.frescura([{ nombre: "a", actualizado: "2026-10-22T11:00:00Z", cada_h: 1 }, { nombre: "b", actualizado: "2026-10-20T00:00:00Z", cada_h: 6 }, { nombre: "c" }], ahora);
  assert.deepEqual(f.map((x) => x.estado), ["al día", "detenida", "sin dato"]);
});

test("CSV, Banco Mundial y prompt", () => {
  assert.match(A.eventosCSV([{ titulo: 'Dice "hola"', pais_iso3: "MEX" }]), /"Dice ""hola"""/);
  assert.deepEqual(A.leerBM([{}, [{ value: 2.5, date: "2024" }]]), { valor: 2.5, anio: "2024" });
  assert.equal(A.leerBM([{}, []]), null);
  assert.match(A.promptSerie("Seguridad", [{ dia: "d", n: 3 }], { media_base: 1, media_reciente: 3, z: 2 }), /z = 2/);
});
