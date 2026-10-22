// Matriz de riesgo para cualquier país con las fuentes que elija la persona (eventos y noticias, riesgos y clima,
// en movimiento, fenómenos anómalos y capas). Sin DOM ni red: la página pide los datos y se los pasa.

/** Fuentes disponibles, agrupadas como en el menú del mapa. `def`: severidad cuando el dato no trae una. */
export const FUENTES = [
  { id: "eventos", grupo: "Eventos y noticias", nombre: "Eventos clasificados (noticias y fuentes oficiales)", url: "data/events.json", tipo: "eventos", tema: "Eventos", def: 3 },
  { id: "seguridad", grupo: "Eventos y noticias", nombre: "Feed de seguridad (bloqueos, violencia, protestas)", url: "data/vivos/ct/security_map.geojson", tema: "Seguridad", def: 3 },
  { id: "crimen", grupo: "Eventos y noticias", nombre: "Crimen y violencia (noticias)", url: "data/vivos/crimen.geojson", tema: "Seguridad", def: 3 },
  { id: "ataques", grupo: "Eventos y noticias", nombre: "Ataques con misiles, drones y bombas", url: "data/vivos/ataques.geojson", tema: "Conflicto armado", def: 4 },
  { id: "vial", grupo: "Eventos y noticias", nombre: "Protestas, bloqueos e incidentes viales", url: "data/vivos/vial.geojson", tema: "Social", def: 2 },
  { id: "cortes", grupo: "Eventos y noticias", nombre: "Cortes de luz y agua (noticias)", url: "data/vivos/cortes.geojson", tema: "Infraestructura", def: 3 },
  { id: "gdacs", grupo: "Riesgos y clima", nombre: "Desastres en curso (GDACS: sismos, ciclones, inundaciones, volcanes)", url: "data/vivos/gdacs_mundo.geojson", tema: "Desastres", def: 3 },
  { id: "ciclones", grupo: "Riesgos y clima", nombre: "Ciclones tropicales", url: "data/vivos/ciclones_mundo.geojson", tema: "Clima", def: 3 },
  { id: "meteoalarm", grupo: "Riesgos y clima", nombre: "Alertas meteorológicas de Europa (MeteoAlarm)", url: "data/vivos/meteoalarm.geojson", tema: "Clima", def: 2 },
  { id: "clima_severo", grupo: "Riesgos y clima", nombre: "Clima severo (noticias)", url: "data/vivos/ct/severe_weather_map.geojson", tema: "Clima", def: 3 },
  { id: "tornados", grupo: "Riesgos y clima", nombre: "Tornados", url: "data/vivos/tornados.geojson", tema: "Clima", def: 3 },
  { id: "volcanes", grupo: "Riesgos y clima", nombre: "Volcanes activos", url: "data/vivos/ct/volcanoes.geojson", tema: "Desastres", def: 3 },
  { id: "tsunamis", grupo: "Riesgos y clima", nombre: "Tsunamis (PTWC/NTWC)", url: "data/vivos/tsunamis.geojson", tema: "Desastres", def: 3 },
  { id: "salud", grupo: "Riesgos y clima", nombre: "Brotes y salud pública (fuentes oficiales)", url: "data/vivos/salud_oficial.geojson", tema: "Salud", def: 3 },
  { id: "red", grupo: "Riesgos y clima", nombre: "Cortes de internet (IODA)", url: "data/vivos/red_cortes.geojson", tema: "Infraestructura", def: 3 },
  { id: "emergencias_aereas", grupo: "En movimiento", nombre: "Emergencias aéreas (7500, 7600, 7700)", url: "data/vivos/emergencias_aereas.geojson", tema: "Transporte", def: 4 },
  { id: "avisos_nauticos", grupo: "En movimiento", nombre: "Avisos náuticos (ejercicios, peligros)", url: "data/vivos/avisos_nauticos.geojson", tema: "Transporte", def: 2 },
  { id: "gfw_apagados", grupo: "En movimiento", nombre: "Buques que apagan su transpondedor (posible pesca ilegal o evasión)", url: "data/vivos/gfw_apagados.geojson", tema: "Marítimo", def: 2 },
  { id: "gfw_encuentros", grupo: "En movimiento", nombre: "Encuentros de buques en altamar (transbordos)", url: "data/vivos/gfw_encuentros.geojson", tema: "Marítimo", def: 2 },
  { id: "anomalias", grupo: "Fenómenos anómalos", nombre: "Reportes de fenómenos anómalos", url: "data/vivos/anomalias.geojson", tema: "Anómalos", def: 1 },
  { id: "bolidos", grupo: "Fenómenos anómalos", nombre: "Bólidos (CNEOS/NASA)", url: "data/vivos/bolidos.geojson", tema: "Anómalos", def: 1 },
  { id: "conflicto", grupo: "Capas del mapa", nombre: "Zonas de conflicto armado activo", url: "data/capas/conflicto.geojson", tema: "Conflicto armado", def: 4, estatica: true },
  { id: "zonas_afectadas", grupo: "Capas del mapa", nombre: "Estados o provincias con eventos graves en 48 h", url: "data/zonas_afectadas.geojson", tema: "Eventos", def: 3, estatica: true },
];

