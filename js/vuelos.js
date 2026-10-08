// Ficha y trayectoria de un vuelo: origen y destino, ruta, posiciones recientes y hacia dónde va.
//
// Datos (sin cuentas ni llaves):
//   - Ruta (origen y destino): base comunitaria de rutas de adsb.lol, consultada por el bot cada 20 min
//     y guardada en data/vivos/aeropuertos-ruta.json. Es la ruta habitual del indicativo: puede fallar.
//   - Trayectoria reciente: posiciones de nuestras instantáneas (cada 20 min, hasta 3 h) en
//     data/vivos/rastros/<primer carácter del ICAO>.json. Si OpenSky responde desde el navegador,
//     se usa su trayectoria detallada del vuelo en curso.
//   - Hacia dónde va: línea discontinua con el rumbo actual (30 min) y, con ruta, arco al destino.
// Privacidad: ruta y trayectoria solo para aerolíneas, carga, militares y vuelos de Estado; nunca
// aviación general. No se muestra propietario.
import { getJSON, esc, distanciaKm } from "./util.js";

// Nombres de país que usa OpenSky y no coinciden con el gazetteer (en inglés) → español.
export const PAISES_OPENSKY = {
  "United States": "Estados Unidos", "Russian Federation": "Rusia", "Republic of Korea": "Corea del Sur",
  "Iran, Islamic Republic of": "Irán", "Viet Nam": "Vietnam", "Kingdom of the Netherlands": "Países Bajos",
  "Taiwan": "Taiwán", "United Kingdom": "Reino Unido", "Republic of Moldova": "Moldavia", "Syrian Arab Republic": "Siria",
  "Lao People's Democratic Republic": "Laos", "Democratic People's Republic of Korea": "Corea del Norte",
  "Bolivia, Plurinational State of": "Bolivia", "Venezuela, Bolivarian Republic of": "Venezuela", "Czech Republic": "Chequia",
  "Turkey": "Turquía", "Brunei Darussalam": "Brunéi", "Tanzania, United Republic of": "Tanzania",
};

export const CON_TRAYECTORIA = new Set(["civil_comercial", "carga", "militar", "estado", "sancionada"]);

// Prefijo OACI del indicativo → aerolínea (las más frecuentes; el resto muestra solo el código).
export const AEROLINEAS = {
  AMX: "Aeroméxico", SLI: "Aeroméxico Connect", VOI: "Volaris", VIV: "Viva Aerobus", AAL: "American Airlines", UAL: "United Airlines",
  DAL: "Delta Air Lines", SWA: "Southwest Airlines", ASA: "Alaska Airlines", JBU: "JetBlue", NKS: "Spirit Airlines", FFT: "Frontier Airlines",
  SKW: "SkyWest", ENY: "Envoy Air", RPA: "Republic Airways", ACA: "Air Canada", WJA: "WestJet", BAW: "British Airways",
  VIR: "Virgin Atlantic", EZY: "easyJet", RYR: "Ryanair", WZZ: "Wizz Air", AFR: "Air France", TVF: "Transavia France", KLM: "KLM",
  TRA: "Transavia", DLH: "Lufthansa", EWG: "Eurowings", SWR: "Swiss", AUA: "Austrian Airlines", IBE: "Iberia", VLG: "Vueling",
  AEA: "Air Europa", TAP: "TAP Air Portugal", ITY: "ITA Airways", SAS: "SAS", NAX: "Norwegian", FIN: "Finnair", THY: "Turkish Airlines",
  PGT: "Pegasus", SXS: "SunExpress", UAE: "Emirates", QTR: "Qatar Airways", ETD: "Etihad Airways", SVA: "Saudia", ELY: "El Al",
  MSR: "EgyptAir", ETH: "Ethiopian Airlines", KQA: "Kenya Airways", SAA: "South African Airways", RAM: "Royal Air Maroc",
  AIC: "Air India", AXB: "Air India Express", IGO: "IndiGo", SIA: "Singapore Airlines", CPA: "Cathay Pacific", CCA: "Air China",
  CES: "China Eastern", CSN: "China Southern", JAL: "Japan Airlines", ANA: "All Nippon Airways", KAL: "Korean Air", AAR: "Asiana Airlines",
  QFA: "Qantas", ANZ: "Air New Zealand", AVA: "Avianca", LAN: "LATAM Airlines", TAM: "LATAM Brasil", LPE: "LATAM Perú", GLO: "Gol",
  AZU: "Azul", ARG: "Aerolíneas Argentinas", CMP: "Copa Airlines", FDX: "FedEx", UPS: "UPS Airlines", GTI: "Atlas Air",
  CLX: "Cargolux", DHK: "DHL", BCS: "DHL (European Air Transport)", ABW: "AirBridgeCargo", CKS: "Kalitta Air", BOX: "AeroLogic",
};

