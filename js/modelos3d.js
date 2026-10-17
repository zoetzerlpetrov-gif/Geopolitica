// Qué modelo 3D corresponde a cada elemento del mapa (avión, barco, satélite, presa, central, volcán, tornado, ciclón,
// tormenta, sismo, incendio, cohete). Solo decide forma, colores y parámetros; el dibujo vive en js/visor3d.js, que se
// descarga (con three.js) la primera vez que alguien abre un modelo. Todo es ilustrativo: no es el objeto real ni está a escala.
import { esc } from "./util.js";

// Colores aproximados de la cola por código OACI de la aerolínea (solo color; sin logotipos ni marcas).
export const COLA_AEROLINEA = {
  AMX: "#0B2343", VOI: "#A12B8F", VIV: "#00A04A", UAL: "#1B3A6B", AAL: "#8C98A4", DAL: "#B3122E", SWA: "#304CB2", JBU: "#003876",
  ASA: "#01426A", AVA: "#DA291C", LAN: "#1B0088", TAM: "#1B0088", CMP: "#0032A0", IBE: "#D7192D", AFR: "#002157", BAW: "#1B2C5D",
  DLH: "#05164D", KLM: "#00A1DE", UAE: "#C8102E", QTR: "#5C0632", ACA: "#D22630", ANA: "#13448F", JAL: "#CC0000", CPA: "#006564",
  SIA: "#1F2A44", THY: "#C70A0C", ETD: "#BD8B13", AAY: "#F7A800", NKS: "#FFE600", FFT: "#0A6B3B", WJA: "#00A3AD", ARG: "#5FA9DD",
  FDX: "#4D148C", UPS: "#351C15", GTI: "#1E3D7B", CLX: "#004B8D", RYR: "#073590", EZY: "#FF6600", VLG: "#FFCC00", AEA: "#0066B3",
};
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
  return COLA_AEROLINEA[String(indicativo || "").trim().toUpperCase().slice(0, 3)] || "#2B4C7E";
}

const FORMA_BUQUE = { carga: "carga", tanqueros: "tanquero", pasaje: "pasaje", pesca: "pesca", militares: "militar", vela_recreo: "vela",
  remolque_servicio: "remolcador", sancionados: "tanquero", otros: "carga" };
const FORMA_SAT = { estaciones: "estacion", starlink: "plano", oneweb: "plano", telescopios: "telescopio" };
const NIVEL_VOLCAN = { verde: 1, amarillo: 3, naranja: 4, rojo: 5, green: 1, yellow: 3, orange: 4, red: 5 };
const AVISO = "Representación ilustrativa generada por el monitor: no es el objeto real ni está a escala.";

/**
 * Contexto del clic → modelo {tipo, forma, titulo, nota, …} o null si no hay modelo para ese elemento.
 * fuente: "aeronave" | "buque" | "satelite" | "entidad" | "riesgo".
 */
export function modeloPara(c) {
  if (!c) return null;
  if (c.fuente === "aeronave") {
    if (c.subtipo === "aviacion_general") return null; // aviación general: sin imagen ni modelo (privacidad)
    const forma = formaAvion(c.tipo_av, c.cat, c.subtipo);
    return { tipo: "avion", forma, cola: colaAerolinea(c.indicativo, c.subtipo), titulo: `${c.indicativo || "Avión"}${c.tipo_av ? ` · ${c.tipo_av}` : ""}`,
      nota: `${AVISO} Forma según el tipo de avión${c.tipo_av ? ` (${c.tipo_av})` : ""}; color de cola aproximado de la aerolínea, sin logotipos.` };
  }
  if (c.fuente === "buque") {
    return { tipo: "barco", forma: FORMA_BUQUE[c.subtipo] || "carga", titulo: c.nombre || "Barco", nota: `${AVISO} Forma según el tipo de barco.` };
  }
  if (c.fuente === "satelite") {
    return { tipo: "satelite", forma: FORMA_SAT[c.st] || "comun", titulo: c.nombre || "Satélite", nota: `${AVISO} Forma genérica del grupo del satélite.` };
  }
  if (c.fuente === "entidad") {
    const st = String(c.st || "");
    const forma = st.startsWith("presa_") || st === "central_hidro" ? "presa" : st === "central_nuclear" || st === "instalaciones_nucleares" ? "nuclear"
      : st === "central_eolica" ? "eolica" : st === "central_solar" ? "solar" : st.startsWith("volcanes") ? "volcan" : null;
    if (!forma) return null;
    return { tipo: forma, hidro: st === "presa_hidro" || st === "central_hidro", nivel: 1, titulo: c.nombre || "Instalación", nota: `${AVISO} Modelo genérico del tipo de instalación.` };
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

/** Botón para la ficha, o "" si no hay modelo. */
export function botonModelo(c) {
  const m = modeloPara(c);
  return m ? `<p><button type="button" class="btn-3d" data-modelo3d="${esc(JSON.stringify(m))}">🧊 Ver modelo 3D animado</button></p>` : "";
}
