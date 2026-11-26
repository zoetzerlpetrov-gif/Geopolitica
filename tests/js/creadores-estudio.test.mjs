// Estudio para creadores: lógica (ideas, guion, escenas, métricas, evaluación) y cuenta del creador en el servidor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../../js/creadores-estudio-logica.js";
import { serveCreadores, estadoCreador, DIAS_DEMO } from "../../cloudflare/planes/creadores.js";

const CFG = JSON.parse(readFileSync(new URL("../../config/creadores.json", import.meta.url)));

test("catálogo: nichos fuera de geopolítica, guías con fuente y planes de 7 días, 5 y 10 USD", () => {
  for (const k of ["gastronomia", "viajes", "belleza", "moda", "fitness", "finanzas", "videojuegos", "mascotas", "familia"]) assert.ok(CFG.nichos[k], k);
  for (const n of Object.values(CFG.nichos)) {
    assert.ok(n.subnichos.length >= 3 && n.ideas.every((i) => i.includes("{sub}")) && n.cuidado.length, n.nombre);
  }
  assert.ok(CFG.nichos.gastronomia.subnichos.includes("Cocina vegana") && CFG.nichos.gastronomia.subnichos.includes("Repostería"));
  for (const x of CFG.legal) assert.match(x.fuente[1], /^https:\/\//);
  for (const x of [...CFG.plataformas, ...CFG.monetizacion]) assert.match(x.fuente, /^https:\/\//);
  assert.deepEqual(CFG.planes.map((p) => [p.id, p.precio_usd]), [["demo", 0], ["inicial", 5], ["creador", 10]]);
  assert.equal(CFG.planes[0].dias, 7);
  assert.ok(CFG.legal.some((x) => /íntimo/i.test(x.tema)) && CFG.legal.some((x) => /música/i.test(x.tema)) && CFG.legal.some((x) => /niñas/i.test(x.tema)));
});

test("ideas por nicho, prioridad y guion con duración estimada", () => {
  const ideas = L.ideasDe(CFG.nichos.gastronomia, "Repostería");
  assert.ok(ideas[0].includes("repostería") && !ideas.some((x) => x.includes("{sub}")));
  assert.equal(L.prioridad({ interes: 5, facilidad: 1 }), 3.4);
  assert.equal(L.prioridad({ interes: 9, facilidad: -3 }), 3.4);  // se acota de 1 a 5
  const g = L.guion({ idea: "3 errores al ahorrar", formato: "corto", puntos: ["Uno", "Dos", "Tres"], cta: "Sígueme" });
  assert.equal(g.partes[0].texto, "3 errores al ahorrar");
  assert.equal(g.partes.at(-1).texto, "Sígueme");
  assert.equal(g.total, g.partes.reduce((s, p) => s + p.seg, 0));
  assert.equal(L.segundosDe("una dos tres cuatro cinco"), 2);  // 5 palabras a 2.5 por segundo
  assert.match(L.revisarDuracion(90, "corto"), /hasta 60 s/);
  assert.equal(L.revisarDuracion(30, "corto"), "");
  assert.equal(L.guion({ idea: "x", formato: "carrusel" }).total, 0);
  assert.ok(L.guion({ idea: "x", formato: "largo" }).partes.length >= 6);
});

test("escenas del video, encuadre y fundidos", () => {
  const partes = [{ texto: "Hola a todos" }, { texto: "Uno dos tres cuatro cinco seis siete ocho" }, { texto: "Fin" }];
  const es = L.escenas(partes, [{}, {}]);
  assert.deepEqual(es.map((e) => e.medio), [0, 1, 0]);  // los medios se reparten en orden
  assert.ok(es.every((e) => e.dur >= 2.5));
  assert.deepEqual(L.escenas([], []), []);
  assert.equal(L.opacidad(0.25, 3, 0.5), 0.5);
  assert.equal(L.opacidad(1.5, 3, 0.5), 1);
  assert.ok(L.kenBurns(1, 0).escala > L.kenBurns(0, 0).escala);
  assert.deepEqual(L.LIENZO["9:16"], [1080, 1920]);
  assert.equal(L.atribucion({ titulo: "Playa", autor: "Ana", licencia: "CC BY-SA 4.0", fuente: "Wikimedia Commons" }), "Playa de Ana (CC BY-SA 4.0) vía Wikimedia Commons");
});

test("métricas: tasas y recomendaciones; comparación y evaluación de 30 días", () => {
  const m = L.leerMetricas({ vistas: 10000, me_gusta: 100, comentarios: 10, compartidos: 5, guardados: 5, seguidores: 10, retencion: 20 });
  assert.equal(m.tasa, 1.2);
  assert.ok(m.consejos.some((c) => /gancho/.test(c)) && m.consejos.some((c) => /pregunta/.test(c)) && m.consejos.some((c) => /siguen/.test(c)));
  assert.equal(L.leerMetricas({}).tasa, null);
  const c = L.compararPublicaciones([{ titulo: "A", vistas: 100, me_gusta: 20 }, { titulo: "B", vistas: 100, me_gusta: 2 }, { titulo: "C", vistas: 0 }]);
  assert.equal(c.repetir[0].titulo, "A");
  assert.equal(c.promedio, 11);
  const e = L.evaluacion30({ inicio: "2026-11-01", metaSemana: 3, publicaciones: [{ fecha: "2026-11-02" }, { fecha: "2026-11-05" }, { fecha: "2026-10-20" }] }, new Date("2026-11-10T12:00:00"));
  assert.deepEqual([e.semana, e.hechas, e.esperadas, e.color], [2, 2, 6, "rojo"]);
  assert.equal(L.evaluacion30({}), null);
});

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* sin SQLite */ }
function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
  return { prepare: (s) => stmt(s), batch: async (l) => { for (const x of l) await x.run(); } };
}
const ORIGEN = "https://dominusosint.com";
async function api(env, correo, ruta, cuerpo) {
  const init = cuerpo === undefined ? { headers: { Origin: ORIGEN } } : { method: "POST", headers: { Origin: ORIGEN }, body: JSON.stringify(cuerpo) };
  const req = new Request(`https://admin.dominusosint.com/cuenta/creador/${ruta}`, init);
  const r = await serveCreadores(req, new URL(req.url), env, { correo, origenes: [ORIGEN] });
  return { status: r.status, body: await r.json() };
}

