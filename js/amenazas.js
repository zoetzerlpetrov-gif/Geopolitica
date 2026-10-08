// Lógica pura de las capas de riesgo (portada de Clima Táctico / WarRoomViajero y ampliada):
// severidad 1–5, tipo, ícono y país de cada objeto; enjambres sísmicos, radios de tsunami, óvalo de
// auroras, Hoy No Circula y registro de eventos nuevos. Sin DOM ni mapa: se prueba en node.

export const SEVERIDADES = [
  [1, "Informativa"], [2, "Baja"], [3, "Media"], [4, "Alta"], [5, "Extrema"],
];
export const COLOR_SEV = { 1: "#6f8a82", 2: "#2E9E6E", 3: "#E0A100", 4: "#E2711D", 5: "#D23B3B" };

const lim = (n) => Math.max(1, Math.min(5, Math.round(n)));

/** Severidad, tipo e ícono de un objeto según su capa. */
export function clasificar(capa, p = {}, geom = null) {
  switch (capa) {
    case "sismos": {
      const m = p.mag || 0;
      if (p._enjambre) return { sev: 3, tipo: "Enjambre sísmico", ic: "🔁" };
      if (p._tsunami_radio) return { sev: 4, tipo: "Tsunami (alcance estimado)", ic: "" };
      return { sev: p.tsunami ? 5 : m >= 7 ? 5 : m >= 6 ? 4 : m >= 5 ? 3 : m >= 4 ? 2 : 1, tipo: p.tsunami ? "Tsunami" : "Sismo", ic: p.tsunami ? "🌊" : m >= 4.5 ? "🫨" : "" };
    }
    case "ciclones": {
      const kt = Number(p.intensity_kt || p.wind_kt || 0);
      const sev = kt >= 113 ? 5 : kt >= 83 ? 4 : kt >= 64 ? 3 : kt >= 34 ? 2 : 1;  // Saffir-Simpson: cat. 4+ (113 kt) = 5, cat. 2-3 = 4, cat. 1 = 3, tormenta tropical = 2
      const ic = p.layer === "storm" ? "🌀" : "";
      return { sev: p.layer === "storm" ? Math.max(sev, 2) : sev, tipo: "Ciclón tropical", ic };
    }
    case "incendios": {
      const frp = Number(p.frp || 0);
      return { sev: frp >= 300 ? 4 : frp >= 100 ? 3 : frp >= 20 ? 2 : 1, tipo: "Incendio", ic: "" };
    }
    case "gdacs": {
      const l = String(p.alertlevel || "green").toLowerCase();
      const ics = { EQ: "🫨", TC: "🌀", FL: "🌊", VO: "🌋", DR: "🏜️", WF: "🔥", TS: "🌊" };
      return { sev: l === "red" ? 5 : l === "orange" ? 4 : 2, tipo: `Desastre: ${p.type_label || p.eventtype || "GDACS"}`, ic: ics[String(p.eventtype || "").toUpperCase()] || "⚠️" };
    }
    case "pronostico": {
      const lv = Number(p.level || 0), tl = Number(p.temp_level || 0);
      const sev = lim(1 + Math.max(lv, tl));
      const tipo = tl > lv ? (p.temp_kind === "calor" ? "Calor extremo" : "Frío extremo") : "Lluvia y viento";
      return { sev, tipo, ic: lv >= 1 ? ["🌤️", "🌧️", "⛈️", "🔴", "🟣"][Math.min(4, lv)] : "" };
    }
    case "aire": return { sev: lim(1 + Math.min(4, Number(p.level || 0))), tipo: "Calidad del aire", ic: "" };
    case "volcanes": return { sev: p.ash_active ? 4 : 2, tipo: "Volcán", ic: "🌋" };
    case "seguridad": {
      const k = String(p.kind || "OTRO").toUpperCase();
      const ics = { BLOQUEO: "🚧", SECUESTRO: "❗", VIOLENCIA: "💥", ASALTO: "🛑", EXTORSION: "💰" };
      return { sev: ["VIOLENCIA", "SECUESTRO"].includes(k) ? 4 : 3, tipo: `Seguridad: ${k.toLowerCase()}`, ic: ics[k] || "📍" };
    }
    case "severo": return { sev: p.severe ? 4 : 2, tipo: String(p.kind || "").toUpperCase() === "TORNADO" ? "Tornado" : "Granizo", ic: String(p.kind || "").toUpperCase() === "TORNADO" ? "🌪️" : "🧊" };
    case "deslaves": return { sev: 3, tipo: "Deslave", ic: "⛰️" };
    case "nws": {
      const s = { Extreme: 5, Severe: 4, Moderate: 3, Minor: 2 }[p.severity] || 1;
      return { sev: s, tipo: `Alerta EUA: ${p.event || "aviso"}`, ic: "" };
    }
    case "auroras": return { sev: p.actual ? 2 : 1, tipo: "Aurora", ic: "" };
    case "crimen": return { sev: lim(p.severidad || 3), tipo: p.tipo || "Crimen organizado", ic: { Terrorismo: "💣", "Crimen organizado": "🕴️", Narcotráfico: "💊", Mafia: "🎩" }[p.tipo] || "🕴️" };
    default: return { sev: 1, tipo: capa, ic: "" };
  }
}

