// Alerta de sismos visual y sonora para la ubicación de quien consulta el mapa.
//
// Qué NO es: una alerta temprana. Los sistemas de alerta temprana (SASMEX en México, ShakeAlert en EUA,
// el de la JMA en Japón) detectan el sismo con sensores cerca del epicentro y avisan SEGUNDOS antes de que
// llegue la sacudida. Este mapa lee catálogos públicos que publican el sismo uno o varios minutos DESPUÉS
// (USGS y EMSC, el Centro Sismológico Euromediterráneo, que suele publicar primero fuera de EUA). Sirve para enterarte de inmediato de un
// sismo fuerte cerca de ti si tienes el mapa abierto, no para protegerte antes de la sacudida.
//
// Privacidad: tu ubicación (GPS del navegador o la ciudad que elijas) se guarda solo en este navegador,
// redondeada a ~5 km, y nunca se envía a ningún servidor: el cálculo de distancia se hace aquí.
// No se usa la dirección IP: ubicarte por IP exige mandarla a un servicio externo.

// Distancia (km, hipocentral) dentro de la cual un sismo de esa magnitud suele sentirse fuerte o muy fuerte.
// Heurística propia para filtrar, inspirada en la atenuación típica de la intensidad: NO es una ecuación
// publicada ni una predicción de daños. La sacudida real depende del suelo (en el Valle de México el lago
// amplifica), de la profundidad y del tipo de falla.
export const UMBRALES = [[8.0, 1000], [7.5, 650], [7.0, 400], [6.5, 250], [6.0, 150], [5.5, 80], [5.0, 40]];
export const EDAD_MAX_MIN = 30;  // un sismo publicado hace más de 30 min ya no dispara la alarma
export const SENSIBILIDAD = { baja: 0.7, normal: 1, alta: 1.5 };

export function radioPeligro(mag, factor = 1) {
  const m = Number(mag);
  if (!Number.isFinite(m)) return 0;
  const u = UMBRALES.find(([min]) => m >= min);
  return u ? u[1] * factor : 0;
}

export function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * ¿Pone en riesgo a la persona? sismo = {mag, lat, lon, prof_km, tiempo (ms), tsunami (bool)}; ubic = {lat, lon}.
 * Devuelve null si no hay que avisar, o {nivel: "alarma" | "aviso", distancia_km, radio_km, motivo}.
 *  - alarma: dentro de la distancia de peligro (sonido + pantalla).
 *  - aviso: entre 1 y 2 veces esa distancia, o bandera de tsunami a menos de 1,000 km (solo pantalla).
 * Los sismos menores de M5, los lejanos y los de hace más de 30 min se descartan.
 */
export function evaluar(sismo, ubic, { factor = 1, ahora = Date.now(), edadMaxMin = EDAD_MAX_MIN } = {}) {
  if (!sismo || !ubic || !Number.isFinite(sismo.lat) || !Number.isFinite(ubic.lat)) return null;
  if (ahora - sismo.tiempo > edadMaxMin * 60000 || sismo.tiempo - ahora > 5 * 60000) return null;
  const epi = distanciaKm(ubic.lat, ubic.lon, sismo.lat, sismo.lon);
  const d = Math.sqrt(epi ** 2 + (Number(sismo.prof_km) || 10) ** 2);  // distancia al foco: un sismo profundo sacude menos
  const radio = radioPeligro(sismo.mag, factor);
  if (radio && d <= radio) return { nivel: "alarma", distancia_km: Math.round(epi), radio_km: Math.round(radio), motivo: "sacudida fuerte probable en tu zona" };
  if (sismo.tsunami && sismo.mag >= 7 && epi <= 1000) return { nivel: "aviso", distancia_km: Math.round(epi), radio_km: Math.round(radio), motivo: "posible tsunami: revisa el aviso oficial si estás en la costa" };
  if (radio && d <= 2 * radio) return { nivel: "aviso", distancia_km: Math.round(epi), radio_km: Math.round(radio), motivo: "pudo sentirse en tu zona" };
  return null;
}

/** Feature GeoJSON de USGS → sismo normalizado. */
export function deUsgs(f) {
  const p = f.properties || {}, c = f.geometry?.coordinates || [];
  return { id: `usgs:${f.id}`, mag: p.mag, lat: c[1], lon: c[0], prof_km: c[2], tiempo: p.time, tsunami: Boolean(p.tsunami),
    lugar: p.place || "", url: p.url, fuente: "USGS" };
}

/** Feature de EMSC (seismicportal.eu, FDSN) → sismo normalizado. */
export function deEmsc(f) {
  const p = f.properties || {};
  return { id: `emsc:${f.id || p.unid}`, mag: p.mag, lat: p.lat, lon: p.lon, prof_km: Math.abs(Number(p.depth) || 10), tiempo: Date.parse(p.time),
    tsunami: false, lugar: p.flynn_region || "", url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.source_id || "")}`,
    fuente: `EMSC${p.auth ? ` (${p.auth})` : ""}` };
}

/** RSS de últimos sismos del SSN (UNAM) → sismos normalizados. Título: «4.1, 12 km al SUROESTE de X, GRO». */
export function deSsn(xml) {
  const out = [];
  for (const item of String(xml).split(/<item>/i).slice(1)) {
    const tag = (t) => (item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
    const titulo = tag("title");
    const mag = Number((titulo.match(/^\s*([\d.]+)/) || [])[1]);
    const lat = Number(tag("geo:lat")), lon = Number(tag("geo:long"));
    const desc = tag("description");
    const fecha = (desc.match(/Fecha:\s*([\d-]+\s+[\d:]+)/i) || [])[1];
    const prof = Number((desc.match(/Profundidad:\s*([\d.]+)/i) || [])[1]);
    if (!Number.isFinite(mag) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // El SSN publica la hora del centro de México (UTC−6, sin horario de verano desde 2022).
    const tiempo = fecha ? Date.parse(`${fecha.replace(" ", "T")}-06:00`) : NaN;
    out.push({ id: `ssn:${fecha || titulo}`, mag, lat, lon, prof_km: Number.isFinite(prof) ? prof : 10, tiempo, tsunami: false,
      lugar: titulo.replace(/^\s*[\d.]+,\s*/, ""), url: tag("link") || "http://www.ssn.unam.mx/", fuente: "SSN (UNAM)" });
  }
  return out.filter((s) => Number.isFinite(s.tiempo));
}

/** El mismo sismo reportado por USGS y por el SSN (≤ 100 km y ≤ 3 min): se queda el primero de la lista. */
export function sinDuplicados(sismos) {
  const out = [];
  for (const s of sismos) {
    if (out.some((o) => Math.abs(o.tiempo - s.tiempo) <= 180000 && distanciaKm(o.lat, o.lon, s.lat, s.lon) <= 100)) continue;
    out.push(s);
  }
  return out;
}

/** Zona horaria del navegador → ciudad sugerida (sin red): «America/Mexico_City» → «Mexico City». */
export function ciudadDeZonaHoraria(tz, ciudades) {
  const nombre = String(tz || "").split("/").pop().replace(/_/g, " ").toLowerCase();
  if (!nombre) return null;
  const c = ciudades.find(([en, es]) => en.toLowerCase() === nombre || (es || "").toLowerCase() === nombre);
  return c ? { nombre: c[1] || c[0], iso3: c[2], lat: c[3], lon: c[4] } : null;
}

/** Redondea la ubicación a 0.05° (~5 km): basta para el cálculo y no guarda el domicilio exacto. */
export const redondear = (v) => Math.round(v * 20) / 20;
