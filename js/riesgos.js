// Riesgos naturales y clima: capas del proyecto «Clima Táctico» (repositorio WarRoomViajero) dentro de
// este mapa, sin copiar sus datos. WarRoomViajero los regenera 2 veces al día con GitHub Actions y los
// publica en su GitHub Pages (mismo dominio que este sitio); aquí solo se leen al activar cada capa.
// Los sismos se piden en vivo a USGS desde el navegador (CORS abierto), como en el mapa original.
//
// Fuentes originales: USGS, NOAA NHC, NASA FIRMS, GDACS, Open-Meteo, CENAPRED/Smithsonian, noticias
// (GDELT y Google News) y NOAA SWPC. Las capas de noticias son SEÑALES por verificar, no incidentes
// confirmados, y siempre enlazan a la fuente.
import { getJSON, esc, safeUrl, pinturaEtiqueta } from "./util.js";
import { clasificar, claveDe, paisEn, paisDeLugar, enjambres, radiosTsunami, lineasAurora, registrarVistos, feedAPuntos, PARPADEO_MS, NUEVO_MS, SEVERIDADES,
  ESCALA_SISMO, estiloSismo, categoriaCiclon, sevAlertaVolcan, normalizar, BANDAS_AQI } from "./amenazas.js";

export const BASES = [
  "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/data/",
  "https://raw.githubusercontent.com/zoetzerlpetrov-gif/WarRoomViajero/main/data/",
];
/** Orden e ícono de los subgrupos del panel. */
export const GRUPOS = [["Desastres naturales", "🌋", "#C0392B"], ["Clima y ambiente", "🌦️", "#2471A3"], ["Seguridad y ataques", "🛡️", "#6C3483"]];

export const ORIGEN = { nombre: "Clima Táctico (WarRoomViajero)", url: "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/" };

const C = { verde: "#2E9E6E", ambar: "#E0A100", naranja: "#E2711D", rojo: "#D23B3B", violeta: "#8E4FD1", cian: "#1F8A8A", gris: "#6f8a82" };
const NIVEL = [C.verde, C.ambar, C.naranja, C.rojo, C.violeta];
const COLOR_ALERTA = { verde: "#2E9E6E", amarillo: "#E0B000", naranja: "#E2711D", rojo: "#D23B3B" };
const fecha = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? String(t || "") : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };

/**
 * Capas. `archivos` se buscan en BASES; `url` es una fuente en vivo. `estilo(props, geom)` devuelve
 * {c: color, r: radio}; `ficha(props)` devuelve {titulo, chip, filas:[[etiqueta, valor]], url, fuente}.
 */
