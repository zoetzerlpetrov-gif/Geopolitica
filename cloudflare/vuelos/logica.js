// Reglas del intermediario de vuelos en vivo (sin dependencias, para probarlas con node --test).
// Fuente: OpenSky Network con cuenta gratuita (cupo diario por cuenta, no por dirección IP).

/** Sitios que pueden usarlo desde el navegador. El resto recibe 403. */
export const ORIGENES = ["https://zoetzerlpetrov-gif.github.io", "http://localhost:8766"];
/** Radios permitidos en millas náuticas. Pocos valores = más respuestas reutilizables. */
export const RADIOS = [25, 50, 100, 150, 250];
// Categoría numérica de OpenSky → código ADS-B (copia de CAT_OPENSKY en tools/vivos/actualizar.py).
const CAT = { 2: "A1", 3: "A2", 4: "A3", 5: "A4", 6: "A5", 7: "A6", 8: "A7", 9: "B1", 10: "B2", 11: "B3", 12: "B4", 14: "B6", 15: "B7", 16: "C1", 17: "C2", 18: "C3", 19: "C3", 20: "C3" };

/** "/punto/19.25/-99.25/100" → {lat, lon, nm}; cualquier otra cosa → null. */
export function ruta(path) {
  const m = /^\/punto\/(-?\d{1,2}(?:\.\d{1,2})?)\/(-?\d{1,3}(?:\.\d{1,2})?)\/(\d{2,3})$/.exec(path || "");
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]), nm = Number(m[3]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !RADIOS.includes(nm)) return null;
  return { lat, lon, nm };
}

/** Rectángulo que contiene el círculo (OpenSky consulta por rectángulo). */
export function caja({ lat, lon, nm }) {
  const dLat = (nm * 1.852) / 111.32;
  const dLon = Math.min(180, dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const r = (x) => Math.round(x * 1000) / 1000;
  return { lamin: r(Math.max(-90, lat - dLat)), lamax: r(Math.min(90, lat + dLat)), lomin: r(Math.max(-180, lon - dLon)), lomax: r(Math.min(180, lon + dLon)) };
}

/**
 * Vectores de estado de OpenSky (/api/states/all?extended=1) → aviones con los nombres y unidades que ya usa el
 * mapa (los de adsb.lol: pies, nudos, pies/min). Solo posición y datos de vuelo; nada del dueño.
 */
export function deOpensky(d) {
  const t = d?.time || 0;
  return (d?.states || []).filter((s) => s[5] != null && s[6] != null).map((s) => {
    const o = { hex: s[0], flight: (s[1] || "").trim(), lat: s[6], lon: s[5], gs: Math.round((s[9] || 0) * 1.94384 * 10) / 10, track: s[10] || 0,
      seen_pos: Math.max(0, t - (s[3] || t)), mil: 0, pais: s[2] || "" };
    if (s[8]) o.alt_baro = "ground"; else if (s[7] != null) o.alt_baro = Math.round(s[7] / 0.3048);
    if (s[13] != null) o.alt_geom = Math.round(s[13] / 0.3048);
    if (s[11] != null) o.baro_rate = Math.round(s[11] * 196.85);
    if (s[14]) o.squawk = s[14];
    if (CAT[s[17]]) o.category = CAT[s[17]];
    return o;
  });
}