export function aerolinea(indicativo) {
  const m = /^([A-Z]{3})\d/.exec((indicativo || "").toUpperCase());
  return m ? { codigo: m[1], nombre: AEROLINEAS[m[1]] || null } : null;
}

// Códigos de transpondedor con significado fijo (OACI).
const SQUAWK = {
  7500: { texto: "Interferencia ilícita (secuestro)", alerta: true },
  7600: { texto: "Falla de radio", alerta: true },
  7700: { texto: "Emergencia general", alerta: true },
  7000: { texto: "Vuelo visual (VFR) en Europa", alerta: false },
  1200: { texto: "Vuelo visual (VFR) en América del Norte", alerta: false },
};
export const squawkInfo = (codigo) => SQUAWK[codigo] || null;

// Categoría ADS-B del emisor.
const CATEGORIAS = {
  A1: "Ligera (menos de 7 t)", A2: "Pequeña (7 a 34 t)", A3: "Grande (34 a 136 t)", A4: "Grande con estela fuerte (p. ej. B757)",
  A5: "Pesada (más de 136 t)", A6: "Alto rendimiento", A7: "Helicóptero", B1: "Planeador", B2: "Globo o dirigible",
  B3: "Paracaidista", B4: "Ultraligero", B6: "Dron", B7: "Vehículo espacial", C1: "Vehículo de emergencia (en tierra)",
  C2: "Vehículo de servicio (en tierra)", C3: "Obstáculo",
};
export const categoria = (c) => CATEGORIAS[c] || null;

const RUMBOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const cardinal = (grados) => RUMBOS[Math.round((((grados % 360) + 360) % 360) / 22.5) % 16];

/** Arco de gran círculo entre dos puntos [lon, lat], con longitudes continuas (sin saltos de 360°). */
export function granCirculo([lon1, lat1], [lon2, lat2], n = 64) {
  const r = Math.PI / 180;
  const [f1, l1, f2, l2] = [lat1 * r, lon1 * r, lat2 * r, lon2 * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) return [[lon1, lat1], [lon2, lat2]];
  const pts = [];
  let previo = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.sin((1 - t) * d) / Math.sin(d), b = Math.sin(t * d) / Math.sin(d);
    const x = a * Math.cos(f1) * Math.cos(l1) + b * Math.cos(f2) * Math.cos(l2);
    const y = a * Math.cos(f1) * Math.sin(l1) + b * Math.cos(f2) * Math.sin(l2);
    const z = a * Math.sin(f1) + b * Math.sin(f2);
    let lon = Math.atan2(y, x) / r;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / r;
    if (previo != null) while (lon - previo > 180) lon -= 360;
    if (previo != null) while (lon - previo < -180) lon += 360;
    previo = lon;
    pts.push([+lon.toFixed(4), +lat.toFixed(4)]);
  }
  return pts;
}

/** Minutos estimados para recorrer `km` a `kmh` (null si no se mueve). */
export const etaMin = (km, kmh) => (kmh > 50 ? Math.round((km / kmh) * 60) : null);

export function horaLlegada(min, ahora = Date.now()) {
  if (min == null) return null;
  return new Date(ahora + min * 60000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

/** Avance del vuelo (0–100 %) entre origen y destino según la distancia recorrida en línea recta. */
export function avance(origen, destino, lon, lat) {
  const total = distanciaKm(origen.lat, origen.lon, destino.lat, destino.lon);
  const falta = distanciaKm(lat, lon, destino.lat, destino.lon);
  return total > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - falta / total)))) : null;
}

// ---------------------------------------------------------------- datos bajo demanda
let aeropuertosP = null;
const shards = new Map();

const aeropuerto = (icao, tabla) => {
  const a = tabla[icao];
  return a ? { icao, nombre: a[0], ciudad: a[1], pais: a[2], lat: a[3], lon: a[4], iata: a[5] } : null;
};

