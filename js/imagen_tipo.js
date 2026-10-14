// Imagen representativa del TIPO de avión, buque, tren o satélite en su ficha (no es la unidad real).
// Sale de la imagen principal del artículo de Wikipedia en inglés del modelo o tipo; solo se aceptan imágenes de
// Wikimedia Commons (licencia libre), con crédito y enlace a la página del archivo. Se consulta en el navegador al
// abrir la ficha y no se guarda nada en el sitio.
import { getJSON } from "./util.js";

// Designador de tipo OACI (ADS-B «t», p. ej. B738) → artículo. Primera regla que coincide.
const AVIONES = [
  [/^B3[789X]M$/, "Boeing 737 MAX"], [/^B73[6-9]$/, "Boeing 737 Next Generation"], [/^B73[345]$/, "Boeing 737 Classic"], [/^B73[12]$/, "Boeing 737"],
  [/^B748$/, "Boeing 747-8"], [/^B74/, "Boeing 747-400"], [/^B75/, "Boeing 757"], [/^B76/, "Boeing 767"], [/^B77[89]$/, "Boeing 777X"], [/^B77/, "Boeing 777"],
  [/^B78/, "Boeing 787 Dreamliner"], [/^B712$/, "Boeing 717"], [/^B72/, "Boeing 727"], [/^B70/, "Boeing 707"],
  [/^A[12][019]N$/, "Airbus A320neo family"], [/^A3(18|19|20|21)$/, "Airbus A320 family"], [/^BCS[13]$/, "Airbus A220"],
  [/^A33[89]$/, "Airbus A330neo"], [/^A337$/, "Airbus Beluga XL"], [/^A33/, "Airbus A330"], [/^A34/, "Airbus A340"], [/^A35/, "Airbus A350"],
  [/^A38/, "Airbus A380"], [/^A30/, "Airbus A300"], [/^A310$/, "Airbus A310"], [/^A400$/, "Airbus A400M Atlas"],
  [/^E29[05]$/, "Embraer E-Jet E2 family"], [/^E(17|19)[05]$|^E75[LS]$/, "Embraer E-Jet family"], [/^E(135|145|35L|45X)$/, "Embraer ERJ family"],
  [/^E50P$/, "Embraer Phenom 100"], [/^E55P$/, "Embraer Phenom 300"], [/^E120$/, "Embraer EMB 120 Brasilia"], [/^E110$/, "Embraer EMB 110 Bandeirante"],
  [/^CRJ[79X]$/, "Bombardier CRJ700 series"], [/^CRJ[12]$/, "Bombardier CRJ100/200"], [/^DH8/, "De Havilland Canada Dash 8"],
  [/^AT7/, "ATR 72"], [/^AT4/, "ATR 42"], [/^SF34$/, "Saab 340"], [/^SB20$/, "Saab 2000"], [/^SU95$/, "Sukhoi Superjet 100"],
  [/^MD11$/, "McDonnell Douglas MD-11"], [/^MD8/, "McDonnell Douglas MD-80"], [/^MD90$/, "McDonnell Douglas MD-90"], [/^DC10$/, "McDonnell Douglas DC-10"],
  [/^IL76$/, "Ilyushin Il-76"], [/^AN12$/, "Antonov An-12"], [/^A124$/, "Antonov An-124 Ruslan"], [/^AN26$/, "Antonov An-26"],
  [/^C30J$/, "Lockheed Martin C-130J Super Hercules"], [/^C130$/, "Lockheed C-130 Hercules"], [/^C17$/, "Boeing C-17 Globemaster III"],
  [/^C5M?$/, "Lockheed C-5 Galaxy"], [/^K35R$/, "Boeing KC-135 Stratotanker"], [/^KC46?$/, "Boeing KC-46 Pegasus"], [/^E3[TC]F$/, "Boeing E-3 Sentry"],
  [/^P8$/, "Boeing P-8 Poseidon"], [/^F16$/, "General Dynamics F-16 Fighting Falcon"], [/^F18/, "McDonnell Douglas F/A-18 Hornet"],
  [/^F35$/, "Lockheed Martin F-35 Lightning II"], [/^EUFI$/, "Eurofighter Typhoon"], [/^H60$/, "Sikorsky UH-60 Black Hawk"], [/^V22$/, "Bell Boeing V-22 Osprey"],
  [/^GLF[456]$|^GA[56]C$/, "Gulfstream G650"], [/^C25[ABC]$|^C525$/, "Cessna CitationJet"], [/^C56X$/, "Cessna Citation Excel"],
  [/^C68A$/, "Cessna Citation Latitude"], [/^C172$/, "Cessna 172"], [/^C182$/, "Cessna 182 Skylane"], [/^C152$/, "Cessna 152"], [/^C208$/, "Cessna 208 Caravan"],
  [/^PC12$/, "Pilatus PC-12"], [/^P28[ABRU]$/, "Piper PA-28 Cherokee"], [/^SR2[02]$/, "Cirrus SR22"], [/^B350$/, "Beechcraft Super King Air"],
  [/^BE(20|9L|30)$/, "Beechcraft King Air"], [/^LJ\d\d$/, "Learjet 45"], [/^CL3[05]$/, "Bombardier Challenger 300"], [/^CL60$/, "Bombardier Challenger 600 series"],
  [/^GL(EX|5T|7T)$/, "Bombardier Global Express"], [/^FA[78]X$/, "Dassault Falcon 7X"], [/^F900$/, "Dassault Falcon 900"], [/^F2TH$/, "Dassault Falcon 2000"],
  [/^EC35$/, "Eurocopter EC135"], [/^EC45$/, "Eurocopter EC145"], [/^AS50$/, "Eurocopter AS350 Écureuil"], [/^R44$/, "Robinson R44"], [/^R22$/, "Robinson R22"],
  [/^B06$/, "Bell 206"], [/^B407$/, "Bell 407"], [/^A139$/, "AgustaWestland AW139"], [/^S76$/, "Sikorsky S-76"],
];
const AVION_GENERICO = { civil_comercial: "Airliner", carga: "Cargo aircraft", aviacion_general: "General aviation", militar: "Military aircraft",
  estado: "Airliner", en_tierra: "Airliner", sancionada: "Airliner" };

