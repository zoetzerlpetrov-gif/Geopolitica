// Riesgos naturales y clima: capas del proyecto «Clima Táctico» (repositorio WarRoomViajero) dentro de
// este mapa, sin copiar sus datos. WarRoomViajero los regenera 2 veces al día con GitHub Actions y los
// publica en su GitHub Pages (mismo dominio que este sitio); aquí solo se leen al activar cada capa.
// Los sismos se piden en vivo a USGS desde el navegador (CORS abierto), como en el mapa original.
//
// Fuentes originales: USGS, NOAA NHC, NASA FIRMS, GDACS, Open-Meteo, CENAPRED/Smithsonian, noticias
// (GDELT y Google News) y NOAA SWPC. Las capas de noticias son SEÑALES por verificar, no incidentes
// confirmados, y siempre enlazan a la fuente.
import { getJSON, esc, safeUrl, pinturaEtiqueta } from "./util.js";
import { ESCALAS_NOAA, COLOR_ESCALA, NO_AFECTA, gDeKp, clasificar, claveDe, paisEn, paisDeLugar, enjambres, radiosTsunami, lineasAurora, registrarVistos, feedAPuntos, PARPADEO_MS, NUEVO_MS, SEVERIDADES,
  ESCALA_SISMO, estiloSismo, categoriaCiclon, sevAlertaVolcan, normalizar, BANDAS_AQI } from "./amenazas.js";

