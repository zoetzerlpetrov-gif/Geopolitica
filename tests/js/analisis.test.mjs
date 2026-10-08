// Pruebas de las Fases 4 y 5: línea de tiempo, lentes, riesgo, vista México, quiz, índice y ficha.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rangoTiempo, histograma, ventana, ordenarLentes, rellenar, probabilidadRegla, nivelRiesgo, riesgoDe, matriz,
  csvRiesgo, semaforo, agruparMexico, aleatorio, eventoQuiz, opcionesQuiz, anotar,
} from "../../js/analisis-logica.js";
import { unirIndice } from "../../js/indice.js";
import { htmlFicha } from "../../js/card.js";

const ANALISIS = JSON.parse(readFileSync(new URL("../../config/analisis.json", import.meta.url)));
const TAX = JSON.parse(readFileSync(new URL("../../config/taxonomy.json", import.meta.url)));
const H = 3600000;
const T0 = Date.parse("2026-10-08T00:00:00Z");

function ev(over = {}) {
  return {
    id: "e1", fecha_utc: "2026-10-08T00:00:00Z", _t: T0, titulo: "Prueba", resumen: "r", fuente: "F", url: "https://x.org/a",
    tipo_fuente: "noticia", pais_iso3: "MEX", region: "norteamerica", lat: 19, lon: -99, area_principal: "geoeconomia",
    areas_secundarias: [], subtemas: [], actores: ["EUA"], severidad: 3, confianza_clasificacion: 0.7, verificado: false,
    impacto_mexico: null, fuentes: [{ fuente: "F", url: "https://x.org/a", tipo_fuente: "noticia" }], ...over,
  };
}

// ---------- Línea de tiempo ----------
test("rango e histograma cuentan cada evento una vez, incluido el extremo final", () => {
  const evs = [0, 1, 2, 47].map((h, i) => ev({ id: `e${i}`, _t: T0 + h * H }));
  const r = rangoTiempo(evs);
  assert.deepEqual(r, { min: T0, max: T0 + 47 * H });
  const h = histograma(evs, r.min, r.max, 47);
  assert.equal(h.reduce((a, b) => a + b, 0), 4);
  assert.equal(h[46], 1); // el último evento cae en la última cubeta, no fuera
});

test("ventana: 24 h que terminan 6 h antes del evento más nuevo; 0 = todo", () => {
  const r = { min: T0, max: T0 + 72 * H };
  assert.deepEqual(ventana(r, 24, 6), { desde: T0 + 42 * H, hasta: T0 + 66 * H });
  assert.equal(ventana(r, 0, 0).desde, -Infinity);
  assert.equal(ventana(null, 24, 0).hasta, Infinity);
});

// ---------- Lentes y checklist ----------
test("config/analisis.json: 10 pasos y 7 lentes completas con áreas válidas", () => {
  assert.equal(ANALISIS.checklist.length, 10);
  assert.equal(ANALISIS.lentes.length, 7);
  const areas = new Set(TAX.areas.map((a) => a.id));
  for (const l of ANALISIS.lentes) {
    assert.ok(l.nombre && l.autores && l.idea && l.preguntas.length >= 2, l.id);
    for (const a of l.areas_afines) assert.ok(areas.has(a), `${l.id}: área ${a}`);
  }
});

test("las lentes afines al área principal van primero", () => {
  const orden = ordenarLentes(ANALISIS.lentes, ev({ area_principal: "seguridad", areas_secundarias: ["geografia"] })).map((l) => l.id);
  assert.equal(orden[0], "realismo");          // seguridad (2) + geografía (1)
  assert.equal(orden[1], "geopolitica_clasica");
  // Sin afinidad: van al final y conservan su orden original.
  assert.deepEqual(orden.slice(-4), ["liberalismo", "constructivismo", "economia_politica", "seguridad_humana"]);
});

test("rellenar usa datos del evento y genéricos legibles si faltan", () => {
  assert.equal(rellenar("¿Qué gana {actor} en {pais}?", ev(), { pais: "México" }), "¿Qué gana EUA en México?");
  assert.equal(rellenar("{actor} / {region}", ev({ actores: [] })), "el actor principal / la región");
});

// ---------- Riesgo ----------
test("probabilidad por regla: base 2, escala +2, verificado +1, 3 correlaciones +1, tope 5", () => {
  assert.equal(probabilidadRegla(ev()), 2);
  assert.equal(probabilidadRegla(ev({ delta: "escala" })), 4);
  assert.equal(probabilidadRegla(ev({ delta: "nuevo", severidad: 4 })), 3);
  assert.equal(probabilidadRegla(ev({ delta: "desescala" })), 1);
  assert.equal(probabilidadRegla(ev({ delta: "escala", verificado: true, correlaciones: ["a", "b", "c"] })), 5);
});

test("niveles 5 × 5: 4 bajo, 5 medio, 10 alto, 16 crítico", () => {
  assert.equal(nivelRiesgo(2, 2).id, "bajo");
  assert.equal(nivelRiesgo(1, 5).id, "medio");
  assert.equal(nivelRiesgo(2, 5).id, "alto");
  assert.equal(nivelRiesgo(4, 4).id, "critico");
  assert.equal(nivelRiesgo(5, 5).puntaje, 25);
});

