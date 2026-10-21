// Qué modelo 3D corresponde a cada elemento del mapa (vehículos, instalaciones y fenómenos). Solo decide forma, colores y
// parámetros; el dibujo vive en js/mapa3d.js, que se descarga (con three.js) la primera vez que se dibuja un modelo sobre el
// mapa. Todo es ilustrativo: no es el objeto real.
import { esc } from "./util.js";

// Colores aproximados de la cola por código OACI de la aerolínea (solo color; sin logotipos ni marcas).
export const COLA_AEROLINEA = {
  AMX: "#0B2343", VOI: "#A12B8F", VIV: "#00A04A", UAL: "#1B3A6B", AAL: "#8C98A4", DAL: "#B3122E", SWA: "#304CB2", JBU: "#003876",
  ASA: "#01426A", AVA: "#DA291C", LAN: "#1B0088", TAM: "#1B0088", CMP: "#0032A0", IBE: "#D7192D", AFR: "#002157", BAW: "#1B2C5D",
  DLH: "#05164D", KLM: "#00A1DE", UAE: "#C8102E", QTR: "#5C0632", ACA: "#D22630", ANA: "#13448F", JAL: "#CC0000", CPA: "#006564",
  SIA: "#1F2A44", THY: "#C70A0C", ETD: "#BD8B13", AAY: "#F7A800", NKS: "#FFE600", FFT: "#0A6B3B", WJA: "#00A3AD", ARG: "#5FA9DD",
  FDX: "#4D148C", UPS: "#351C15", GTI: "#1E3D7B", CLX: "#004B8D", RYR: "#073590", EZY: "#FF6600", VLG: "#FFCC00", AEA: "#0066B3",
  SLI: "#0B2343", VIR: "#DA0530", WZZ: "#C6007E", TAP: "#E20613", ITY: "#0046AD", SAS: "#000F6E", NAX: "#D81939", FIN: "#0B1560",
  PGT: "#FDC300", SVA: "#006C35", ELY: "#003A80", MSR: "#00265D", ETH: "#078930", KQA: "#E31837", SAA: "#00205B", RAM: "#C1272D",
  AIC: "#E31837", IGO: "#001B94", CCA: "#E60012", CES: "#0B3D91", CSN: "#0072CE", KAL: "#00A5E5", QFA: "#E0001B", ANZ: "#111111",
  GLO: "#FF6A00", AZU: "#003B71", LPE: "#1B0088", DHK: "#FFCC00", BCS: "#FFCC00", EWG: "#7A1E5A", SWR: "#E2001A", AUA: "#E2001A",
  TRA: "#00C060", TVF: "#00C060",
};
// Sin aerolínea conocida: cola gris neutra (antes era azul y se confundía con la de United).
const COLA_NEUTRA = "#9AA3AD";
const QUATRIMOTOR = /^(A38|B74|A34|IL96|A124)/;
const ANCHO = /^(A3[035]|A38|B7[4-8]|IL96|A124|C17|C5M|A400|B52)/;
const REGIONAL = /^(E1[79]|E2|E[57]|CRJ|SU95|BCS|E19|E29|E75|ARJ)/;
const TURBOHELICE = /^(AT[4-7]|DH8|SF34|C130|D328|SB20|AN26|C295|CN35|Q400)/;
const HELICOPTERO = /^(H1|H6|EC|AS3|AS5|S76|S92|B06|B407|B412|A139|A169|AW1|UH|MI8|CH47|H47|H60|NH90)/;
const CAZA = /^(F1[5-8]|F35|F22|EUFI|RFAL|SU[23]|MG29|J10|F5|FA18|A10|T38|GRIF|M2000|JF17)/;

/** Forma del avión por su tipo OACI y su categoría ADS-B (A7 = helicóptero). */
export function formaAvion(tipo, categoria, subtipo) {
  const t = String(tipo || "").toUpperCase();
  if (categoria === "A7" || HELICOPTERO.test(t)) return "helicoptero";
  if (CAZA.test(t) || (subtipo === "militar" && categoria === "A6")) return "caza";
  if (QUATRIMOTOR.test(t)) return "ancho4";
  if (ANCHO.test(t) || categoria === "A5") return "ancho";
  if (TURBOHELICE.test(t)) return "turbohelice";
  if (REGIONAL.test(t)) return "regional";
  return "angosto";
}

export function colaAerolinea(indicativo, subtipo) {
  if (subtipo === "militar" || subtipo === "estado") return "#4B5560";
  return COLA_AEROLINEA[String(indicativo || "").trim().toUpperCase().slice(0, 3)] || COLA_NEUTRA;
}