/** Trayectoria detallada de OpenSky para el vuelo en curso; null si no responde (sin cuenta puede negarse). */
async function trayectoriaOpenSky(hex) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://opensky-network.org/api/tracks/all?icao24=${encodeURIComponent(hex)}&time=0`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    const pts = (d.path || []).filter((p) => p[1] != null && p[2] != null).map((p) => [p[2], p[1], Math.round(p[3] || 0), Math.round(p[0] / 60)]);
    return pts.length > 1 ? pts : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Reúne lo que necesita la ficha: origen y destino, rastro reciente y su fuente.
 * @param {object} v  vuelo con nombres de campo (hex, indicativo, ruta, subtipo, lon, lat…)
 */
export async function datosVuelo(v) {
  const out = { origen: null, destino: null, rastro: [], fuenteRastro: null };
  if (!CON_TRAYECTORIA.has(v.subtipo)) return out;
  const tareas = [];
  if (v.ruta) {
    aeropuertosP ??= getJSON("data/vivos/aeropuertos-ruta.json", { bust: true }).catch(() => ({ aeropuertos: {} }));
    tareas.push(aeropuertosP.then((d) => {
      const [o, de] = v.ruta.split("-");
      out.origen = aeropuerto(o, d.aeropuertos);
      out.destino = aeropuerto(de, d.aeropuertos);
    }));
  }
  const clave = v.hex.slice(0, 1).toLowerCase();
  if (!shards.has(clave)) shards.set(clave, getJSON(`data/vivos/rastros/${clave}.json`, { bust: true }).catch(() => ({ r: {} })));
  tareas.push(shards.get(clave).then((d) => { out.rastro = d.r[v.hex] || []; out.fuenteRastro = "instantaneas"; }));
  tareas.push(trayectoriaOpenSky(v.hex).then((p) => { if (p) { out.rastroDetallado = p; } }));
  await Promise.all(tareas);
  if (out.rastroDetallado) { out.rastro = out.rastroDetallado; out.fuenteRastro = "opensky"; }
  delete out.rastroDetallado;
  return out;
}

/** Olvida los datos guardados cuando movimiento.js carga una instantánea nueva. */
export function olvidarCache() { aeropuertosP = null; shards.clear(); }
if (typeof addEventListener === "function") addEventListener("vivos-actualizados", olvidarCache);

// ---------------------------------------------------------------- dibujo en el mapa
/** GeoJSON de la trayectoria: recorrido, rumbo (30 min), arco al destino y aeropuertos. Función pura. */
export function geojsonTrayectoria(v, { origen, destino, rastro }, proyectar) {
  const feats = [];
  const actual = [v.lon, v.lat];
  const recorrido = [...rastro.map((p) => [p[0], p[1]]), actual];
  if (recorrido.length > 1) {
    // Longitudes continuas para que la línea no cruce el mapa entero en el antimeridiano.
    for (let i = 1; i < recorrido.length; i++) {
      while (recorrido[i][0] - recorrido[i - 1][0] > 180) recorrido[i][0] -= 360;
      while (recorrido[i][0] - recorrido[i - 1][0] < -180) recorrido[i][0] += 360;
    }
    feats.push({ type: "Feature", properties: { k: "recorrido" }, geometry: { type: "LineString", coordinates: recorrido } });
    for (const p of rastro) feats.push({ type: "Feature", properties: { k: "punto" }, geometry: { type: "Point", coordinates: [p[0], p[1]] } });
  }
  if (v.vel_kmh > 50) {
    const rumbo = [];
    for (let s = 0; s <= 1800; s += 300) rumbo.push(proyectar(v.lon, v.lat, v.rumbo || 0, v.vel_kmh, s));
    feats.push({ type: "Feature", properties: { k: "rumbo" }, geometry: { type: "LineString", coordinates: rumbo } });
  }
  if (destino) feats.push({ type: "Feature", properties: { k: "al_destino" }, geometry: { type: "LineString", coordinates: granCirculo(actual, [destino.lon, destino.lat]) } });
  if (origen && rastro.length === 0) feats.push({ type: "Feature", properties: { k: "desde_origen" }, geometry: { type: "LineString", coordinates: granCirculo([origen.lon, origen.lat], actual) } });
  for (const [ap, rol] of [[origen, "Origen"], [destino, "Destino"]]) {
    if (ap) feats.push({ type: "Feature", properties: { k: "aeropuerto", n: `${rol}: ${ap.iata || ap.icao}` }, geometry: { type: "Point", coordinates: [ap.lon, ap.lat] } });
  }
  return { type: "FeatureCollection", features: feats };
}

