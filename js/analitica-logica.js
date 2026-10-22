// Lógica de analitica.html (Data & Analytics). Funciones puras sobre data/historial-estadisticas.json, events.json y
// los manifiestos de fuentes. Sin red: la página pide los datos y se los pasa.

/** Serie diaria de una métrica: `clave` = "total" | "area:<id>" | "pais:<ISO3>" | "sev:<n>". */
export function serie(dias, clave) {
  const [tipo, id] = clave.includes(":") ? clave.split(":") : [clave, null];
  return dias.map((d) => ({ dia: d.dia, n: tipo === "total" ? d.total : tipo === "area" ? d.areas?.[id] || 0 : tipo === "pais" ? d.paises?.[id] || 0 : d.sev?.[id] || 0 }));
}

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const desv = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))); };

/**
 * Alerta de anomalía: compara el promedio de los últimos `reciente` días con la línea base anterior (media y desviación
 * estándar de los días previos). z = (reciente − media) / desviación. |z| ≥ 2 suele marcarse como inusual.
 */
export function anomalia(valores, reciente = 7, minimoBase = 7) {
  if (valores.length < reciente + minimoBase) return null;
  const base = valores.slice(0, -reciente), ult = valores.slice(-reciente);
  const m = media(base), s = desv(base), r = media(ult);
  const z = s > 0 ? (r - m) / s : r > m ? Infinity : 0;
  return { media_base: Math.round(m * 10) / 10, media_reciente: Math.round(r * 10) / 10, z: Number.isFinite(z) ? Math.round(z * 100) / 100 : z,
    cambio_pct: m > 0 ? Math.round(((r - m) / m) * 100) : null };
}

/** Países con mayor aumento: eventos por día en los últimos `reciente` días contra los `base` días anteriores. */
export function paisesAlza(dias, reciente = 7, base = 21, minimo = 5) {
  const ult = dias.slice(-reciente), prev = dias.slice(-(reciente + base), -reciente);
  const suma = (lista) => { const s = {}; for (const d of lista) for (const [p, n] of Object.entries(d.paises || {})) s[p] = (s[p] || 0) + n; return s; };
  const a = suma(ult), b = suma(prev);
  return Object.keys(a).map((p) => {
    const r = a[p] / Math.max(1, ult.length), pb = (b[p] || 0) / Math.max(1, prev.length);
    return { pais: p, reciente: Math.round(r * 10) / 10, previo: Math.round(pb * 10) / 10, total: a[p], razon: pb > 0 ? Math.round((r / pb) * 10) / 10 : null };
  }).filter((x) => x.total >= minimo).sort((x, y) => (y.razon ?? 99) - (x.razon ?? 99) || y.total - x.total);
}

/** Puntos de una polilínea SVG para una serie (ancho w, alto h, margen m). */
export function polilinea(valores, w = 600, h = 160, m = 4) {
  const max = Math.max(1, ...valores), n = Math.max(1, valores.length - 1);
  return valores.map((v, i) => `${Math.round((m + (i * (w - 2 * m)) / n) * 10) / 10},${Math.round((h - m - (v / max) * (h - 2 * m)) * 10) / 10}`).join(" ");
}

/** Conteo de eventos por área y por severidad de un país en events.json (los eventos vigentes). */
export function perfilPais(eventos, iso) {
  const evs = eventos.filter((e) => e.pais_iso3 === iso);
  const areas = {};
  for (const e of evs) areas[e.area_principal] = (areas[e.area_principal] || 0) + 1;
  return { total: evs.length, graves: evs.filter((e) => e.severidad >= 4).length, areas };
}

/** Indicadores del Banco Mundial para el comparador (código → nombre, unidad, decimales). */
export const INDICADORES_BM = [
  ["NY.GDP.MKTP.KD.ZG", "Crecimiento del PIB", "%", 1],
  ["FP.CPI.TOTL.ZG", "Inflación", "%", 1],
  ["NY.GDP.PCAP.CD", "PIB por habitante", "USD", 0],
  ["SL.UEM.TOTL.ZS", "Desempleo", "%", 1],
  ["PV.EST", "Estabilidad política (−2.5 a +2.5)", "", 2],
  ["CC.EST", "Control de la corrupción (−2.5 a +2.5)", "", 2],
  ["VC.IHR.PSRC.P5", "Homicidios por 100 mil", "", 1],
  ["SP.POP.TOTL", "Población", "", 0],
];
export const leerBM = (d) => { const v = d?.[1]?.[0]; return v && v.value != null ? { valor: Number(v.value), anio: v.date } : null; };

/**
 * Frescura de cada fuente: horas desde su última actualización contra lo esperado. `fuentes` = [{nombre, actualizado, cada_h}].
 * Estado: «al día» (≤ 1.5× lo esperado), «atrasada» (≤ 4×) o «detenida».
 */
export function frescura(fuentes, ahora = new Date()) {
  return fuentes.map((f) => {
    const t = Date.parse(f.actualizado || "");
    if (!Number.isFinite(t)) return { ...f, horas: null, estado: "sin dato" };
    const h = Math.round(((ahora - t) / 3600000) * 10) / 10;
    const lim = f.cada_h || 24;
    return { ...f, horas: h, estado: h <= lim * 1.5 ? "al día" : h <= lim * 4 ? "atrasada" : "detenida" };
  });
}

/** Eventos → CSV (para Excel o Power BI). Solo campos públicos; nunca texto completo de la nota. */
export function eventosCSV(eventos) {
  const cols = ["fecha_utc", "pais_iso3", "area_principal", "severidad", "titulo", "fuente", "url", "lat", "lon"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...eventos.map((e) => cols.map((c) => q(e[c])).join(","))].join("\n");
}

/** Prompt para que la IA explique una serie: solo cifras agregadas (sin datos personales). */
export function promptSerie(nombre, puntos, alerta) {
  return `Serie diaria de eventos registrados por DOMINUS OSINT: «${nombre}».\nDatos (día: eventos): ${puntos.map((p) => `${p.dia}: ${p.n}`).join("; ")}.\n`
    + (alerta ? `Prueba de anomalía: media de los días previos ${alerta.media_base}, media de los últimos 7 días ${alerta.media_reciente}, z = ${alerta.z}.\n` : "")
    + "Explica en español, en máximo 8 líneas: qué tendencia muestra, si el cambio reciente parece relevante o puede ser ruido "
    + "(recuerda que el número de eventos depende también de cuántas noticias se publican y de cómo se capturan), y qué revisarías para confirmarlo. "
    + "Usa lenguaje de probabilidad tipo ICD 203 (probable, improbable…). No inventes hechos que no estén en los datos.";
}