/** Avión: por su designador de tipo OACI; si no se conoce, por categoría ADS-B (A7 = helicóptero) o subtipo. */
export function articuloAvion(tipo, subtipo, cat) {
  const t = String(tipo || "").toUpperCase().trim();
  const r = t && AVIONES.find(([re]) => re.test(t));
  if (r) return { titulo: r[1], exacto: true };
  if (String(cat || "").toUpperCase() === "A7") return { titulo: "Helicopter", exacto: false };
  return { titulo: AVION_GENERICO[subtipo] || "Airliner", exacto: false };
}

// Tipo AIS (ITU-R M.1371) exacto → artículo; si no, por decena; si no, por subtipo del sitio.
const BUQUE_AIS = { 30: "Fishing vessel", 31: "Tugboat", 32: "Tugboat", 33: "Dredging", 34: "Diving support vessel", 35: "Warship", 36: "Sailboat", 37: "Yacht",
  50: "Pilot boat", 51: "Lifeboat (rescue)", 52: "Tugboat", 53: "Ship's tender", 55: "Patrol boat", 58: "Hospital ship" };
const BUQUE_DECENA = { 4: "High-speed craft", 6: "Passenger ship", 7: "Cargo ship", 8: "Oil tanker" };
const BUQUE_SUBTIPO = { carga: "Cargo ship", pasaje: "Passenger ship", tanqueros: "Oil tanker", vela_recreo: "Sailboat", pesca: "Fishing vessel",
  militares: "Warship", remolque_servicio: "Tugboat", sancionados: "Oil tanker", otros: "Ship" };
export function articuloBuque(subtipo, tipoAis) {
  const n = Number(tipoAis) || 0;
  return { titulo: BUQUE_AIS[n] || BUQUE_DECENA[Math.floor(n / 10)] || BUQUE_SUBTIPO[subtipo] || "Ship", exacto: false };
}

// Satélite por nombre (los más conocidos), luego por grupo. Nunca se busca el nombre libre: daría artículos equivocados.
const SATELITES = [
  [/^ISS\b|ZARYA/, "International Space Station"], [/^CSS\b|TIANHE/, "Tiangong space station"], [/^HST$|HUBBLE/, "Hubble Space Telescope"],
  [/STARLINK/, "Starlink"], [/ONEWEB/, "OneWeb"], [/IRIDIUM/, "Iridium satellite constellation"], [/NAVSTAR|^GPS\b/, "GPS Block IIF"],
  [/GLONASS/, "GLONASS-M"], [/GALILEO|^GSAT0\d/, "Galileo (satellite navigation)"], [/BEIDOU/, "Satellite navigation"],
  [/^(FLOCK|DOVE)/, "Planet Labs"], [/SKYSAT/, "Planet Labs"], [/^GOES/, "Geostationary Operational Environmental Satellite"], [/METEOSAT|^MSG/, "Meteosat"],
  [/^METOP/, "MetOp"], [/HIMAWARI/, "Himawari 8"], [/FENGYUN|^FY-/, "Fengyun"], [/^NOAA \d+/, "NOAA-19"], [/^SUOMI NPP|^NPP$/, "Suomi NPP"],
  [/LANDSAT/, "Landsat 9"], [/SENTINEL-1/, "Sentinel-1"], [/SENTINEL-2/, "Sentinel-2"], [/SENTINEL-3/, "Sentinel-3"], [/SENTINEL-6/, "Sentinel-6 Michael Freilich"],
  [/^TERRA$/, "Terra (satellite)"], [/^AQUA$/, "Aqua (satellite)"], [/TESS\b/, "Transiting Exoplanet Survey Satellite"], [/SWIFT\b/, "Neil Gehrels Swift Observatory"],
  [/FERMI/, "Fermi Gamma-ray Space Telescope"], [/CHANDRA/, "Chandra X-ray Observatory"], [/ R\/B$|ROCKET BODY/, "Multistage rocket"], [/ DEB$|DEBRIS/, "Space debris"],
];
const SAT_GRUPO = { estaciones: "Space station", gnss: "Satellite navigation", starlink: "Starlink", oneweb: "OneWeb", iridium: "Iridium satellite constellation",
  observacion: "Earth observation satellite", planet: "Planet Labs", cientificos: "Satellite", meteorologicos_eo: "Weather satellite",
  geoestacionarios: "Communications satellite", militares: "Military satellite", visibles: "Satellite", telescopios: "Space telescope", satnogs: "CubeSat" };