/** País de una descripción de USGS («12 km SW of Tecpan, Mexico» → «Mexico»). */
export function paisDeLugar(place) {
  const m = /,\s*([^,]+)$/.exec(place || "");
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------- país por coordenada
function enAnillo(x, y, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Índice de países (GeoJSON con properties.iso3) con cajas para descartar rápido. */
export function indicePaises(fc) {
  return fc.features.map((f) => {
    const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let o = 180, s = 90, e = -180, n = -90;
    for (const p of polis) for (const [x, y] of p[0]) { o = Math.min(o, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { iso3: f.properties.iso3, polis, caja: [o, s, e, n] };
  });
}

/** ISO3 del país que contiene [lon, lat], o null (mar). */
export function paisEn(indice, lon, lat) {
  for (const p of indice) {
    const [o, s, e, n] = p.caja;
    if (lon < o || lon > e || lat < s || lat > n) continue;
    for (const poli of p.polis) {
      if (enAnillo(lon, lat, poli[0]) && !poli.slice(1).some((h) => enAnillo(lon, lat, h))) return p.iso3;
    }
  }
  return null;
}

// ---------------------------------------------------------------- sismos: enjambres y tsunami
const R = 6371;
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Posibles enjambres sísmicos en México: 5 o más sismos en una celda de ~50 km (heurística de Clima Táctico). */
export function enjambres(features, { celda = 0.45, minimo = 5, caja = [-119, 14, -85, 33] } = {}) {
  const celdas = new Map();
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    if (lon < caja[0] || lon > caja[2] || lat < caja[1] || lat > caja[3]) continue;
    const k = `${Math.round(lat / celda)}_${Math.round(lon / celda)}`;
    if (!celdas.has(k)) celdas.set(k, []);
    celdas.get(k).push(f);
  }
  return [...celdas.values()].filter((c) => c.length >= minimo).map((c) => {
    const lat = c.reduce((s, f) => s + f.geometry.coordinates[1], 0) / c.length;
    const lon = c.reduce((s, f) => s + f.geometry.coordinates[0], 0) / c.length;
    const max = Math.max(...c.map((f) => f.properties.mag || 0));
    return { type: "Feature", geometry: { type: "Point", coordinates: [+lon.toFixed(3), +lat.toFixed(3)] },
      properties: { _enjambre: true, eventos: c.length, mag_max: max, place: `Posible enjambre sísmico (${c.length} eventos)`, time: Math.max(...c.map((f) => f.properties.time || 0)) } };
  });
}

/** Círculo geodésico (LineString) de `km` alrededor de [lon, lat]. */
export function circuloKm([lon, lat], km, n = 64) {
  const d = km / R, f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180, pts = [];
  for (let i = 0; i <= n; i++) {
    const b = (2 * Math.PI * i) / n;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    pts.push([+((l2 * 180) / Math.PI).toFixed(3), +((f2 * 180) / Math.PI).toFixed(3)]);
  }
  return pts;
}

/** Radios de alcance de un tsunami a 1, 2 y 3 h (~700 km/h en aguas profundas; estimación gruesa). */
export function radiosTsunami(f) {
  return [1, 2, 3].map((h) => ({ type: "Feature", geometry: { type: "LineString", coordinates: circuloKm(f.geometry.coordinates, 700 * h) },
    properties: { _tsunami_radio: h, place: `Alcance estimado de tsunami a ${h} h (${700 * h} km)`, origen: f.properties.place, time: f.properties.time } }));
}

// ---------------------------------------------------------------- auroras
/** Latitud mínima aproximada donde puede verse la aurora para un Kp (fórmula de Clima Táctico). */
export const latAurora = (kp) => 67 - kp * 2.5;

/** Líneas del borde de la aurora (norte y sur) para el Kp actual y para Kp 5, 7 y 9 de referencia. */
export function lineasAurora(kpActual) {
  const niveles = [...new Set([Math.round(kpActual * 10) / 10, 5, 7, 9])];
  const feats = [];
  for (const kp of niveles) {
    const lat = latAurora(kp);
    for (const signo of [1, -1]) {
      const coords = [];
      for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, signo * lat]);
      feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords },
        properties: { kp, actual: kp === niveles[0], hemisferio: signo > 0 ? "norte" : "sur", lat_min: Math.round(lat), place: `Borde de aurora con Kp ${kp} (~${Math.round(lat)}° ${signo > 0 ? "N" : "S"})` } });
    }
  }
  return { type: "FeatureCollection", features: feats };
}

