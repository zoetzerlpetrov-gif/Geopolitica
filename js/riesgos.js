// Riesgos naturales y clima: capas del proyecto «Clima Táctico» (repositorio WarRoomViajero) dentro de
// este mapa, sin copiar sus datos. WarRoomViajero los regenera 2 veces al día con GitHub Actions y los
// publica en su GitHub Pages (mismo dominio que este sitio); aquí solo se leen al activar cada capa.
// Los sismos se piden en vivo a USGS desde el navegador (CORS abierto), como en el mapa original.
//
// Fuentes originales: USGS, NOAA NHC, NASA FIRMS, GDACS, Open-Meteo, CENAPRED/Smithsonian, noticias
// (GDELT y Google News) y NOAA SWPC. Las capas de noticias son SEÑALES por verificar, no incidentes
// confirmados, y siempre enlazan a la fuente.
import { getJSON, esc, safeUrl } from "./util.js";

export const BASES = [
  "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/data/",
  "https://raw.githubusercontent.com/zoetzerlpetrov-gif/WarRoomViajero/main/data/",
];
export const ORIGEN = { nombre: "Clima Táctico (WarRoomViajero)", url: "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/" };

const C = { verde: "#2E9E6E", ambar: "#E0A100", naranja: "#E2711D", rojo: "#D23B3B", violeta: "#8E4FD1", cian: "#1F8A8A", gris: "#6f8a82" };
const NIVEL = [C.verde, C.ambar, C.naranja, C.rojo, C.violeta];
const fecha = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? String(t || "") : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };

/**
 * Capas. `archivos` se buscan en BASES; `url` es una fuente en vivo. `estilo(props, geom)` devuelve
 * {c: color, r: radio}; `ficha(props)` devuelve {titulo, chip, filas:[[etiqueta, valor]], url, fuente}.
 */
