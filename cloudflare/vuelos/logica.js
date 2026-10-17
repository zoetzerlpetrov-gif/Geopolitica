// Reglas del intermediario de vuelos en vivo (sin dependencias, para probarlas con node --test).

/** Sitios que pueden usarlo desde el navegador. El resto recibe 403. */
export const ORIGENES = ["https://zoetzerlpetrov-gif.github.io", "http://localhost:8766"];
/** Radios permitidos en millas náuticas (adsb.lol acepta hasta 250). Pocos valores = más respuestas reutilizables. */
export const RADIOS = [25, 50, 100, 150, 250];
// Solo lo que el mapa necesita. Se descartan propietario/operador (ownOp), año y demás campos de la base de datos.
const CAMPOS = ["hex", "flight", "r", "t", "lat", "lon", "alt_baro", "alt_geom", "gs", "track", "baro_rate", "geom_rate", "squawk", "category", "seen_pos"];

/** "/punto/19.25/-99.25/100" → {lat, lon, nm}; cualquier otra cosa → null. */
export function ruta(path) {
  const m = /^\/punto\/(-?\d{1,2}(?:\.\d{1,2})?)\/(-?\d{1,3}(?:\.\d{1,2})?)\/(\d{2,3})$/.exec(path || "");
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]), nm = Number(m[3]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !RADIOS.includes(nm)) return null;
  return { lat, lon, nm };
}

/** Respuesta de adsb.lol → aviones con posición, sin los que pidieron privacidad (PIA = 4, LADD = 8) y con campos mínimos. */
export function limpiar(d) {
  return (d?.ac || []).filter((a) => a.lat != null && a.lon != null && !((a.dbFlags || 0) & 12)).map((a) => {
    const o = {};
    for (const k of CAMPOS) if (a[k] !== undefined) o[k] = a[k];
    o.mil = (a.dbFlags || 0) & 1 ? 1 : 0;
    return o;
  });
}