// ---------------------------------------------------------------- Valle de México
const HNC = { 1: ["Amarillo", "5 y 6"], 2: ["Rosa", "7 y 8"], 3: ["Rojo", "3 y 4"], 4: ["Verde", "1 y 2"], 5: ["Azul", "9 y 0"] };

/** Hoy No Circula (programa normal, sin contingencia) para una fecha, en hora de la Ciudad de México. */
export function hoyNoCircula(fecha = new Date()) {
  const wd = fecha.toLocaleString("en-US", { timeZone: "America/Mexico_City", weekday: "short" });
  const d = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[wd];
  if (HNC[d]) return { aplica: true, engomado: HNC[d][0], placas: HNC[d][1], texto: `Engomado ${HNC[d][0]}: placas con terminación ${HNC[d][1]} (holograma 1 y 2; exentos 0 y 00).` };
  if (d === 6) return { aplica: true, texto: "Sábado: aplica según holograma y semana del mes; consulta el calendario oficial." };
  return { aplica: false, texto: "Domingo: no aplica." };
}

// ---------------------------------------------------------------- eventos nuevos
export const PARPADEO_MS = 60000;
export const NUEVO_MS = 3600000;
const RETENCION_MS = 7 * 86400000;

/**
 * Compara las claves actuales de una capa con lo ya visto en este navegador.
 * Devuelve {vistos (actualizado), nuevas: Set}. La primera vez que se ve una capa no hay «nuevas»
 * (todo sería nuevo); a partir de ahí, lo que aparezca parpadea 1 min y lleva la marca NUEVO 1 h.
 */
export function registrarVistos(vistos, capa, claves, ahora = Date.now()) {
  const v = { ...vistos };
  const primera = !v[`_capa:${capa}`];
  v[`_capa:${capa}`] = v[`_capa:${capa}`] || ahora;
  const nuevas = new Set();
  for (const k of claves) {
    if (!v[k]) { v[k] = ahora; if (!primera) nuevas.add(k); }
  }
  for (const [k, t] of Object.entries(v)) if (!k.startsWith("_capa:") && ahora - t > RETENCION_MS) delete v[k];
  return { vistos: v, nuevas };
}

/** Clave estable de un objeto: capa + identificador o título + coordenada redondeada. */
export function claveDe(capa, p, geom) {
  const c = geom?.type === "Point" ? geom.coordinates : null;
  const id = p.id || p.code || p.url || p.title || p.name || p.storm_id || p.place || "";
  return `${capa}|${id}|${c ? `${c[0].toFixed(2)},${c[1].toFixed(2)}` : p.kind || ""}`;
}

/** Filtro de la lista de amenazas. */
export function filtrar(lista, { pais = "", tipo = "", sevMin = 1, zona = null } = {}) {
  return lista.filter((a) => a.sev >= sevMin && (!pais || a.pais === pais) && (!tipo || a.tipo === tipo)
    && (!zona || (zona.iso3 ? a.pais === zona.iso3 : distanciaKm(zona.lat, zona.lon, a.lat, a.lon) <= zona.radio_km)));
}

/** Orden de la lista: nuevas primero, luego severidad y lo más reciente. */
export function ordenar(lista, nuevas = new Set()) {
  return [...lista].sort((a, b) => (nuevas.has(b.k) - nuevas.has(a.k)) || (b.sev - a.sev) || ((b.t || 0) - (a.t || 0)));
}
