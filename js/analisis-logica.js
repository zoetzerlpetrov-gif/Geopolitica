// Lógica pura de las Fases 4 y 5 (sin DOM): línea de tiempo, lentes, riesgo, vista México y quiz.
// Se prueba en tests/js/analisis.test.mjs. Las reglas están documentadas en docs/INDICADORES.md.

const H = 3600000;

// ---------- Línea de tiempo ----------
/** Rango de fechas (ms) de los eventos; null si no hay. Usa ev._t (Date.parse precalculado). */
export function rangoTiempo(eventos) {
  let min = Infinity, max = -Infinity;
  for (const e of eventos) { if (e._t < min) min = e._t; if (e._t > max) max = e._t; }
  return eventos.length ? { min, max } : null;
}

/** Conteo de eventos en n cubetas iguales entre inicio y fin (incluye ambos extremos). */
export function histograma(eventos, inicio, fin, n = 48) {
  const out = new Array(n).fill(0);
  const ancho = Math.max(1, fin - inicio) / n;
  for (const e of eventos) {
    if (e._t < inicio || e._t > fin) continue;
    out[Math.min(n - 1, Math.floor((e._t - inicio) / ancho))]++;
  }
  return out;
}

/**
 * Ventana visible. `horasVentana` = 0 significa «todo hasta el fin». `horasAtras` desplaza el fin hacia el
 * pasado desde el evento más reciente (0 = lo más nuevo).
 */
export function ventana(rango, horasVentana, horasAtras) {
  if (!rango) return { desde: -Infinity, hasta: Infinity };
  const hasta = rango.max - horasAtras * H;
  return { desde: horasVentana > 0 ? hasta - horasVentana * H : -Infinity, hasta };
}

// ---------- Lentes ----------
/** Ordena las lentes por afinidad con el evento: área principal pesa 2, cada secundaria 1. */
export function ordenarLentes(lentes, ev) {
  const peso = (l) => (l.areas_afines.includes(ev.area_principal) ? 2 : 0)
    + ev.areas_secundarias.filter((a) => l.areas_afines.includes(a)).length;
  return lentes.map((l, i) => ({ ...l, afinidad: peso(l), i })).sort((a, b) => b.afinidad - a.afinidad || a.i - b.i);
}

/** Sustituye {actor}, {pais}, {region} y {area} con datos del evento (o un genérico legible). */
export function rellenar(plantilla, ev, { pais = "", region = "", area = "" } = {}) {
  return plantilla
    .replaceAll("{actor}", ev.actores[0] || "el actor principal")
    .replaceAll("{pais}", pais || "el país afectado")
    .replaceAll("{region}", region || "la región")
    .replaceAll("{area}", area || "el área");
}

// ---------- Matriz de riesgo (probabilidad × impacto, 5 × 5) ----------
/**
 * Probabilidad estimada POR REGLA (1–5) de que el hecho escale o tenga consecuencias en 30 días.
 * Base 2; +2 si escaló frente a la corrida anterior; +1 si es nuevo con severidad ≥ 4; −1 si desescala;
 * +1 si está verificado por 2+ medios; +1 si tiene 3 o más eventos correlacionados. Límite 1–5.
 * Es un punto de partida para el analista, no un pronóstico.
 */
export function probabilidadRegla(ev) {
  let p = 2;
  if (ev.delta === "escala") p += 2;
  if (ev.delta === "nuevo" && ev.severidad >= 4) p += 1;
  if (ev.delta === "desescala") p -= 1;
  if (ev.verificado) p += 1;
  if ((ev.correlaciones || []).length >= 3) p += 1;
  return Math.max(1, Math.min(5, p));
}

export const NIVELES_RIESGO = [
  { id: "bajo", nombre: "Bajo", max: 4 },
  { id: "medio", nombre: "Medio", max: 9 },
  { id: "alto", nombre: "Alto", max: 15 },
  { id: "critico", nombre: "Crítico", max: 25 },
];

/** Nivel por puntaje = probabilidad × impacto: 1–4 bajo, 5–9 medio, 10–15 alto, 16–25 crítico. */
export function nivelRiesgo(p, i) {
  const s = p * i;
  return { puntaje: s, ...NIVELES_RIESGO.find((n) => s <= n.max) };
}

/** Valores de riesgo de un evento: los que fijó el usuario o, si no hay, los de la regla. */
export function riesgoDe(ev, ajustes = {}) {
  const a = ajustes[ev.id];
  const p = a?.p ?? probabilidadRegla(ev);
  const i = a?.i ?? ev.severidad;
  return { p, i, origen: a ? "usuario" : "regla", ...nivelRiesgo(p, i) };
}

/** Matriz 5 × 5: celdas[p-1][i-1] = lista de eventos. */
export function matriz(eventos, ajustes = {}) {
  const celdas = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
  for (const ev of eventos) {
    const r = riesgoDe(ev, ajustes);
    celdas[r.p - 1][r.i - 1].push(ev);
  }
  return celdas;
}