export const CAPAS = [
  {
    id: "sismos", grupo: "Desastres naturales", nombre: "Sismos M2.5+ (24 h, en vivo)", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    refresco_s: 300, fuente: "USGS",
    // Agrega posibles enjambres en México y radios estimados de tsunami (1, 2 y 3 h) para sismos con bandera de tsunami.
    derivar: (fc) => ({ ...fc, features: [...fc.features, ...enjambres(fc.features), ...fc.features.filter((f) => f.properties.tsunami).flatMap(radiosTsunami)] }),
    estilo: (p) => (p._tsunami_radio ? { c: C.cian, r: 0 } : p._enjambre ? { c: C.naranja, r: 10 } : estiloSismo(p.mag)),
    etiqueta: (p) => (p._enjambre ? `Enjambre · ${p.eventos} sismos` : !p._tsunami_radio && p.mag >= 4.5 ? `M${Number(p.mag).toFixed(1)}` : ""),
    leyenda: [...ESCALA_SISMO.map(([, c, r, t]) => ({ c, r: Math.max(4, r / 2), t })), { ic: "🔁", t: "Enjambre: 5 o más sismos en ~50 km en 24 h" },
      { ic: "🌊", t: "Sismo con bandera de tsunami (y radios de 1, 2 y 3 h)" }],
    ficha: (p, g) => (p._enjambre ? { titulo: p.place, chip: `Magnitud máxima ${p.mag_max?.toFixed?.(1) ?? p.mag_max}`,
      filas: [["Sismos agrupados", String(p.eventos)], ["Último", fecha(p.time)], ["Método", "5 o más sismos en una celda de ~50 km (heurística, últimas 24 h)"]],
      url: "http://www.ssn.unam.mx/", fuente: "Detección propia sobre datos de USGS; confirma con el SSN" }
    : p._tsunami_radio ? { titulo: p.place, chip: "estimación gruesa", filas: [["Sismo de origen", p.origen || "—"], ["Supuesto", "~700 km/h en aguas profundas; no considera batimetría ni costa"]],
      url: "https://www.tsunami.gov/", fuente: "Consulta siempre el aviso oficial (tsunami.gov)" }
    : {
      titulo: p.place || "Sismo", chip: `M${(p.mag ?? 0).toFixed(1)}${p.tsunami ? " · bandera de tsunami" : ""}`,
      filas: [["Hora", fecha(p.time)], ["Profundidad", g?.coordinates?.[2] != null ? `${Math.round(g.coordinates[2])} km` : "—"], ["Alerta PAGER", p.alert || "sin alerta"]],
      url: p.url, fuente: "USGS (tiempo real)",
    }),
  },
  {
    id: "ciclones", grupo: "Desastres naturales", nombre: "Ciclones, tifones y tormentas tropicales (todo el mundo)", archivos: ["storms.geojson", "storm_tracks.geojson"],
    locales: ["data/vivos/ciclones_mundo.geojson"], fuente: "NOAA NHC, GDACS e IBTrACS",
    // storms: posición actual. storm_tracks: trayectoria pasada (gris), pronóstico (ámbar) y radios de viento
    // de 34, 50 y 64 nudos (polígonos, más rojos cuanto más fuerte el viento).
    estilo: (p) => {
      if (p.layer === "storm") { const k = categoriaCiclon(p.intensity_kt || p.wind_kt); return { c: !k ? C.rojo : k.n >= 3 ? "#6A1B9A" : k.n >= 1 ? C.rojo : C.naranja, r: 8 + Math.round((k?.n || 0) * 2.4) }; }
      if (String(p.kind).startsWith("past")) return { c: C.gris, r: 2.5 };
      if (String(p.kind).startsWith("wind_radii")) return { c: p.wind_kt >= 64 ? C.rojo : p.wind_kt >= 50 ? C.naranja : C.ambar, r: 0 };
      return { c: C.ambar, r: 4 };
    },
    etiqueta: (p) => { if (p.layer !== "storm") return ""; const k = categoriaCiclon(p.intensity_kt || p.wind_kt); return `${p.name || p.storm_name || ""}${k ? ` · ${k.texto}` : ""}`; },
    leyenda: [{ c: "#6A1B9A", r: 10, t: "Categoría 3 a 5 (huracán o tifón mayor)" }, { c: C.rojo, r: 8, t: "Categoría 1 o 2" }, { c: C.naranja, r: 6, t: "Tormenta o depresión tropical" },
      { c: C.gris, r: 3, t: "Trayectoria recorrida" }, { c: C.ambar, r: 4, t: "Pronóstico y radios de viento" },
      { t: "La severidad 1–5 del panel se calcula con la categoría: cat. 4–5 = 5, cat. 2–3 = 4, cat. 1 = 3, tormenta = 2." }],
    ficha: (p) => {
      const kt = p.intensity_kt || p.wind_kt;
      const cat = p.layer === "storm" ? categoriaCiclon(kt) : null;
      const tipo = { past: "Trayectoria recorrida", past_point: "Posición pasada", forecast: "Trayectoria pronosticada", forecast_point: "Posición pronosticada",
        wind_radii_current: "Radio de vientos actual", wind_radii_forecast: "Radio de vientos pronosticado" }[p.kind];
      return {
        titulo: `${p.name || p.storm_name || "Ciclón"}${cat ? ` · ${cat.texto}` : ""}`, chip: cat?.texto || p.class_label || p.category || tipo || "",
        filas: [...(tipo ? [["Elemento", tipo]] : []), ...(cat ? [["Categoría (escala Saffir-Simpson)", cat.texto]] : []), ...(p.label || p.valid_text ? [["Momento", [p.label, p.valid_text].filter(Boolean).join(" · ")]] : []),
          ["Viento", kt ? `${kt} nudos (${Math.round(kt * 1.852)} km/h)` : "—"], ...(p.pressure_mb ? [["Presión", `${p.pressure_mb} hPa`]] : []),
          ...(p.movement ? [["Movimiento", p.movement]] : []), ...(p.basin ? [["Cuenca / zona", p.basin]] : []), ...(p.alertlevel ? [["Alerta GDACS", p.alertlevel]] : []),
          ...(p.last_update ? [["Actualizado", fecha(p.last_update)]] : [])],
        url: p.url || "https://www.nhc.noaa.gov/", fuente: p.fuente || "NOAA National Hurricane Center",
      };
    },
  },
  {
    id: "incendios", grupo: "Desastres naturales", nombre: "Incendios activos (focos VIIRS, 24 h)", archivos: ["fires.geojson"], fuente: "NASA FIRMS",
    estilo: (p) => ({ c: p.frp >= 100 ? C.rojo : p.frp >= 20 ? C.naranja : C.ambar, r: p.frp >= 100 ? 5 : 3 }),
    ficha: (p) => ({
      titulo: "Foco de calor", chip: `${Math.round(p.frp || 0)} MW de potencia radiativa`,
      filas: [["Detectado", `${p.acq_date || ""} ${String(p.acq_time || "").padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")} UTC`], ["Confianza", { h: "alta", n: "nominal", l: "baja" }[p.confidence] || p.confidence || "—"],
        ["Satélite", p.satellite === "N" ? "Suomi NPP" : p.satellite === "1" ? "NOAA-20" : p.satellite || "—"], ["Día o noche", p.daynight === "D" ? "día" : "noche"]],
      url: "https://firms.modaps.eosdis.nasa.gov/map/", fuente: "NASA FIRMS",
    }),
  },
  {
    id: "gdacs", grupo: "Desastres naturales", nombre: "Alertas de desastre GDACS (ONU/UE)", archivos: ["gdacs.geojson"], fuente: "GDACS",
    estilo: (p) => { const l = String(p.alertlevel || "green").toLowerCase(); return { c: l === "red" ? C.rojo : l === "orange" ? C.naranja : C.verde, r: 8 }; },
    ficha: (p) => ({ titulo: p.name || p.title || p.eventname || "Evento", chip: `${p.type_label || p.eventtype || ""} · ${p.alertlevel || ""}`,
      filas: [["País", p.country || "—"], ["Desde", p.fromdate ? fecha(p.fromdate) : "—"]], url: p.url || "https://www.gdacs.org", fuente: "GDACS" }),
  },
  {
    id: "pronostico", grupo: "Clima y ambiente", nombre: "Pronóstico 7 días: lluvia, viento y temperatura", archivos: ["forecast.geojson"], fuente: "Open-Meteo",
    estilo: (p) => ({ c: NIVEL[Math.min(4, p.level || 0)], r: 3 + (p.level || 0) * 2 }),
    ficha: (p) => ({ titulo: p.name, chip: p.level_label || "",
      filas: [["Lluvia máxima diaria", `${p.max_rain_mm ?? "—"} mm`], ["Ráfaga máxima", `${p.max_gust_kmh ?? "—"} km/h`],
        ["Temperatura", `${p.min_tmin_c ?? "—"} a ${p.max_tmax_c ?? "—"} °C`], ...(p.temp_label ? [["Aviso de temperatura", p.temp_label]] : [])],
      url: "https://open-meteo.com", fuente: "Open-Meteo (modelos numéricos)" }),
  },
  {
    id: "aire", grupo: "Clima y ambiente", nombre: "Calidad del aire (US AQI)", archivos: ["airquality.geojson"], locales: ["data/vivos/aire_ciudades.geojson"],
    fuente: "Open-Meteo Air Quality",
    derivar: (fc) => ({ ...fc, features: sinCiudadesRepetidas(fc.features) }),
    leyenda: BANDAS_AQI.map(([max, t, c]) => ({ c, r: 6, t: `${t}${Number.isFinite(max) ? ` (hasta ${max})` : " (301+)"}` })),
    estilo: (p) => ({ c: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : NIVEL[Math.min(4, p.level || 0)], r: 4 + Math.min(4, p.level || 0) }),
    ficha: (p) => ({ titulo: p.name, chip: `${p.level_label || ""} · AQI ${p.us_aqi ?? "—"}`,
      filas: [...(p.pais_iso3 ? [["País", p.pais_iso3]] : []), ["PM2.5", `${p.pm2_5 ?? "—"} µg/m³`], ["PM10", `${p.pm10 ?? "—"} µg/m³`], ["Ozono", `${p.ozone ?? "—"} µg/m³`], ["NO₂", `${p.no2 ?? "—"} µg/m³`]],
      url: "https://open-meteo.com/en/docs/air-quality-api", fuente: "Open-Meteo Air Quality (modelo CAMS)" }),
  },
  {
    id: "volcanes", grupo: "Desastres naturales", nombre: "Volcanes vigilados (alerta oficial y viento para la ceniza)", archivos: ["volcanoes.geojson"], fuente: "CENAPRED / USGS / Smithsonian",
    // Alerta oficial: semáforo de CENAPRED (Popocatépetl) y niveles de USGS (volcanes de EUA con alerta elevada).
    complementar: async (fc) => complementarVolcanes(fc),
    estilo: (p) => ({ c: COLOR_ALERTA[alertaColor(p)] || (p.ash_active ? C.rojo : C.violeta), r: 7 }),
    etiqueta: (p) => (p.alerta_texto ? `${p.name} · ${p.alerta_texto}` : ""),
    ficha: (p) => ({ titulo: p.name, chip: p.alerta_texto ? `Alerta oficial: ${p.alerta_texto}` : `${p.status || ""}${p.ash_active ? " · ceniza reportada" : ""}`,
      filas: [["País", p.country || "—"], ...(p.alerta_texto ? [["Nivel de alerta", `${p.alerta_texto} (${p.alerta_fuente || "fuente oficial"}${p.alerta_fecha ? `, ${p.alerta_fecha}` : ""})`]]
        : [["Nivel de alerta", "Sin dato automático: consulta la fuente oficial"]]),
        ...(p.codigo_aviacion ? [["Código de aviación", p.codigo_aviacion]] : []), ["Nota", p.note || "—"], ["Ceniza", p.ash_note || "—"]],
      url: p.alerta_url || p.url, fuente: p.alerta_fuente || "Fuente oficial del volcán" }),
    // Viento en altura (Open-Meteo): se pide al abrir la ficha y se dibuja hacia dónde iría la ceniza.
    extra: (p, g) => `<div class="ceniza" data-lon="${g.coordinates[0]}" data-lat="${g.coordinates[1]}" data-nombre="${esc(p.name)}"><p class="meta">Calculando hacia dónde iría la ceniza…</p></div>`,
    leyenda: [{ c: COLOR_ALERTA.verde, r: 6, t: "Verde / NORMAL" }, { c: COLOR_ALERTA.amarillo, r: 6, t: "Amarillo (fases 1–3) / ADVISORY" },
      { c: COLOR_ALERTA.naranja, r: 6, t: "Naranja / WATCH" }, { c: COLOR_ALERTA.rojo, r: 6, t: "Rojo / WARNING" }, { c: C.violeta, r: 6, t: "Sin alerta automática (consultar)" },
      { t: "La severidad 1–5 sale de la alerta oficial: Verde 1, Amarillo F1 2, F2 3, F3 4, Rojo 5 (USGS: NORMAL 1, ADVISORY 2, WATCH 4, WARNING 5)." }],
  },
  {
    id: "seguridad", grupo: "Seguridad y ataques", nombre: "Señales de seguridad en noticias (verificar)", archivos: ["security_map.geojson"], fuente: "Google News / GDELT",
    // Además se ubican los titulares del feed de seguridad por la ciudad o el estado que mencionan (como en Clima Táctico).
    complementar: async (fc, leer) => {
      const [feed, estados] = await Promise.all([leer("security_feed.json").catch(() => null), getJSON("config/mx_estados.json").catch(() => null)]);
      if (!feed || !estados) return fc;
      const ya = new Set(fc.features.map((f) => f.properties.title));
      return { ...fc, features: [...fc.features, ...feedAPuntos(feed.items, estados).filter((f) => !ya.has(f.properties.title))] };
    },
    estilo: () => ({ c: C.rojo, r: 5 }), senal: true,
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind || "SEÑAL"} · señal de noticias, verifica`,
      filas: [["Estado / zona", `${p.state || "—"}${p.precision ? ` (ubicación aproximada: ${p.precision})` : ""}`], ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"],
        ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "severo", grupo: "Clima y ambiente", nombre: "Granizo, tornados y tormentas en noticias (verificar)", archivos: ["severe_weather_map.geojson"], fuente: "Google News / GDELT",
    estilo: (p) => ({ c: p.severe ? C.rojo : C.cian, r: 5 }), senal: true,
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind || ""}${p.severe ? " · severo" : ""} · señal de noticias, verifica`,
      filas: [["Estado / zona", p.state || "—"], ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"]], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "deslaves", grupo: "Desastres naturales", nombre: "Deslaves y movimientos de masa (noticias)", archivos: ["mass_movements.geojson"], locales: ["data/vivos/deslaves.geojson"], fuente: "Noticias", senal: true,
    estilo: () => ({ c: C.naranja, r: 5 }),
    ficha: (p) => ({ titulo: p.title || p.name || "Deslave", chip: "señal de noticias, verifica",
      filas: [["Zona", `${p.state || p.lugar || p.country || "—"}${p.precision && p.precision !== "ciudad" ? ` (aprox.: ${p.precision})` : ""}`], ["Medio", p.source || "—"],
        ["Fecha", p.date ? fecha(p.date) : "—"], ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "crimen", grupo: "Seguridad y ataques", nombre: "Terrorismo, narcotráfico y crimen organizado (noticias 72 h, verificar)", url: "data/vivos/crimen.geojson", refresco_s: 1200,
    fuente: "GDELT (noticias)", senal: true,
    estilo: (p) => ({ c: { Terrorismo: "#8E1B1B", Narcotráfico: "#B4451F", Mafia: "#5B3A8E", "Crimen organizado": "#C27C1E" }[p.tipo] || C.rojo, r: 3 + (p.severidad || 3) }),
    ficha: (p) => ({ titulo: p.title, chip: `${p.tipo || "Crimen"} · señal de noticias, verifica`,
      filas: [["Lugar", `${p.lugar || "—"}${p.precision === "país" ? " (ubicación aproximada: país)" : p.precision === "estado" ? " (aprox.: centro del estado)" : ""}`],
        ...(p.arma ? [["Arma o método", p.arma]] : []),
        ...(p.actores ? [["Actores (GDELT)", p.actores]] : []), ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"],
        ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticia" }),
  },
  {
    id: "ataques", grupo: "Seguridad y ataques", nombre: "Ataques: misiles, drones, bombas y artillería (48 h)", url: "data/vivos/ataques.geojson", refresco_s: 1200,
    fuente: "GDELT (códigos CAMEO de ataque) y medios mexicanos", senal: true,
    estilo: (p) => ({ c: p.severidad >= 5 ? "#7B1E1E" : p.severidad >= 4 ? C.rojo : C.naranja, r: 3 + (p.severidad || 3) }),
    ficha: (p) => ({ titulo: p.title, chip: `${p.arma || "Ataque"} · señal, verifica`,
      filas: [["Arma o método", p.arma || "—"], ["Lugar", `${p.lugar || "—"}${p.precision && p.precision !== "ciudad" ? ` (aprox.: ${p.precision})` : ""}`],
        ...(p.actores ? [["Actores (GDELT)", p.actores]] : []), ...(p.cameo ? [["Código CAMEO", p.cameo]] : []), ["Medio", p.source || "—"],
        ["Fecha", p.date ? fecha(p.date) : "—"], ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticia" }),
  },
  {
    id: "nws", grupo: "Clima y ambiente", nombre: "Alertas meteorológicas de EUA (NWS, en vivo)", url: "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
    refresco_s: 300, fuente: "NOAA National Weather Service",
    estilo: (p) => ({ c: { Extreme: C.violeta, Severe: C.rojo, Moderate: C.naranja, Minor: C.ambar }[p.severity] || C.gris, r: 4 }),
    ficha: (p) => ({ titulo: p.event || "Alerta", chip: `${p.severity || ""} · ${p.urgency || ""}`,
      filas: [["Zonas", (p.areaDesc || "—").slice(0, 300)], ["Vigente hasta", p.expires ? fecha(p.expires) : "—"], ["Resumen", (p.headline || "—").slice(0, 300)]],
      url: p["@id"] || "https://alerts.weather.gov", fuente: "NOAA NWS (aviso oficial)" }),
  },
  {
    id: "auroras", grupo: "Clima y ambiente", nombre: "Auroras: hasta dónde se verían según el Kp", generar: async (leer) => { const s = await leer("space.json"); return lineasAurora(Number(s?.kp?.value || 0)); },
    fuente: "NOAA SWPC (índice Kp)",
    estilo: (p) => ({ c: p.actual ? "#2ECC71" : "#7FB89A", r: 0 }),
    ficha: (p) => ({ titulo: `Borde de aurora con Kp ${p.kp}`, chip: p.actual ? "nivel actual" : "referencia",
      filas: [["Latitud mínima aprox.", `${p.lat_min}° ${p.hemisferio === "norte" ? "N" : "S"}`], ["Fórmula", "67° − 2.5 × Kp (aproximación)"]],
      url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast", fuente: "NOAA SWPC" }),
  },
];

/**
 * Agrega a cada feature: color (_c), radio (_r), severidad (_sev 1–5), tipo (_tipo), ícono (_ic, nombre de
 * imagen o ""), país ISO3 (_pais), clave estable (_k), hora (_t) e índice (_i). Descarta geometrías vacías.
 * `ctx` = {indice: indicePaises(), porNombre: {nombre en/es → ISO3}}; sin ctx el país queda vacío.
 */
export function preparar(capa, fc, ctx = {}) {
  const features = (fc?.features || []).filter((f) => f && f.geometry).map((f, i) => {
    const p = f.properties || {};
    const e = capa.estilo(p, f.geometry);
    const k = clasificar(capa.id, p, f.geometry);
    return { type: "Feature", geometry: f.geometry,
      properties: { ...p, _c: e.c, _r: e.r, _i: i, _lbl: capa.etiqueta ? capa.etiqueta(p, f.geometry) : "", _sev: k.sev, _tipo: k.tipo, _ic: k.ic ? `emoji:${k.ic}` : "", _pais: paisDe(capa.id, p, f.geometry, ctx) || "",
        _k: claveDe(capa.id, p, f.geometry), _t: tiempo(p) } };
  });
  return { type: "FeatureCollection", features };
}

function tiempo(p) {
  const t = p.time ?? p.last_update ?? p.date ?? p.acq_date ?? p.fromdate ?? p.sent ?? p.fecha_utc;
  const n = typeof t === "number" ? t : Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}

function primeraCoord(g) {
  let c = g.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return c;
}

function paisDe(capa, p, g, { indice, porNombre = {} }) {
  if (["seguridad", "severo"].includes(capa) && p.state) return "MEX";
  if (p.pais_iso3) return p.pais_iso3;
  const nombre = p.country || (capa === "sismos" ? paisDeLugar(p.place) : null);
  if (nombre && porNombre[nombre.toLowerCase()]) return porNombre[nombre.toLowerCase()];
  if (!indice || !g) return null;
  const c = primeraCoord(g);
  return Array.isArray(c) ? paisEn(indice, c[0], c[1]) : null;
}

/** Texto del clima espacial (space.json): escalas NOAA R (radio), S (radiación) y G (geomagnética). */
export function textoEspacial(s) {
  if (!s || !s.G) return null;
  const nombres = { 0: "sin tormenta", 1: "menor", 2: "moderada", 3: "fuerte", 4: "severa", 5: "extrema" };
  const g = s.G.scale ?? 0;
  const partes = [`Tormenta geomagnética G${g} (${nombres[g] || g})`];
  if (s.kp?.value != null) partes.push(`Kp ${Number(s.kp.value).toFixed(1)}`);
  if (s.flare?.class) partes.push(`última llamarada ${s.flare.class}`);
  if ((s.R?.scale || 0) > 0) partes.push(`apagón de radio R${s.R.scale}`);
  if ((s.S?.scale || 0) > 0) partes.push(`radiación solar S${s.S.scale}`);
  return partes.join(" · ");
}

/** Ficha HTML de un objeto de riesgo. */
function alertaColor(p) {
  const s = String(p.semaforo || "").toLowerCase();
  if (s) return s;
  return { GREEN: "verde", YELLOW: "amarillo", ORANGE: "naranja", RED: "rojo" }[String(p.codigo_aviacion || "").toUpperCase()] || "";
}

/** Une las alertas oficiales (vivos/volcanes_alerta.json) con la lista de volcanes de Clima Táctico. */
async function complementarVolcanes(fc) {
  const al = await getJSON("data/vivos/volcanes_alerta.json", { bust: true }).catch(() => null);
  if (!al) return fc;
  const feats = [...fc.features];
  for (const m of al.mexico || []) {
    const f = feats.find((x) => normalizar(x.properties.name).startsWith(normalizar(m.volcan).slice(0, 6)));
    if (f) Object.assign(f.properties, { semaforo: m.semaforo, fase: m.fase, alerta_texto: `Semáforo ${m.texto}`, alerta_fuente: m.fuente, alerta_fecha: m.fecha, alerta_url: m.url });
  }
  for (const u of al.usgs || []) {
    const props = { nivel_usgs: u.nivel, codigo_aviacion: u.codigo_aviacion, alerta_texto: `${u.nivel} · ${u.codigo_aviacion}`, alerta_fuente: `USGS ${u.observatorio || ""}`.trim(),
      alerta_fecha: (u.enviado_utc || "").slice(0, 10), alerta_url: u.url };
    const f = feats.find((x) => normalizar(x.properties.name) === normalizar(u.volcan));
    if (f) Object.assign(f.properties, props);
    else feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [u.lon, u.lat] },
      properties: { layer: "volcano", name: u.volcan, country: "Estados Unidos", status: "alerta elevada", url: u.url, ...props } });
  }
  return { ...fc, features: feats };
}

/** Clima Táctico y el archivo propio traen algunas ciudades iguales: se queda una por nombre y zona (~1°). */
export function sinCiudadesRepetidas(features) {
  const vistas = new Set();
  return features.filter((f) => {
    const [lon, lat] = f.geometry?.coordinates || [];
    const k = `${normalizar(f.properties?.name)}:${Math.round(lat)}:${Math.round(lon)}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Leyenda HTML de una capa (círculos de color y tamaño, íconos y notas). */
export function htmlLeyenda(capa) {
  if (!capa.leyenda) return "";
  return `<div class="leyenda-capa">${capa.leyenda.map((x) => `<div>${x.ic ? `<span class="ley-ic">${x.ic}</span>` : x.c ? `<span class="ley-c" style="background:${x.c};width:${x.r * 2}px;height:${x.r * 2}px"></span>` : ""}<span>${esc(x.t)}</span></div>`).join("")}</div>`;
}

export function htmlRiesgo(capa, props, geom) {
  const f = capa.ficha(props, geom);
  const sev = props._sev ? SEVERIDADES.find(([n]) => n === props._sev) : null;
  return `<h3 id="ficha-titulo">${esc(f.titulo || capa.nombre)}</h3>
    <div class="fecha">${esc(props._tipo || capa.nombre)}</div>
    <div class="chips">${props._nuevo ? `<span class="chip nuevo">NUEVO</span>` : ""}${sev ? `<span class="chip sev-${sev[0]}">Severidad ${sev[0]}/5 · ${esc(sev[1])}</span>` : ""}
      ${f.chip ? `<span class="chip ${capa.senal ? "alerta" : ""}">${esc(f.chip)}</span>` : ""}</div>
    <dl>${f.filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
      <dt>Fuente</dt><dd>${f.url ? `<a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a>` : esc(f.fuente)}</dd></dl>
    ${capa.extra ? capa.extra(props, geom) : ""}
    ${capa.senal ? `<p class="meta">Señal detectada en cobertura noticiosa y ubicada de forma aproximada: no es un incidente confirmado. Verifica en la fuente y con autoridades locales.</p>` : ""}
    <p class="meta">Capa integrada desde <a href="${ORIGEN.url}" target="_blank" rel="noopener noreferrer">${esc(ORIGEN.nombre)}</a>. No sustituye a Protección Civil ni a los avisos oficiales.</p>`;
}

export async function leerArchivo(nombre) {
  let ultimo;
  for (const base of BASES) {
    try { return await getJSON(base + nombre, { bust: true }); } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

/** Imagen de un emoji (64 px, densidad 2) para usarla como ícono de símbolo en la GPU. */
function imagenEmoji(emoji) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.font = "46px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 4;
  g.fillText(emoji, 32, 35);
  return g.getImageData(0, 0, 64, 64);
}

const LS_VISTOS = "geo_riesgos_vistos";
const leerVistos = () => { try { return JSON.parse(localStorage.getItem(LS_VISTOS) || "{}"); } catch (e) { return {}; } };
const guardarVistos = (v) => { try { localStorage.setItem(LS_VISTOS, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

export class Riesgos {
  /**
   * @param {object} o
   * @param {(capa, props, geom) => void} o.onObjeto  clic en un objeto
   * @param {() => void} o.onCambio  cambió la lista de amenazas (para redibujar el panel)
   * @param {object} o.ctx  {indice, porNombre} para asignar país
   */
  constructor(map, { onObjeto, onCambio = () => {}, ctx = {} }) {
    this.map = map; this.onObjeto = onObjeto; this.onCambio = onCambio; this.ctx = ctx;
    this.activas = new Map(); this.relojes = new Map();
    this.filtro = { pais: "", tipo: "", sevMin: 1 };
    this.ocultos = new Map();  // capa → claves que no se dibujan
    this.nuevas = new Map();   // clave → hora en que apareció en esta sesión (parpadea 1 min)
    this.vistos = leerVistos();
    this.pulso = null;
  }

  async manifiesto() { return leerArchivo("manifest.json").catch(() => null); }
  async espacial() { return leerArchivo("space.json").catch(() => null); }

  async #datos(capa) {
    let fc;
    if (capa.generar) fc = await capa.generar(leerArchivo);
    else if (capa.url) fc = await getJSON(capa.url, { bust: true });
    else {
      // Archivos de Clima Táctico + archivos propios (data/vivos/…); uno que falte no impide los demás.
      const partes = await Promise.all([...capa.archivos.map((a) => leerArchivo(a).catch(() => null)), ...(capa.locales || []).map((u) => getJSON(u, { bust: true }).catch(() => null))]);
      if (partes.every((p) => !p)) throw new Error("sin datos");
      fc = { type: "FeatureCollection", features: partes.flatMap((p) => p?.features || []) };
    }
    if (capa.complementar) fc = await capa.complementar(fc, leerArchivo);
    return capa.derivar ? capa.derivar(fc) : fc;
  }

  #cargarEn(capa, fc) {
    const gj = preparar(capa, fc, this.ctx);
    const r = registrarVistos(this.vistos, capa.id, gj.features.map((f) => f.properties._k));
    this.vistos = r.vistos; guardarVistos(this.vistos);
    const ahora = Date.now();
    for (const k of r.nuevas) this.nuevas.set(k, ahora);
    // NUEVO = apareció después de la primera vez que se activó la capa en este navegador, hace menos de 1 h.
    const base = this.vistos[`_capa:${capa.id}`];
    for (const f of gj.features) {
      const visto = this.vistos[f.properties._k];
      f.properties._nuevo = Boolean(visto && visto !== base && ahora - visto < NUEVO_MS);
    }
    this.activas.set(capa.id, gj);
    if (r.nuevas.size) this.#arrancarPulso();
    return gj;
  }

  async activar(id) {
    const capa = CAPAS.find((c) => c.id === id);
    if (!capa || this.activas.has(id)) return 0;
    const gj = this.#cargarEn(capa, await this.#datos(capa));
    this.#instalar(capa);
    if (capa.refresco_s) {
      this.relojes.set(id, setInterval(async () => {
        try { const n = this.#cargarEn(capa, await this.#datos(capa)); this.map.getSource(`rg-${id}`)?.setData(n); this.onCambio(); } catch (e) { /* siguiente ciclo */ }
      }, capa.refresco_s * 1000));
    }
    this.onCambio();
    return gj.features.length;
  }

  desactivar(id) {
    clearInterval(this.relojes.get(id)); this.relojes.delete(id);
    this.activas.delete(id);
    for (const l of this.#capasDe(id)) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource(`rg-${id}`)) this.map.removeSource(`rg-${id}`);
    this.onCambio();
  }

  #capasDe(id) { return ["area", "linea", "punto", "icono", "pulso", "texto"].map((s) => `rg-${id}-${s}`); }

  /** Oculta objetos de una capa por clave (p. ej. ciudades desmarcadas en «Calidad del aire por ciudad»). */
  setOcultos(id, claves) {
    if (claves?.size) this.ocultos.set(id, [...claves]); else this.ocultos.delete(id);
    for (const l of this.#capasDe(id)) if (this.map.getLayer(l)) this.map.setFilter(l, this.#filtroDe(l));
  }

  /** Datos ya cargados de una capa activa (o null). */
  datos(id) { return this.activas.get(id) || null; }

  reinstalar() { for (const id of this.activas.keys()) this.#instalar(CAPAS.find((c) => c.id === id)); }

  /** Lista de amenazas de todas las capas activas (puntos), con lo necesario para el panel. */
  amenazas() {
    const out = [];
    for (const [id, gj] of this.activas) out.push(...this.#puntos(id, gj));
    return out;
  }

  #puntos(id, gj) {
    const capa = CAPAS.find((c) => c.id === id);
    const out = [];
    for (const f of gj.features) {
      const p = f.properties;
      if (f.geometry.type !== "Point" || p._tsunami_radio) continue;
      const ficha = capa.ficha(p, f.geometry);
      out.push({ capa: id, k: p._k, sev: p._sev, tipo: p._tipo, pais: p._pais, t: p._t, titulo: ficha.titulo || capa.nombre,
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], i: p._i, nuevo: p._nuevo || this.nuevas.has(p._k) });
    }
    return out;
  }

  /**
   * Tipos y países de TODAS las capas, también las apagadas (para llenar los filtros). Se descarga una
   * sola vez, la primera vez que se abre un filtro; no dibuja nada ni marca eventos como vistos.
   */
  async explorar() {
    this.catalogo ??= Promise.all(CAPAS.map(async (c) => {
      try { return [c.id, preparar(c, await this.#datos(c), this.ctx)]; } catch (e) { return null; }
    })).then((r) => new Map(r.filter(Boolean)));
    const cat = await this.catalogo;
    const out = [];
    for (const [id, gj] of cat) if (!this.activas.has(id)) out.push(...this.#puntos(id, gj).map((a) => ({ ...a, apagada: true })));
    return out;
  }

  /** Abre la ficha de una amenaza de la lista. */
  abrir(a) {
    const capa = CAPAS.find((c) => c.id === a.capa);
    const f = this.activas.get(a.capa)?.features[a.i];
    if (capa && f) this.onObjeto(capa, f.properties, f.geometry);
  }

  /** Filtro global (país ISO3, tipo, severidad mínima) aplicado en la GPU a todas las capas de riesgo. */
  setFiltro(filtro) {
    this.filtro = { ...this.filtro, ...filtro };
    for (const id of this.activas.keys()) for (const l of this.#capasDe(id)) if (this.map.getLayer(l)) this.map.setFilter(l, this.#filtroDe(l));
  }

  #filtroBase() {
    const f = ["all", [">=", ["coalesce", ["get", "_sev"], 1], this.filtro.sevMin]];
    if (this.filtro.pais) f.push(["==", ["get", "_pais"], this.filtro.pais]);
    if (this.filtro.tipo) f.push(["==", ["get", "_tipo"], this.filtro.tipo]);
    return f;
  }

  #filtroDe(capaId) {
    const base = this.#filtroBase();
    const oc = this.ocultos.get(capaId.replace(/^rg-/, "").replace(/-[a-z]+$/, ""));
    if (oc) base.push(["!", ["in", ["get", "_k"], ["literal", oc]]]);
    if (capaId.endsWith("-texto")) return [...base, ["==", ["geometry-type"], "Point"], ["!=", ["coalesce", ["get", "_lbl"], ""], ""]];
    if (capaId.endsWith("-area")) return [...base, ["==", ["geometry-type"], "Polygon"]];
    if (capaId.endsWith("-linea")) return [...base, ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]]];
    if (capaId.endsWith("-icono")) return [...base, ["==", ["geometry-type"], "Point"], ["!=", ["get", "_ic"], ""]];
    if (capaId.endsWith("-punto")) return [...base, ["==", ["geometry-type"], "Point"], ["==", ["get", "_ic"], ""]];
    // pulso: solo lo que apareció hace menos de 1 min
    const ahora = Date.now();
    const vivas = [...this.nuevas].filter(([, t]) => ahora - t < PARPADEO_MS).map(([k]) => k);
    return [...base, ["==", ["geometry-type"], "Point"], ["in", ["get", "_k"], ["literal", vivas]]];
  }

  #asegurarIconos(gj) {
    for (const f of gj.features) {
      const ic = f.properties._ic;
      if (ic && !this.map.hasImage(ic)) this.map.addImage(ic, imagenEmoji(ic.slice(6)), { pixelRatio: 2 });
    }
  }

  #instalar(capa) {
    const src = `rg-${capa.id}`, m = this.map;
    if (m.getSource(src)) return;
    const gj = this.activas.get(capa.id);
    m.addSource(src, { type: "geojson", data: gj, attribution: capa.url || capa.generar ? capa.fuente : "Clima Táctico" });
    this.#asegurarIconos(gj);
    const antes = m.getLayer("clusters") ? "clusters" : undefined;
    m.addLayer({ id: `${src}-area`, type: "fill", source: src, filter: this.#filtroDe(`${src}-area`), paint: { "fill-color": ["get", "_c"], "fill-opacity": 0.15 } }, antes);
    m.addLayer({ id: `${src}-linea`, type: "line", source: src, filter: this.#filtroDe(`${src}-linea`),
      paint: { "line-color": ["get", "_c"], "line-width": 2, "line-opacity": 0.85, "line-dasharray": capa.id === "auroras" || capa.id === "sismos" ? [3, 2] : [1, 0] } }, antes);
    m.addLayer({ id: `${src}-pulso`, type: "circle", source: src, filter: this.#filtroDe(`${src}-pulso`),
      paint: { "circle-color": "#ffffff", "circle-opacity": 0, "circle-radius": 10, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-stroke-opacity": 0.9 } }, antes);
    m.addLayer({ id: `${src}-punto`, type: "circle", source: src, filter: this.#filtroDe(`${src}-punto`),
      paint: { "circle-color": ["get", "_c"], "circle-radius": ["get", "_r"], "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 } }, antes);
    // Íconos: una imagen por emoji en la GPU (no un elemento HTML por objeto), así escalan a miles.
    m.addLayer({ id: `${src}-icono`, type: "symbol", source: src, filter: this.#filtroDe(`${src}-icono`),
      layout: { "icon-image": ["get", "_ic"], "icon-size": ["interpolate", ["linear"], ["get", "_sev"], 1, 0.55, 5, 0.95], "icon-allow-overlap": true,
        "icon-ignore-placement": true, "symbol-sort-key": ["-", 0, ["get", "_sev"]] } }, antes);
    // Etiquetas cortas (magnitud del sismo, categoría del ciclón, alerta del volcán).
    m.addLayer({ id: `${src}-texto`, type: "symbol", source: src, filter: this.#filtroDe(`${src}-texto`),
      layout: { "text-field": ["get", "_lbl"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true },
      paint: pinturaEtiqueta() }, antes);
    for (const l of [`${src}-punto`, `${src}-icono`, `${src}-linea`]) {
      m.on("click", l, (e) => { const f = e.features[0]; this.onObjeto(capa, this.#original(capa.id, f.properties._i) || f.properties, f.geometry); });
      m.on("mouseenter", l, () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", l, () => { m.getCanvas().style.cursor = ""; });
    }
  }

  /** Halo blanco que late durante 1 min alrededor de cada objeto nuevo (como en Clima Táctico). */
  #arrancarPulso() {
    if (this.pulso) return;
    const t0 = performance.now();
    const paso = (t) => {
      const ahora = Date.now();
      const quedan = [...this.nuevas.values()].some((x) => ahora - x < PARPADEO_MS);
      const fase = ((t - t0) % 1200) / 1200;
      for (const id of this.activas.keys()) {
        const l = `rg-${id}-pulso`;
        if (!this.map.getLayer(l)) continue;
        this.map.setPaintProperty(l, "circle-radius", 8 + fase * 22);
        this.map.setPaintProperty(l, "circle-stroke-opacity", 0.9 * (1 - fase));
      }
      if (quedan) { this.pulso = requestAnimationFrame(paso); return; }
      this.pulso = null;
      for (const id of this.activas.keys()) { const l = `rg-${id}-pulso`; if (this.map.getLayer(l)) this.map.setFilter(l, this.#filtroDe(l)); }
    };
    // Se recalcula el filtro del pulso cada 5 s (para quitar los que ya cumplieron su minuto).
    const refiltrar = setInterval(() => {
      if (!this.pulso) { clearInterval(refiltrar); return; }
      for (const id of this.activas.keys()) { const l = `rg-${id}-pulso`; if (this.map.getLayer(l)) this.map.setFilter(l, this.#filtroDe(l)); }
    }, 5000);
    this.pulso = requestAnimationFrame(paso);
  }

  // MapLibre convierte arreglos y objetos de las propiedades en texto: se usa el objeto original.
  #original(id, i) { return this.activas.get(id)?.features[i]?.properties; }
}