test("el ajuste del usuario reemplaza a la regla y se refleja en la matriz", () => {
  const e = ev({ id: "x", severidad: 2 });
  assert.equal(riesgoDe(e).origen, "regla");
  const r = riesgoDe(e, { x: { p: 5, i: 4 } });
  assert.deepEqual([r.p, r.i, r.origen, r.id], [5, 4, "usuario", "critico"]);
  const m = matriz([e], { x: { p: 5, i: 4 } });
  assert.equal(m[4][3].length, 1);
});

test("CSV con BOM, comillas escapadas y una fila por evento", () => {
  const csv = csvRiesgo([ev({ titulo: 'Dijo "no", y salió', impacto_mexico: "Ocurre en México." })], {}, { geoeconomia: "Geoeconomía" });
  assert.ok(csv.startsWith("﻿id,fecha_utc,titulo"));
  assert.match(csv, /"Dijo ""no"", y salió"/);
  assert.match(csv, /Geoeconomía,3,2,3,6,Medio,regla/);
  assert.equal(csv.trim().split("\r\n").length, 2);
});

// ---------- Vista México ----------
test("semáforo y agrupación por área en el orden de la taxonomía", () => {
  assert.deepEqual([5, 4, 3, 2, 1].map(semaforo), ["rojo", "rojo", "ambar", "verde", "verde"]);
  const evs = [
    ev({ id: "a", area_principal: "seguridad", severidad: 2, impacto_mexico: "x" }),
    ev({ id: "b", area_principal: "geoeconomia", severidad: 4, impacto_mexico: "x" }),
    ev({ id: "c", area_principal: "geoeconomia", severidad: 1, impacto_mexico: "x" }),
    ev({ id: "d", area_principal: "clima", severidad: 5, impacto_mexico: null }),
  ];
  const g = agruparMexico(evs, TAX.areas.map((a) => a.id));
  assert.deepEqual(g.map((x) => x.area), ["seguridad", "geoeconomia"]);
  assert.equal(g[1].peor, "rojo");
  assert.deepEqual(g[1].conteo, { rojo: 1, ambar: 0, verde: 1 });
  assert.equal(g[1].eventos[0].id, "b");
});

// ---------- Quiz ----------
test("quiz: 4 opciones distintas, incluye la correcta y excluye las secundarias", () => {
  const rnd = aleatorio(42);
  const e = ev({ area_principal: "seguridad", areas_secundarias: ["geografia", "energia"] });
  const ops = opcionesQuiz(e, TAX.areas.map((a) => a.id), rnd);
  assert.equal(ops.length, 4);
  assert.equal(new Set(ops).size, 4);
  assert.ok(ops.includes("seguridad"));
  assert.ok(!ops.includes("geografia") && !ops.includes("energia"));
});

test("quiz: prefiere confianza ≥ 0.5 y no repite eventos", () => {
  const rnd = aleatorio(1);
  const evs = [ev({ id: "baja", confianza_clasificacion: 0.2 }), ev({ id: "alta", confianza_clasificacion: 0.8 })];
  assert.equal(eventoQuiz(evs, rnd).id, "alta");
  assert.equal(eventoQuiz(evs, rnd, new Set(["alta"])).id, "baja");
  assert.equal(eventoQuiz(evs, rnd, new Set(["alta", "baja"])), null);
});

test("marcador por área", () => {
  let m = anotar({}, "clima", true);
  m = anotar(m, "clima", false);
  m = anotar(m, "seguridad", true);
  assert.deepEqual(m, { aciertos: 2, intentos: 3, porArea: { clima: [1, 2], seguridad: [1, 1] } });
});

// ---------- Índice por país ----------
test("unirIndice: países sin dato quedan en -1 (transparentes)", () => {
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { iso3: "MEX" }, geometry: null }, { type: "Feature", properties: { iso3: "FJI" }, geometry: null }] };
  const out = unirIndice(fc, { MEX: { indice: 63, eventos: 4, A: 25 } });
  assert.deepEqual(out.features.map((f) => f.properties.indice), [63, -1]);
  assert.equal(fc.features[0].properties.indice, undefined); // no modifica el original
});

// ---------- Ficha ----------
test("la ficha muestra checklist marcado, notas escapadas y lentes", () => {
  const tax = { areas: new Map(TAX.areas.map((a) => [a.id, a])), subtemas: new Map() };
  const html = htmlFicha(ev(), tax, { MEX: { es: "México" } }, new Map(), {
    analisis: ANALISIS, cuaderno: { c: ["fuente", "lugar"], n: "<script>x</script>" },
  });
  assert.match(html, /Checklist de análisis <span class="contador" id="check-avance">2\/10/);
  assert.equal((html.match(/data-check="[a-z_]+" checked/g) || []).length, 2);
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;") && !html.includes("<script>x"));
  assert.match(html, /Lentes teóricas \(7\)/);
  assert.match(html, /¿Qué poder relativo gana o pierde EUA con este hecho\?/);
});
