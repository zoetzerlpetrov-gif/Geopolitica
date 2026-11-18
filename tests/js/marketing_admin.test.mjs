import { test } from "node:test";
import assert from "node:assert/strict";
import { REDES, largoX, leerEstado, avance, cambio, svgLinea, htmlTablero, htmlBorrador, semana, htmlPlan, proximaRevision, urlEditarPlan } from "../../js/marketing_admin.js";
import { readFileSync } from "node:fs";

const plan = JSON.parse(readFileSync(new URL("../../config/marketing.json", import.meta.url)));

test("plan: avance por fase y tablas", () => {
  const est = leerEstado({ getItem: () => JSON.stringify({ tareas: { "preparacion.dominio": "2026-11-18" } }) });
  const a = avance(plan, est.tareas);
  assert.equal(a[0].hechas, 1);
  assert.ok(a[0].total >= 5);
  const h = htmlPlan(plan, est);
  assert.match(h, /data-tarea="preparacion\.dominio" checked/);
  assert.match(h, /Periodistas/);
  assert.match(htmlPlan(null, est), /No se pudo leer/);
});

test("métricas: cambio a 30 días y línea", () => {
  const hist = [{ fecha: "2026-10-01", suscriptores: 10, vistas: 100 }, { fecha: "2026-10-20", suscriptores: 15, vistas: 160 }, { fecha: "2026-11-18", suscriptores: 25, vistas: 400 }];
  assert.equal(cambio(hist, "suscriptores", 30), 10);
  assert.equal(cambio([hist[0]], "suscriptores", 30), null);
  assert.match(svgLinea(hist, "vistas"), /<polyline/);
  assert.match(svgLinea([hist[0]], "vistas"), /segundo día/);
  const m = { canal: { suscriptores: 25, vistas: 400 }, historial: hist, videos: [{ privacidad: "private" }, { privacidad: "public" }], generado_utc: "2026-11-18T10:00:00Z" };
  const t = htmlTablero(m, plan, leerEstado(null), []);
  assert.match(t, /\+10 en 30 días/);
  assert.match(t, /1 públicos · 1 privados/);
  assert.match(htmlTablero(null, plan, leerEstado(null), []), /Aún no hay métricas/);
});

test("borradores y redes", () => {
  const b = { id: "x1", fecha: "2026-11-18", pilar: "dato", audiencias: ["publico"], fuente: "NOAA", fuente_url: "https://gml.noaa.gov/", textos: { x: "Hola https://ejemplo.com/a?b=c" } };
  const est = leerEstado(null);
  assert.equal(largoX(b.textos.x), 5 + 23);
  assert.match(htmlBorrador(b, est, "x"), /28 caracteres/);
  est.publicados.x1 = { fecha: "2026-11-18" };
  assert.match(htmlBorrador(b, est, "x"), /✅ Publicado/);
  assert.match(REDES.x.url("a b"), /^https:\/\/x\.com\/intent\/post\?text=a%20b$/);
  assert.match(REDES.facebook.url("t https://s.mx/?u=1"), /sharer\.php\?u=https%3A%2F%2Fs\.mx/);
  assert.match(urlEditarPlan(), /edit\/main\/config\/marketing\.json$/);
});

test("semana tipo y fechas de revisión", () => {
  const s = semana(plan);
  assert.equal(s.length, 7);
  assert.ok(s[0].items.includes("YouTube"));
  const r = proximaRevision(new Date("2026-11-18T12:00:00Z"));   // miércoles
  assert.equal(r.semanal, "2026-11-23");
  assert.equal(r.mensual, "2026-12-07");
});