const ALERTA = { red: 5, orange: 4, yellow: 3, green: 2 };
const acotar = (x) => Math.max(1, Math.min(5, Math.round(x)));

/** Severidad (impacto) 1–5 a partir de lo que traiga el dato. */
export function severidadDe(p = {}, def = 3) {
  if (Number.isFinite(p.severidad)) return acotar(p.severidad);
  if (Number.isFinite(p.sev)) return acotar(p.sev);
  const al = String(p.alertlevel || p.alerta || "").toLowerCase();
  if (ALERTA[al]) return ALERTA[al];
  if (Number.isFinite(p.magnitud ?? p.mag)) { const m = p.magnitud ?? p.mag; return m >= 7 ? 5 : m >= 6 ? 4 : m >= 5 ? 3 : 2; }
  if (Number.isFinite(p.nivel)) return acotar(p.nivel + 1);
  if (p.grupo === "grave") return 4;
  if (p.squawk === "7500") return 5;
  if (p.squawk === "7700") return 4;
  if (Number.isFinite(p.energia_kt)) return p.energia_kt >= 1 ? 3 : 1;
  return def;
}

/** Probabilidad 1–5 de que tenga consecuencias en 30 días: en curso o escalando sube; pronóstico o informativo baja. */
export function probabilidadDe(p = {}, tipo = "") {
  if (tipo === "eventos") {
    let x = 2;
    if (p.delta === "escala") x += 2; else if (p.delta === "nuevo" && p.severidad >= 4) x += 1; else if (p.delta === "desescala") x -= 1;
    if (p.verificado) x += 1;
    if ((p.correlaciones || []).length >= 3) x += 1;
    return acotar(x);
  }
  if (p.en_curso === true || p.ash_active === true || /activo|en curso|posted/i.test(String(p.status || ""))) return 4;
  if (Number.isFinite(p.prob_7d)) return acotar(1 + p.prob_7d / 25);
  if (/forecast|pron/i.test(String(p.kind || p.layer || ""))) return 3;
  return 3;
}

