// Evaluador de riesgo por ubicación para inmuebles (inmuebles.html). Funciones puras; la página pide los datos.
// Escala común: 1 bajo · 2 moderado · 3 alto · 4 muy alto. Cada dimensión explica de dónde sale su calificación.

export function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const NIVELES = ["", "Bajo", "Moderado", "Alto", "Muy alto"];

/** Sismos M≥5 a ≤150 km desde 1975 (respuesta GeoJSON de USGS) → nivel. */
export function riesgoSismico(sismos) {
  const ms = sismos.map((f) => Number(f.properties?.mag) || 0);
  const max = ms.length ? Math.max(...ms) : 0, n6 = ms.filter((m) => m >= 6).length;
  const nivel = max >= 7 || n6 >= 5 ? 4 : max >= 6.5 || n6 >= 2 ? 3 : ms.length >= 3 || max >= 6 ? 2 : 1;
  return { nivel, texto: ms.length ? `${ms.length} sismos de magnitud 5 o más a menos de 150 km desde 1975; el mayor, M${max.toFixed(1)}.` : "Sin sismos de magnitud 5 o más a menos de 150 km desde 1975 (catálogo USGS)." };
}

/** Volcanes del Holoceno ([nombre, lon, lat]) → nivel por distancia al más cercano. */
export function riesgoVolcanico(lat, lon, volcanes) {
  let cerca = null;
  for (const [n, vlon, vlat] of volcanes) {
    if (Math.abs(vlat - lat) > 2 || Math.abs(vlon - lon) > 3) continue;
    const d = distanciaKm(lat, lon, vlat, vlon);
    if (!cerca || d < cerca.d) cerca = { n, d };
  }
  if (!cerca) return { nivel: 1, texto: "Ningún volcán activo en los últimos ~12,000 años a menos de ~200 km." };
  const nivel = cerca.d < 15 ? 4 : cerca.d < 40 ? 3 : cerca.d < 100 ? 2 : 1;
  return { nivel, texto: `Volcán más cercano: ${cerca.n}, a ${Math.round(cerca.d)} km (caída de ceniza posible hasta ~100 km según el viento; flujos y lahares en los primeros 15-40 km).` };
}

/** Pendiente aproximada (°) con la elevación del punto y de 4 puntos a `paso` metros (N, S, E, O). */
export function pendiente(elevs, paso = 300) {
  if (!Array.isArray(elevs) || elevs.length < 5 || elevs.some((x) => x == null)) return null;
  const [c, n, s, e, o] = elevs.map(Number);
  if ([c, n, s, e, o].some((x) => !Number.isFinite(x))) return null;
  const dzdy = (n - s) / (2 * paso), dzdx = (e - o) / (2 * paso);
  return Math.round((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI * 10) / 10;
}
export function puntosPendiente(lat, lon, paso = 300) {
  const dLat = paso / 111320, dLon = paso / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]];
}

/** Deslaves e inundación (estimación por terreno): pendiente y elevación del punto. */
export function riesgoTerreno(grados, elevacion) {
  if (grados == null) return { nivel: null, texto: "Sin datos de elevación." };
  const desl = grados >= 25 ? 4 : grados >= 15 ? 3 : grados >= 8 ? 2 : 1;
  const inund = elevacion != null && elevacion < 5 ? 3 : elevacion != null && elevacion < 15 && grados < 2 ? 2 : 1;
  return { nivel: Math.max(desl, inund), deslave: desl, inundacion: inund,
    texto: `Pendiente aproximada ${grados}° (deslave: ${NIVELES[desl].toLowerCase()}); elevación ${elevacion ?? "?"} m (inundación o marejada: ${NIVELES[inund].toLowerCase()}). Estimación con el relieve: confirma con el atlas de riesgos local.` };
}

/** Estabilidad política (Banco Mundial, WGI «Political Stability», escala aprox. −2.5 a +2.5). */
export function riesgoPolitico(pv) {
  if (pv == null) return { nivel: null, texto: "Sin dato del Banco Mundial." };
  const nivel = pv >= 0.5 ? 1 : pv >= -0.25 ? 2 : pv >= -1 ? 3 : 4;
  return { nivel, texto: `Estabilidad política y ausencia de violencia (Banco Mundial, WGI): ${pv.toFixed(2)} en una escala de −2.5 a +2.5.` };
}

/** Inseguridad: tasa nacional de homicidios (por 100 mil) y eventos de seguridad del mapa a ≤50 km en la ventana disponible. */
export function riesgoInseguridad(homicidios, eventosCerca) {
  const h = homicidios == null ? null : Number(homicidios);
  const base = h == null ? null : h >= 20 ? 4 : h >= 10 ? 3 : h >= 3 ? 2 : 1;
  const graves = eventosCerca.filter((e) => e.severidad >= 4).length;
  const nivel = base == null ? (graves >= 3 ? 3 : null) : Math.min(4, base + (graves >= 3 ? 1 : 0));
  return { nivel, texto: `${h == null ? "Tasa de homicidios sin dato" : `Homicidios: ${h.toFixed(1)} por 100 mil habitantes (nacional, Banco Mundial/UNODC)`}; `
    + `${eventosCerca.length} eventos de seguridad del mapa a menos de 50 km (${graves} graves). La cifra nacional no describe cada colonia: revisa la estadística local.` };
}

const sinAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^estado de /, "").trim();

/** Nombre de estado de OpenStreetMap («Yucatán», «Estado de México», «Michoacán») → clave del SESNSP («Michoacán de
 * Ocampo», «México»…); null si no coincide. «Ciudad de México» no se confunde con «México». */
export function estadoSesnspDe(nombre, claves) {
  const n = sinAcento(nombre);
  if (!n) return null;
  return claves.find((k) => sinAcento(k) === n) || claves.find((k) => sinAcento(k).startsWith(`${n} `) || n.startsWith(`${sinAcento(k)} `)) || null;
}

/** Inseguridad en México con la cifra del estado: homicidio doloso del SESNSP (carpetas de investigación de los meses
 * publicados del año, anualizadas, por 100 mil habitantes del Censo 2020). Umbrales propios: menos de 4 bajo, 4 a 12
 * medio, 12 a 25 alto, 25 o más muy alto (las carpetas cuentan un poco menos que las víctimas). Más de 3 eventos
 * graves del mapa a 50 km suben un nivel. */
export function riesgoInseguridadMx(estado, dato, nacional, eventosCerca, periodo = "") {
  const graves = eventosCerca.filter((e) => e.severidad >= 4).length;
  const t = dato?.tasa_anual_100k;
  const base = t == null ? null : t >= 25 ? 4 : t >= 12 ? 3 : t >= 4 ? 2 : 1;
  const nivel = base == null ? (graves >= 3 ? 3 : null) : Math.min(4, base + (graves >= 3 ? 1 : 0));
  const txt = t == null ? `Sin cifra estatal${estado ? ` para ${estado}` : ""}`
    : `Homicidio doloso en ${estado}: ${t.toFixed(1)} por 100 mil habitantes al año (SESNSP${periodo ? `, ${periodo}` : ""}, anualizado; nacional ${nacional?.tasa_anual_100k ?? "—"})`;
  return { nivel, texto: `${txt}; ${eventosCerca.length} eventos de seguridad del mapa a menos de 50 km (${graves} graves). `
    + "Es la cifra de todo el estado: la colonia puede ser más o menos segura; revisa también la estadística municipal del SESNSP." };
}

/** Calificación global: la peor dimensión pesa más (un riesgo muy alto no se compensa con otros bajos). */
export function riesgoGlobal(dims) {
  const v = dims.map((d) => d.nivel).filter((n) => n >= 1);
  if (!v.length) return null;
  const max = Math.max(...v), prom = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.min(4, Math.max(1, Math.round(0.6 * max + 0.4 * prom)));
}

/** Precio por m² y comparación contra la referencia que tú indiques (por ejemplo, la mediana oficial de la zona). */
export function precioM2(precio, m2, referencia) {
  const p = Number(precio), s = Number(m2);
  if (!(p > 0 && s > 0)) return null;
  const v = p / s, r = Number(referencia);
  return { m2: Math.round(v), dif: r > 0 ? Math.round(((v - r) / r) * 100) : null };
}

/**
 * Búsqueda de coordenadas por ciudad y colonia/barrio con Nominatim (OpenStreetMap; política de uso: una consulta a
 * la vez, iniciada por la persona y con atribución). `iso2`: código de 2 letras para limitar al país.
 */
export function urlGeocodificar(ciudad, colonia = "", iso2 = "") {
  const q = [colonia, ciudad].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  if (q.length < 3) return null;
  const p = new URLSearchParams({ format: "jsonv2", limit: "6", addressdetails: "1", "accept-language": "es", q });
  if (/^[a-z]{2}$/i.test(iso2)) p.set("countrycodes", iso2.toLowerCase());
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

/** Resultados de Nominatim → opciones legibles, primero colonias/barrios y localidades (no tiendas ni paradas). */
export function opcionesGeocodificacion(res) {
  const PREF = { suburb: 0, neighbourhood: 0, quarter: 0, city_district: 1, borough: 1, village: 2, town: 2, city: 2, hamlet: 2, municipality: 3, county: 4, state: 5 };
  return (Array.isArray(res) ? res : []).map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), nombre: r.display_name || r.name || "",
    tipo: r.addresstype || r.type || "", orden: PREF[r.addresstype] ?? 9 }))
    .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lon))
    .sort((a, b) => a.orden - b.orden);
}


/** Une las reglas por país de varios catálogos: la última gana, salvo «busqueda», que se suma (antes, el catálogo
 * de Veracruz habría borrado las búsquedas de los demás estados de México). */
export function unirReglas(lista) {
  const out = {};
  for (const paises of lista) for (const [iso, r] of Object.entries(paises || {})) {
    const prev = out[iso] || {};
    out[iso] = { ...prev, ...r, busqueda: [...(prev.busqueda || []), ...(r.busqueda || [])] };
  }
  return out;
}

/** Vista de calle de un punto, sin llave: Google Street View (URL pública de Google Maps) y Mapillary (fotos
 * abiertas, CC BY-SA). Si Google no tiene foto justo ahí, muestra la más cercana o el mapa. */
export const urlCalle = (lat, lon) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
export const urlMapillary = (lat, lon) => `https://www.mapillary.com/app/?lat=${Number(lat).toFixed(6)}&lng=${Number(lon).toFixed(6)}&z=17`;