const FORMA_BUQUE = { carga: "carga", tanqueros: "tanquero", pasaje: "pasaje", pesca: "pesca", militares: "militar", vela_recreo: "vela",
  remolque_servicio: "remolcador", sancionados: "tanquero", otros: "carga" };
// Subtipo de las capas (o «familia:…») → [tipo de modelo, variante, cómo se nombra]. El primero que coincida gana.
const TIPO_INSTALACION = [
  [/^presa_|^central_hidro$/, "presa", "", "presa"],
  [/^central_nuclear$|^nuclear_operacion$|^instalaciones_nucleares$/, "nuclear", "", "central nuclear"],
  [/^nuclear_cerrada$/, "nuclear", "cerrada", "central nuclear cerrada"],
  [/^nuclear_construccion$/, "nuclear", "construccion", "central nuclear en construcción"],
  [/^reactor_investigacion$/, "nuclear", "investigacion", "reactor de investigación"],
  [/^central_eolica$/, "eolica", "", "parque eólico"],
  [/^central_solar$/, "solar", "", "planta solar"],
  [/^central_carbon$/, "termica", "carbon", "central de carbón"],
  [/^central_(gas|petroleo)$/, "termica", "gas", "central térmica"],
  [/^central_(residuos|biomasa|otros)$/, "termica", "biomasa", "central térmica"],
  [/^central_geotermica$/, "termica", "geotermica", "central geotérmica"],
  [/^central_almacenamiento$/, "termica", "baterias", "almacenamiento de energía"],
  [/^industria_pesada$/, "termica", "industria", "industria pesada"],
  [/^datacenter_|^semiconductores$/, "datacenter", "", "centro de datos"],
  [/^aeropuerto_internacional$/, "aeropuerto", "grande", "aeropuerto"],
  [/^aeropuerto_regional$|^aerodromo$/, "aeropuerto", "chico", "aeropuerto"],
  [/^helipuerto$/, "aeropuerto", "helipuerto", "helipuerto"],
  [/^puerto_espacial$/, "cohete", "puerto", "puerto espacial"], // antes que /^puerto_/: no es un puerto de barcos
  [/^puerto_/, "puerto", "", "puerto"],
  [/^farma_/, "farma", "", "planta farmacéutica"],
  [/^campo_petrolero$|^energia_yacimientos$/, "petroleo", "", "campo petrolero"],
  [/^campo_gas$/, "petroleo", "gas", "campo de gas"],
  [/^plataforma_marina$/, "plataforma", "", "plataforma marina"],
  [/^cruce_fronterizo$/, "frontera", "", "cruce fronterizo"],
  [/^desaladora$/, "desaladora", "", "planta desaladora"],
  [/^mineria$/, "mina", "", "mina"],
  [/^volcanes/, "volcan", "", "volcán"],
  [/^ductos_gas$/, "flujo", "gas", "gasoducto"],
  [/^ductos_/, "flujo", "petroleo", "oleoducto"],
  [/^ferrocarril_/, "flujo", "tren", "vía férrea"],
  [/^autopista$|^carretera_troncal$/, "flujo", "autos", "carretera"],
];
// Modelos alrededor de los cuales se levantan los edificios reales de OpenStreetMap.
const REAL_OSM = new Set(["aeropuerto", "puerto", "nuclear", "termica", "datacenter", "farma", "desaladora", "frontera"]);
const FORMA_SAT = { estaciones: "estacion", starlink: "plano", oneweb: "plano", telescopios: "telescopio" };
const NIVEL_VOLCAN = { verde: 1, amarillo: 3, naranja: 4, rojo: 5, green: 1, yellow: 3, orange: 4, red: 5 };
const AVISO = "Representación ilustrativa generada por el monitor: no es el objeto real.";

/**
 * Contexto del clic → modelo {tipo, forma, titulo, nota, …} o null si no hay modelo para ese elemento.
 * fuente: "aeronave" | "buque" | "satelite" | "entidad" | "riesgo".
 */