export const BASES = [
  "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/data/",
  "https://raw.githubusercontent.com/zoetzerlpetrov-gif/WarRoomViajero/main/data/",
];
/** Orden e ícono de los subgrupos del panel. */
export const GRUPOS = [["Desastres naturales", "🌋", "#C0392B"], ["Clima y ambiente", "🌦️", "#2471A3"], ["Seguridad y ataques", "🛡️", "#6C3483"],
  ["Red y ciberseguridad", "🌐", "#1F6F8B"]];

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
    locales: ["data/vivos/ciclones_mundo.geojson", "data/vivos/nhc_conos.geojson"], fuente: "NOAA NHC, GDACS e IBTrACS",
    // storms: posición actual. storm_tracks: trayectoria pasada (gris), pronóstico (ámbar) y radios de viento
    // de 34, 50 y 64 nudos (polígonos, más rojos cuanto más fuerte el viento).
    estilo: (p) => {
      if (p.kind === "cono") return { c: "#E0A100", r: 0 };
      if (p.kind === "aviso_costa") return { c: { 4: "#C62828", 3: "#E2711D", 2: "#F2C230" }[p.aviso_nivel] || "#E0A100", r: 0 };
      if (p.layer === "storm") { const k = categoriaCiclon(p.intensity_kt || p.wind_kt); return { c: !k ? C.rojo : k.n >= 3 ? "#6A1B9A" : k.n >= 1 ? C.rojo : C.naranja, r: 8 + Math.round((k?.n || 0) * 2.4) }; }
      if (String(p.kind).startsWith("past")) return { c: C.gris, r: 2.5 };
      if (String(p.kind).startsWith("wind_radii")) return { c: p.wind_kt >= 64 ? C.rojo : p.wind_kt >= 50 ? C.naranja : C.ambar, r: 0 };
      return { c: C.ambar, r: 4 };
    },
    etiqueta: (p) => { if (p.layer !== "storm") return ""; const k = categoriaCiclon(p.intensity_kt || p.wind_kt); return `${p.name || p.storm_name || ""}${k ? ` · ${k.texto}` : ""}`; },
    leyenda: [{ c: "#6A1B9A", r: 10, t: "Categoría 3 a 5 (huracán o tifón mayor)" }, { c: C.rojo, r: 8, t: "Categoría 1 o 2" }, { c: C.naranja, r: 6, t: "Tormenta o depresión tropical" },
      { c: C.gris, r: 3, t: "Trayectoria recorrida" }, { c: C.ambar, r: 4, t: "Pronóstico y radios de viento" },
      { c: "#E0A100", r: 6, t: "Cono del NHC: por dónde podría pasar el CENTRO en 5 días (no es el tamaño del huracán)" },
      { c: "#C62828", r: 3, t: "Costa con aviso de huracán · naranja: vigilancia de huracán o aviso de tormenta · amarillo: vigilancia de tormenta" },
      { t: "La severidad 1–5 del panel se calcula con la categoría: cat. 4–5 = 5, cat. 2–3 = 4, cat. 1 = 3, tormenta = 2." }],
    ficha: (p) => {
      if (p.kind === "cono") return { titulo: `Cono de pronóstico · ${p.name}`, chip: p.clase || "ciclón", filas: [["Qué es", "Zona por donde podría pasar el centro del ciclón en los próximos 5 días. Se traza con los errores del NHC de los últimos 5 años: el centro queda dentro unas 2 de cada 3 veces"],
        ["Qué no es", "El tamaño del ciclón: viento, lluvia y marea de tormenta pueden afectar muy lejos del cono"], ["Aviso núm.", p.aviso_num || "—"], ["Actualizado", p.last_update ? fecha(p.last_update) : "—"]], url: p.url, fuente: "NOAA National Hurricane Center" };
      if (p.kind === "aviso_costa") return { titulo: `${p.aviso} · ${p.name}`, chip: p.aviso, filas: [["Aviso", "Se esperan esas condiciones en la costa marcada, en general en 36 h"], ["Vigilancia", "Esas condiciones son posibles, en general en 48 h"],
        ["Actualizado", p.last_update ? fecha(p.last_update) : "—"]], url: p.url, fuente: "NOAA National Hurricane Center" };
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
    extra: (p) => graficaPronostico(lista(p.days)),
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
    id: "tsunamis", grupo: "Desastres naturales", nombre: "Tsunamis: boletines oficiales, zona de amenaza, frentes de onda y llegadas (NOAA)",
    url: "data/vivos/tsunamis.geojson", refresco_s: 300, fuente: "NOAA tsunami.gov (PTWC y NTWC)",
    estilo: (p) => ({ epicentro: { c: ["#9aa5ad", "#2E6F8E", "#C27C1E", "#E07B00", "#C62828", "#7B1E1E"][p.nivel ?? 1], r: 11 },
      zona: { c: ["#B71C1C", "#C62828", "#D84315", "#EF6C00", "#F9A825", "#FBC02D"][Math.max(0, (p.banda || 1) - 1)], r: 0 }, frente: { c: p.pasado ? "#9cc3dc" : "#1f6fb2", r: 0 }, llegada: { c: "#E07B00", r: 5 },
      observacion: { c: p.amplitud_m >= 1 ? "#7B1E1E" : p.amplitud_m >= 0.3 ? "#C62828" : "#E07B00", r: 6 } }[p.k] || { c: C.cian, r: 5 }),
    etiqueta: (p) => (p.k === "epicentro" ? `${p.categoria} · M${p.magnitud ?? "?"}` : p.k === "llegada" ? p.hora_utc?.slice(-5) || "" : p.k === "observacion" ? `${p.amplitud_m} m` : ""),
    leyenda: [{ ic: "🌊", t: "Epicentro con boletín oficial (color según la categoría: información, vigilancia, aviso, amenaza, alerta)" },
      { c: "#C62828", r: 6, t: "Alcance probable (solo mar), más intenso cerca del epicentro: zona del boletín o, si no la da, estimada por magnitud" }, { c: "#1f6fb2", r: 3, t: "Frente de onda estimado cada hora (claro: ya pasó)" },
      { c: "#E07B00", r: 5, t: "Llegada estimada (hora UTC) · ola medida en mareógrafo (metros)" }],
    ficha: (p) => fichaTsunami(p),
    // Mapa oficial de tiempos de viaje (imagen de la NOAA): considera la batimetría, a diferencia de los círculos.
    extra: (p) => (p.k === "epicentro" && p.mapa_tiempos ? `<h4>Tiempos de viaje calculados por la NOAA</h4>
      <a href="${esc(safeUrl(p.mapa_tiempos))}" target="_blank" rel="noopener noreferrer"><img class="mapa-tsunami" src="${esc(safeUrl(p.mapa_tiempos))}" alt="Mapa de tiempos de viaje del tsunami (NOAA)" loading="lazy"></a>
      <p class="meta">Cada contorno es una hora de viaje de la onda. Las horas oficiales de llegada a cada costa están en el boletín.</p>` : ""),
  },
  {
    id: "severo", grupo: "Clima y ambiente", nombre: "Tornados, trombas marinas, granizo y tormentas (noticias del mundo, verificar)", archivos: ["severe_weather_map.geojson"],
    locales: ["data/vivos/tornados.geojson"], fuente: "GDELT GKG (mundo) y Google News / GDELT (México)",
    estilo: (p) => (/TORNADO|TROMBA/i.test(p.kind || "") ? { c: p.severe ? "#7B1E1E" : "#6A1B9A", r: p.severe ? 7 : 6 } : { c: p.severe ? C.rojo : C.cian, r: 5 }), senal: true,
    etiqueta: (p) => (/TORNADO|TROMBA/i.test(p.kind || "") ? (p.kind === "TORNADO" ? "Tornado" : "Tromba marina") : ""),
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind || ""}${p.severe ? " · con daños o víctimas en el título" : ""} · señal de noticias, verifica`,
      filas: [["Lugar", `${p.state || "—"}${p.precision && p.precision !== "ciudad" ? ` (ubicación aproximada: ${p.precision})` : ""}`], ["Medio", p.source || "—"],
        ["Fecha", p.date ? fecha(p.date) : "—"], ...(p.notas > 1 ? [["Notas", `${p.notas} notas desde ${fecha(p.desde)}`], ["Otros medios", otrosMedios(p.enlaces, p.url)]] : []),
        ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticias" }),
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
    id: "cortes_internet", grupo: "Red y ciberseguridad", nombre: "Cortes de internet por país (48 h, IODA)", url: "data/vivos/red_cortes.geojson", refresco_s: 1200,
    fuente: "IODA (Georgia Tech)",
    estilo: (p) => (p.en_curso ? { c: p.n_senales >= 2 ? "#B71C1C" : "#E2711D", r: p.n_senales >= 2 ? 11 : 9 } : { c: "#8D99A6", r: 7 }),
    etiqueta: (p) => (p.en_curso ? `Corte · ${p.pais}` : ""),
    leyenda: [{ c: "#B71C1C", r: 8, t: "Corte en curso visto por 2 o más señales" }, { c: "#E2711D", r: 7, t: "Corte en curso visto por 1 señal" },
      { c: "#8D99A6", r: 6, t: "Corte terminado en las últimas 48 h" },
      { t: "Señales de IODA: rutas BGP anunciadas, respuesta a sondeos (ping) y tráfico hacia Google. Una sola señal puede ser una falla técnica local; varias a la vez suelen indicar un corte amplio o un apagón ordenado." }],
    ficha: (p) => ({ titulo: `Corte de internet en ${p.pais}`, chip: p.en_curso ? `En curso · ${lista(p.senales).length} señal(es)` : "Terminado",
      filas: [["Señales que lo detectan", lista(p.senales).join(" · ") || "—"], ["Inicio", fecha(p.inicio_utc)], ["Fin", p.fin_utc ? fecha(p.fin_utc) : "sigue en curso"],
        ["Duración", `${p.horas} h`], ["Eventos", lista(p.eventos).map((e) => `${e.senal}: ${fecha(e.inicio_utc)}, ${e.horas} h`).join(" · ") || "—"],
        ["Qué no dice", "La causa (apagón eléctrico, cable cortado, desastre o bloqueo ordenado). Confírmala en el tablero de IODA y en noticias"]],
      url: p.url, fuente: "IODA, Georgia Tech (abre su tablero del país)" }),
  },
  {
    id: "c2_botnets", grupo: "Red y ciberseguridad", nombre: "Servidores de control de botnets por país (48 h, abuse.ch)", url: "data/vivos/red_c2.geojson", refresco_s: 3600,
    fuente: "abuse.ch ThreatFox y Feodo Tracker; país por DB-IP",
    estilo: (p) => ({ c: "#6A1B9A", r: Math.min(24, 4 + Math.sqrt(p.n || 1) * 1.6) }),
    etiqueta: (p) => (p.n >= 25 ? `${p.n} C2` : ""),
    leyenda: [{ c: "#6A1B9A", r: 9, t: "Servidores de mando y control (C2) activos reportados; el tamaño crece con la cantidad" },
      { t: "Un C2 alojado en un país casi nunca indica dónde está el atacante: suele ser un servidor rentado. No se publica ninguna dirección IP." }],
    ficha: (p) => ({ titulo: `${p.n} servidores C2 de botnets en ${p.pais}`, chip: `${p.n_familias} familia(s) de malware`,
      filas: [["Familias más vistas", lista(p.familias).map(([f, n]) => `${/^unknown/i.test(f) ? "Sin identificar" : f} (${n})`).join(" · ") || "—"],
        ["Ventana", "IOC reportados a ThreatFox en las últimas 48 h + lista recomendada de Feodo Tracker"],
        ["País de cada IP", "Base IP to Country Lite de DB-IP (CC BY 4.0). Puede fallar con redes anycast o VPN"],
        ["Para qué sirve", "Ver qué países y proveedores alojan más infraestructura criminal. Para bloquear, usa las listas originales de abuse.ch"]],
      url: "https://threatfox.abuse.ch/browse/", fuente: "abuse.ch (CC0) · IP Geolocation by DB-IP" }),
  },
  {
    id: "avisos_ics", grupo: "Red y ciberseguridad", nombre: "Avisos de sistemas industriales (ICS/SCADA) por país del fabricante (90 días, CISA)", url: "data/vivos/red_ics.geojson",
    refresco_s: 3600, fuente: "CISA ICS Advisories (CSAF)",
    estilo: (p) => ({ c: p.explotados ? "#B71C1C" : p.criticos ? "#E2711D" : "#1F6F8B", r: Math.min(22, 5 + Math.sqrt(p.n || 1) * 2) }),
    etiqueta: (p) => (p.n >= 5 ? `${p.n} avisos` : ""),
    leyenda: [{ c: "#B71C1C", r: 8, t: "Algún aviso con explotación conocida" }, { c: "#E2711D", r: 7, t: "Algún aviso con CVSS 9 o más (crítico)" }, { c: "#1F6F8B", r: 6, t: "Avisos sin críticos" },
      { t: "El punto va en el país SEDE del fabricante del equipo, no donde está instalado: casi todos se venden en todo el mundo. No se mapean equipos expuestos." }],
    ficha: (p) => ({ titulo: `${p.n} avisos ICS de fabricantes con sede en ${p.pais}`, chip: `CVSS máximo ${p.cvss_max ?? "—"}${p.explotados ? ` · ${p.explotados} con explotación conocida` : ""}`,
      filas: [["Críticos (CVSS ≥ 9)", String(p.criticos)], ["Equipo médico", String(p.medicos || 0)],
        ["Fabricantes", lista(p.fabricantes).map(([f, n]) => `${f} (${n})`).join(" · ") || "—"],
        ["Sectores", lista(p.sectores).map(([s, n]) => `${SECTOR_CISA[s] || s} (${n})`).join(" · ") || "—"]],
      url: "https://www.cisa.gov/news-events/cybersecurity-advisories?f%5B0%5D=advisory_type%3A95", fuente: "CISA (dominio público, EUA)" }),
    extra: (p) => `<h4>Avisos más recientes</h4><ul class="fuentes">${lista(p.avisos).map((a) => `<li><a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.id)}</a> · ${esc(a.titulo)} · ${esc(a.fecha)}${a.cvss != null ? ` · CVSS ${esc(a.cvss)}` : ""}${a.explotado ? " · <b>explotación conocida</b>" : ""}</li>`).join("")}</ul>
      <p class="meta">CVSS mide la gravedad técnica de 0 a 10. Un aviso no significa un ataque: es una vulnerabilidad publicada con su parche o mitigación.</p>`,
  },
  {
    id: "avisos_europa", grupo: "Clima y ambiente", nombre: "Avisos meteorológicos oficiales de Europa (MeteoAlarm)", url: "data/vivos/meteoalarm.geojson", refresco_s: 1200,
    fuente: "MeteoAlarm (EUMETNET) y servicios meteorológicos nacionales",
    estilo: (p) => ({ c: { 2: "#F2C230", 3: "#E2711D", 4: "#C62828" }[p.nivel] || "#F2C230", r: p.k === "region" ? 4 : 0 }),
    etiqueta: (p) => (p.k === "region" && p.nivel >= 4 ? `${p.region}` : ""),
    leyenda: [{ c: "#C62828", r: 6, t: "Rojo: peligro extraordinario, actúa según las autoridades" }, { c: "#E2711D", r: 6, t: "Naranja: peligroso, mantente al tanto y prepárate" },
      { c: "#F2C230", r: 6, t: "Amarillo: potencialmente peligroso en actividades expuestas" },
      { t: "Relleno intenso: aviso ya vigente; tenue: empieza en las próximas 48 h. 38 países de Europa e Israel." }],
    ficha: (p) => ({ titulo: `${p.region} (${p.pais_iso2})`, chip: `${["", "", "Amarilla", "Naranja", "Roja"][p.nivel]} · ${lista(p.tipos).join(", ")}`,
      filas: [...lista(p.avisos).map((a) => [`${["", "", "Amarillo", "Naranja", "Rojo"][a.nivel]} · ${a.tipo}`, `${a.desde ? fecha(a.desde) : "—"} a ${a.hasta ? fecha(a.hasta) : "—"}`]),
        ["Estado", p.en_curso ? "Vigente" : "Empieza más tarde"]],
      url: p.url, fuente: "MeteoAlarm (EUMETNET): consulta el texto oficial del servicio nacional" }),
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
      filas: [["Latitud mínima aprox.", `${p.lat_min}° ${p.hemisferio === "norte" ? "N" : "S"}`], ["Fórmula", "67° − 2.5 × Kp (aproximación)"],
        ["Tormenta equivalente", `G${gDeKp(p.kp)} · ${ESCALAS_NOAA.G.niveles[gDeKp(p.kp)].n}`]],
      url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast", fuente: "NOAA SWPC" }),
    // Qué puede afectar una tormenta de ese tamaño (escala G de NOAA).
    extra: (p) => { const g = gDeKp(p.kp); return `<div class="efectos" style="--c:${COLOR_ESCALA[g]}"><b>Con Kp ${esc(p.kp)} (G${g}) puede afectar:</b><ul>${ESCALAS_NOAA.G.niveles[g].ef.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="meta">${esc(NO_AFECTA)}</p></div>`; },
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

// Colores de los niveles de alerta por su nombre («Morada (extraordinario)», «Amarilla (vigilancia)», «Amarillo Fase 2»…).
const COLOR_NOMBRE = [[/morad|violet|p[uú]rpura/i, "#7B3FB8"], [/\broj[oa]|\bred\b/i, "#C62828"], [/naranja|orange/i, "#E2711D"],
  [/amarill|yellow/i, "#F2C230"], [/\bverde|green/i, "#2E9E6E"]];
export function colorDeNivel(texto) {
  const m = COLOR_NOMBRE.find(([rx]) => rx.test(texto || ""));
  return m ? m[1] : null;
}
/** Negro o blanco, el que tenga más contraste con el fondo (luminancia relativa de la WCAG 2.1). */
export function textoSobre(hex) {
  const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#111111" : "#ffffff";
}

export function htmlRiesgo(capa, props, geom) {
  const f = capa.ficha(props, geom);
  const colorChip = f.chip ? colorDeNivel(f.chip) : null;
  const sev = props._sev ? SEVERIDADES.find(([n]) => n === props._sev) : null;
  return `<h3 id="ficha-titulo">${esc(f.titulo || capa.nombre)}</h3>
    <div class="fecha">${esc(props._tipo || capa.nombre)}</div>
    <div class="chips">${props._nuevo ? `<span class="chip nuevo">NUEVO</span>` : ""}${sev ? `<span class="chip sev-${sev[0]}">Severidad ${sev[0]}/5 · ${esc(sev[1])}</span>` : ""}
      ${f.chip ? `<span class="chip ${capa.senal ? "alerta" : ""}"${colorChip ? ` style="background:${colorChip};color:${textoSobre(colorChip)};border-color:${colorChip}"` : ""}>${esc(f.chip)}</span>` : ""}</div>
    <dl>${f.filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
      <dt>Fuente</dt><dd>${f.url ? `<a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a>` : esc(f.fuente)}</dd></dl>
    ${capa.extra ? capa.extra(props, geom) : ""}
    ${capa.senal ? `<p class="meta">Señal detectada en cobertura noticiosa y ubicada de forma aproximada: no es un incidente confirmado. Verifica en la fuente y con autoridades locales.</p>` : ""}
    <p class="meta">${capa.archivos ? `Capa integrada desde <a href="${ORIGEN.url}" target="_blank" rel="noopener noreferrer">${esc(ORIGEN.nombre)}</a>. ` : ""}No sustituye a Protección Civil ni a los avisos oficiales.</p>`;
}

/** De los objetos bajo el clic, el más cercano al punto exacto. */
function masCercano(m, e) {
  let mejor = e.features[0], d0 = Infinity;
  for (const f of e.features) {
    const q = m.project(f.geometry.coordinates), d = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2;
    if (d < d0) { d0 = d; mejor = f; }
  }
  return mejor;
}

const SECTOR_CISA = { Chemical: "Químico", "Commercial Facilities": "Instalaciones comerciales", Communications: "Comunicaciones", "Critical Manufacturing": "Manufactura crítica",
  Dams: "Presas", "Defense Industrial Base": "Industria de defensa", "Emergency Services": "Servicios de emergencia", Energy: "Energía", "Financial Services": "Servicios financieros",
  "Food and Agriculture": "Alimentos y agricultura", "Government Facilities": "Instalaciones de gobierno", "Government Services and Facilities": "Instalaciones de gobierno",
  "Healthcare and Public Health": "Salud", "Information Technology": "Tecnologías de la información", "Nuclear Reactors, Materials, and Waste": "Nuclear",
  "Transportation Systems": "Transporte", "Water and Wastewater Systems": "Agua y saneamiento" };

const lista = (v) => { if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return []; } } return v || []; };

const ICONO_WMO = (c) => (c >= 95 ? "⛈️" : c >= 80 ? "🌦️" : c >= 71 ? "🌨️" : c >= 61 ? "🌧️" : c >= 51 ? "🌦️" : c >= 45 ? "🌫️" : c >= 2 ? "⛅" : c === 1 ? "🌤️" : "☀️");
const DIA = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${d.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" }).replace(".", "")} ${iso.slice(8, 10)}`; };

/**
 * Gráfica de 7 días (como en Clima Táctico / WarRoomViajero, ampliada): por día, una barra flotante de la
 * temperatura mínima a la máxima (escala común de la semana), una barra de lluvia en mm y la probabilidad de
 * lluvia. HTML y CSS, sin bibliotecas: los números van escritos para no depender del color.
 */
export function graficaPronostico(dias) {
  if (!dias?.length) return "";
  const tmin = Math.min(...dias.map((d) => d.tmin)), tmax = Math.max(...dias.map((d) => d.tmax));
  const rango = Math.max(1, tmax - tmin), maxLluvia = Math.max(1, ...dias.map((d) => d.rain || 0));
  const ALTO_T = 64, ALTO_L = 44;
  const col = (d) => {
    const base = ((d.tmin - tmin) / rango) * ALTO_T, alto = Math.max(4, ((d.tmax - d.tmin) / rango) * ALTO_T);
    const lluvia = Math.max(d.rain > 0 ? 3 : 1, ((d.rain || 0) / maxLluvia) * ALTO_L);
    return `<div class="pr-dia" title="${esc(d.date)}: máx ${d.tmax} °C, mín ${d.tmin} °C, lluvia ${d.rain ?? 0} mm, probabilidad ${d.pop ?? "—"} %, ráfagas ${d.gust ?? "—"} km/h">
      <div class="pr-ic">${ICONO_WMO(d.code ?? 0)}</div>
      <div class="pr-tmax">${Math.round(d.tmax)}°</div>
      <div class="pr-t" style="height:${ALTO_T}px"><span style="bottom:${base}px;height:${alto}px"></span></div>
      <div class="pr-tmin">${Math.round(d.tmin)}°</div>
      <div class="pr-l" style="height:${ALTO_L}px"><span style="height:${lluvia}px;opacity:${(0.35 + 0.65 * (d.pop ?? 100) / 100).toFixed(2)}"></span></div>
      <div class="pr-mm">${(d.rain ?? 0) >= 10 ? Math.round(d.rain) : (d.rain ?? 0).toFixed(1)} mm</div>
      <div class="pr-pop">${d.pop ?? "—"}%</div>
      <div class="pr-d">${esc(DIA(d.date))}</div></div>`;
  };
  return `<h4>Pronóstico de 7 días</h4><div class="pronostico-7">${dias.map(col).join("")}</div>
    <p class="meta pr-ley"><span class="pr-ley-t"></span> temperatura mínima a máxima (°C) · <span class="pr-ley-l"></span> lluvia del día (mm) · % probabilidad de lluvia (barra más intensa = más probable)</p>`;
}

/** Ficha de un objeto de la capa de tsunamis (epicentro, zona, frente, llegada u observación). */
function fichaTsunami(p) {
  const oficial = { url: "https://www.tsunami.gov/", fuente: "NOAA tsunami.gov: consulta siempre el boletín oficial y a tu protección civil" };
  if (p.k === "frente") return { ...oficial, titulo: p.titulo, chip: "estimación", filas: [["Evento", p.region], ["Supuesto", "≈ 700 km/h en mar abierto (√(g·h) con 4 km de profundidad). La batimetría real deforma el frente y la tierra lo bloquea; la hora oficial es la del boletín"], ["Estado", p.pasado ? "Ya debió pasar" : "Aún no llega a esta distancia"]] };
  if (p.k === "zona") return { ...oficial, titulo: p.titulo, chip: p.categoria, filas: [["Evento", p.region],
    ["Cómo se calcula", "Zona de amenaza del boletín; si no la trae, umbrales del PTWC por magnitud: M6.5–7.0 ≈ 100 km, M7.1–7.5 ≈ 300 km, M7.6–7.8 ≈ 1,000 km, M7.9+ toda la cuenca. El color se desvanece con la distancia y la tierra firme se recorta"]] };
  if (p.k === "llegada") return { ...oficial, titulo: p.titulo, chip: "hora estimada por la NOAA", filas: [["Hora (UTC, mes/día)", p.hora_utc], ["Evento", p.region]] };
  if (p.k === "observacion") return { ...oficial, titulo: p.titulo, chip: "medido en mareógrafo", filas: [["Hora (UTC)", p.hora_utc], ["Amplitud", `${p.amplitud_m} m sobre el nivel de marea`], ["Evento", p.region]] };
  const bols = lista(p.boletines), alturas = lista(p.alturas);
  return {
    titulo: p.titulo, chip: `${p.categoria}${p.horas_desde != null ? ` · hace ${p.horas_desde} h` : ""}`,
    filas: [["Magnitud preliminar", p.magnitud != null ? `M${p.magnitud}` : "—"], ["Profundidad", p.profundidad_km ? `${p.profundidad_km} km` : "—"],
      ["Hora del sismo", p.origen_utc ? fecha(p.origen_utc) : "—"],
      ...(p.radio_km ? [["Zona de amenaza", `Costas a menos de ${p.radio_km} km del epicentro`]] : []),
      ...(p.alcance_km && !p.radio_km ? [["Alcance probable", `≈ ${Number(p.alcance_km).toLocaleString("es-MX")} km (estimado por la magnitud; el boletín no da zona)`]] : []),
      ...alturas.map((a) => [`Olas de ${a.altura.replace("meters", "m").replace(" to ", " a ")}`, a.costas]),
      ...(p.primer_impacto ? [["Primer impacto posible", p.primer_impacto]] : []),
      ...(p.nota ? [["Evaluación", p.nota]] : []),
      ["Boletines", bols.map((b) => `${b.centro}: ${b.categoria} (${fecha(b.actualizado)})`).join(" · ") || "—"]],
    url: bols[0]?.boletin || "https://www.tsunami.gov/", fuente: "Boletín oficial (NOAA)",
  };
}

/** «medio1, medio2…» a partir de los enlaces agrupados (MapLibre entrega los arreglos como texto JSON). */
function otrosMedios(enlaces, principal) {
  let l = enlaces || [];
  if (typeof l === "string") { try { l = JSON.parse(l); } catch (e) { l = []; } }
  return [...new Set(l.filter((x) => x.url !== principal).map((x) => x.source))].slice(0, 7).join(", ") || "—";
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

  #capasDe(id) { return ["area", "linea", "punto", "icono", "pulso", "texto", "toque"].map((s) => `rg-${id}-${s}`); }

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
    if (capaId.endsWith("-toque")) return [...base, ["==", ["geometry-type"], "Point"]];
    if (capaId.endsWith("-texto")) return [...base, ["==", ["geometry-type"], "Point"], ["!=", ["coalesce", ["get", "_lbl"], ""], ""]];
    if (capaId.endsWith("-area")) return [...base, ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]];
    // Los polígonos con «opacidad» (bandas de un degradado) van sin borde: el contorno de cada banda ensuciaría el degradado.
    if (capaId.endsWith("-linea")) return [...base, ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
      ["!", ["all", ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], ["has", "opacidad"]]]];
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
    m.addLayer({ id: `${src}-area`, type: "fill", source: src, filter: this.#filtroDe(`${src}-area`), paint: { "fill-color": ["get", "_c"], "fill-opacity": ["coalesce", ["get", "opacidad"], 0.15] } }, antes);
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
    // Zona de toque invisible (10 px) para elegir puntos pequeños (focos de incendio, ciudades) con facilidad.
    m.addLayer({ id: `${src}-toque`, type: "circle", source: src, filter: this.#filtroDe(`${src}-toque`), paint: { "circle-radius": 10, "circle-opacity": 0, "circle-stroke-width": 0 } }, antes);
    for (const l of [`${src}-toque`, `${src}-linea`]) {
      m.on("click", l, (e) => {
        if (l.endsWith("-linea") && m.queryRenderedFeatures(e.point, { layers: [`${src}-toque`] }).length) return;  // el punto gana a la línea
        const f = l.endsWith("-toque") ? masCercano(m, e) : e.features[0];
        this.onObjeto(capa, this.#original(capa.id, f.properties._i) || f.properties, f.geometry);
      });
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