export const CAPAS = [
  {
    id: "sismos", nombre: "Sismos M2.5+ (24 h, en vivo)", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    refresco_s: 300, fuente: "USGS",
    estilo: (p) => ({ c: p.mag >= 6 ? C.rojo : p.mag >= 4.5 ? C.naranja : C.ambar, r: Math.max(3, Math.min(18, (p.mag || 0) * 2.4)) }),
    ficha: (p, g) => ({
      titulo: p.place || "Sismo", chip: `M${(p.mag ?? 0).toFixed(1)}${p.tsunami ? " · bandera de tsunami" : ""}`,
      filas: [["Hora", fecha(p.time)], ["Profundidad", g?.coordinates?.[2] != null ? `${Math.round(g.coordinates[2])} km` : "—"], ["Alerta PAGER", p.alert || "sin alerta"]],
      url: p.url, fuente: "USGS (tiempo real)",
    }),
  },
  {
    id: "ciclones", nombre: "Ciclones y huracanes (cono y trayectoria)", archivos: ["storms.geojson", "storm_tracks.geojson"], fuente: "NOAA NHC",
    // storms: posición actual. storm_tracks: trayectoria pasada (gris), pronóstico (ámbar) y radios de viento
    // de 34, 50 y 64 nudos (polígonos, más rojos cuanto más fuerte el viento).
    estilo: (p) => {
      if (p.layer === "storm") return { c: C.rojo, r: 9 };
      if (String(p.kind).startsWith("past")) return { c: C.gris, r: 2.5 };
      if (String(p.kind).startsWith("wind_radii")) return { c: p.wind_kt >= 64 ? C.rojo : p.wind_kt >= 50 ? C.naranja : C.ambar, r: 0 };
      return { c: C.ambar, r: 4 };
    },
    ficha: (p) => {
      const kt = p.intensity_kt || p.wind_kt;
      const tipo = { past: "Trayectoria recorrida", past_point: "Posición pasada", forecast: "Trayectoria pronosticada", forecast_point: "Posición pronosticada",
        wind_radii_current: "Radio de vientos actual", wind_radii_forecast: "Radio de vientos pronosticado" }[p.kind];
      return {
        titulo: p.name || p.storm_name || "Ciclón", chip: p.class_label || p.category || tipo || "",
        filas: [...(tipo ? [["Elemento", tipo]] : []), ...(p.label || p.valid_text ? [["Momento", [p.label, p.valid_text].filter(Boolean).join(" · ")]] : []),
          ["Viento", kt ? `${kt} nudos (${Math.round(kt * 1.852)} km/h)` : "—"], ...(p.pressure_mb ? [["Presión", `${p.pressure_mb} hPa`]] : []),
          ...(p.movement ? [["Movimiento", p.movement]] : []), ...(p.last_update ? [["Actualizado", fecha(p.last_update)]] : [])],
        url: "https://www.nhc.noaa.gov/", fuente: "NOAA National Hurricane Center",
      };
    },
  },
  {
    id: "incendios", nombre: "Incendios activos (focos VIIRS, 24 h)", archivos: ["fires.geojson"], fuente: "NASA FIRMS",
    estilo: (p) => ({ c: p.frp >= 100 ? C.rojo : p.frp >= 20 ? C.naranja : C.ambar, r: p.frp >= 100 ? 5 : 3 }),
    ficha: (p) => ({
      titulo: "Foco de calor", chip: `${Math.round(p.frp || 0)} MW de potencia radiativa`,
      filas: [["Detectado", `${p.acq_date || ""} ${String(p.acq_time || "").padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")} UTC`], ["Confianza", { h: "alta", n: "nominal", l: "baja" }[p.confidence] || p.confidence || "—"],
        ["Satélite", p.satellite === "N" ? "Suomi NPP" : p.satellite === "1" ? "NOAA-20" : p.satellite || "—"], ["Día o noche", p.daynight === "D" ? "día" : "noche"]],
      url: "https://firms.modaps.eosdis.nasa.gov/map/", fuente: "NASA FIRMS",
    }),
  },
  {
    id: "gdacs", nombre: "Alertas de desastre GDACS (ONU/UE)", archivos: ["gdacs.geojson"], fuente: "GDACS",
    estilo: (p) => { const l = String(p.alertlevel || "green").toLowerCase(); return { c: l === "red" ? C.rojo : l === "orange" ? C.naranja : C.verde, r: 8 }; },
    ficha: (p) => ({ titulo: p.name || p.title || p.eventname || "Evento", chip: `${p.type_label || p.eventtype || ""} · ${p.alertlevel || ""}`,
      filas: [["País", p.country || "—"], ["Desde", p.fromdate ? fecha(p.fromdate) : "—"]], url: p.url || "https://www.gdacs.org", fuente: "GDACS" }),
  },
  {
    id: "pronostico", nombre: "Pronóstico 7 días: lluvia, viento y temperatura", archivos: ["forecast.geojson"], fuente: "Open-Meteo",
    estilo: (p) => ({ c: NIVEL[Math.min(4, p.level || 0)], r: 3 + (p.level || 0) * 2 }),
    ficha: (p) => ({ titulo: p.name, chip: p.level_label || "",
      filas: [["Lluvia máxima diaria", `${p.max_rain_mm ?? "—"} mm`], ["Ráfaga máxima", `${p.max_gust_kmh ?? "—"} km/h`],
        ["Temperatura", `${p.min_tmin_c ?? "—"} a ${p.max_tmax_c ?? "—"} °C`], ...(p.temp_label ? [["Aviso de temperatura", p.temp_label]] : [])],
      url: "https://open-meteo.com", fuente: "Open-Meteo (modelos numéricos)" }),
  },
  {
    id: "aire", nombre: "Calidad del aire (US AQI)", archivos: ["airquality.geojson"], fuente: "Open-Meteo Air Quality",
    estilo: (p) => ({ c: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : NIVEL[Math.min(4, p.level || 0)], r: 4 + Math.min(4, p.level || 0) }),
    ficha: (p) => ({ titulo: p.name, chip: `${p.level_label || ""} · AQI ${p.us_aqi ?? "—"}`,
      filas: [["PM2.5", `${p.pm2_5 ?? "—"} µg/m³`], ["PM10", `${p.pm10 ?? "—"} µg/m³`], ["Ozono", `${p.ozone ?? "—"} µg/m³`], ["NO₂", `${p.no2 ?? "—"} µg/m³`]],
      url: "https://open-meteo.com/en/docs/air-quality-api", fuente: "Open-Meteo Air Quality (modelo CAMS)" }),
  },
  {
    id: "volcanes", nombre: "Volcanes vigilados", archivos: ["volcanoes.geojson"], fuente: "CENAPRED / Smithsonian",
    estilo: (p) => ({ c: p.ash_active ? C.rojo : C.violeta, r: 6 }),
    ficha: (p) => ({ titulo: p.name, chip: `${p.status || ""}${p.ash_active ? " · ceniza reportada" : ""}`,
      filas: [["País", p.country || "—"], ["Nota", p.note || "—"], ["Ceniza", p.ash_note || "—"]], url: p.url, fuente: "Fuente oficial del volcán" }),
  },
  {
    id: "seguridad", nombre: "Señales de seguridad en noticias (verificar)", archivos: ["security_map.geojson"], fuente: "Google News / GDELT",
    estilo: () => ({ c: C.rojo, r: 5 }), senal: true,
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind || "SEÑAL"} · señal de noticias, verifica`,
      filas: [["Estado / zona", p.state || "—"], ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"]], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "severo", nombre: "Granizo, tornados y tormentas en noticias (verificar)", archivos: ["severe_weather_map.geojson"], fuente: "Google News / GDELT",
    estilo: (p) => ({ c: p.severe ? C.rojo : C.cian, r: 5 }), senal: true,
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind || ""}${p.severe ? " · severo" : ""} · señal de noticias, verifica`,
      filas: [["Estado / zona", p.state || "—"], ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"]], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "deslaves", nombre: "Deslaves y movimientos de masa (noticias)", archivos: ["mass_movements.geojson"], fuente: "Noticias", senal: true,
    estilo: () => ({ c: C.naranja, r: 5 }),
    ficha: (p) => ({ titulo: p.title || p.name || "Deslave", chip: "señal de noticias, verifica",
      filas: [["Zona", p.state || p.country || "—"], ["Fecha", p.date ? fecha(p.date) : "—"]], url: p.url, fuente: p.source || "Noticias" }),
  },
];

