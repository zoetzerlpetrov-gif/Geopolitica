import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../js/ciencia.js";

const cat = JSON.parse(readFileSync(new URL("../../config/escenarios.json", import.meta.url)));
const modelos = JSON.parse(readFileSync(new URL("../../config/modelos_ciencia.json", import.meta.url)));
const ctx = { cliente: { ingresos: 500000000, empleados: 300, margen: 12 } };

test("distribuciones y estadística", () => {
  assert.ok(Math.abs(C.fiNormal(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(C.fiInversa(0.975) - 1.96) < 1e-3);
  const { mu, sigma } = C.lognormalDesdeRango(100, 1000);
  assert.ok(Math.abs(Math.exp(mu) - 100) < 1e-9 && Math.abs(Math.exp(mu + 1.2815515655446004 * sigma) - 1000) < 1e-6);
  const u = C.rng(7), v = Array.from({ length: 20000 }, () => C.poisson(u, 3));
  assert.ok(Math.abs(C.media(v) - 3) < 0.05);
  const r = C.resumen([0, 0, 10, 20, 100]);
  assert.equal(r.mediana, 10);
  assert.equal(C.rng(1)(), C.rng(1)(), "misma semilla, mismo número");
});

test("álgebra lineal, ecuaciones diferenciales y evaluador", () => {
  const inv = C.inversa([[4, 7], [2, 6]]);
  assert.ok(Math.abs(inv[0][0] - 0.6) < 1e-9 && Math.abs(inv[1][0] + 0.2) < 1e-9);
  const L = C.cholesky([[4, 2], [2, 3]]);
  assert.ok(Math.abs(L[1][1] - Math.sqrt(2)) < 1e-9);
  const pi = C.estacionaria([[0.9, 0.1], [0.5, 0.5]]);
  assert.ok(Math.abs(pi[1] - 1 / 6) < 1e-6);
  const p = C.rk4((t, [y]) => [y], [1], 0, 1, 0.1);
  assert.ok(Math.abs(p.at(-1).y[0] - Math.E) < 1e-5);
  assert.equal(C.evaluar("cliente.ingresos * 0.01 + max(2, 3)", ctx), 5000003);
  assert.ok(Number.isNaN(C.evaluar("alert(1)")));
  assert.ok(Number.isNaN(C.evaluar("constructor.constructor")));
});

test("física, química y colas con valores conocidos", () => {
  const e = C.MODELOS.erlang_c({ llamadas_hora: 100, minutos_servicio: 3, agentes: 7 });
  assert.ok(Math.abs(e.prob - 0.324) < 0.01);
  const ex = C.MODELOS.sobrepresion_explosion({ tnt_kg: 1 });
  assert.ok(ex.radios[0].radio_m > ex.radios[4].radio_m);
  const hi = C.MODELOS.estres_termico({ temp_c: 35, humedad: 60, trabajadores: 1, horas: 1, costo_hora: 1 });
  assert.match(hi.pasos[0][2], /45\.\d °C/);
  assert.ok(C.MODELOS.pluma_gaussiana({ q_gs: 100, viento: 3, altura: 0, limite_mgm3: 10 }).distancia_m > 0);
  const pr = C.MODELOS.periodo_retorno({ T: 100, horizonte: 50, perdida_evento: 1000 });
  assert.ok(Math.abs(pr.prob_horizonte - (1 - 0.99 ** 50)) < 1e-12);
  assert.equal(pr.prob, 0.01);
});

test("los escenarios del catálogo corren con datos del cliente y dan nivel 5×5", () => {
  assert.ok(cat.escenarios.length >= 30);
  const ids = new Set();
  for (const e of cat.escenarios) {
    assert.ok(!ids.has(e.id), e.id); ids.add(e.id);
    assert.ok(C.MODELOS[e.modelo], e.modelo);
    const r = C.simular(e, {}, ctx);
    assert.ok(r.pasos.length >= 1, e.id);
    if (r.prob != null) assert.ok(r.prob >= 0 && r.prob <= 1, `${e.id} prob ${r.prob}`);
    if (r.perdida != null) assert.ok(Number.isFinite(r.perdida) && r.perdida >= 0, `${e.id} pérdida ${r.perdida}`);
  }
  const usados = new Set(modelos.modelos.map((m) => m.motor).filter(Boolean));
  for (const m of usados) assert.ok(C.MODELOS[m], m);
  assert.throws(() => C.simular(cat.escenarios[0], { p50: "abc" }, ctx), /Falta un dato/);
});

test("propuestas por contexto son reproducibles", () => {
  const p = C.proponer(cat.escenarios, { texto: "Nos preocupa un ciberataque y el robo de carga en carretera", sector: "logistica", eventosPorArea: { seguridad: 30, clima: 5 } });
  assert.ok(p.slice(0, 4).some((x) => x.id === "ransomware"));
  assert.ok(p.slice(0, 4).some((x) => x.id === "robo_transporte"));
  assert.deepEqual(p, C.proponer(cat.escenarios, { texto: "Nos preocupa un ciberataque y el robo de carga en carretera", sector: "logistica", eventosPorArea: { seguridad: 30, clima: 5 } }));
});