/** Rectángulo [[oeste, sur], [este, norte]] de todo lo dibujado; null si no hay nada. */
export function limites(gj) {
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const ver = ([x, y]) => { o = Math.min(o, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); };
  for (const f of gj.features) {
    if (f.geometry.type === "Point") ver(f.geometry.coordinates);
    else f.geometry.coordinates.forEach(ver);
  }
  return Number.isFinite(o) ? [[o, Math.max(-85, s)], [e, Math.min(85, n)]] : null;
}

export class Trayectoria {
  constructor(map) { this.map = map; this.datos = null; }

  mostrar(geojson) {
    this.datos = geojson;
    this.#instalar();
    this.map.getSource("trayectoria").setData(geojson);
  }

  limpiar() {
    this.datos = null;
    this.map.getSource("trayectoria")?.setData({ type: "FeatureCollection", features: [] });
  }

  reinstalar() { if (this.datos) this.mostrar(this.datos); }

  #instalar() {
    const m = this.map;
    if (m.getSource("trayectoria")) return;
    m.addSource("trayectoria", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const linea = (id, filtro, paint) => m.addLayer({ id, type: "line", source: "trayectoria", filter: ["==", ["get", "k"], filtro],
      layout: { "line-cap": "round", "line-join": "round" }, paint });
    linea("tray-desde-origen", "desde_origen", { "line-color": "#8a8f94", "line-width": 1.5, "line-dasharray": [1, 2] });
    linea("tray-al-destino", "al_destino", { "line-color": "#2E6F8E", "line-width": 1.8, "line-dasharray": [1, 2] });
    linea("tray-recorrido", "recorrido", { "line-color": "#C27C1E", "line-width": 3, "line-opacity": 0.9 });
    linea("tray-rumbo", "rumbo", { "line-color": "#C27C1E", "line-width": 2.5, "line-dasharray": [2, 1.5] });
    m.addLayer({ id: "tray-puntos", type: "circle", source: "trayectoria", filter: ["==", ["get", "k"], "punto"],
      paint: { "circle-radius": 3, "circle-color": "#C27C1E", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
    m.addLayer({ id: "tray-aeropuertos", type: "circle", source: "trayectoria", filter: ["==", ["get", "k"], "aeropuerto"],
      paint: { "circle-radius": 6, "circle-color": "#2E6F8E", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    m.addLayer({ id: "tray-aeropuertos-texto", type: "symbol", source: "trayectoria", filter: ["==", ["get", "k"], "aeropuerto"],
      layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top" },
      paint: { "text-color": "#1c2329", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
  }
}

// ---------------------------------------------------------------- ficha
const num = (n) => Number(n).toLocaleString("es-MX");

/** HTML de la ficha de un vuelo. `extra` = resultado de datosVuelo(); `paisEs` traduce el país de OpenSky. */
export function htmlVuelo(v, extra, { subtipoNombre, edadMin, paisEs = (x) => x }) {
  const al = aerolinea(v.indicativo);
  const sq = squawkInfo(v.squawk);
  const cat = categoria(v.cat);
  const { origen, destino, rastro = [], fuenteRastro } = extra || {};
  let ruta = "";
  if (origen && destino) {
    const falta = distanciaKm(v.lat, v.lon, destino.lat, destino.lon);
    const min = etaMin(falta, v.vel_kmh);
    const pct = avance(origen, destino, v.lon, v.lat);
    const ap = (a) => `<b>${esc(a.iata || a.icao)}</b> ${esc(a.nombre)}${a.ciudad ? `, ${esc(a.ciudad)}` : ""}${a.pais ? ` (${esc(a.pais)})` : ""}`;
    ruta = `<div class="ruta-vuelo">
      <div><span class="meta">Origen</span>${ap(origen)}</div>
      <div class="barra-ruta" aria-label="Avance aproximado ${pct ?? "?"} %"><span style="width:${pct ?? 0}%"></span></div>
      <div><span class="meta">Destino</span>${ap(destino)}</div>
      <p class="meta">Faltan ${num(Math.round(falta))} km en línea recta${min != null ? ` · llegada estimada ≈ ${esc(horaLlegada(min))} (${num(min)} min a la velocidad actual)` : ""}.
        Ruta habitual del indicativo según la base comunitaria de adsb.lol: puede no corresponder a este vuelo.</p></div>`;
  } else if (CON_TRAYECTORIA.has(v.subtipo)) {
    ruta = `<p class="meta">Sin ruta conocida para este indicativo${v.subtipo === "militar" || v.subtipo === "estado" ? " (los vuelos militares y de Estado no publican ruta)" : ""}.</p>`;
  }
  const vsTxt = v.vs_ms ? `${v.vs_ms > 0 ? "Subiendo" : "Bajando"} ${num(Math.abs(Math.round(v.vs_ms * 196.85)))} pies/min` : "Nivelado";
  const tray = !CON_TRAYECTORIA.has(v.subtipo) ? "No se muestra la trayectoria de la aviación general (privacidad)."
    : fuenteRastro === "opensky" ? `Trayectoria detallada del vuelo en curso (OpenSky, ${rastro.length} puntos).`
      : rastro.length ? `Trayectoria aproximada: ${rastro.length} posiciones de las instantáneas (cada 20 min, hasta 3 h).`
        : "Aún sin posiciones anteriores para dibujar la trayectoria.";
  return `<h3 id="ficha-titulo">${esc(v.indicativo || v.hex)}${al?.nombre ? ` · ${esc(al.nombre)}` : ""}</h3>
    <div class="fecha">${esc(subtipoNombre)}${v.pais ? " · registrado en " + esc(paisEs(v.pais)) : ""}</div>
    <div class="chips"><span class="chip estado-retrasado">Dato retrasado${edadMin != null ? ` · instantánea de hace ${edadMin} min` : ""}</span>
      ${sq?.alerta ? `<span class="chip alerta alerta-FLASH">Squawk ${esc(v.squawk)}: ${esc(sq.texto)}</span>` : ""}</div>
    ${ruta}
    <dl>
      <dt>Altitud</dt><dd>${num(v.alt_m)} m · ${num(Math.round(v.alt_m * 3.28084))} pies${v.alt_m > 3000 ? ` (FL${String(Math.round(v.alt_m * 3.28084 / 100)).padStart(3, "0")})` : ""}</dd>
      <dt>Vertical</dt><dd>${esc(vsTxt)}</dd>
      <dt>Velocidad</dt><dd>${num(v.vel_kmh)} km/h · ${num(Math.round(v.vel_kmh / 1.852))} nudos</dd>
      <dt>Rumbo</dt><dd>${esc(v.rumbo)}° (${esc(cardinal(v.rumbo || 0))})</dd>
      ${v.squawk ? `<dt>Transpondedor</dt><dd>${esc(v.squawk)}${sq ? ` · ${esc(sq.texto)}` : ""}</dd>` : ""}
      ${cat ? `<dt>Categoría</dt><dd>${esc(cat)}</dd>` : ""}
      ${v.tipo_av ? `<dt>Tipo</dt><dd>${esc(v.tipo_av)}</dd>` : ""}
      ${v.matricula && v.subtipo !== "aviacion_general" ? `<dt>Matrícula</dt><dd>${esc(v.matricula)}</dd>` : ""}
      ${al && !al.nombre ? `<dt>Operador (OACI)</dt><dd>${esc(al.codigo)}</dd>` : ""}
      <dt>ICAO 24 bits</dt><dd>${esc(v.hex)}</dd>
      <dt>Ver en</dt><dd><a href="https://globe.adsb.lol/?icao=${encodeURIComponent(v.hex)}" target="_blank" rel="noopener noreferrer">adsb.lol</a></dd>
    </dl>
    ${CON_TRAYECTORIA.has(v.subtipo) ? `<p class="leyenda-tray"><span class="lt-rec"></span>recorrido <span class="lt-rumbo"></span>rumbo 30 min <span class="lt-dest"></span>al destino</p>` : ""}
    <p class="meta">${esc(tray)} La posición se proyecta como máximo 5 min desde la instantánea. No se muestra propietario ni se vincula con personas.</p>`;
}