const csvCampo = (v) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV con BOM (Excel en español abre bien los acentos). Una fila por evento. */
export function csvRiesgo(eventos, ajustes = {}, nombresArea = {}) {
  const cab = ["id", "fecha_utc", "titulo", "pais_iso3", "area_principal", "severidad", "probabilidad", "impacto", "puntaje", "nivel", "origen", "impacto_mexico", "url"];
  const filas = eventos.map((ev) => {
    const r = riesgoDe(ev, ajustes);
    return [ev.id, ev.fecha_utc, ev.titulo, ev.pais_iso3, nombresArea[ev.area_principal] || ev.area_principal, ev.severidad,
      r.p, r.i, r.puntaje, r.nombre, r.origen, ev.impacto_mexico, ev.url].map(csvCampo).join(",");
  });
  return "﻿" + [cab.join(","), ...filas].join("\r\n") + "\r\n";
}

// ---------- Vista México ----------
/** Semáforo por severidad: rojo ≥ 4, ámbar 3, verde ≤ 2. */
export function semaforo(sev) {
  return sev >= 4 ? "rojo" : sev === 3 ? "ambar" : "verde";
}

/** Eventos con impacto para México agrupados por área principal, en el orden de la taxonomía. */
export function agruparMexico(eventos, ordenAreas) {
  const grupos = new Map(ordenAreas.map((a) => [a, []]));
  for (const ev of eventos) if (ev.impacto_mexico && grupos.has(ev.area_principal)) grupos.get(ev.area_principal).push(ev);
  const out = [];
  for (const [area, lista] of grupos) {
    if (!lista.length) continue;
    lista.sort((a, b) => b.severidad - a.severidad || b._t - a._t);
    const conteo = { rojo: 0, ambar: 0, verde: 0 };
    for (const ev of lista) conteo[semaforo(ev.severidad)]++;
    out.push({ area, eventos: lista, conteo, peor: semaforo(lista[0].severidad) });
  }
  return out;
}

// ---------- Modo aprendizaje ----------
/** Generador pseudoaleatorio con semilla (mulberry32), para pruebas reproducibles. */
export function aleatorio(semilla = Date.now()) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elige un evento para el quiz: prefiere los de confianza ≥ 0.5 y evita los ya preguntados. */
export function eventoQuiz(eventos, rnd, vistos = new Set()) {
  const buenos = eventos.filter((e) => !vistos.has(e.id) && e.confianza_clasificacion >= 0.5);
  const pool = buenos.length ? buenos : eventos.filter((e) => !vistos.has(e.id));
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

/** Cuatro opciones: la correcta y tres áreas distintas que no sean principal ni secundaria del evento. */
export function opcionesQuiz(ev, areaIds, rnd) {
  const excluir = new Set([ev.area_principal, ...ev.areas_secundarias]);
  const otras = areaIds.filter((a) => !excluir.has(a));
  for (let i = otras.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [otras[i], otras[j]] = [otras[j], otras[i]]; }
  const ops = [ev.area_principal, ...otras.slice(0, 3)];
  for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
  return ops;
}

/** Suma un intento al marcador: { aciertos, intentos, porArea: { area: [aciertos, intentos] } }. */
export function anotar(marcador, area, acierto) {
  const m = { aciertos: 0, intentos: 0, porArea: {}, ...marcador };
  m.porArea = { ...m.porArea };
  const [a, n] = m.porArea[area] || [0, 0];
  m.porArea[area] = [a + (acierto ? 1 : 0), n + 1];
  m.aciertos += acierto ? 1 : 0;
  m.intentos += 1;
  return m;
}

// ---------- Calidad de datos ----------
/** Mismos indicadores que ingest/run.py `calidad()`, calculados en el navegador sobre los eventos cargados. */
export function calidad(eventos) {
  const por_area = {};
  let sin_pais = 0, confianza_baja = 0, verificados = 0, varias = 0, mx = 0, suma = 0;
  for (const e of eventos) {
    por_area[e.area_principal] = (por_area[e.area_principal] || 0) + 1;
    if (!e.pais_iso3) sin_pais++;
    if (e.confianza_clasificacion < 0.3) confianza_baja++;
    if (e.verificado) verificados++;
    if (e.fuentes.length > 1) varias++;
    if (e.impacto_mexico) mx++;
    suma += e.confianza_clasificacion;
  }
  return {
    eventos: eventos.length, sin_pais, confianza_baja, verificados, con_varias_fuentes: varias, impacto_mexico: mx,
    confianza_media: eventos.length ? Math.round((100 * suma) / eventos.length) / 100 : 0, por_area,
  };
}

/** Porcentaje entero seguro (0 si no hay base). */
export const pct = (n, base) => (base ? Math.round((100 * n) / base) : 0);