/** Punto dentro de un polígono (ray casting) para un anillo [[lon, lat], …]. */
export function puntoEnAnillo([x, y], anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
/** Punto dentro de un Polygon o MultiPolygon (respeta huecos). */
export function puntoEnGeometria(pt, g) {
  const polis = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  return polis.some(([ext, ...huecos]) => puntoEnAnillo(pt, ext) && !huecos.some((h) => puntoEnAnillo(pt, h)));
}
/** Un punto representativo de cualquier geometría (el primer vértice o el promedio del anillo exterior). */
export function puntoDe(g) {
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  const anillo = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates[0] : null;
  if (!anillo?.length) return null;
  return [anillo.reduce((s, c) => s + c[0], 0) / anillo.length, anillo.reduce((s, c) => s + c[1], 0) / anillo.length];
}

/**
 * ¿El dato es del país? Primero por sus códigos (pais_iso3, iso3, pais_iso2) o por nombre del país (en inglés o
 * español, también en listas «Philippines, Japan»); si no trae país, por su posición dentro del polígono del país.
 */
export function esDelPais(p = {}, geom, iso3, ctx) {
  const { iso2, nombres, poligono } = ctx;
  if (p.pais_iso3 || p.iso3) return (p.pais_iso3 || p.iso3) === iso3;
  if (p.pais_iso2) return String(p.pais_iso2).toUpperCase() === iso2;
  const txt = String(p.country || p.paises || p.pais || "").toLowerCase();
  if (txt) return nombres.some((n) => n && txt.split(/\s*,\s*/).includes(n));
  const pt = puntoDe(geom);
  return Boolean(pt && poligono && puntoEnGeometria(pt, poligono));
}

/** Título legible de un dato de cualquier fuente. */
export const tituloDe = (p = {}) => String(p.titulo || p.title || p.name || p.nombre || p.storm_name || p.region || p.codigo_texto || p.categoria_texto || p.tipo_nombre || p.evento || "Sin título").slice(0, 220);

/**
 * Construye la matriz: cada dato del país → (probabilidad, impacto). Devuelve celdas 5×5, filas, conteo por fuente y
 * por tema, e índice del país (0–100) = promedio ponderado de puntaje (p × i) sobre 25, escalado por volumen (log).
 */
export function construir(datosPorFuente, iso3, ctx, fuentesSel = FUENTES.map((f) => f.id)) {
  const filas = [];
  for (const f of FUENTES.filter((x) => fuentesSel.includes(x.id))) {
    const lista = datosPorFuente[f.id] || [];
    for (const it of lista) {
      const p = f.tipo === "eventos" ? it : it.properties || {};
      const g = f.tipo === "eventos" ? (Number.isFinite(it.lon) ? { type: "Point", coordinates: [it.lon, it.lat] } : null) : it.geometry;
      if (!esDelPais(p, g, iso3, ctx)) continue;
      const i = severidadDe(p, f.def), pr = probabilidadDe(p, f.tipo);
      filas.push({ fuente: f.nombre, grupo: f.grupo, tema: f.tipo === "eventos" ? (ctx.areas?.[p.area_principal] || p.area_principal || f.tema) : f.tema,
        titulo: tituloDe(p), url: p.url || "", fecha: String(p.fecha_utc || p.date || p.fecha || p.fromdate || p.actualizado || "").slice(0, 10), p: pr, i, puntaje: pr * i });
    }
  }
  const celdas = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
  for (const r of filas) celdas[r.p - 1][r.i - 1].push(r);
  const porFuente = {}, porTema = {};
  for (const r of filas) { porFuente[r.fuente] = (porFuente[r.fuente] || 0) + 1; (porTema[r.tema] ||= { n: 0, max: 0, suma: 0 }); porTema[r.tema].n++; porTema[r.tema].suma += r.puntaje; porTema[r.tema].max = Math.max(porTema[r.tema].max, r.puntaje); }
  const prom = filas.length ? filas.reduce((s, r) => s + r.puntaje, 0) / filas.length : 0;
  const indice = filas.length ? Math.round(Math.min(100, (prom / 25) * 100 * Math.min(1, 0.4 + Math.log10(1 + filas.length) / 3))) : 0;
  return { filas: filas.sort((a, b) => b.puntaje - a.puntaje), celdas, porFuente, porTema, indice };
}

/** Nivel por puntaje (mismo criterio que la matriz del mapa): 1–4 bajo, 5–9 medio, 10–15 alto, 16–25 crítico. */
export const nivelDe = (s) => (s >= 16 ? "crítico" : s >= 10 ? "alto" : s >= 5 ? "medio" : "bajo");

/** Mensajes para que la IA redacte el resumen (solo con las cifras calculadas). */
export function promptMatriz(pais, r) {
  const temas = Object.entries(r.porTema).sort((a, b) => b[1].suma - a[1].suma).slice(0, 8).map(([t, v]) => `${t}: ${v.n} datos, puntaje máximo ${v.max}`).join("; ");
  const top = r.filas.slice(0, 12).map((f) => `- [P${f.p}×I${f.i}] ${f.titulo} (${f.fuente})`).join("\n");
  return [{ role: "system", content: "Eres un analista de riesgo país. Respondes en español, con viñetas, lenguaje de probabilidad tipo ICD 203, sin inventar hechos ni cifras: usa solo lo que se te da." },
    { role: "user", content: `País: ${pais}. Índice de riesgo DOMINUS (0-100): ${r.indice}. Datos analizados: ${r.filas.length}.\nTemas: ${temas}\nPrincipales riesgos:\n${top}\n\nRedacta: 1) resumen ejecutivo en 3 viñetas, 2) los 5 riesgos prioritarios con su posible impacto en empresas y personas, 3) qué vigilar en los próximos 30 días.` }];
}