/** Agrega a cada feature su color (_c) y radio (_r) según la capa; descarta geometrías vacías. */
export function preparar(capa, fc) {
  const features = (fc?.features || []).filter((f) => f && f.geometry).map((f, i) => {
    const e = capa.estilo(f.properties || {}, f.geometry);
    return { type: "Feature", geometry: f.geometry, properties: { ...(f.properties || {}), _c: e.c, _r: e.r, _i: i } };
  });
  return { type: "FeatureCollection", features };
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
export function htmlRiesgo(capa, props, geom) {
  const f = capa.ficha(props, geom);
  return `<h3 id="ficha-titulo">${esc(f.titulo || capa.nombre)}</h3>
    <div class="fecha">${esc(capa.nombre)}</div>
    <div class="chips">${f.chip ? `<span class="chip ${capa.senal ? "alerta" : ""}">${esc(f.chip)}</span>` : ""}</div>
    <dl>${f.filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
      <dt>Fuente</dt><dd>${f.url ? `<a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a>` : esc(f.fuente)}</dd></dl>
    ${capa.senal ? `<p class="meta">Señal detectada en cobertura noticiosa y ubicada de forma aproximada: no es un incidente confirmado. Verifica en la fuente y con autoridades locales.</p>` : ""}
    <p class="meta">Capa integrada desde <a href="${ORIGEN.url}" target="_blank" rel="noopener noreferrer">${esc(ORIGEN.nombre)}</a>. No sustituye a Protección Civil ni a los avisos oficiales.</p>`;
}

async function leerArchivo(nombre) {
  let ultimo;
  for (const base of BASES) {
    try { return await getJSON(base + nombre, { bust: true }); } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

export class Riesgos {
  constructor(map, { onObjeto }) { this.map = map; this.onObjeto = onObjeto; this.activas = new Map(); this.relojes = new Map(); }

  async manifiesto() { return leerArchivo("manifest.json").catch(() => null); }
  async espacial() { return leerArchivo("space.json").catch(() => null); }

  async #datos(capa) {
    if (capa.url) return getJSON(capa.url, { bust: true });
    const partes = await Promise.all(capa.archivos.map(leerArchivo));
    return { type: "FeatureCollection", features: partes.flatMap((p) => p.features || []) };
  }

  async activar(id) {
    const capa = CAPAS.find((c) => c.id === id);
    if (!capa || this.activas.has(id)) return 0;
    const gj = preparar(capa, await this.#datos(capa));
    this.activas.set(id, gj);
    this.#instalar(capa);
    if (capa.refresco_s) {
      this.relojes.set(id, setInterval(async () => {
        try { const n = preparar(capa, await this.#datos(capa)); this.activas.set(id, n); this.map.getSource(`rg-${id}`)?.setData(n); } catch (e) { /* se reintenta en el siguiente ciclo */ }
      }, capa.refresco_s * 1000));
    }
    return gj.features.length;
  }

  desactivar(id) {
    clearInterval(this.relojes.get(id)); this.relojes.delete(id);
    this.activas.delete(id);
    for (const l of [`rg-${id}-area`, `rg-${id}-linea`, `rg-${id}-punto`]) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource(`rg-${id}`)) this.map.removeSource(`rg-${id}`);
  }

  reinstalar() { for (const id of this.activas.keys()) this.#instalar(CAPAS.find((c) => c.id === id)); }

  #instalar(capa) {
    const src = `rg-${capa.id}`, m = this.map;
    if (m.getSource(src)) return;
    m.addSource(src, { type: "geojson", data: this.activas.get(capa.id), attribution: capa.url ? capa.fuente : "Clima Táctico" });
    const antes = m.getLayer("clusters") ? "clusters" : undefined;
    m.addLayer({ id: `${src}-area`, type: "fill", source: src, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "_c"], "fill-opacity": 0.15 } }, antes);
    m.addLayer({ id: `${src}-linea`, type: "line", source: src, filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
      paint: { "line-color": ["get", "_c"], "line-width": 2, "line-opacity": 0.85 } }, antes);
    m.addLayer({ id: `${src}-punto`, type: "circle", source: src, filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": ["get", "_c"], "circle-radius": ["get", "_r"], "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 } }, antes);
    for (const l of [`${src}-punto`, `${src}-linea`]) {
      m.on("click", l, (e) => { const f = e.features[0]; this.onObjeto(capa, this.#original(capa.id, f.properties._i) || f.properties, f.geometry); });
      m.on("mouseenter", l, () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", l, () => { m.getCanvas().style.cursor = ""; });
    }
  }

  // MapLibre convierte arreglos y objetos de las propiedades en texto: se usa el objeto original.
  #original(id, i) { return this.activas.get(id)?.features[i]?.properties; }
}
