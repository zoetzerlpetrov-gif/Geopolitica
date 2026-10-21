// Riesgos naturales y clima: capas del proyecto «Clima Táctico» (repositorio WarRoomViajero) dentro de este mapa.
// Geopolítica genera su propia copia cada 6 h (tools/clima_tactico, en data/vivos/ct/) para no depender de ese
// repositorio; si un archivo falta, se lee el de WarRoomViajero. Se leen solo al activar cada capa.
// Los sismos se piden en vivo a USGS desde el navegador (CORS abierto), como en el mapa original.
//
// Fuentes originales: USGS, NOAA NHC, NASA FIRMS, GDACS, Open-Meteo, CENAPRED/Smithsonian, noticias
// (GDELT y Google News) y NOAA SWPC. Las capas de noticias son SEÑALES por verificar, no incidentes
// confirmados, y siempre enlazan a la fuente.
import { getJSON, esc, safeUrl, pinturaEtiqueta, layoutEtiqueta, htmlImagenMedio } from "./util.js";
import { articuloTren, articuloWikipedia, huecoImagen } from "./imagen_tipo.js";
import { htmlBloque as htmlErupcion } from "./erupcion.js";
import * as P from "./polos.js";
import * as K from "./cielo.js";
import * as GF from "./gfw.js";
import { ESCALAS_NOAA, COLOR_ESCALA, NO_AFECTA, gDeKp, clasificar, claveDe, paisEn, paisDeLugar, enjambres, radiosTsunami, lineasAurora, registrarVistos, feedAPuntos, PARPADEO_MS, NUEVO_MS, SEVERIDADES,
  ESCALA_SISMO, estiloSismo, categoriaCiclon, sevAlertaVolcan, normalizar, BANDAS_AQI } from "./amenazas.js";

// Primero la copia propia (tools/clima_tactico, mismo sitio: más rápida y sin depender de WarRoomViajero); si falta un
// archivo, el sitio de WarRoomViajero y su repositorio como respaldo.
export const BASES = [
  "data/vivos/ct/",
  "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/data/",
  "https://raw.githubusercontent.com/zoetzerlpetrov-gif/WarRoomViajero/main/data/",
];
/** Orden e ícono de los subgrupos del panel. */
export const GRUPOS = [["Desastres naturales", "🌋", "#C0392B"], ["Clima y ambiente", "🌦️", "#2471A3"], ["Seguridad y ataques", "🛡️", "#6C3483"],
  ["Emergencias, zonas afectadas y transporte", "🚨", "#B23A48"], ["Red y ciberseguridad", "🌐", "#1F6F8B"], ["Espacio", "🚀", "#34495E"],
  ["Mar: tráfico de barcos y pesca ilegal", "⚓", "#1B4F72"], ["Salud: brotes y enfermedades", "🦠", "#117A65"], ["Horas: zonas horarias del mundo", "🕒", "#6C5B7B"], ["Sociedad: idiomas y creadores de contenido", "📣", "#8E44AD"], ["Criminología: modalidades delictivas en noticias", "🔎", "#4A235A"],
  ["Carreteras y calles: robos, bloqueos y protestas", "🚧", "#9C5B12"], ["Polos: Antártida, Groenlandia y Ártico", "🧊", "#3A7CA5"]];
const POLOS = "Polos: Antártida, Groenlandia y Ártico";
const MAR = "Mar: tráfico de barcos y pesca ilegal";
const SALUD = "Salud: brotes y enfermedades";
const SOCIEDAD = "Sociedad: idiomas y creadores de contenido";
// Idioma principal de cada país → color (los más extendidos; el resto en gris).
const COLOR_IDIOMA = { en: "#1F77B4", es: "#D62728", fr: "#2CA02C", ar: "#8C564B", pt: "#FF7F0E", ru: "#9467BD", zh: "#E377C2", de: "#BCBD22",
  it: "#17BECF", nl: "#F4A261", sw: "#2A9D8F", el: "#457B9D", otro: "#95A5A6" };
const NOMBRE_IDIOMA = { en: "Inglés", es: "Español", fr: "Francés", ar: "Árabe", pt: "Portugués", ru: "Ruso", zh: "Chino", de: "Alemán", it: "Italiano",
  nl: "Neerlandés", sw: "Suajili", el: "Griego" };
const fmtPct = (v) => `${Number(v) >= 1 ? Math.round(Number(v)) : Number(v).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;
const ICONO_RED = { YouTube: "▶️", TikTok: "🎵", Instagram: "📷" };
/** 421000000 → «421 M»; 15300000 → «15.3 M». */
const millones = (n) => `${(Number(n) / 1e6).toLocaleString("es-MX", { maximumFractionDigits: Number(n) >= 1e8 ? 0 : 1 })} M`;
const PALETA_TZ = ["#E8D5B7", "#B8D8BA", "#D9B8C4", "#A8C5DA", "#F2C57C", "#C3B1E1", "#9ED2C6", "#F4A6A6", "#CFCFCF"];

/** Dónde poner la hora de una franja horaria: su centro en longitud, a 15° N y 45° N si la franja llega ahí. */
export function puntosEtiquetaZona(f) {
  const xs = [], ys = [];
  const rec = (c) => { if (typeof c[0] === "number") { xs.push(c[0]); ys.push(c[1]); } else c.forEach(rec); };
  rec(f.geometry.coordinates);
  if (!xs.length) return [];
  const lon = (Math.min(...xs) + Math.max(...xs)) / 2, s = Math.min(...ys), n = Math.max(...ys);
  if (Math.max(...xs) - Math.min(...xs) > 40 || n - s < 30) return [];  // zonas irregulares o pequeñas: solo la ficha
  return [15, 45].filter((lat) => lat > s + 2 && lat < n - 2).map((lat) => [Math.round(lon * 100) / 100, lat]);
}

/** Hora con desfase fijo de la franja (sin horario de verano). */
export function horaFija(zona, ahora = new Date()) {
  const t = new Date(ahora.getTime() + (Number(zona) || 0) * 3600000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Hora y desfase actuales en una zona IANA (con horario de verano si aplica), o null. */
export function horaIana(tz, ahora = new Date()) {
  try {
    const hora = new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
    const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(ahora).find((x) => x.type === "timeZoneName")?.value.replace("GMT", "UTC");
    return { hora, utc: !off || off === "UTC" ? "UTC+0" : off };
  } catch (e) { return null; }
}
// Color por grupo de enfermedad (salud): graves, respiratorias, estomacales, transmitidas por mosquitos, prevenibles con vacuna.
const COLOR_SALUD = { grave: "#8E1B1B", laboratorio: "#4A148C", respiratoria: "#1F6FB2", gastro: "#8D6E2F", vectores: "#2E7D32", prevenible: "#C2185B", otra: "#5D6D7E" };
const LEYENDA_SALUD = [{ c: COLOR_SALUD.grave, r: 6, t: "Graves: ébola, Marburgo, mpox, peste, polio, causa desconocida" },
  { c: COLOR_SALUD.respiratoria, r: 6, t: "Respiratorias: gripe, gripe aviar, COVID, MERS, neumonía, tos ferina" },
  { c: COLOR_SALUD.gastro, r: 6, t: "Estomacales: cólera, norovirus, salmonela, intoxicación alimentaria" },
  { c: COLOR_SALUD.vectores, r: 6, t: "Por mosquitos: dengue, chikungunya, zika, malaria, fiebre amarilla" },
  { c: COLOR_SALUD.prevenible, r: 6, t: "Prevenibles con vacuna: sarampión, difteria, meningitis" },
  { c: COLOR_SALUD.laboratorio, r: 6, t: "Incidente de bioseguridad en un laboratorio (según noticias)" }];

export const ORIGEN = { nombre: "Clima Táctico (WarRoomViajero)", url: "https://zoetzerlpetrov-gif.github.io/WarRoomViajero/" };

const C = { verde: "#2E9E6E", ambar: "#E0A100", naranja: "#E2711D", rojo: "#D23B3B", violeta: "#8E4FD1", cian: "#1F8A8A", gris: "#6f8a82" };
const NIVEL = [C.verde, C.ambar, C.naranja, C.rojo, C.violeta];
const COLOR_ALERTA = { verde: "#2E9E6E", amarillo: "#E0B000", naranja: "#E2711D", rojo: "#D23B3B" };
const fecha = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? String(t || "") : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };

/**
 * Capas. `archivos` se buscan en BASES; `url` es una fuente en vivo. `estilo(props, geom)` devuelve
 * {c: color, r: radio}; `ficha(props)` devuelve {titulo, chip, filas:[[etiqueta, valor]], url, fuente}.
 */
// Trenes en circulación: una capa por red (todas leen vivos/trenes.geojson). Van en el menú «En movimiento → Trenes».
export const REDES_TREN = [
  ["finlandia", "Finlandia: todos los trenes (Fintraffic)", "Pasajeros, cercanías y carga, con GPS. Licencia CC BY 4.0."],
  ["noruega", "Noruega: trenes de pasajeros (Entur)", "Vy, Go-Ahead, SJ Norge y Flytoget. Licencia NLOD."],
  ["irlanda", "Irlanda: trenes en marcha (Irish Rail)", "Intercity, DART y cercanías, con retraso si lo hay."],
  ["boston", "EUA · Boston: trenes de cercanías (MBTA)", "Commuter Rail de Massachusetts."],
  ["filadelfia", "EUA · Filadelfia: trenes regionales (SEPTA)", "Regional Rail, con retraso en minutos."],
];
function capaTrenes(red, nombre, nota) {
  return {
    id: `trenes_${red}`, grupo: "Trenes", menu: "trenes", nombre, url: "data/vivos/trenes.geojson", refresco_s: 1200,
    fuente: { finlandia: "Fintraffic / Digitraffic (CC BY 4.0)", noruega: "Entur (NLOD)", irlanda: "Irish Rail", boston: "MBTA V3 API", filadelfia: "SEPTA TrainView" }[red],
    derivar: (fc) => ({ ...fc, features: fc.features.filter((f) => f.properties.red === red) }),
    estilo: (p) => ({ c: p.categoria === "Larga distancia" ? "#1F6FB2" : p.categoria === "Carga" ? "#8D6E63" : ["Maniobras", "Maquinaria de vía", "Prueba", "Locomotora sola"].includes(p.categoria) ? C.gris : (p.retraso_min ?? 0) >= 10 ? C.naranja : "#2E9E6E", r: 5 }),
    etiqueta: (p) => (p.categoria === "Larga distancia" || red === "irlanda" ? `${p.tipo ? `${p.tipo} ` : ""}${p.numero}` : ""),
    leyenda: [{ c: "#1F6FB2", r: 5, t: "Larga distancia" }, { c: "#2E9E6E", r: 5, t: "Pasajeros o cercanías" }, { c: C.naranja, r: 5, t: "Con 10 min o más de retraso" },
      { c: "#8D6E63", r: 5, t: "Carga" }, { c: C.gris, r: 5, t: "Maniobras, maquinaria o prueba" }, { t: `${nota} Se actualiza cada ~20 min.` }],
    ficha: (p) => ({ titulo: `Tren ${p.tipo || ""} ${p.numero}`.replace(/\s+/g, " "), chip: [p.categoria, p.operador].filter(Boolean).join(" · ") || "tren",
      filas: [...(p.linea ? [["Línea o ruta", p.linea]] : []), ...(p.origen ? [["Origen", p.origen]] : []), ...(p.destino ? [["Destino", p.destino]] : []),
        ...(p.vel_kmh != null ? [["Velocidad", `${p.vel_kmh} km/h`]] : []), ...(p.retraso_min != null ? [["Retraso", `${p.retraso_min} min`]] : []),
        ...(p.estado ? [["Estado", p.estado]] : []), ["Posición de", p.hora ? fecha(p.hora) : "—"]],
      url: p.url, fuente: p.fuente, imagen: articuloTren(red, p.categoria, p.tipo) }),
  };
}

// Eventos de la ingesta horaria (app.js los deja en globalThis.__eventosIngesta al cargarlos) para las señales del mundo.
/** Eventos del área «seguridad», severidad 3 o más, últimas 72 h, con coordenadas → puntos de la capa de señales. */
export function seguridadMundo(evs, ahora = Date.now()) {
  const desde = ahora - 72 * 3600e3;
  return (evs || []).filter((e) => e.area_principal === "seguridad" && Number(e.severidad) >= 3 && Date.parse(e.fecha_utc) >= desde
    && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)) && !e._sintetico)
    .map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [Number(e.lon), Number(e.lat)] }, properties: {
      title: e.titulo, kind: Number(e.severidad) >= 4 ? "GRAVE" : "SEGURIDAD", state: e.pais_iso3 || "", precision: "lugar que menciona la nota",
      source: e.fuente, date: e.fecha_utc, url: e.url, via: "Ingesta horaria del monitor (medios del mundo)" } }));
}

// Crimen organizado, narcotráfico, mafias, terrorismo y grupos armados en noticias: ventanas de 7 a 90 días.
// Todas leen vivos/crimen_90d.geojson (conteo diario por celda de ~55 km, tools/crimen/historial.py).
export const COLOR_CRIMEN = { Terrorismo: "#8E1B1B", Narcotráfico: "#B4451F", Mafia: "#5B3A8E", "Crimen organizado": "#C27C1E",
  "Grupo armado": "#6D4C41", "Grupo rebelde": "#455A64", Insurgencia: "#37474F", Separatistas: "#546E7A" };
/** Suma por celda lo de los últimos `dias` días (hasta hoy). Celdas sin notas en la ventana se quitan. */
export function ventanaCrimen(fc, dias, hoy = new Date()) {
  const base = Date.parse(`${fc.base}T00:00:00Z`);
  if (!Number.isFinite(base)) return { ...fc, features: [] };
  const hoyI = Math.floor((Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) - base) / 86400000);
  const desde = hoyI - dias + 1;
  const desdeIso = new Date(base + desde * 86400000).toISOString().slice(0, 10);
  const tipos = fc.tipos || [];
  const features = [];
  for (const f of fc.features || []) {
    const por = {};
    let n = 0;
    for (const [i, t, k] of f.properties.d || []) if (i >= desde && i <= hoyI) { por[tipos[t]] = (por[tipos[t]] || 0) + k; n += k; }
    if (!n) continue;
    const dominante = Object.entries(por).sort((a, b) => b[1] - a[1])[0][0];
    features.push({ ...f, properties: { ...f.properties, n, por, dominante, dias, notas: (f.properties.notas || []).filter((x) => String(x[3]).slice(0, 10) >= desdeIso) } });
  }
  return { ...fc, features };
}
export const VENTANAS_CRIMEN = [7, 15, 30, 60, 90].map((dias) => ({
  id: `crimen_${dias}d`, grupo: "Seguridad y ataques", noAmenaza: true, url: "data/vivos/crimen_90d.geojson", refresco_s: 3600,
  nombre: `Crimen organizado, narcotráfico, mafias y terrorismo en noticias: últimos ${dias} días (conteo por zona)`,
  fuente: "GDELT y medios mexicanos (conteo de señales de noticias)",
  derivar: (fc) => ventanaCrimen(fc, dias),
  estilo: (p) => ({ c: COLOR_CRIMEN[p.dominante] || C.rojo, r: Math.min(20, 3 + Math.sqrt(p.n) * 1.6) }),
  etiqueta: (p) => (p.n >= 10 ? String(p.n) : ""),
  leyenda: [...Object.entries(COLOR_CRIMEN).slice(0, 5).map(([t, c]) => ({ c, r: 5, t: `Predomina: ${t}` })), { c: C.gris, r: 4, t: "Pocas notas" }, { c: C.gris, r: 14, t: "Muchas notas" },
    { t: `Cuántas notas de noticias mencionaron crimen organizado, narcotráfico, mafias, terrorismo o grupos armados en cada zona de ~55 km en los últimos ${dias} días. Mide cobertura en medios, no delitos denunciados: los países con más medios en GDELT aparecen más. El historial empezó a acumularse en octubre de 2026.` }],
  ficha: (p) => ({ titulo: `${p.lugar || "Zona"}: ${p.n} nota${p.n === 1 ? "" : "s"} en ${dias} días`, chip: `Predomina: ${p.dominante} · conteo de noticias, verifica`,
    filas: [...Object.entries(p.por).sort((a, b) => b[1] - a[1]).map(([t, k]) => [t, `${k} nota${k === 1 ? "" : "s"}`]), ...(p.pais ? [["País", p.pais]] : []),
      ["Zona", "Celda de ~55 km (posición aproximada)"]], fuente: "GDELT y medios mexicanos" }),
  extra: (p) => { const ns = lista(p.notas); return ns.length ? `<h4>Titulares recientes de la zona (${ns.length})</h4><ul class="fuentes">${ns.map(([t, u, m, f, tipo]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a> <span class="meta">${esc(m)} · ${esc(String(f).slice(0, 10))} · ${esc(tipo)}</span></li>`).join("")}</ul>` : ""; },
  pie: "Conteo de señales de noticias por zona: no son incidentes confirmados ni estadística oficial de delitos. Para cifras oficiales en México, consulta SESNSP e INEGI (ENVIPE).",
}));