// El subtipo puede llegar como grupo de CelesTrak (así lo guarda la capa).
const GRUPO_CELESTRAK = { stations: "estaciones", "iridium-NEXT": "iridium", resource: "observacion", science: "cientificos", weather: "meteorologicos_eo",
  geo: "geoestacionarios", military: "militares", visual: "visibles" };
export function articuloSatelite(nombre, subtipo) {
  const n = String(nombre || "").toUpperCase();
  const r = SATELITES.find(([re]) => re.test(n));
  return r ? { titulo: r[1], exacto: true } : { titulo: SAT_GRUPO[GRUPO_CELESTRAK[subtipo] || subtipo] || "Satellite", exacto: false };
}

// Tren: por red y categoría (las flotas de cada red son pocas; se muestra el servicio, no la unidad).
export function articuloTren(red, categoria, tipo) {
  if (categoria === "Carga") return { titulo: "Freight train", exacto: false };
  const t = { irlanda: /DART/i.test(tipo || "") ? "Dublin Area Rapid Transit" : "IE 22000 Class", boston: "MBTA Commuter Rail",
    filadelfia: "SEPTA Regional Rail", noruega: "Rail transport in Norway", finlandia: categoria === "Larga distancia" ? "VR Class Sm3" : "Helsinki commuter rail" }[red];
  return { titulo: t || "Passenger train", exacto: false };
}

/** Todos los artículos posibles (para comprobar que existen y tienen imagen libre). */
export function todosLosArticulos() {
  return [...new Set([...AVIONES.map((r) => r[1]), ...Object.values(AVION_GENERICO), "Helicopter", ...Object.values(BUQUE_AIS), ...Object.values(BUQUE_DECENA),
    ...Object.values(BUQUE_SUBTIPO), "Ship", ...SATELITES.map((r) => r[1]), ...Object.values(SAT_GRUPO), "Satellite", "Freight train", "Dublin Area Rapid Transit",
    "IE 22000 Class", "MBTA Commuter Rail", "SEPTA Regional Rail", "Rail transport in Norway", "VR Class Sm3", "Helsinki commuter rail", "Passenger train"])];
}

/** URL de miniatura de Commons (upload. o thumb.wikimedia.org) → página del archivo (para la licencia y el autor). Otras (no libres) → null. */
export function paginaCommons(src) {
  const m = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(String(src || ""));
  return m ? `https://commons.wikimedia.org/wiki/File:${m[1]}` : null;
}

const cache = new Map();
/** Imagen principal del artículo (REST summary de Wikipedia, con CORS). null si no hay o no es de Commons. */
export function cargarImagen(titulo) {
  if (!cache.has(titulo)) {
    cache.set(titulo, getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.replace(/ /g, "_"))}`)
      .then((d) => {
        const src = d?.thumbnail?.source;
        const archivo = paginaCommons(src);
        return archivo ? { src, ancho: d.thumbnail.width, alto: d.thumbnail.height, archivo, articulo: d.content_urls?.desktop?.page, titulo: d.title || titulo } : null;
      }).catch(() => null));
  }
  return cache.get(titulo);
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Hueco en la ficha que `rellenarImagenes` completa. */
export const huecoImagen = (ref) => (ref ? `<figure class="img-tipo" data-img-tipo="${escH(ref.titulo)}" data-exacto="${ref.exacto ? 1 : 0}"></figure>` : "");

export function htmlImagen(img, exacto) {
  return `<a href="${escH(img.archivo)}" target="_blank" rel="noopener noreferrer"><img src="${escH(img.src)}" alt="${escH(img.titulo)}" loading="lazy" decoding="async"
      width="${Number(img.ancho) || ""}" height="${Number(img.alto) || ""}"></a>
    <figcaption>${exacto ? "Modelo" : "Tipo"}: <a href="${escH(img.articulo)}" target="_blank" rel="noopener noreferrer">${escH(img.titulo)}</a>.
      Imagen representativa, no es esta unidad. <a href="${escH(img.archivo)}" target="_blank" rel="noopener noreferrer">Autor y licencia en Wikimedia Commons</a>.</figcaption>`;
}

/** Completa los huecos de imagen dentro de `raiz` (si falla la consulta, el hueco se quita). */
export async function rellenarImagenes(raiz) {
  for (const fig of raiz?.querySelectorAll?.("figure[data-img-tipo]:not([data-listo])") || []) {
    fig.dataset.listo = "1";
    const img = await cargarImagen(fig.dataset.imgTipo);
    if (!fig.isConnected) continue;
    if (img) fig.innerHTML = htmlImagen(img, fig.dataset.exacto === "1"); else fig.remove();
  }
}