export function modeloPara(c) {
  if (!c) return null;
  if (c.fuente === "aeronave") {
    if (c.subtipo === "aviacion_general") return null; // aviación general: sin imagen ni modelo (privacidad)
    const forma = formaAvion(c.tipo_av, c.cat, c.subtipo);
    return { tipo: "avion", forma, cola: colaAerolinea(c.indicativo, c.subtipo), rumbo: Number(c.rumbo) || 0, alt_m: Number(c.alt_m) || 0, titulo: `${c.indicativo || "Avión"}${c.tipo_av ? ` · ${c.tipo_av}` : ""}`,
      nota: `${AVISO} Tamaño exagerado para que se vea; va a su altitud y rumbo de la última señal. Forma según el tipo de avión${c.tipo_av ? ` (${c.tipo_av})` : ""}; color de cola aproximado de la aerolínea, sin logotipos.` };
  }
  if (c.fuente === "buque") {
    return { tipo: "barco", forma: FORMA_BUQUE[c.subtipo] || "carga", rumbo: Number(c.rumbo) || 0, titulo: c.nombre || "Barco", nota: `${AVISO} Tamaño exagerado para que se vea; rumbo de la última señal. Forma según el tipo de barco.` };
  }
  if (c.fuente === "satelite") {
    return { tipo: "satelite", forma: FORMA_SAT[c.st] || "comun", alt_m: (Number(c.alt) || 550) * 1000, titulo: c.nombre || "Satélite", nota: `${AVISO} Tamaño muy exagerado; está a su altitud real sobre el punto de la Tierra que tiene debajo. Forma genérica del grupo.` };
  }
  if (c.fuente === "entidad") {
    const st = String(c.st || ""), fam = String(c.familia || "");
    const t = TIPO_INSTALACION.find(([re]) => re.test(st) || re.test(`familia:${fam}`));
    if (!t) return null;
    const [, tipo, variante = "", que = "instalación"] = t;
    if (tipo === "flujo") return { tipo, variante, titulo: c.nombre || que, nota: `Flujo animado sobre el trazo real de ${que} (ilustrativo: no es el flujo medido).` };
    return { tipo, variante, hidro: st === "presa_hidro" || st === "central_hidro", nivel: 1, titulo: c.nombre || que,
      nota: `${AVISO} Modelo genérico de ${que}${REAL_OSM.has(tipo) ? "; los edificios grises alrededor son los reales de OpenStreetMap (forma y altura registradas)" : ""}${tipo === "aeropuerto" ? "; los aviones despegan sobre la pista real si OpenStreetMap la tiene" : ""}.` };
  }
  if (c.fuente === "riesgo") {
    const p = c.props || {};
    switch (c.capa) {
      case "sismos":
        if (p._enjambre || p._tsunami_radio || p.mag == null) return null;
        return { tipo: "sismo", mag: Number(p.mag), titulo: p.place || "Sismo", nota: `${AVISO} La sacudida crece con la magnitud (M${Number(p.mag).toFixed(1)}).` };
      case "ciclones": {
        if (p.layer !== "storm") return null;
        const kt = Number(p.intensity_kt || p.wind_kt || 0);
        const cat = kt >= 137 ? 5 : kt >= 113 ? 4 : kt >= 96 ? 3 : kt >= 83 ? 2 : kt >= 64 ? 1 : 0;
        return { tipo: "ciclon", cat, sur: Number(c.lat) < 0, titulo: p.name || p.storm_name || "Ciclón",
          nota: `${AVISO} Giro ${Number(c.lat) < 0 ? "horario (hemisferio sur)" : "antihorario (hemisferio norte)"}; más bandas y giro más rápido con más categoría.` };
      }
      case "volcanes": {
        // Semáforo de CENAPRED o código de aviación de USGS (mismo criterio que la capa de volcanes).
        const nivel = NIVEL_VOLCAN[String(p.semaforo || p.codigo_aviacion || "").toLowerCase().split(/\s/)[0]] || (p.ash_active ? 3 : 1);
        return { tipo: "volcan", nivel, titulo: p.name || "Volcán", nota: `${AVISO} La actividad dibujada sigue el nivel de alerta, no una observación en vivo.` };
      }
      case "severo":
        if (/TORNADO|TROMBA|WATERSPOUT/i.test(p.kind || "")) return { tipo: "tornado", agua: /TROMBA|WATERSPOUT/i.test(p.kind), titulo: p.title || "Tornado", nota: `${AVISO} Señal de noticias: verifica con la fuente.` };
        return { tipo: "tormenta", titulo: p.title || "Tormenta", nota: `${AVISO} Señal de noticias: verifica con la fuente.` };
      case "incendios":
        return { tipo: "incendio", titulo: "Incendio activo", nota: `${AVISO} Foco detectado por satélite; el avance dibujado es ilustrativo.` };
      case "lanzamientos":
        return { tipo: "cohete", titulo: p.nombre || "Lanzamiento", nota: `${AVISO} Cohete genérico, no el modelo de la misión.` };
      default:
        return null;
    }
  }
  return null;
}

/** Nota en la ficha cuando el modelo se dibujó en el mapa (con botón para quitarlo). */
export function notaModelo(m) {
  return m ? `<p class="meta nota-3d">🧊 ${esc(m.nota || "")} <button type="button" class="icon-btn" id="quitar-3d">Quitar del mapa</button></p>` : "";
}
