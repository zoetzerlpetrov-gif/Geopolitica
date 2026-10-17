// Vuelos en vivo: al acercar el mapa, cada 15 s se piden a OpenSky Network (por el intermediario de Cloudflare,
// cloudflare/vuelos) los aviones alrededor del centro y reemplazan a los de la instantánea en ese círculo.
// Mismas reglas de subtipos y sanciones que tools/vivos/actualizar.py.

export const INTERVALO_MS = 15000;
export const ZOOM_MIN = 6;
export const RADIOS = [25, 50, 100, 150, 250]; // millas náuticas; los mismos que acepta el intermediario

// Copia de CARGA_SOLO y ESTADO de tools/vivos/actualizar.py.
const CARGA_SOLO = new Set(["FDX", "UPS", "GTI", "CLX", "ABW", "CKS", "BOX", "DHK", "DHL", "BCS", "CAO", "CKK", "AJT", "ATN", "MPH", "NCA", "SQC", "TAY", "LCO", "MXY", "ABX", "PAC", "WGN"]);
const ESTADO = ["SAM", "EXEC", "VENUS", "CFC0", "GAF6", "RRR", "FAF", "IAM", "CTM", "ASY", "MMF", "FAM", "SPAR"];

/** Igual que _subtipo_avion del servidor. */
export function subtipoAvion(indicativo, militar, enTierra, matricula, sancionadas) {
  const cs = String(indicativo || "").trim().toUpperCase();
  if (matricula && sancionadas?.has(String(matricula).replace(/-/g, "").toUpperCase())) return "sancionada";
  if (enTierra) return "en_tierra";
  if (ESTADO.some((p) => cs.startsWith(p))) return "estado";
  if (militar) return "militar";
  if (/^[A-Z]{3}\d/.test(cs)) return CARGA_SOLO.has(cs.slice(0, 3)) ? "carga" : "civil_comercial";
  return "aviacion_general";
}

/** Avión del intermediario → fila con los campos de aeronaves.json (hex, indicativo, lon, lat, alt_m, rumbo, vel_kmh, subtipo, pais, edad_s, …). */
export function filaDeVivo(a, sancionadas) {
  const enTierra = a.alt_baro === "ground";
  const alt = enTierra ? 0 : Math.round((Number(a.alt_geom) || Number(a.alt_baro) || 0) * 0.3048);
  const vs = a.baro_rate ?? a.geom_rate ?? 0;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return [a.hex, String(a.flight || "").trim(), r3(a.lon), r3(a.lat), alt, Math.round(a.track || 0), Math.round((a.gs || 0) * 1.852),
    subtipoAvion(a.flight, !!a.mil, enTierra, a.r, sancionadas), a.pais || "", Math.round(a.seen_pos || 0), Math.round(vs * 0.00508 * 10) / 10,
    a.squawk || "", a.category || "", a.t || "", a.r || "", ""];
}

/** Qué pedir para la vista actual: centro redondeado a 0.25° (para compartir respuestas) y el radio que cubre la vista, hasta 250 nm. */
export function consulta(centro, esquina) {
  const r = (x) => Number((Math.round(x * 4) / 4).toFixed(2));
  const nm = distanciaKm(centro, esquina) / 1.852;
  return { lat: r(centro.lat), lon: r(((centro.lng + 540) % 360) - 180), nm: RADIOS.find((x) => x >= nm) || RADIOS.at(-1) };
}

export function distanciaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Mezcla la instantánea con lo recibido en vivo: dentro del círculo consultado manda el dato en vivo (los que ya no
 * aparecen se quitan); fuera, sigue la instantánea. La edad de cada fila en vivo se expresa respecto a la hora de la
 * instantánea, porque la proyección suma (ahora − generado) + edad_s.
 */
export function fusionar(filas, campos, vivas, { lat, lon, nm }, generadoMs, tVivoMs) {
  const iLon = campos.indexOf("lon"), iLat = campos.indexOf("lat"), iE = campos.indexOf("edad_s");
  const hex = new Set(vivas.map((f) => f[0]));
  const km = nm * 1.852, centro = { lat, lng: lon };
  const fuera = filas.filter((f) => !hex.has(f[0]) && distanciaKm(centro, { lat: f[iLat], lng: f[iLon] }) > km);
  const desfase = (generadoMs - tVivoMs) / 1000;
  return { filas: fuera.concat(vivas.map((f) => { const g = f.slice(); g[iE] = f[iE] + desfase; return g; })), hex };
}