// Criminología: modalidades delictivas detectadas en titulares (crimen.geojson 72 h + eventos de la ingesta).
// Solo grupos y hechos, nunca personas: no se extraen nombres ni datos personales; se muestra el titular y el enlace.
export const MODALIDADES = [
  ["extorsion", "Extorsión y cobro de piso", "#B4451F", /extorsi|cobro de piso|derecho de piso|extortion|racketeer/],
  ["secuestro", "Secuestro, rapto y desaparición", "#8E1B1B", /secuestr|plagi[oa]|\blevant(on|ad[oa]s?)\b|\brapt|kidnap|abduct|desaparec|desaparicion|missing (person|people|migrants)/],
  ["fraude", "Fraude, estafas y lavado de dinero", "#C27C1E", /fraude|estafa|\btimo\b|piramidal|ponzi|lavado de dinero|blanqueo|money laundering|\bscam|\bfraud|factureras?|empresas fantasma/],
  ["ciber", "Ciberdelito: ransomware, phishing, hackeos y sextorsión", "#1F6F8B", /ciberataque|ciberdelit|ransomware|hacke|phishing|malware|filtracion de datos|data breach|cybercrim|cyberattack|cyber attack|sextorsi|sextortion|deepfake|robo de identidad|identity theft/],
  ["trata", "Trata y tráfico de personas", "#5B3A8E", /trata de personas|trafico de (personas|migrantes)|human trafficking|people smuggling|migrant smuggling|explotacion sexual|polleros?|coyotes? de migrantes/],
  ["amenazas", "Amenazas, intimidación y ataques a periodistas o autoridades", "#6D4C41", /narcomanta|amenazas? de muerte|amenazan? (a|con matar)|amenazad[oa]s? (de muerte|por)|intimidac|death threats?|threatened to kill|periodista asesinad|journalist killed|ataque a (alcalde|policia|juez|periodista)|cobro de cuota/],
  ["robo", "Robo, asalto y robo de combustible", "#455A64", /\brobo|asalto|atraco|robber|theft|huachicol|carjack|robo de vehiculo/],
];
let fuenteModalidades = null; // {t, fc}: una sola descarga compartida por las 7 capas durante 10 min
async function titularesDelito() {
  if (fuenteModalidades && Date.now() - fuenteModalidades.t < 600e3) return fuenteModalidades.fc;
  const crimen = await getJSON("data/vivos/crimen.geojson", { bust: true }).catch(() => ({ features: [] }));
  const desde = Date.now() - 7 * 86400e3;
  const evs = (globalThis.__eventosIngesta || []).filter((e) => Date.parse(e.fecha_utc) >= desde && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)) && !String(e.id).startsWith("sintetico"))
    .map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [Number(e.lon), Number(e.lat)] },
      properties: { title: e.titulo, url: e.url, source: e.fuente, date: e.fecha_utc, lugar: e.pais_iso3 || "", precision: "lugar que menciona la nota", via: "Ingesta horaria del monitor" } }));
  const vistos = new Set();
  const fc = { type: "FeatureCollection", features: [...(crimen.features || []), ...evs].filter((f) => f.properties.title && !vistos.has(f.properties.title) && vistos.add(f.properties.title)) };
  fuenteModalidades = { t: Date.now(), fc };
  return fc;
}
/** Titulares → los de una modalidad (por palabras clave en el título, sin acentos). */
export function filtrarModalidad(fc, rx) {
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return { ...fc, features: (fc.features || []).filter((f) => rx.test(norm(f.properties.title))) };
}
export const CAPAS_MODALIDADES = MODALIDADES.map(([id, nombre, color, rx]) => ({
  id: `mod_${id}`, grupo: "Criminología: modalidades delictivas en noticias", noAmenaza: true, senal: true, nombre: `${nombre} (noticias 72 h a 7 días, verificar)`,
  fuente: "GDELT, medios mexicanos y medios del monitor", generar: titularesDelito, derivar: (fc) => filtrarModalidad(fc, rx),
  estilo: () => ({ c: color, r: 5 }),
  leyenda: [{ c: color, r: 5, t: nombre }, { t: "Titulares que mencionan esta modalidad (palabras clave en español e inglés), ubicados por el lugar que nombran. Es una señal para investigar, no un delito confirmado; no se extraen nombres de personas." }],
  ficha: (p) => ({ titulo: p.title, chip: `${nombre} · señal de noticias, verifica`,
    filas: [["Lugar", `${p.lugar || p.state || "—"}${p.precision && p.precision !== "ciudad" ? ` (aprox.: ${p.precision})` : ""}`], ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"],
      ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticia" }),
  pie: "Para denunciar en México: 089 (denuncia anónima), 088 (Guardia Nacional, incluye ciberdelitos) y CONDUSEF para fraudes financieros. No sustituye a las autoridades.",
}));

// Carreteras y calles: robo a transporte de carga y público, robo de vehículos, tomas de casetas, bloqueos y protestas
// (vivos/vial.geojson, que arma tools/crimen/crimen.py con tools/crimen/vial.py). Señales de noticias, no cifras oficiales.
const VIAL = "Carreteras y calles: robos, bloqueos y protestas";
export const TIPOS_VIAL = [
  ["robo_carga", "Robo a transporte de carga", "#8E1B1B", "🚛", ["robo_carga"]],
  ["robo_publico", "Asaltos en transporte público", "#B4451F", "🚌", ["robo_publico"]],
  ["robo_vehiculo", "Robo de vehículos", "#6D4C41", "🚗", ["robo_vehiculo"]],
  ["caseta", "Tomas de casetas de cobro", "#C27C1E", "🎫", ["caseta"]],
  ["bloqueo", "Bloqueos de carreteras y calles (incluye narcobloqueos)", "#D35400", "🚧", ["bloqueo"]],
  ["protesta", "Protestas, marchas, paros y disturbios", "#5B3A8E", "📢", ["protesta", "paro", "protesta_violenta"]],
];
let fuenteVial = null; // una sola descarga compartida por las 6 capas durante 10 min
async function datosVial() {
  if (fuenteVial && Date.now() - fuenteVial.t < 600e3) return fuenteVial.fc;
  const fc = await getJSON("data/vivos/vial.geojson", { bust: true }).catch(() => ({ type: "FeatureCollection", features: [] }));
  fuenteVial = { t: Date.now(), fc };
  return fc;
}
export const CAPAS_VIAL = TIPOS_VIAL.map(([id, nombre, color, ic, sts]) => ({
  id: `vial_${id}`, grupo: VIAL, senal: true, nombre: `${ic} ${nombre} (noticias 72 h, verificar)`,
  fuente: "Medios mexicanos, GDELT GKG y eventos CAMEO 14 de GDELT", generar: datosVial,
  derivar: (fc) => ({ ...fc, features: (fc.features || []).filter((f) => sts.includes(f.properties.st)) }),
  estilo: (p) => ({ c: color, r: 3 + (p.severidad || 2) }),
  leyenda: [{ c: color, r: 6, t: nombre }, { t: id === "protesta"
    ? "En México, titulares de medios que nombran el lugar. En el mundo, eventos de GDELT con código CAMEO de protesta (14x) cubiertos por 5 notas o más; los que solo traen el país no se pintan."
    : "Titulares de medios mexicanos que nombran la ciudad o el estado (sin lugar en el título no se pinta). Son señales para verificar, no cifras oficiales: las del SESNSP son mensuales y por estado." }],
  ficha: (p) => ({ titulo: p.title, chip: `${p.tipo || nombre} · señal de noticias, verifica`,
    filas: [["Lugar", `${p.lugar || "—"}${p.precision === "estado" ? " (aprox.: centro del estado)" : ""}`], ["Severidad estimada", `${p.severidad || 2} de 5 (sube si el titular menciona violencia)`],
      ...(p.cameo ? [["Código CAMEO (GDELT)", `${p.cameo} · ${p.articulos || 1} nota(s)`]] : []), ["Medio", p.source || "—"], ["Fecha", p.date ? fecha(p.date) : "—"],
      ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticia" }),
  pie: "Antes de viajar por carretera en México: Guardia Nacional 088 y el estado de las vías en CAPUFE (@CAPUFE). Para denunciar: 089 (anónimo). No sustituye a las autoridades.",
}));

// Fenómenos anómalos: una capa por clase (todas leen vivos/anomalias.geojson). Van en su propio menú y NO entran a la
// lista de amenazas, a los filtros de severidad ni al sonido de avisos: son reportes, no riesgos.
export const NIVELES_ANOM = {
  oficial: ["#1F6FB2", "Documentado por un gobierno u organismo oficial (no implica origen extraterrestre)"],
  cientifico: ["#2E9E6E", "Estudiado con instrumentos o en publicaciones científicas"],
  medios: ["#E0A100", "Reportado en medios o blogs; sin verificación independiente"],
  civil: ["#8E4FD1", "Reportes civiles (testigos), sin verificación"],
  local: ["#E2711D", "Leyenda local, blogs o turismo; no verificado"],
  explicado: ["#6f8a82", "Hay una explicación convencional propuesta o confirmada"],
};
const AVISO_ANOM = "Son reportes, no hechos confirmados. El color indica qué respaldo tiene cada uno; ninguno prueba un origen extraterrestre.";
function capaAnomalia(id, nombre, nota, extra = {}) {
  const ids = extra.ids || [id];
  return {
    id, grupo: "Fenómenos anómalos", menu: "anomalias", noAmenaza: true, nombre, url: "data/vivos/anomalias.geojson", refresco_s: 21600,
    fuente: "TrackAlien, NUFORC y catálogo propio",
    subgrupo: extra.subgrupo || "Casos, lugares y reportes",
    derivar: (fc) => ({ ...fc, features: fc.features.filter(extra.filtro || ((f) => ids.includes(f.properties.capa))) }),
    estilo: (p) => (id === "anom_nuforc" ? { c: NIVELES_ANOM.civil[0], r: Math.min(16, 3 + Math.sqrt(p.n || 1) / 3) } : { c: (NIVELES_ANOM[p.nivel] || NIVELES_ANOM.medios)[0], r: 6 }),
    // Nombre visible solo en el catálogo curado (pocos puntos); las noticias y la densidad irían encimadas.
    etiqueta: (p) => (["anom_lugar", "anom_triangulo", "anom_orbe", "anom_objeto", "anom_cultivo", "anom_oficina"].includes(p.capa) ? p.titulo
      : p.precision === "país" && p.n ? `${p.n} nota${p.n === 1 ? "" : "s"} · ${p.lugar}` : ""),
    leyenda: [...(id === "anom_nuforc" ? [{ c: NIVELES_ANOM.civil[0], r: 4, t: "Pocos reportes" }, { c: NIVELES_ANOM.civil[0], r: 12, t: "Miles de reportes" }]
      : Object.entries(NIVELES_ANOM).filter(([k]) => (extra.niveles || Object.keys(NIVELES_ANOM)).includes(k)).map(([, [c, t]]) => ({ c, r: 5, t }))),
      { t: `${nota} ${AVISO_ANOM}` }],
    pie: AVISO_ANOM,
    ficha: (p) => ({
      titulo: p.titulo, chip: p.tipo_nombre || nombre,
      filas: [...(p.fecha ? [["Fecha o periodo", String(p.fecha)]] : []), ...(p.desde ? [["Años con reportes", `${p.desde}–${p.hasta}`]] : []),
        ...(p.formas ? [["Formas más reportadas", p.formas]] : []), ...(p.resumen ? [["Qué se sabe", p.resumen]] : []),
        ["Nivel de respaldo", (NIVELES_ANOM[p.nivel] || NIVELES_ANOM.medios)[1]], ...(p.credibilidad ? [["Credibilidad según TrackAlien", p.credibilidad]] : []),
        ...(p.pais && !p.lugar ? [["País", p.pais]] : []), ...(p.lugar ? [["Lugar", p.lugar]] : []),
        ...(p.aprox ? [["Ubicación", "Aproximada (pueblo o zona de referencia)"]] : []),
        ...(p.precision === "país" ? [["Ubicación", "Centro del país: el título no nombra una ciudad"]] : p.precision === "estado" ? [["Ubicación", "Centro del estado"]] : [])],
      url: p.url, fuente: p.fuente || "TrackAlien", imagen: articuloWikipedia(p.url) }),
    // Notas agrupadas por país: lista con enlace a cada original.
    extra: (p) => { const ns = lista(p.notas); return ns.length ? `<h4>Notas (${ns.length}${p.n > ns.length ? ` de ${p.n}` : ""})</h4><ul class="fuentes">${ns.map((x) => `<li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.titulo)}</a> <span class="meta">${esc(x.fuente)} · ${esc(x.fecha)}</span></li>`).join("")}</ul>` : ""; },
  };
}
export const ANOMALIAS = [
  capaAnomalia("anom_recientes", "Noticias y blogs del último año (OVNI/UAP, luces, contactos)", "Notas que mencionan el tema en el título, de medios y blogs especializados, vía TrackAlien (se actualiza 2 veces al día). Muchas terminan explicadas (satélites, drones, cohetes).", { niveles: ["medios"] }),
  capaAnomalia("anom_archivo", "Archivo de notas: más de un año (se conservan aunque la fuente las retire)", "Notas de medios y blogs que ya no están en TrackAlien o tienen más de 12 meses; el monitor las acumula desde octubre de 2026.", { niveles: ["medios"] }),
  capaAnomalia("anom_historicos", "Casos históricos conocidos (Roswell, Campeche, Nimitz…)", "Casos seleccionados en TrackAlien con su nivel de credibilidad.", { niveles: ["oficial", "medios"] }),
  capaAnomalia("anom_nuforc", "Dónde se reporta más: reportes civiles 1910–2014 (NUFORC)", "≈ 80 mil reportes del centro civil NUFORC (EUA), contados por celdas de ~110 km. Hay muchos más en EUA porque NUFORC es estadounidense: mide dónde se reporta, no dónde ocurre más."),
  capaAnomalia("anom_objeto", "Objetos extraños: esferas metálicas y restos caídos", "Esfera de Buga, esfera de Betz, anillo de Mukuku.", { niveles: ["medios", "explicado"] }),
  capaAnomalia("anom_cultivo", "Figuras en cultivos (crop circles)", "La mayoría en Wiltshire, Inglaterra; desde 1991 se sabe que muchas son obra de personas.", { niveles: ["explicado"] }),
  capaAnomalia("anom_orbe", "Orbes y luces que se repiten en el mismo lugar", "Hessdalen, Marfa, Min Min, Naga, Brown Mountain, Paulding.", { niveles: ["cientifico", "local", "explicado"] }),
  capaAnomalia("anom_lugar", "Lugares con fama de «propensos» (oficiales y no verificados)", "Incluye sitios documentados por gobiernos y sitios conocidos solo por blogs, periódicos locales o turismo; el color dice cuál es cuál.", { ids: ["anom_lugar", "anom_triangulo"], niveles: ["oficial", "local", "explicado"] }),
  capaAnomalia("anom_oficina", "Oficinas oficiales que investigan reportes (AARO, GEIPAN)", "Dónde reportar o consultar casos analizados.", { niveles: ["oficial"] }),
];
// Por tipo de fenómeno, con las categorías de TrackAlien: noticias + casos históricos (+ catálogo cuando aplica).
// Las notas agrupadas por país entran en cada tipo que contienen («tipos»).
export const TIPOS_ANOM = [
  ["ufo", "Objetos aéreos no identificados (OVNI/UAP)", "Objetos en el cielo sin identificar: discos, cilindros, triángulos, esferas."],
  ["lights_sky", "Luces en el cielo", "Luces, orbes o destellos en el cielo. Muchas resultan ser satélites Starlink, drones, globos o cohetes."],
  ["lights_ground", "Luces a ras de suelo", "Luces que se repiten cerca del suelo en el mismo lugar (Hessdalen, Marfa, Min Min…).", ["anom_orbe"]],
  ["uso", "Objetos sumergidos o en el mar (USO)", "Objetos que entran o salen del agua, o luces bajo el mar."],
  ["contact", "Supuestos contactos, seres o abducciones", "Relatos de encuentros cercanos o seres. Ninguno ha sido verificado."],
  ["sound", "Sonidos inexplicados", "Zumbidos, estruendos o «trompetas» sin fuente identificada."],
  ["em", "Efectos electromagnéticos", "Apagones, fallas de aparatos o interferencias asociadas a un avistamiento."],
  ["volcano", "Objetos sobre volcanes", "Objetos filmados cerca de cráteres (Popocatépetl, Colima…), casi siempre por cámaras de monitoreo."],
  ["crop", "Figuras en cultivos", "Figuras en campos de cultivo; desde 1991 se sabe que muchas son obra de personas.", ["anom_cultivo"]],
];
const TIPO_ANOM_CAPAS = new Set(["anom_recientes", "anom_archivo", "anom_historicos"]);
export const ANOMALIAS_POR_TIPO = TIPOS_ANOM.map(([t, nombre, nota, catalogo = []]) => capaAnomalia(`anom_t_${t}`, nombre, nota, {
  subgrupo: "Por tipo de fenómeno (como TrackAlien)",
  filtro: (f) => { const p = f.properties; return catalogo.includes(p.capa) || (TIPO_ANOM_CAPAS.has(p.capa) && (p.tipo === t || (p.tipos || []).includes(t))); },
}));

/** Alertas del NWS sin geometría → punto en el promedio de los centroides de sus condados (SAME = «0» + FIPS). */
export function ubicarPorCondados(fc, condados) {
  return { ...fc, features: (fc.features || []).map((f) => {
    if (f.geometry) return f;
    const cs = (f.properties?.geocode?.SAME || []).map((s) => condados[String(s).slice(-5)]).filter(Boolean);
    if (!cs.length) return f;
    const lon = cs.reduce((a, c) => a + c[0], 0) / cs.length, lat = cs.reduce((a, c) => a + c[1], 0) / cs.length;
    return { ...f, geometry: { type: "Point", coordinates: [Number(lon.toFixed(3)), Number(lat.toFixed(3))] }, properties: { ...f.properties, _aprox: cs.length } };
  }) };
}

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
    id: "gdacs", grupo: "Desastres naturales", nombre: "Alertas de desastre GDACS (ONU/UE)", archivos: ["gdacs.geojson"], locales: ["data/vivos/gdacs_mundo.geojson"], fuente: "GDACS",
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
    id: "frentes", grupo: "Clima y ambiente", nombre: "Frentes fríos y cálidos, altas y bajas presiones (América del Norte y océanos vecinos)", noAmenaza: true,
    url: "data/vivos/frentes.geojson", refresco_s: 3600, fuente: "NOAA Weather Prediction Center (análisis de superficie)",
    estilo: (p) => ({ c: K.colorFrente(p), r: p.kind === "alta" || p.kind === "baja" ? 4 : 0 }),
    etiqueta: (p) => (p.kind === "alta" ? `A ${p.presion_hpa}` : p.kind === "baja" ? `B ${p.presion_hpa}` : p.kind === "tentativo_12h" ? "en 12 h"
      : p.kind === "frio" && (p.toca_mexico || p.mov_kmh >= 3) ? `Frente frío${p.mov_kmh >= 3 ? ` → ${p.mov_hacia} ${p.mov_kmh} km/h` : ""}` : ""),
    leyenda: [{ c: K.COLOR_FRENTE.frio, r: 4, t: "Frente frío" }, { c: K.COLOR_FRENTE.calido, r: 4, t: "Frente cálido" }, { c: K.COLOR_FRENTE.estacionario, r: 4, t: "Frente estacionario" },
      { c: K.COLOR_FRENTE.ocluido, r: 4, t: "Frente ocluido" }, { c: K.COLOR_FRENTE.vaguada, r: 4, t: "Vaguada" }, { c: K.COLOR_FRENTE.alta, r: 5, t: "A: alta presión (hPa)" },
      { c: K.COLOR_FRENTE.baja, r: 5, t: "B: baja presión (hPa)" }, { c: K.COLOR_FRENTE.tentativo_12h, r: 4, t: "Línea clara: posición tentativa en 12 h" },
      { t: "Franja sombreada: zona de influencia estimada (en el frente frío, más ancha detrás, donde entra el aire frío). Dirección y velocidad: estimación propia comparando el análisis de NOAA con el de 3 h antes." },
      { t: "Análisis de NOAA cada 3 h; cubre de ~10° N al Ártico. El SMN numera los frentes fríos de la temporada (septiembre a mayo) en sus avisos." }],
    ficha: (p) => ({ titulo: p.nombre, chip: p.kind === "zona" || p.kind === "tentativo_12h" ? "estimación" : p.toca_mexico ? "sobre México" : "", filas: K.filasFrente(p), url: "https://www.wpc.ncep.noaa.gov/html/sfc-zoom.php",
      fuente: "NOAA WPC (posiciones frontales codificadas); avisos oficiales en México: SMN" }),
  },
  {
    id: "nortes", grupo: "Clima y ambiente", nombre: "Eventos de «Norte» en el Golfo de México e Istmo de Tehuantepec (estimación a 7 días)",
    url: "data/vivos/nortes.geojson", refresco_s: 3600, fuente: "Estimación propia con el pronóstico de Open-Meteo",
    estilo: (p) => ({ c: ["#8D99A6", "#E0A100", "#E2711D", "#C62828"][p.nivel || 0], r: 4 + 2 * (p.nivel || 0) }),
    etiqueta: (p) => (p.nivel ? `${p.rafaga_max_kmh} km/h` : ""),
    leyenda: [{ c: "#E0A100", r: 6, t: "Norte: ráfagas del norte de 50 a 69 km/h" }, { c: "#E2711D", r: 8, t: "Norte fuerte: 70 a 89 km/h" }, { c: "#C62828", r: 10, t: "Norte muy fuerte: 90 km/h o más" },
      { c: "#8D99A6", r: 4, t: "Sin Norte en 7 días" }, { t: "Estimación propia (viento del NO al NE con esas ráfagas). El aviso oficial es del SMN y las capitanías de puerto." }],
    ficha: (p) => ({ titulo: p.name, chip: K.nivelNorte(p.nivel), filas: K.filasNorte(p), url: "https://smn.conagua.gob.mx/es/pronosticos/avisos/aviso-de-frente-frio",
      fuente: "Pronóstico Open-Meteo; aviso oficial: SMN" }),
    extra: (p) => K.barras(p.serie, { titulo: "Ráfagas del norte (km/h)", unidad: "km/h", umbrales: [[50, "#E0A100", "50"], [70, "#E2711D", "70"], [90, "#C62828", "90"]] }),
  },
  {
    id: "mar_fondo", grupo: "Clima y ambiente", nombre: "Mar de fondo: oleaje largo en costas de México y del mundo (7 días)",
    url: "data/vivos/mar_fondo.geojson", refresco_s: 3600, fuente: "Open-Meteo Marine (estimación propia)",
    estilo: (p) => ({ c: ["#5DADE2", "#E0A100", "#E2711D", "#C62828"][p.nivel || 0], r: p.nivel ? 4 + 2 * p.nivel : 3 }),
    etiqueta: (p) => (p.nivel ? `${p.altura_max_m} m` : ""),
    leyenda: [{ c: "#E0A100", r: 6, t: "Moderado: oleaje de fondo de 2 a 2.9 m (periodo de 12 s o más)" }, { c: "#E2711D", r: 8, t: "Fuerte: 3 a 3.9 m" },
      { c: "#C62828", r: 10, t: "Muy fuerte: 4 m o más" }, { c: "#5DADE2", r: 3, t: "Sin mar de fondo en 7 días" },
      { t: "Mar de fondo = olas largas que vienen de tormentas lejanas: corrientes de resaca y oleaje en malecones aunque no haya viento. Aviso oficial en México: SMN y SEMAR." }],
    ficha: (p) => ({ titulo: p.name, chip: K.nivelMar(p.nivel), filas: K.filasMar(p), url: "https://open-meteo.com/en/docs/marine-weather-api", fuente: "Open-Meteo Marine (modelos de oleaje)" }),
    extra: (p) => K.barras((p.serie || []).map(([t, h]) => [t, h]), { titulo: "Altura del oleaje de fondo (m)", unidad: "m", umbrales: [[2, "#E0A100", "2 m"], [3, "#E2711D", "3 m"], [4, "#C62828", "4 m"]] }),
  },
  {
    id: "enso", grupo: "Clima y ambiente", nombre: "El Niño / La Niña: estado oficial y temperatura del mar en las regiones Niño", noAmenaza: true,
    url: "data/vivos/enso.geojson", refresco_s: 21600, fuente: "NOAA Climate Prediction Center",
    derivar: (fc) => ({ ...fc, features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, opacidad: 0.45 } })) }),
    estilo: (p) => ({ c: p.anomalia == null ? C.gris : p.anomalia >= 1.5 ? "#8E1B1B" : p.anomalia >= 0.5 ? "#D84315" : p.anomalia <= -1.5 ? "#0D3B66" : p.anomalia <= -0.5 ? "#1F6FB2" : "#8D99A6", r: 0 }),
    etiqueta: (p) => `${p.nombre}: ${p.anomalia > 0 ? "+" : ""}${p.anomalia ?? "—"} °C`,
    leyenda: [{ c: "#8E1B1B", r: 6, t: "+1.5 °C o más (cálido fuerte)" }, { c: "#D84315", r: 6, t: "+0.5 a +1.4 °C" }, { c: "#8D99A6", r: 6, t: "−0.4 a +0.4 °C (neutral)" },
      { c: "#1F6FB2", r: 6, t: "−0.5 a −1.4 °C" }, { c: "#0D3B66", r: 6, t: "−1.5 °C o menos (frío fuerte)" },
      { t: "Cajas del Pacífico ecuatorial que NOAA usa para medir El Niño (cálido) y La Niña (frío). Niño 3.4 es la referencia oficial. Toca una caja para ver el estado y sus efectos en México." }],
    ficha: (p) => ({ titulo: `${p.nombre}: ${K.FASE_ENSO[p.fase_oni]?.[0] || ""}`, chip: p.estado || "", filas: K.filasEnso(p),
      url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml", fuente: "NOAA CPC (discusión ENSO, índice ONI y SST semanal)" }),
    extra: (p) => K.extraEnso(p),
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
    extra: (p, g) => `<div class="ceniza" data-lon="${g.coordinates[0]}" data-lat="${g.coordinates[1]}" data-nombre="${esc(p.name)}"><p class="meta">Calculando hacia dónde iría la ceniza…</p></div>`
      + htmlErupcion({ lon: g.coordinates[0], lat: g.coordinates[1], nombre: p.name, tipo: p.type || "", pais: p.country || "", gvp: (String(p.url || "").match(/vn=(\d+)/) || [])[1] || "" }),
    leyenda: [{ c: COLOR_ALERTA.verde, r: 6, t: "Verde / NORMAL" }, { c: COLOR_ALERTA.amarillo, r: 6, t: "Amarillo (fases 1–3) / ADVISORY" },
      { c: COLOR_ALERTA.naranja, r: 6, t: "Naranja / WATCH" }, { c: COLOR_ALERTA.rojo, r: 6, t: "Rojo / WARNING" }, { c: C.violeta, r: 6, t: "Sin alerta automática (consultar)" },
      { t: "La severidad 1–5 sale de la alerta oficial: Verde 1, Amarillo F1 2, F2 3, F3 4, Rojo 5 (USGS: NORMAL 1, ADVISORY 2, WATCH 4, WARNING 5)." }],
  },
  {
    id: "seguridad", grupo: "Seguridad y ataques", nombre: "Señales de seguridad en noticias: México y mundo (verificar)", archivos: ["security_map.geojson"], fuente: "Google News / GDELT y medios del monitor",
    // México: mapa y titulares de seguridad (como en Clima Táctico), ubicados por la ciudad o el estado que mencionan.
    // Mundo: eventos de seguridad de la ingesta horaria (ya descargados por la app; no se pide nada más).
    complementar: async (fc, leer) => {
      const [feed, estados] = await Promise.all([leer("security_feed.json").catch(() => null), getJSON("config/mx_estados.json").catch(() => null)]);
      const ya = new Set(fc.features.map((f) => f.properties.title));
      const extra = feed && estados ? feedAPuntos(feed.items, estados) : [];
      return { ...fc, features: [...fc.features, ...[...extra, ...seguridadMundo(globalThis.__eventosIngesta)].filter((f) => !ya.has(f.properties.title) && ya.add(f.properties.title))] };
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
    id: "cortes", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Apagones y cortes de agua (noticias del mundo, 7 días, verificar)", senal: true,
    url: "data/vivos/cortes.geojson", refresco_s: 1200, fuente: "GDELT GKG (noticias de todo el mundo)",
    estilo: (p) => ({ c: /LUZ/.test(p.kind || "") ? (p.severe ? "#B7950B" : "#D4AC0D") : (p.severe ? "#1A5276" : "#2E86C1"), r: p.severe ? 7 : 5 }),
    etiqueta: (p) => (p.severe ? `${/LUZ/.test(p.kind || "") ? "Apagón" : "Corte de agua"}${p.notas > 1 ? ` · ${p.notas} notas` : ""}` : ""),
    leyenda: [{ ic: "⚡", t: "Apagón (o luz y agua)" }, { ic: "💧", t: "Corte o escasez de agua" },
      { t: "Severidad 3: el titular habla de miles o millones de afectados o de todo un país; 1: corte programado (aviso de mantenimiento)." },
      { t: "Son titulares ubicados por el lugar que nombran. Confirma con la empresa eléctrica o el organismo de agua. Para apagones grandes compara las «Luces nocturnas VIIRS» de dos días (Imágenes satelitales) y los cortes de internet de IODA (Red y ciberseguridad), que suelen acompañarlos." }],
    ficha: (p) => ({ titulo: p.title, chip: `${p.kind === "AGUA" ? "Corte de agua" : p.kind === "LUZ" ? "Apagón" : "Luz y agua"}${p.programado ? " · programado" : ""}${p.severe ? " · muchos afectados según el titular" : ""} · señal de noticias, verifica`,
      filas: [["Lugar", `${p.state || "—"}${p.precision && p.precision !== "ciudad" ? ` (ubicación aproximada: ${p.precision})` : ""}`], ["Medio", p.source || "—"],
        ["Fecha", p.date ? fecha(p.date) : "—"], ...(p.notas > 1 ? [["Notas", `${p.notas} notas desde ${fecha(p.desde)}`], ["Otros medios", otrosMedios(p.enlaces, p.url)]] : []),
        ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticias",
      // Si el medio no declaró imagen (o la nota es anterior a guardarla), una ilustrativa de Wikipedia, marcada como tal.
      imagen: p.image ? null : { titulo: p.kind === "AGUA" ? "Water scarcity" : "Power outage", ilustrativa: true } }),
  },
  {
    id: "salud_oficial", grupo: SALUD, nombre: "Brotes y avisos oficiales: OMS, CDC (viajeros) y ECDC", url: "data/vivos/salud_oficial.geojson", refresco_s: 3600,
    fuente: "OMS, CDC de EUA y ECDC",
    estilo: (p) => ({ c: COLOR_SALUD[p.grupo] || COLOR_SALUD.otra, r: 4 + (p.nivel || 2) }),
    etiqueta: (p) => (p.nivel >= 3 ? p.enfermedad : ""),
    leyenda: [...LEYENDA_SALUD, { t: "Punto = centro del país donde la autoridad reporta el brote, no la zona exacta. Tamaño: nivel del aviso (CDC: 1 precauciones habituales, 2 precauciones extra, 3 evitar viajes no esenciales, 4 no viajar). La OMS publica los brotes que un país notifica bajo el Reglamento Sanitario Internacional." }],
    ficha: (p) => ({ titulo: `${p.enfermedad} · ${p.lugar}`, chip: p.nivel_cdc ? `Aviso CDC nivel ${p.nivel_cdc}` : String(p.fuente || "").split(" · ")[0],
      filas: [["Aviso", p.title], ["Organismo", p.fuente], ["Fecha", fecha(p.date)], ["País", p.lugar],
        ["Qué hacer", "Consulta el aviso oficial y a la Secretaría de Salud o la autoridad sanitaria local antes de viajar"]], url: p.url, fuente: p.fuente }),
  },
  {
    id: "salud_noticias", grupo: SALUD, nombre: "Brotes y aumentos de casos en noticias: gripe, dengue, estomacales y más (14 días, verificar)", senal: true,
    url: "data/vivos/salud_noticias.geojson", refresco_s: 1800, fuente: "GDELT GKG (noticias de todo el mundo)",
    estilo: (p) => ({ c: COLOR_SALUD[p.grupo] || COLOR_SALUD.otra, r: Math.min(10, (p.severe ? 6 : 4) + Math.log2(p.notas || 1)) }),
    etiqueta: (p) => (p.severe || p.notas >= 3 ? `${p.enfermedad}${p.notas > 1 ? ` · ${p.notas}` : ""}` : ""),
    leyenda: [...LEYENDA_SALUD, { t: "Titulares de noticias que hablan de un brote, aumento de casos o muertes, ubicados por el lugar que nombran y agrupados por enfermedad. El número es la cantidad de notas. Son señales: confirma con la autoridad sanitaria (en México, Secretaría de Salud y su boletín epidemiológico)." }],
    ficha: (p) => ({ titulo: p.title, chip: `${p.enfermedad} · señal de noticias, verifica`,
      filas: [["Lugar", `${p.state || "—"}${p.precision && p.precision !== "ciudad" ? ` (ubicación aproximada: ${p.precision})` : ""}`], ["Medio", p.source || "—"],
        ["Fecha", p.date ? fecha(p.date) : "—"], ...(p.notas > 1 ? [["Notas", `${p.notas} notas desde ${fecha(p.desde)}`], ["Otros medios", otrosMedios(p.enlaces, p.url)]] : []),
        ...(p.via ? [["Origen del dato", p.via]] : [])], url: p.url, fuente: p.source || "Noticias" }),
  },
  {
    id: "desplazamiento_origen", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Desplazamiento forzado: personas que huyeron de cada país y desplazados internos (ACNUR, anual)", noAmenaza: true,
    url: "data/vivos/desplazamiento_origen.geojson", refresco_s: 86400, fuente: "ACNUR (UNHCR), Refugee Data Finder",
    estilo: (p) => ({ c: p.total >= 1e6 ? "#922B21" : p.total >= 1e5 ? "#CB4335" : "#E59866", r: Math.min(16, 3 + Math.log10(p.total || 1) * 1.6) }),
    etiqueta: (p) => (p.total >= 1e6 ? `${p.pais} · ${millones(p.total)}` : ""),
    leyenda: [{ c: "#922B21", r: 8, t: "1 millón o más" }, { c: "#CB4335", r: 6, t: "100 mil a 1 millón" }, { c: "#E59866", r: 4, t: "Menos de 100 mil" },
      { t: "Suma de refugiados y solicitantes de asilo que salieron del país, otras personas con necesidad de protección y desplazados dentro del país. Cifras oficiales de fin de año (ACNUR las publica a mitad del año siguiente). Punto = centro del país." }],
    ficha: (p) => ({ titulo: `Desplazamiento desde ${p.pais}`, chip: `${Number(p.total).toLocaleString("es-MX")} personas · ${p.anio}`,
      filas: [["Refugiados en otros países", Number(p.refugiados).toLocaleString("es-MX")], ["Solicitantes de asilo", Number(p.solicitantes).toLocaleString("es-MX")],
        ["Otras con necesidad de protección", Number(p.otros_proteccion).toLocaleString("es-MX")], ["Desplazados dentro del país", Number(p.desplazados_internos).toLocaleString("es-MX")],
        ["Regresaron en el año", Number(p.retornados).toLocaleString("es-MX")], ["Año del dato", `Fin de ${p.anio}`]],
      url: "https://www.unhcr.org/refugee-statistics/", fuente: "ACNUR, Refugee Data Finder" }),
  },
  {
    id: "desplazamiento_acogida", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Países que acogen refugiados y solicitantes de asilo (ACNUR, anual)", noAmenaza: true,
    url: "data/vivos/desplazamiento_acogida.geojson", refresco_s: 86400, fuente: "ACNUR (UNHCR), Refugee Data Finder",
    estilo: (p) => ({ c: p.total >= 1e6 ? "#1A5276" : p.total >= 1e5 ? "#2E86C1" : "#85C1E9", r: Math.min(16, 3 + Math.log10(p.total || 1) * 1.6) }),
    etiqueta: (p) => (p.total >= 1e6 ? `${p.pais} · ${millones(p.total)}` : ""),
    leyenda: [{ c: "#1A5276", r: 8, t: "Acoge 1 millón o más" }, { c: "#2E86C1", r: 6, t: "100 mil a 1 millón" }, { c: "#85C1E9", r: 4, t: "Menos de 100 mil" },
      { t: "Refugiados, solicitantes de asilo y otras personas con necesidad de protección que viven en el país. Cifras oficiales de fin de año. Punto = centro del país." }],
    ficha: (p) => ({ titulo: `${p.pais}: personas acogidas`, chip: `${Number(p.total).toLocaleString("es-MX")} personas · ${p.anio}`,
      filas: [["Refugiados", Number(p.refugiados).toLocaleString("es-MX")], ["Solicitantes de asilo", Number(p.solicitantes).toLocaleString("es-MX")],
        ["Otras con necesidad de protección", Number(p.otros_proteccion).toLocaleString("es-MX")], ["Apátridas", Number(p.apatridas).toLocaleString("es-MX")],
        ["Año del dato", `Fin de ${p.anio}`]],
      url: "https://www.unhcr.org/refugee-statistics/", fuente: "ACNUR, Refugee Data Finder" }),
  },
  {
    id: "idiomas", grupo: SOCIEDAD, nombre: "Idiomas que se hablan en cada país: el principal colorea el país (Unicode CLDR)", noAmenaza: true,
    url: "data/base/idiomas.geojson", fuente: "Unicode CLDR (territoryInfo); nombres ISO 639-3 de SIL cuando CLDR no tiene",
    derivar: (fc) => ({ ...fc, features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, opacidad: 0.42 } })) }),
    estilo: (p) => ({ c: COLOR_IDIOMA[p.principal] || COLOR_IDIOMA.otro, r: 0 }),
    leyenda: [...Object.entries(NOMBRE_IDIOMA).map(([k, t]) => ({ c: COLOR_IDIOMA[k], r: 6, t })), { c: COLOR_IDIOMA.otro, r: 6, t: "Otro idioma principal" },
      { t: "Color = idioma que habla la mayor parte de la población. Al dar clic: todos los idiomas con el % de la población que los habla y si son oficiales. Una persona puede hablar varios: los % pueden sumar más de 100." }],
    ficha: (p) => ({ titulo: `Idiomas de ${p.pais}`, chip: `Principal: ${p.principal_nombre} (${fmtPct(p.principal_pct)})`,
      filas: [["Oficiales", lista(p.oficiales).join(", ") || "Sin idioma oficial declarado en CLDR"], ["Población (CLDR)", Number(p.poblacion || 0).toLocaleString("es-MX")]],
      url: "https://cldr.unicode.org/", fuente: "Unicode CLDR: estimaciones a partir de censos y estudios; pueden tener varios años" }),
    extra: (p) => `<h4>Idiomas que se hablan</h4><table class="tabla-idiomas"><tbody>${lista(p.idiomas).map((x) => `<tr><td>${esc(x.nombre)}${x.estatus ? ` <span class="chip">${esc(x.estatus)}</span>` : ""}</td>
      <td class="barra-idioma"><span style="width:${Math.min(100, Number(x.pct) || 0)}%"></span></td><td>${fmtPct(x.pct)}</td></tr>`).join("")}</tbody></table>
      <p class="meta">% de la población que habla cada idioma (como lengua materna o segunda lengua). Se listan los de 0.1 % o más y todos los oficiales.</p>`,
  },
  {
    id: "creadores", grupo: SOCIEDAD, nombre: "Creadores de contenido con más seguidores: hasta 100 por plataforma en YouTube, TikTok e Instagram (Wikidata)", noAmenaza: true,
    url: "data/vivos/creadores.geojson", refresco_s: 86400, fuente: "Wikidata (CC0), número de seguidores en redes sociales (P8687)",
    estilo: (p) => ({ c: "#8E44AD", r: Math.min(14, 4 + Math.sqrt(p.n || 1) * 1.6) }),
    etiqueta: (p) => `${p.pais} · ${p.n}`,
    leyenda: [{ c: "#8E44AD", r: 6, t: "Punto = país de nacionalidad (centro del país, no donde vive la persona); tamaño = cuántos creadores tiene en los primeros 100" },
      { t: "Solo personas, no marcas ni medios. Se muestran nombre, ocupación, cuenta oficial y seguidores con la fecha del dato que registra Wikidata, que puede estar desactualizado. Se actualiza cada semana." }],
    ficha: (p) => ({ titulo: `Creadores de contenido · ${p.pais}`, chip: `${p.n} entre los 100 primeros de alguna plataforma`,
      filas: [["Cómo se arma", "Por plataforma, las 100 personas con más seguidores según Wikidata; cada una con su dato más reciente"],
        ["Ojo", "Quien tiene más de una nacionalidad aparece en cada país. Las cifras cambian cada día: confírmalas en la cuenta oficial."]],
      url: "https://www.wikidata.org/wiki/Property:P8687", fuente: "Wikidata (abre la propiedad de seguidores)" }),
    extra: (p) => `<h4>Creadores</h4><ol class="fuentes">${lista(p.creadores).map((c) => `<li><b><a href="https://www.wikidata.org/wiki/${esc(c.qid)}" target="_blank" rel="noopener noreferrer">${esc(c.nombre)}</a></b>${lista(c.ocupaciones).length ? ` · <span class="meta">${esc(lista(c.ocupaciones).join(", "))}</span>` : ""}<br>${lista(c.cuentas).map((k) => `${ICONO_RED[k.plataforma] || ""} <a href="${esc(safeUrl(k.url))}" target="_blank" rel="noopener noreferrer">${esc(k.plataforma)}</a> #${esc(k.puesto)} · ${millones(k.seguidores)}${k.fecha ? ` <span class="meta">(${esc(k.fecha)})</span>` : ""}`).join(" · ")}</li>`).join("")}</ol>`,
  },
  {
    id: "zonas_horarias", grupo: "Horas: zonas horarias del mundo", nombre: "Zonas horarias con la hora local actual (se actualiza cada minuto)", noAmenaza: true,
    url: "data/base/zonas-horarias.geojson", refresco_s: 60, fuente: "Natural Earth (zonas horarias, dominio público)",
    derivar: (fc) => ({ ...fc, features: fc.features.flatMap((f) => {
      const props = { ...f.properties, hora: horaFija(f.properties.zona) };
      return [{ ...f, properties: { ...props, opacidad: 0.3 } }, ...puntosEtiquetaZona(f).map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { ...props, kind: "etiqueta" } }))];
    }) }),
    estilo: (p) => ({ c: PALETA_TZ[(Number(p.color) || 0) % PALETA_TZ.length], r: p.kind === "etiqueta" ? 1 : 0 }),
    etiqueta: (p) => (p.kind === "etiqueta" ? `${p.hora}\n${p.utc.replace(":00", "")}` : ""),
    leyenda: [{ t: "Cada franja es una zona horaria con su hora local actual y su desfase respecto al Tiempo Universal Coordinado (UTC). Donde el país tiene horario de verano se usa su zona oficial (base de datos IANA de tu navegador); en el mar se usa el desfase náutico. Los límites son simplificados: para un lugar exacto consulta la hora oficial del país (en México, el CENAM)." }],
    ficha: (p) => { const v = p.lugares_dst && p.tz ? horaIana(p.tz) : null; return { titulo: `Hora local: ${horaFija(p.zona)}`, chip: p.utc,
      filas: [["Desfase de la franja", `${p.utc} (sin horario de verano)`], ["Lugares", p.lugares || "—"],
        ...(p.lugares_dst ? [["Con horario de verano", p.lugares_dst], ...(v ? [["Hora en esos lugares ahora", `${v.hora} (${v.utc}, referencia ${p.tz})`]] : [])] : [])],
      url: "https://www.timeanddate.com/time/map/", fuente: "Natural Earth; hora calculada en tu navegador" }; },
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
  ...VENTANAS_CRIMEN,
  ...CAPAS_MODALIDADES,
  ...CAPAS_VIAL,
  {
    id: "conflictos_zonas", grupo: "Seguridad y ataques", nombre: "Zonas de conflicto armado: resumen, noticias y videos (lista curada)", noAmenaza: true,
    url: "data/base/conflictos.geojson", refresco_s: 86400, fuente: "Lista curada propia; polígonos de Natural Earth",
    derivar: (fc) => ({ ...fc, features: fc.features.flatMap((f) => [f, ...(f.properties.etiqueta ? [{ type: "Feature", geometry: { type: "Point", coordinates: f.properties.etiqueta },
      properties: { ...f.properties, kind: "etiqueta", opacidad: undefined } }] : [])]) }),
    estilo: (p) => ({ c: p.intensidad === "alta" ? "#B71C1C" : "#E2711D", r: p.kind === "etiqueta" ? 3 : 0 }),
    etiqueta: (p) => (p.kind === "etiqueta" ? p.nombre : ""),
    leyenda: [{ c: "#B71C1C", r: 6, t: "Intensidad alta: guerra abierta, combates diarios o bombardeos" }, { c: "#E2711D", r: 6, t: "Intensidad media: insurgencia, violencia armada sostenida o crimen organizado" },
      { t: "La zona marca los estados o provincias donde se concentran los combates o la violencia; NO indica quién controla el territorio. La ficha trae un resumen de contexto, las noticias recientes del monitor y videos de canales de noticias. Para la violencia registrada en detalle, enciende «Dominio y disputa de grupos armados» (UCDP)." }],
    ficha: (p) => ({ titulo: p.nombre, chip: `Intensidad ${p.intensidad} · desde ${String(p.desde || "").slice(0, 4)}`,
      filas: [["Desde", p.desde || "—"], ["Partes", (p.partes || []).join(" · ") || "—"], ["Contexto", p.resumen || "—"], ...(p.nota_regiones ? [["Nota sobre la zona", p.nota_regiones]] : [])],
      url: "https://ucdp.uu.se/", fuente: "Lista curada del monitor; datos de violencia: UCDP" }),
    extra: (p) => `<div class="conf-extra" data-conf="${esc(p.id)}"><p class="meta">Cargando noticias y videos…</p></div>`,
  },
  {
    id: "zonas_afectadas", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Zonas posiblemente afectadas: estados y provincias con eventos graves (48 h)",
    url: "data/zonas_afectadas.geojson", refresco_s: 1800, fuente: "Eventos del monitor (medios y fuentes oficiales) + Natural Earth admin-1",
    estilo: (p) => ({ c: p.sev_max >= 5 ? "#6A1B9A" : p.sev_max >= 4 ? "#C62828" : "#E2711D", r: 0 }),
    leyenda: [{ c: "#6A1B9A", r: 6, t: "Algún evento de severidad 5 (extrema)" }, { c: "#C62828", r: 6, t: "Severidad 4 (alta)" }, { c: "#E2711D", r: 6, t: "Severidad 3 (media)" },
      { t: "Se marca el estado o provincia que la nota NOMBRA (o donde caen sus coordenadas). Es una aproximación: no quiere decir que todo el estado esté afectado. Sin señales automáticas de GDELT ni redes sociales. Los polígonos oficiales (cono de huracán, tsunami, MeteoAlarm) están en sus capas." }],
    ficha: (p) => ({ titulo: `${p.nombre}${p.iso3 ? ` (${p.iso3})` : ""}`, chip: `${p.n_eventos} evento(s) · severidad máxima ${p.sev_max}`,
      filas: [["Posible afectación por", lista(p.temas).map(([t, n]) => `${t} (${n})`).join(" · ") || "—"],
        ["Cómo se detectó", p.motivo === "la nota nombra" ? "Las notas nombran este estado o provincia" : p.motivo || "—"],
        ["División", p.tipo || "estado o provincia"], ["Ventana", "Últimas 48 h, severidad 3 a 5"],
        ["Ojo", "Es una aproximación: que una nota nombre el estado no significa que todo el estado esté afectado. Lee las notas."]],
      url: lista(p.eventos)[0]?.url, fuente: "Abre la nota más grave; las demás van abajo" }),
    extra: (p) => `<h4>Eventos que la marcan</h4><ul class="fuentes">${lista(p.eventos).map((e) => `<li><span class="sev sev-${e.severidad}">${e.severidad}</span> <b>${esc(e.tema || "")}</b> · <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a> · ${esc(e.fuente || "")} · ${esc(fecha(e.fecha_utc))}${e.por_que ? `<br><span class="meta">Por qué se marca: ${esc(e.por_que)}</span>` : ""}</li>`).join("")}</ul>`,
  },
  {
    id: "emergencias_aereas", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Aviones en emergencia: squawk 7700, 7600 y 7500 (últimas 6 h)",
    url: "data/vivos/emergencias_aereas.geojson", refresco_s: 600, fuente: "adsb.lol (ODbL) y OpenSky Network",
    estilo: (p) => (p.kind === "rastro" ? { c: "#C62828", r: 0 } : { c: p.squawk === "7500" ? "#6A1B9A" : p.squawk === "7700" ? "#C62828" : "#E2711D", r: p.activo ? 10 : 7 }),
    etiqueta: (p) => (p.kind === "avion" ? `${p.indicativo || p.matricula || p.hex} · ${p.squawk}` : ""),
    leyenda: [{ ic: "✈️", t: "7700: emergencia general (falla técnica, médica, combustible…)" }, { c: "#E2711D", r: 6, t: "7600: falla de radio" },
      { ic: "🚨", t: "7500: interferencia ilícita (posible secuestro)" }, { c: "#C62828", r: 3, t: "Rastro desde que se detectó el código" },
      { t: "El código lo pone la tripulación en el transpondedor. Puede ser un error o una prueba: confirma con la aerolínea, la autoridad o la prensa. Se conserva 6 h tras la última señal. Se excluyen aeronaves que pidieron privacidad (PIA/LADD)." }],
    ficha: (p) => (p.kind === "rastro" ? { titulo: `Rastro de ${p.indicativo || p.hex}`, chip: `Squawk ${p.squawk}`, filas: [], url: `https://globe.adsb.lol/?icao=${p.hex}`, fuente: "adsb.lol" } : {
      titulo: `${p.indicativo || p.matricula || p.hex}${p.tipo_av ? ` · ${p.tipo_av}` : ""}`, chip: `Squawk ${p.squawk}: ${p.codigo_texto}${p.activo ? "" : " · ya no transmite el código"}`,
      filas: [["Códigos vistos", lista(p.codigos).join(", ") || p.squawk], ["Matrícula", p.matricula || "—"], ["Altitud", p.en_tierra ? "en tierra" : `${Number(p.alt_m || 0).toLocaleString("es-MX")} m`],
        ["Velocidad", `${p.vel_kmh || 0} km/h`], ["Detectado", fecha(p.primera_vez)], ["Última señal", fecha(p.ultima_vez)], ...(p.emergencia ? [["Tipo declarado (ADS-B)", p.emergencia]] : []),
        ["Fuente", p.fuente]], url: p.url, fuente: "adsb.lol (sigue el vuelo en su mapa)" }),
    extra: (p) => (p.kind === "avion" ? htmlEscucharAvion(p) : ""),
  },
  {
    id: "avisos_nauticos", grupo: "Emergencias, zonas afectadas y transporte", nombre: "Avisos náuticos de seguridad: piratería, minas, barcos a la deriva, GPS (NGA)",
    url: "data/vivos/avisos_nauticos.geojson", refresco_s: 1800, fuente: "NGA Maritime Safety Information (radioavisos NAVAREA)",
    estilo: (p) => ({ c: { pirateria: "#6A1B9A", minas_misiles: "#C62828", rescate: "#E2711D", gnss: "#1F6FB2", militar_espacial: "#8D6E63" }[p.categoria] || C.gris, r: 6 }),
    leyenda: [{ ic: "🏴‍☠️", t: "Piratería, robo armado o ataque" }, { ic: "💣", t: "Minas, misiles o explosivos" }, { ic: "🛟", t: "Embarcación a la deriva, naufragio o búsqueda y rescate" },
      { ic: "📡", t: "Interferencia de GPS / GNSS" }, { ic: "🎯", t: "Tiro, ejercicios militares, cohetes o restos espaciales" },
      { t: "Avisos de radio vigentes para navegantes (NAVAREA IV y XII, HYDROLANT, HYDROPAC, HYDROARC). La antigua base de piratería ASAM de la NGA ya no está disponible; los incidentes que reporta UKMTO llegan por las noticias (subcategoría «Incidentes marítimos»)." }],
    ficha: (p) => ({ titulo: `${p.categoria_texto} · aviso ${p.id}`, chip: p.zona, filas: [["Emitido", p.emitido || "—"], ["Autoridad", p.autoridad || "—"], ["Texto del aviso (inglés)", p.texto]],
      url: p.url, fuente: "NGA Maritime Safety Information (dominio público)" }),
    extra: (p) => htmlRadioNautica(p),
  },
  {
    id: "trafico_maritimo", grupo: MAR, nombre: "Barcos en puertos y estrechos: cuántos hay y cómo cambia (AIS, cada hora)", noAmenaza: true,
    url: "data/vivos/trafico_maritimo.geojson", refresco_s: 1800, fuente: "Conteo propio con la señal AIS de AISStream",
    estilo: (p) => ({ c: p.vs_promedio == null ? C.gris : p.vs_promedio >= 1.3 ? C.rojo : p.vs_promedio >= 1.1 ? C.naranja : p.vs_promedio <= 0.7 ? "#1F6FB2" : C.verde,
      r: Math.min(14, 4 + Math.sqrt(p.total || 0) / 2) }),
    etiqueta: (p) => (p.total ? String(p.total) : ""),
    leyenda: [{ c: C.rojo, r: 8, t: "30 % o más barcos que su promedio de 30 días (posible congestión o espera)" }, { c: C.naranja, r: 7, t: "10 a 29 % arriba del promedio" },
      { c: C.verde, r: 6, t: "Normal" }, { c: "#1F6FB2", r: 6, t: "30 % o más por debajo del promedio (menos tráfico)" },
      { t: "Barcos con AIS dentro de un radio de cada puerto grande y de cada estrecho. AISStream recibe sobre todo de antenas en tierra: compara cada lugar consigo mismo en el tiempo, no un lugar contra otro." }],
    ficha: (p) => ({ titulo: p.nombre, chip: `${p.total} barcos${p.vs_promedio != null ? ` · ${Math.round(p.vs_promedio * 100)} % de su promedio` : ""}`,
      filas: [["Tipo", p.tipo === "estrecho" ? "Estrecho o paso estratégico" : "Puerto"], ["Radio contado", `${p.radio_km} km`],
        ["Detenidos (menos de 1 nudo: fondeados o atracados)", p.detenidos], ["De carga", p.carga], ["Tanqueros", p.tanquero],
        ["Promedio de 30 días", p.promedio_30d], ["Actualizado", fecha(p.actualizado_utc)]],
      url: "https://aisstream.io/", fuente: "AISStream (conteo propio)" }),
    extra: (p) => K.barras((p.serie || []).slice(-168).map(([t, n]) => [t, n]), { titulo: "Barcos contados (últimos 7 días, cada hora)", unidad: "barcos" }),
  },
  {
    id: "gfw_apagados", grupo: MAR, nombre: "Barcos que apagaron su AIS a propósito 12 h o más (Global Fishing Watch, 14 días)",
    url: "data/vivos/gfw_apagados.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, eventos de huecos de AIS",
    estilo: (p) => ({ c: p.horas >= 24 * 7 ? "#4A148C" : p.horas >= 72 ? "#8E4FD1" : "#B39DDB", r: p.horas >= 72 ? 6 : 4 }),
    leyenda: [{ c: "#B39DDB", r: 4, t: "Apagado de 12 a 71 h" }, { c: "#8E4FD1", r: 6, t: "De 3 a 6 días" }, { c: "#4A148C", r: 6, t: "Una semana o más" },
      { t: "El punto es donde el barco dejó de transmitir. Global Fishing Watch lo marca como intencional cuando había buena recepción y aun así se apagó. Es una señal para investigar (pesca ilegal, contrabando, evasión de sanciones), no una prueba: también se apaga por seguridad ante piratas." }],
    ficha: (p) => ({ titulo: p.nombre || `Barco MMSI ${p.mmsi}`, chip: `AIS apagado ${p.horas} h`,
      filas: [["MMSI", p.mmsi || "—"], ["Bandera", p.bandera || "—"], ["Tipo", p.tipo || "—"], ["Se apagó", fecha(p.apagado_utc)], ["Se volvió a encender", fecha(p.encendido_utc)],
        ["Distancia entre ambos puntos", `${p.distancia_km} km`], ["Velocidad implícita", `${p.vel_implicita_nudos} nudos`],
        ["Reapareció en", p.lat_encendido != null ? `${p.lat_encendido.toFixed(2)}, ${p.lon_encendido.toFixed(2)}` : "—"], ["Ojo", "Señal de alerta, no prueba de un delito"]],
      url: GF.enlaceGfw(p), fuente: "Global Fishing Watch (CC BY-NC 4.0)" }),
    extra: (p) => (p.horas >= 72 ? GF.htmlRevision([p]) : ""),
  },
  {
    id: "gfw_encuentros", grupo: MAR, nombre: "Encuentros entre barcos en el mar: posibles transbordos (Global Fishing Watch, 14 días)",
    url: "data/vivos/gfw_encuentros.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, eventos de encuentro",
    estilo: (p) => ({ c: p.riesgo ? C.rojo : p.transbordo ? C.naranja : C.cian, r: p.riesgo || p.transbordo ? 6 : 4 }),
    leyenda: [{ c: C.rojo, r: 6, t: "Global Fishing Watch lo marca con riesgo potencial" }, { c: C.naranja, r: 6, t: "Transbordo: pesquero con buque de carga refrigerada" },
      { c: C.cian, r: 4, t: "Otro encuentro (por ejemplo, abastecimiento de combustible)" },
      { t: "Dos barcos juntos varias horas a baja velocidad lejos de puerto. El transbordo en alta mar es legal con permiso, pero también es la vía para mezclar pesca ilegal o mover carga sin pasar por puerto." }],
    ficha: (p) => { const b = (x) => [x.nombre || "sin nombre", x.mmsi && `MMSI ${x.mmsi}`, x.bandera, x.tipo].filter(Boolean).join(" · ");
      return { titulo: p.transbordo ? "Posible transbordo en el mar" : "Encuentro entre barcos", chip: p.riesgo ? "Riesgo potencial (GFW)" : `${p.horas ?? "—"} h juntos`,
        filas: [["Barco 1", b(p.barco_a || {})], ["Barco 2", b(p.barco_b || {})], ["Inicio", fecha(p.inicio_utc)], ["Fin", fecha(p.fin_utc)], ["Horas juntos", p.horas ?? "—"],
          ["Distancia a la costa", p.dist_costa_km != null ? `${Math.round(p.dist_costa_km)} km` : "—"], ["Ojo", "Señal para investigar, no prueba de un delito"]],
        url: "https://globalfishingwatch.org/map", fuente: "Global Fishing Watch (CC BY-NC 4.0)" }; },
    extra: (p) => GF.htmlRevision([p.barco_a, p.barco_b]),
  },
  {
    id: "gfw_merodeo", grupo: MAR, nombre: "Buques de carga refrigerada merodeando en el mar: posible espera para transbordo (Global Fishing Watch, 14 días)",
    url: "data/vivos/gfw_merodeo.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, eventos de merodeo",
    estilo: (p) => ({ c: p.alerta ? C.rojo : p.alta_mar ? C.naranja : "#E0A100", r: p.horas >= 72 ? 6 : 4 }),
    leyenda: [{ c: C.rojo, r: 6, t: "El buque tiene algo en su revisión (lista IUU, banderas, pesca en áreas protegidas)" }, { c: C.naranja, r: 6, t: "En alta mar (fuera de toda zona económica)" },
      { c: "#E0A100", r: 4, t: "Dentro de la zona económica de algún país" },
      { t: "Un buque de carga refrigerada casi quieto horas o días lejos de puerto: así esperan a los pesqueros para recibir su captura. Es legal con permiso; en alta mar es donde menos vigilancia hay. Puntos más grandes: 3 días o más." }],
    ficha: (p) => ({ titulo: p.nombre || `Buque MMSI ${p.mmsi}`, chip: `Merodeando ${p.horas} h`,
      filas: [["MMSI", p.mmsi || "—"], ["Bandera", p.bandera || "—"], ["Tipo", p.tipo || "—"], ["Inicio", fecha(p.inicio_utc)], ["Fin", fecha(p.fin_utc)],
        ["Velocidad media", `${p.vel_media_nudos} nudos`], ["Distancia a la costa", `${p.dist_costa_km} km`], ["Zona", p.alta_mar ? "Alta mar" : "Zona económica de un país"],
        ["Ojo", "Señal para investigar, no prueba de un delito"]],
      url: GF.enlaceGfw(p), fuente: "Global Fishing Watch (CC BY-NC 4.0)" }),
    extra: (p) => GF.htmlRevision([p]),
  },
  {
    id: "gfw_pesca_mx", grupo: MAR, nombre: "Pesca en aguas de México: barcos extranjeros y en áreas protegidas sin pesca (Global Fishing Watch, 14 días)",
    url: "data/vivos/gfw_pesca_mx.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, eventos de pesca aparente",
    estilo: (p) => ({ c: p.anp_sin_pesca ? C.violeta : p.extranjero ? C.rojo : p.alerta ? C.naranja : "#5B8DB8", r: p.anp_sin_pesca || p.extranjero ? 6 : 3 }),
    leyenda: [{ c: C.violeta, r: 6, t: "Dentro de un área natural protegida donde no se permite pescar" }, { c: C.rojo, r: 6, t: "Barco de bandera extranjera" },
      { c: C.naranja, r: 4, t: "Barco mexicano con algo en su revisión" }, { c: "#5B8DB8", r: 3, t: "Barco mexicano" },
      { t: "«Pesca aparente»: Global Fishing Watch infiere por el movimiento del AIS que el barco estaba pescando. Un barco extranjero puede pescar en la zona económica de México solo con permiso (Ley General de Pesca y Acuacultura Sustentables). Muchos pesqueros pequeños no llevan AIS: no aparecen aquí." }],
    ficha: (p) => ({ titulo: p.nombre || `Barco MMSI ${p.mmsi}`, chip: p.anp_sin_pesca ? "En área protegida sin pesca" : p.extranjero ? `Bandera extranjera: ${p.bandera}` : "Pesca aparente",
      filas: [["MMSI", p.mmsi || "—"], ["Bandera", p.bandera || "sin dato"], ["Tipo", p.tipo || "—"], ["Inicio", fecha(p.inicio_utc)], ["Fin", fecha(p.fin_utc)],
        ["Horas", p.horas ?? "—"], ["Autorización pública", p.autorizacion || "—"], ["Ojo", "Pesca inferida por el movimiento; confirma con CONAPESCA o SEMAR"]],
      url: GF.enlaceGfw(p), fuente: "Global Fishing Watch (CC BY-NC 4.0)" }),
    extra: (p) => (p.extranjero || p.anp_sin_pesca || p.revision ? GF.htmlRevision([p]) : ""),
  },
  {
    id: "gfw_puertos_mx", grupo: MAR, nombre: "Puertos de México: visitas de barcos de pesca, carga refrigerada y apoyo (Global Fishing Watch, 14 días)", noAmenaza: true,
    url: "data/vivos/gfw_puertos_mx.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, visitas a puerto",
    estilo: (p) => ({ c: p.con_alerta ? C.rojo : p.extranjeros ? C.naranja : C.cian, r: Math.min(14, 4 + Math.sqrt(p.visitas_total || 0)) }),
    etiqueta: (p) => String(p.visitas_total || ""),
    leyenda: [{ c: C.rojo, r: 8, t: "Llegó al menos un barco con algo en su revisión" }, { c: C.naranja, r: 7, t: "Llegaron barcos de bandera extranjera" }, { c: C.cian, r: 6, t: "Solo barcos mexicanos" },
      { t: "El número es la cantidad de visitas en 14 días. Con el Acuerdo de la FAO sobre Medidas del Estado Rector del Puerto, un puerto puede inspeccionar o negar la entrada a barcos sospechosos de pesca ilegal." }],
    ficha: (p) => ({ titulo: `Puerto: ${p.nombre}`, chip: `${p.visitas_total} visitas · ${p.extranjeros} extranjeras`,
      filas: [["Banderas extranjeras", (p.banderas || []).join(", ") || "ninguna"], ["Barcos con algo en su revisión", p.con_alerta || 0]],
      url: "https://globalfishingwatch.org/map", fuente: "Global Fishing Watch (CC BY-NC 4.0)" }),
    extra: (p) => GF.htmlVisitas(p.visitas),
  },
  {
    id: "gfw_radar_mx", grupo: MAR, nombre: "Barcos vistos por radar satelital sin AIS en aguas de México (Sentinel-1, 30 días)",
    url: "data/vivos/gfw_radar_mx.geojson", refresco_s: 21600, fuente: "Global Fishing Watch, detecciones de radar SAR",
    estilo: (p) => ({ c: p.detecciones >= 10 ? C.rojo : p.detecciones >= 3 ? C.naranja : "#E0A100", r: Math.min(10, 3 + Math.sqrt(p.detecciones || 0) * 1.5) }),
    etiqueta: (p) => (p.detecciones >= 3 ? String(p.detecciones) : ""),
    leyenda: [{ c: C.rojo, r: 8, t: "10 detecciones o más en la celda" }, { c: C.naranja, r: 6, t: "3 a 9" }, { c: "#E0A100", r: 4, t: "1 o 2" },
      { t: "El radar del satélite Sentinel-1 ve barcos de día, de noche y con nubes. Aquí van solo los que no coincidieron con ninguna señal AIS: barcos sin transmisor (muchos legales, como pesca artesanal o barcos de gobierno) o que lo apagaron. Cada punto es una celda de unos 11 km. No hay nombre: el radar no identifica al barco." }],
    ficha: (p) => ({ titulo: "Barcos detectados por radar sin AIS", chip: `${p.detecciones} detecciones`,
      filas: [["Primera detección", fecha(p.primera_utc)], ["Última detección", fecha(p.ultima_utc)], ["Celda", "0.1° (unos 11 km)"],
        ["Ojo", "El radar no identifica al barco; cruza con patrullajes o imágenes ópticas"]],
      url: "https://globalfishingwatch.org/map", fuente: "Global Fishing Watch / Copernicus Sentinel-1" }),
  },
  ...REDES_TREN.map(([red, nombre, nota]) => capaTrenes(red, nombre, nota)),
  ...ANOMALIAS,
  ...ANOMALIAS_POR_TIPO,
  {
    id: "perturbaciones", grupo: "Desastres naturales", nombre: "Perturbaciones tropicales: posible formación de ciclón en 2 y 7 días (NHC)",
    url: "data/vivos/perturbaciones.geojson", refresco_s: 1800, fuente: "NOAA NHC, Perspectiva del Tiempo Tropical",
    estilo: (p) => { const n = p.nivel_7d || p.nivel_2d; return { c: n === "alta" ? "#C62828" : n === "media" ? "#E2711D" : "#F2C230", r: p.kind.startsWith("ubicacion") ? 9 : 0 }; },
    etiqueta: (p) => (p.kind === "ubicacion_7d" && p.prob_7d != null ? `${p.prob_7d} % en 7 días` : ""),
    leyenda: [{ c: "#C62828", r: 6, t: "Probabilidad alta (> 60 %)" }, { c: "#E2711D", r: 6, t: "Media (40–60 %)" }, { c: "#F2C230", r: 6, t: "Baja (< 40 %)" },
      { t: "Antes de tener nombre, un sistema es una perturbación (tormentas desorganizadas u onda tropical). El punto es su ubicación actual; el área sombreada, donde podría formarse un ciclón en 7 días; la línea, hacia dónde se movería. Cubre Atlántico, Caribe, Golfo y Pacífico oriental y central. El JTWC (Pacífico occidental e Índico) no permite consultas automáticas." }],
    ficha: (p) => ({ titulo: `Perturbación tropical${p.cuenca ? ` · ${p.cuenca}` : ""}`, chip: `48 h: ${p.prob_2d ?? "—"} % · 7 días: ${p.prob_7d ?? "—"} %`,
      filas: [["Elemento", { ubicacion_2d: "Ubicación actual", ubicacion_7d: "Ubicación actual", region_7d: "Región de posible formación (7 días)", movimiento: "Dirección del movimiento" }[p.kind] || p.kind],
        ["Probabilidad en 48 h", p.prob_2d != null ? `${p.prob_2d} % (${p.nivel_2d})` : "—"], ["Probabilidad en 7 días", p.prob_7d != null ? `${p.prob_7d} % (${p.nivel_7d})` : "—"],
        ["Emitido", p.emitido || "—"]], url: p.url, fuente: p.fuente }),
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
      url: p.url, fuente: "IODA, Georgia Tech (abre su tablero del país)", imagen: { titulo: "Internet outage", ilustrativa: true } }),
    extra: (p) => graficaIoda(lista(p.eventos), p.fin_utc),
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
        ["Estado", p.en_curso ? "Vigente" : "Empieza más tarde"], ["Leído de MeteoAlarm", p.leido_utc ? `${fecha(p.leido_utc)} (se actualiza cada ~20 min; el aviso pudo cambiar)` : "—"]],
      url: p.url, fuente: "MeteoAlarm (EUMETNET): consulta el texto oficial del servicio nacional" }),
  },
  {
    id: "lanzamientos", grupo: "Espacio", nombre: "Próximos lanzamientos de cohetes (plataforma y fecha)", url: "data/vivos/lanzamientos.geojson", refresco_s: 3600,
    fuente: "The Space Devs, Launch Library 2",
    estilo: (p) => ({ c: { Go: "#2E9E6E", "In Flight": "#1F6FB2", Hold: "#E2711D", TBD: "#8D99A6", TBC: "#C9A227" }[p.estado_corto] || "#8D99A6", r: 6 }),
    etiqueta: (p) => (p.estado_corto === "Go" || p.estado_corto === "In Flight" ? (p.cohete || p.nombre || "").split(" ")[0] : ""),
    leyenda: [{ c: "#2E9E6E", r: 6, t: "Confirmado (Go)" }, { c: "#C9A227", r: 6, t: "Por confirmar" }, { c: "#8D99A6", r: 6, t: "Fecha por definir" },
      { c: "#E2711D", r: 6, t: "En espera" }, { c: "#1F6FB2", r: 6, t: "En vuelo" }, { t: "Varias misiones pueden compartir plataforma: el punto más cercano es el siguiente. Las fechas cambian seguido." }],
    ficha: (p) => ({ titulo: p.nombre, chip: p.estado,
      filas: [["Fecha prevista", `${p.fecha_utc ? fecha(p.fecha_utc) : "—"}${p.precision ? ` (precisión: ${p.precision})` : ""}`], ["Cohete", p.cohete || "—"],
        ["Empresa o agencia", `${p.empresa || "—"}${p.tipo_empresa ? ` · ${p.tipo_empresa}` : ""}`], ["Misión", [p.mision, p.tipo_mision, p.orbita].filter(Boolean).join(" · ") || "—"],
        ["Plataforma", `${p.plataforma || "—"}${p.lugar ? ` · ${p.lugar}` : ""}`]],
      url: p.url, fuente: "The Space Devs, Launch Library 2" }),
  },
  {
    id: "neo", grupo: "Espacio", nombre: "Asteroides que pasan cerca de la Tierra (próximos 30 días, menos de 19.5 distancias lunares)", noAmenaza: true,
    url: "data/vivos/neo.geojson", refresco_s: 21600, fuente: "NASA/JPL CNEOS y Horizons",
    estilo: (p) => ({ c: p.dist_ld < 1 ? "#C62828" : p.dist_ld < 5 ? "#E2711D" : "#C9A227", r: p.dist_ld < 1 ? 8 : p.dist_ld < 5 ? 6 : 5 }),
    etiqueta: (p) => `${p.des} · ${p.dist_ld} DL`,
    leyenda: [{ c: "#C62828", r: 8, t: "Pasa más cerca que la Luna (< 1 DL)" }, { c: "#E2711D", r: 6, t: "1 a 5 distancias lunares" }, { c: "#C9A227", r: 5, t: "5 a 19.5 distancias lunares" },
      { t: "El punto es el lugar de la Tierra que tendrá el objeto en el cenit en su máximo acercamiento (cambia de lugar con la rotación). Toca uno para ver su trayectoria. Ninguno va a chocar: son pasos calculados." }],
    ficha: (p) => ({ titulo: p.nombre, chip: `${p.dist_ld} distancias lunares`, filas: K.filasNeo(p), url: p.url, fuente: "NASA/JPL (Close-Approach Data y Horizons)" }),
    extra: (p) => K.svgTrayectoria(p),
  },
  {
    id: "cielo", grupo: "Espacio", nombre: "Lluvias de estrellas y cometas visibles: desde dónde se ven", noAmenaza: true,
    url: "data/vivos/cielo.geojson", refresco_s: 21600, fuente: "IMO (lluvias), COBS y NASA/JPL Horizons (cometas), USNO (Luna y eclipses)",
    complementar: async (fc) => { let cal = null; try { cal = await getJSON("data/vivos/cielo_calendario.json", { bust: true }); } catch { /* sin calendario */ }
      return { ...fc, features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, calendario: cal } })) }; },
    // Las franjas cubren casi todo el planeta: se dibujan solo sus bordes (líneas), para no tapar los clics de otras capas.
    derivar: (fc) => ({ ...fc, features: fc.features.map((f) => (f.geometry.type !== "Polygon" ? f : { ...f, properties: { ...f.properties, opacidad: undefined },
      geometry: { type: "MultiLineString", coordinates: [f.properties.lat_desde, f.properties.lat_hasta].filter((l) => Math.abs(l) < 89.5).map((l) => [[-180, l], [180, l]]) } }))
      .filter((f) => f.geometry.type !== "MultiLineString" || f.geometry.coordinates.length) }),
    estilo: (p) => ({ c: p.kind === "cometa" ? "#1F8A8A" : "#5B6C8F", r: p.etiqueta ? 5 : 0 }),
    etiqueta: (p) => (p.etiqueta ? `${p.kind === "cometa" ? "Cometa" : "Lluvia"} ${p.nombre}${p.kind === "lluvia" ? ` · máx ${p.maximo.slice(5)}` : ` · mag ${p.magnitud}`}` : ""),
    leyenda: [{ c: "#5B6C8F", r: 6, t: "Lluvia de estrellas activa o con máximo en 30 días" }, { c: "#1F8A8A", r: 6, t: "Cometa de magnitud 12 o más brillante" },
      { t: "Cada franja marca las latitudes desde donde se ve (no un punto exacto). La etiqueta solo indica a qué franja pertenece. Toca una para ver fechas, Luna y el calendario de eclipses." }],
    ficha: (p) => ({ titulo: p.nombre, chip: p.kind === "lluvia" ? `Lluvia de estrellas · ZHR ${p.zhr}` : `Cometa · magnitud ${p.magnitud}`, filas: K.filasCielo(p), url: p.url,
      fuente: p.kind === "lluvia" ? "Organización Internacional de Meteoros (IMO)" : "COBS y NASA/JPL Horizons" }),
    extra: (p) => K.htmlCalendario(p.calendario),
  },
  {
    id: "bolidos", grupo: "Espacio", nombre: "Bólidos: meteoros muy brillantes detectados (último año)", noAmenaza: true,
    url: "data/vivos/bolidos.geojson", refresco_s: 86400, fuente: "NASA/JPL CNEOS (Fireball Data)",
    estilo: (p) => ({ c: (p.energia_kt || 0) >= 1 ? "#C62828" : (p.energia_kt || 0) >= 0.3 ? "#E2711D" : "#C9A227", r: 4 + Math.min(8, Math.sqrt((p.energia_kt || 0.05) * 40)) }),
    leyenda: [{ c: "#C9A227", r: 5, t: "Menos de 0.3 kilotones" }, { c: "#E2711D", r: 7, t: "0.3 a 1 kilotón" }, { c: "#C62828", r: 9, t: "1 kilotón o más" },
      { t: "Energía estimada de la explosión en el aire (1 kilotón = 1000 t de TNT)." }],
    ficha: (p) => ({ titulo: `Bólido del ${String(p.fecha_utc || "").slice(0, 10)}`, chip: p.energia_kt != null ? `${p.energia_kt} kt` : "", filas: K.filasBolido(p), url: p.url, fuente: "NASA/JPL CNEOS" }),
  },
  {
    id: "nws", grupo: "Clima y ambiente", nombre: "Alertas meteorológicas de EUA (NWS, en vivo)", url: "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
    // La API rechaza parámetros que no conoce (400 con «t=»): sin anticaché.
    sinAnticache: true, refresco_s: 300, fuente: "NOAA National Weather Service",
    // ~90 % de las alertas no trae polígono, solo condados (códigos SAME = «0» + FIPS): se ubican en su centro.
    complementar: async (fc) => ubicarPorCondados(fc, (await getJSON("config/us_condados.json")).condados),
    estilo: (p) => ({ c: { Extreme: C.violeta, Severe: C.rojo, Moderate: C.naranja, Minor: C.ambar }[p.severity] || C.gris, r: 4 }),
    ficha: (p) => ({ titulo: p.event || "Alerta", chip: `${p.severity || ""} · ${p.urgency || ""}`,
      filas: [["Zonas", (p.areaDesc || "—").slice(0, 300)], ["Vigente hasta", p.expires ? fecha(p.expires) : "—"], ["Resumen", (p.headline || "—").slice(0, 300)],
        ...(p._aprox ? [["Ubicación", `Aproximada: centro de ${p._aprox} condado(s) del aviso (el NWS no publica su polígono)`]] : [])],
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
  {
    id: "aurora_ovation", grupo: "Clima y ambiente", nombre: "Auroras: probabilidad de verla en la próxima hora (modelo OVATION)", noAmenaza: true,
    url: "data/vivos/aurora_ovation.geojson", refresco_s: 1800, fuente: "NOAA SWPC (modelo OVATION)",
    estilo: (p) => ({ c: p.p >= 50 ? "#E74C3C" : p.p >= 30 ? "#F1C40F" : "#2ECC71", r: 2.5 }),
    leyenda: [{ c: "#2ECC71", r: 4, t: "10 a 29 %" }, { c: "#F1C40F", r: 4, t: "30 a 49 %" }, { c: "#E74C3C", r: 4, t: "50 % o más" },
      { t: "Probabilidad de ver aurora en ese punto si el cielo está despejado y oscuro. Se actualiza cada ~30 min." }],
    ficha: (p) => ({ titulo: `Aurora: ${p.p} % de probabilidad`, chip: "modelo OVATION de NOAA",
      filas: [["Qué significa", "Probabilidad de que la aurora se vea en este punto en los próximos 30 a 90 minutos, con cielo despejado y de noche."]],
      url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast", fuente: "NOAA SWPC" }),
  },
  {
    id: "polos_indicadores", grupo: POLOS, nombre: "Indicadores: hielo marino, agujero de ozono y deshielo de Groenlandia", noAmenaza: true, refresco_s: 3600,
    fuente: "NOAA NCEI (NSIDC), NASA Ozone Watch, DMI Polar Portal",
    generar: async () => P.indicadoresFC(await getJSON("data/vivos/polos_indicadores.json", { bust: true })),
    estilo: (p) => ({ c: { hielo_artico: "#1F6FB2", hielo_antartico: "#5DADE2", ozono: "#8E44AD", groenlandia: "#1F8A8A" }[p.kind] || C.gris, r: 9 }),
    etiqueta: (p) => P.etiquetaIndicador(p),
    leyenda: [{ c: "#1F6FB2", r: 6, t: "Hielo marino del Ártico (mes más reciente)" }, { c: "#5DADE2", r: 6, t: "Hielo marino de la Antártida" },
      { c: "#8E44AD", r: 6, t: "Agujero de ozono antártico (diario, de agosto a diciembre)" }, { c: "#1F8A8A", r: 6, t: "Groenlandia: balance de masa y deshielo (diario)" },
      { t: "Toca cada punto para ver su gráfica. Para ver bien los polos usa la vista de globo." }],
    ficha: (p) => ({ titulo: P.NOMBRES[p.kind] || "Indicador polar", chip: P.etiquetaIndicador(p), filas: P.filasIndicador(p),
      url: p.dato?.url || P.URL_FUENTE[p.kind], fuente: p.dato?.fuente || p.fuente }),
    extra: (p) => P.extraIndicador(p),
  },
  {
    id: "polos_icebergs", grupo: POLOS, nombre: "Icebergs antárticos de más de 18 km (semanal)", noAmenaza: true, url: "data/vivos/icebergs.geojson", refresco_s: 21600,
    fuente: "U.S. National Ice Center",
    estilo: (p) => ({ c: "#4FC3F7", r: Math.min(12, 4 + Math.sqrt(p.area_km2 || 0) / 8) }),
    etiqueta: (p) => (p.area_km2 >= 500 ? p.nombre : ""),
    leyenda: [{ c: "#4FC3F7", r: 6, t: "Iceberg (el tamaño del círculo crece con su área)" },
      { t: "La letra dice dónde se desprendió: A = Mar de Weddell (0° a 90° O), B = 90° O a 180°, C = 90° E a 180° (Mar de Ross), D = 0° a 90° E." }],
    ficha: (p) => ({ titulo: `Iceberg ${p.nombre}`, chip: `${(p.area_km2 || 0).toLocaleString("es-MX")} km²`,
      filas: [["Tamaño", `${p.largo_km} × ${p.ancho_km} km`], ["Área", `${(p.area_km2 || 0).toLocaleString("es-MX")} km² (la Ciudad de México mide ~1,500 km²)`],
        ["Posición del", p.actualizado || "—"], ["Por qué importa", "Los icebergs grandes estorban la navegación hacia las bases y, al encallar, pueden cambiar la vida marina de la zona (p. ej. el A23a cerca de Georgia del Sur)."]],
      url: "https://usicecenter.gov/Products/AntarcIcebergs", fuente: "U.S. National Ice Center (lista semanal)" }),
  },
  {
    id: "polos_reclamos", grupo: POLOS, nombre: "Antártida: reclamos territoriales (congelados por el Tratado Antártico)", noAmenaza: true, fuente: "Tratado Antártico (1959); reclamos de cada país",
    generar: async () => P.reclamosAntartida(),
    estilo: (p) => ({ c: p.color, r: 0 }),
    leyenda: [...P.RECLAMOS.filter((r, i, a) => a.findIndex((x) => x[0] === r[0]) === i).map(([pais, , , , color]) => ({ c: color, r: 6, t: pais })),
      { t: "Argentina, Chile y Reino Unido reclaman zonas que se traslapan en la Península Antártica. Ningún otro país reconoce estos reclamos." }],
    ficha: (p) => ({ titulo: `${p.nombre}`, chip: p.pais === "Sin reclamar" ? "Sin reclamar" : `Reclamo de ${p.pais}`,
      filas: [["Meridianos", P.meridianos(p)], ["Latitud", "Al sur de 60° S"], ["Se traslapa con", lista(p.traslapes).join(", ") || "ningún otro reclamo"]],
      url: "https://www.ats.aq/e/antarctictreaty.html", fuente: "Secretaría del Tratado Antártico" }),
    extra: () => `<p class="meta">El Tratado Antártico (1959, en vigor desde 1961) reserva el continente para fines pacíficos y científicos. Su artículo IV
      «congela» los reclamos: no se reconocen ni se niegan, y no se pueden hacer nuevos. El Protocolo de Madrid (1991, en vigor desde 1998) prohíbe la
      minería; a partir de 2048 cualquier parte puede pedir una conferencia para revisarlo, pero la prohibición no vence sola. EUA y Rusia no reclaman
      territorio, pero se reservan el derecho de hacerlo.</p>`,
  },
  {
    id: "polos_sitios", grupo: POLOS, nombre: "Bases científicas polares y sitios estratégicos de Groenlandia", noAmenaza: true, url: "data/vivos/polos_sitios.geojson", refresco_s: 86400,
    fuente: "Wikidata (CC0); descripciones propias",
    estilo: (p) => ({ c: p.kind === "base" && p.region === "Antártida" ? "#3A7CA5" : p.kind === "base" ? "#1F8A8A" : "#B9770E", r: 5 }),
    etiqueta: (p) => (p.region === "Groenlandia" ? p.nombre : ""),
    leyenda: [{ ic: "🔬", t: "Base o estación científica (Antártida o Ártico)" }, { ic: "⛏️", t: "Yacimiento minero" }, { ic: "✈️", t: "Aeropuerto (antiguas bases de EUA)" },
      { ic: "⚓", t: "Puerto" }, { ic: "🏛️", t: "Capital" }, { ic: "🧊", t: "Glaciar o fiordo" }, { t: "Solo instalaciones; nunca personas." }],
    ficha: (p) => ({ titulo: p.nombre, chip: p.region,
      filas: [...(p.pais ? [["País que la opera", p.pais]] : []), ...(p.desde ? [["Desde", p.desde]] : []), ...(p.nota ? [["Por qué importa", p.nota]] : [])],
      url: p.url, fuente: "Wikidata" }),
  },
  {
    id: "polos_rutas", grupo: POLOS, nombre: "Rutas marítimas del Ártico (trazo esquemático)", noAmenaza: true, fuente: "Trazo propio por los estrechos principales",
    generar: async () => P.rutasArticas(),
    estilo: (p) => ({ c: p.color, r: 0 }),
    leyenda: P.RUTAS.map(([nombre, color]) => ({ c: color, r: 4, t: nombre })).concat([{ t: "Trazo aproximado: sirve para ver por dónde pasan, no para navegar." }]),
    ficha: (p) => ({ titulo: p.nombre, chip: "trazo esquemático", filas: [["Recorrido", p.nota]],
      url: "https://www.imo.org/en/OurWork/Safety/Pages/polar-code.aspx", fuente: "OMI: Código Polar (reglas para barcos en aguas polares)" }),
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

/** Bloque de 30 min (UTC) en que LiveATC archiva el audio: «15-oct-2026, 04:30–05:00 UTC». */
export function bloqueLiveATC(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(Math.floor(t / 1800000) * 1800000), f = new Date(d.getTime() + 1800000);
  const hm = (x) => `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getUTCDate()}-${meses[d.getUTCMonth()]}-${d.getUTCFullYear()}, ${hm(d)}–${hm(f)} UTC`;
}

/** Dónde escuchar la radio de un avión en emergencia: frecuencias de guardia, LiveATC de los aeropuertos cercanos y búsquedas. */
export function htmlEscucharAvion(p) {
  const aps = lista(p.aeropuertos);
  const id = p.indicativo || p.matricula || "";
  const enlace = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
  return `<h4>🎧 Escuchar la frecuencia</h4>
    <ul class="fuentes">
      <li><b>121.5 MHz</b>: frecuencia internacional de emergencia (guardia) que escuchan torres, centros de control y otros aviones; <b>243.0 MHz</b> es la militar.
        La tripulación suele hablar en la frecuencia del centro de control o de la torre donde está; ahí declara «MAYDAY» o «PAN-PAN».</li>
      ${aps.length ? aps.map((a) => `<li>${enlace(`https://www.liveatc.net/search/?icao=${encodeURIComponent(a[0])}`, `${a[0]} · ${a[1]}`)} <span class="meta">a ${a[2]} km: frecuencias y audio en LiveATC, si un voluntario lo retransmite</span></li>`).join("")
        : `<li class="meta">Sin aeropuertos grandes a menos de 400 km (vuelo sobre el mar o zona remota): puede estar en una frecuencia oceánica de HF sin retransmisión pública.</li>`}
      ${p.primera_vez ? `<li>Archivo de LiveATC: busca el bloque de <b>${esc(bloqueLiveATC(p.primera_vez))}</b> (cuando se detectó el código). LiveATC guarda bloques de 30 min por ~30 días.</li>` : ""}
      ${id ? `<li>${enlace(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${id} ATC emergency`)}`, `Grabaciones publicadas de ${id} (búsqueda en YouTube)`)} · ${enlace(`https://news.google.com/search?q=${encodeURIComponent(`${id} emergencia OR emergency`)}`, "Noticias")}</li>` : ""}
    </ul>
    <p class="meta">LiveATC depende de receptores de voluntarios: cubre bien EUA, Canadá y parte de Europa y América Latina, no todos los aeropuertos. El monitor solo enlaza; no descarga ni guarda audio.</p>`;
}

/** Canales y frecuencias de radio que menciona un aviso náutico («VHF CH 16», «2182 KHZ», «NAVTEX»…). */
export function frecuenciasEnTexto(texto) {
  const t = String(texto || "").toUpperCase();
  const out = new Set();
  for (const m of t.matchAll(/\b(?:VHF\s*)?(?:CH(?:ANNEL)?|CANAL)\.?\s*(\d{1,2})\b/g)) out.add(`VHF canal ${Number(m[1])}`);
  for (const m of t.matchAll(/\b(\d{1,5}(?:[.,]\d{1,3})?)\s*(KHZ|MHZ)\b/g)) out.add(`${m[1].replace(",", ".")} ${m[2] === "KHZ" ? "kHz" : "MHz"}`);
  for (const k of ["NAVTEX", "INMARSAT", "SAFETYNET", "DSC", "EPIRB", "AIS", "SART"]) if (new RegExp(`\\b${k}\\b`).test(t)) out.add(k);
  return [...out];
}

/** Por qué radio llegan los avisos náuticos y qué frecuencias menciona este. */
export function htmlRadioNautica(p) {
  const fr = frecuenciasEnTexto(p.texto);
  return `<h4>📻 Radio y frecuencias</h4>
    ${fr.length ? `<p>Mencionadas en el aviso: ${fr.map((x) => `<span class="chip">${esc(x)}</span>`).join(" ")}</p>` : `<p class="meta">El aviso no menciona frecuencias ni canales.</p>`}
    <ul class="fuentes">
      <li><b>Avisos NAVAREA y HYDRO</b>: se transmiten como texto por <b>SafetyNET</b> (satélite Inmarsat) y radiotélex en HF, no como voz.</li>
      <li><b>NAVTEX</b>: avisos costeros en texto por <b>518 kHz</b> (inglés) y <b>490 kHz</b> (idioma local), hasta ~400 millas náuticas de la costa.</li>
      <li><b>Voz</b>: emergencias y llamadas de socorro por <b>VHF canal 16 (156.8 MHz)</b> y <b>2182 kHz</b>; llamada digital (DSC) por el <b>canal 70</b>.</li>
      <li>Para escuchar en vivo onda corta y NAVTEX desde el navegador: <a href="http://websdr.ewi.utwente.nl:8901/" target="_blank" rel="noopener noreferrer">WebSDR de la Universidad de Twente</a> (receptor en Países Bajos). No existe un archivo público del audio de cada aviso.</li>
    </ul>`;
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

/** MapLibre entrega como texto JSON las propiedades que eran objetos o listas; se devuelven a su forma original. */
export function desanidar(props) {
  const out = { ...props };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && /^[[{]/.test(v)) { try { const o = JSON.parse(v); if (o && typeof o === "object") out[k] = o; } catch (e) { /* texto normal */ } }
  }
  return out;
}

/**
 * Gráfica de las últimas 48 h de un corte de internet: una franja por señal de IODA (BGP, sondeos, tráfico de Google)
 * con los tramos en que cada una detectó la caída. Se dibuja con los eventos que ya trae el dato; no se pide nada más.
 */
export function graficaIoda(eventos, finUtc, ahora = Date.now()) {
  const ev = (eventos || []).filter((e) => e && e.inicio_utc && Number.isFinite(Date.parse(e.inicio_utc)));
  if (!ev.length) return "";
  const H = 48 * 3600e3, t0 = ahora - H, W = 300;
  const senales = [...new Set(ev.map((e) => e.senal || "señal"))];
  const x = (t) => Math.max(0, Math.min(W, ((t - t0) / H) * W));
  const filas = senales.map((sn, i) => {
    const y = 6 + i * 22;
    const barras = ev.filter((e) => (e.senal || "señal") === sn).map((e) => {
      const ini = Date.parse(e.inicio_utc), fin = e.horas != null ? ini + Number(e.horas) * 3600e3 : ahora;
      const a = x(ini), b = Math.max(a + 2, x(fin));
      return `<rect x="${a.toFixed(1)}" y="${y}" width="${(b - a).toFixed(1)}" height="14" rx="3" fill="#C62828"><title>${esc(sn)}: ${esc(fecha(e.inicio_utc))}, ${esc(String(e.horas ?? "?"))} h</title></rect>`;
    }).join("");
    return `<text x="0" y="${y + 11}" font-size="10" fill="currentColor">${esc(sn)}</text><g transform="translate(70 0)"><rect x="0" y="${y}" width="${W}" height="14" rx="3" fill="currentColor" opacity=".08"/>${barras}</g>`;
  }).join("");
  const alto = 6 + senales.length * 22 + 14;
  return `<figure class="graf-ioda"><svg viewBox="0 0 ${W + 72} ${alto}" role="img" aria-label="Tramos de caída por señal en las últimas 48 horas">${filas}
      <g transform="translate(70 ${alto - 4})" font-size="9" fill="currentColor" opacity=".7"><text x="0">hace 48 h</text><text x="${W / 2}" text-anchor="middle">hace 24 h</text><text x="${W}" text-anchor="end">ahora</text></g></svg>
    <figcaption>Gráfica propia con los datos de IODA: en rojo, cuándo cada señal detectó la caída${finUtc ? "" : " (sigue en curso)"}.</figcaption></figure>`;
}

export function htmlRiesgo(capa, props0, geom) {
  const props = desanidar(props0);
  const f = capa.ficha(props, geom);
  const colorChip = f.chip ? colorDeNivel(f.chip) : null;
  // Capas informativas (idiomas, creadores, husos horarios…): sin severidad ni aviso de Protección Civil.
  const sev = props._sev && !capa.noAmenaza ? SEVERIDADES.find(([n]) => n === props._sev) : null;
  return `<h3 id="ficha-titulo">${esc(f.titulo || capa.nombre)}</h3>
    <div class="fecha">${esc(capa.noAmenaza ? capa.nombre : props._tipo || capa.nombre)}</div>
    <div class="chips">${props._nuevo ? `<span class="chip nuevo">NUEVO</span>` : ""}${sev ? `<span class="chip sev-${sev[0]}">Severidad ${sev[0]}/5 · ${esc(sev[1])}</span>` : ""}
      ${f.chip ? `<span class="chip ${capa.senal ? "alerta" : ""}"${colorChip ? ` style="background:${colorChip};color:${textoSobre(colorChip)};border-color:${colorChip}"` : ""}>${esc(f.chip)}</span>` : ""}</div>
    ${huecoImagen(f.imagen)}${htmlImagenMedio(props.image || props.imagen, props.source || f.fuente, props.url || f.url)}
    <dl>${f.filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
      <dt>Fuente</dt><dd>${f.url ? `<a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a>` : esc(f.fuente)}</dd></dl>
    ${capa.extra ? capa.extra(props, geom) : ""}
    ${capa.senal ? `<p class="meta">Señal detectada en cobertura noticiosa y ubicada de forma aproximada: no es un incidente confirmado. Verifica en la fuente y con autoridades locales.</p>` : ""}
    <p class="meta">${capa.pie ? esc(capa.pie) : `${capa.archivos ? `Capa integrada desde <a href="${ORIGEN.url}" target="_blank" rel="noopener noreferrer">${esc(ORIGEN.nombre)}</a>. ` : ""}${capa.noAmenaza ? "" : "No sustituye a Protección Civil ni a los avisos oficiales."}`}</p>`;
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
  let ultimo, vacio = null;
  for (const base of BASES) {
    try {
      const d = await getJSON(base + nombre, { bust: true });
      // Una copia vacía (la fuente falló en la última corrida) no tapa a la siguiente base que sí tenga datos.
      if (Array.isArray(d?.features) && !d.features.length) { vacio ??= d; continue; }
      return d;
    } catch (e) { ultimo = e; }
  }
  if (vacio) return vacio;
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
  constructor(map, { onObjeto, onCambio = () => {}, onNuevas = () => {}, ctx = {} }) {
    this.map = map; this.onObjeto = onObjeto; this.onCambio = onCambio; this.onNuevas = onNuevas; this.ctx = ctx;
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
    else if (capa.url) fc = await getJSON(capa.url, { bust: !capa.sinAnticache });
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
    if (r.nuevas.size && !capa.noAmenaza) {
      this.#arrancarPulso();
      this.onNuevas(r.nuevas.size, gj.features.some((f) => r.nuevas.has(f.properties._k) && (f.properties._sev || 0) >= 4));
    }
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
    if (capa.noAmenaza) return out;  // anomalías: no son amenazas
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

  #filtroBase(capaId = "") {
    if (CAPAS.find((c) => c.id === capaId.replace(/^rg-/, "").replace(/-[a-z]+$/, ""))?.noAmenaza) return ["all"];
    const f = ["all", [">=", ["coalesce", ["get", "_sev"], 1], this.filtro.sevMin]];
    if (this.filtro.pais) f.push(["==", ["get", "_pais"], this.filtro.pais]);
    if (this.filtro.tipo) f.push(["==", ["get", "_tipo"], this.filtro.tipo]);
    return f;
  }

  #filtroDe(capaId) {
    const base = this.#filtroBase(capaId);
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
      layout: { "text-field": ["get", "_lbl"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", ...layoutEtiqueta(m) },
      paint: pinturaEtiqueta() }, antes);
    // Zona de toque invisible (10 px) para elegir puntos pequeños (focos de incendio, ciudades) con facilidad.
    m.addLayer({ id: `${src}-toque`, type: "circle", source: src, filter: this.#filtroDe(`${src}-toque`), paint: { "circle-radius": 10, "circle-opacity": 0, "circle-stroke-width": 0 } }, antes);
    // Clic: punto > línea o borde > interior de un polígono (antes, el interior de un estado no respondía al toque).
    for (const l of [`${src}-toque`, `${src}-linea`, `${src}-area`]) {
      m.on("click", l, (e) => {
        if (l.endsWith("-linea") && m.queryRenderedFeatures(e.point, { layers: [`${src}-toque`] }).length) return;  // el punto gana a la línea
        if (l.endsWith("-area") && m.queryRenderedFeatures(e.point, { layers: [`${src}-toque`, `${src}-linea`] }).length) return;
        // El interior de una zona grande (p. ej. la franja de un frente) no tapa los puntos ni las líneas de otras capas.
        if (l.endsWith("-area") && m.queryRenderedFeatures(e.point).some((x) => x.layer.id.startsWith("rg-") && !x.layer.id.startsWith(`${src}-`)
          && (x.layer.id.endsWith("-toque") || (x.layer.id.endsWith("-linea") && !/Polygon/.test(x.geometry.type))))) return;
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