test("cuenta del creador: demo de 7 días, cortesía, guardado y solo lectura al vencer", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1() };
  assert.equal((await api(env, null, "estado")).status, 401);
  const e = (await api(env, "ana@x.mx", "estado")).body;
  assert.deepEqual([e.plan, e.dias_restantes, e.activo], ["demo", DIAS_DEMO, true]);
  assert.equal((await api(env, "ana@x.mx", "datos", { cambios: { cr_ideas: "[1]" } })).status, 200);
  assert.equal((await api(env, "ana@x.mx", "datos", { cambios: { gp_groq_llave: "x" } })).status, 400);
  assert.equal((await api(env, "ana@x.mx", "datos")).body.datos.cr_ideas, "[1]");
  assert.deepEqual((await api(env, "otro@x.mx", "datos")).body.datos, {});  // cada creador ve solo lo suyo
  // Ocho días después: demo vencida, lectura sí, guardar no.
  const t8 = Math.floor(Date.now() / 1000) + 8 * 86400;
  assert.equal((await estadoCreador(env.OSINT_PLANS_DB, "ana@x.mx", t8)).plan, "vencido");
  // Con una cortesía o pago vigente, manda ese plan.
  await env.OSINT_PLANS_DB.prepare("INSERT INTO dominus_cortesias (email, producto, plan, vence) VALUES (?, 'creadores', 'creador', ?)").bind("ana@x.mx", t8 + 30 * 86400).run();
  const c = await estadoCreador(env.OSINT_PLANS_DB, "ana@x.mx", t8);
  assert.deepEqual([c.plan, c.activo], ["creador", true]);
});
