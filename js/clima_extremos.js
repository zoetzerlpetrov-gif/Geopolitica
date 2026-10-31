// Calor y frío extremos, UV, niebla y anticiclones en altura: colores, etiquetas y filas de las fichas (funciones puras,
// probadas en tests/js). Datos: data/vivos/calor_frio.geojson (tools/clima/calor.py) y data/vivos/anticiclones.geojson
// (tools/clima/anticiclones.py). Todo es estimación propia; los avisos oficiales en México son del SMN.
import { tempCF } from "./util.js";

export const COLOR_CALOR = ["#8D99A6", "#E0A100", "#E2711D", "#C62828", "#6A1B9A"];
export const COLOR_FRIO = ["#8D99A6", "#7FB3D5", "#2E86C1", "#1B2F8E"];
export const COLOR_UV = [[11, "#7B2D8E", "Extremo (11+)"], [8, "#C62828", "Muy alto (8 a 10)"], [6, "#E2711D", "Alto (6 y 7)"],
  [3, "#E0A100", "Moderado (3 a 5)"], [0, "#3DA35D", "Bajo (0 a 2)"]];
export const COLOR_ANTICICLON = { alta: "#B9770E", domo: "#C62828", bloqueo: "#6C3483" };
const NIVEL_CALOR = ["Sin onda de calor", "Onda de calor (precaución)", "Onda de calor (precaución extrema)", "Onda de calor (peligro)", "Onda de calor (peligro extremo)"];
const NIVEL_FRIO = ["Sin frío extremo", "Helada", "Ola de frío", "Ola de frío con heladas"];

const fecha = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const tramos = (l) => (l || []).map((t) => `${fecha(t.inicio)} a ${fecha(t.fin)} (${t.dias} días)`).join("; ");

export const colorUV = (uv) => (COLOR_UV.find(([u]) => (uv ?? 0) >= u) || COLOR_UV[COLOR_UV.length - 1])[1];
export const nivelCalor = (n) => NIVEL_CALOR[n || 0] || NIVEL_CALOR[0];
export const nivelFrio = (n) => NIVEL_FRIO[n || 0] || NIVEL_FRIO[0];

/** Severidad del índice de calor (NWS): 0 sin riesgo, 1 precaución, 2 precaución extrema, 3 peligro, 4 peligro extremo. */
export const catIndiceCalor = (ic) => (ic == null || ic < 27 ? 0 : ic >= 51 ? 4 : ic >= 39 ? 3 : ic >= 32 ? 2 : 1);

export function filasCalor(p) {
  return [["Onda de calor", p.onda_calor ? tramos(p.calor_tramos) : "No en los próximos 7 días"],
    ["Índice de calor máximo (lo que siente el cuerpo)", p.indice_calor_max_c != null ? `${tempCF(p.indice_calor_max_c)}${p.indice_calor_cat ? ` · ${p.indice_calor_cat}` : ""}` : "—"],
    ["Umbral de calor de este lugar", p.climatologia ? "Promedio de la máxima de ese día del año (1991-2020) + 5 °C, y al menos 30 °C" : "35 °C (aún sin climatología de este lugar)"]];
}

export function filasFrio(p) {
  return [["Ola de frío", p.ola_frio ? tramos(p.frio_tramos) : "No en los próximos 7 días"],
    ["Heladas (mínima de 0 °C o menos)", (p.heladas || []).length ? p.heladas.map(fecha).join(", ") : "No"],
    ["Umbral de frío de este lugar", p.climatologia ? "Promedio de la mínima de ese día del año (1991-2020) − 5 °C, y 5 °C o menos" : "0 °C (aún sin climatología de este lugar)"]];
}

export function filasUV(p) {
  return [["UV máximo con cielo despejado", p.uv_max != null ? `${p.uv_max} · ${p.uv_cat}` : "—"],
    ["Qué hacer", (p.uv_max ?? 0) >= 8 ? "Evitar el sol de 11 a 16 h; sombrero, lentes y bloqueador FPS 30+ cada 2 h" : (p.uv_max ?? 0) >= 3 ? "Bloqueador y sombra al mediodía" : "Sin medidas especiales"]];
}

export function filasAnticiclon(p) {
  if (p.kind === "bloqueo") {
    return [["Tipo", "Bloqueo (la corriente en chorro se desvía y el tiempo se queda igual)"], ["Hemisferio", p.hemisferio],
      ["Longitudes", `${p.lon_ini}° a ${p.lon_fin}°`], ["Días seguidos bloqueado (pronóstico)", `${p.dias} de ${p.de_horizontes}`]];
  }
  return [["Tipo", p.domo_calor ? "Domo de calor (alta en altura con aire caliente debajo)" : "Anticiclón en altura"],
    ["Altura a 500 hPa (~5.5 km)", `${p.altura500_dam} dam`], ["Anomalía frente a su latitud", `${p.anomalia_dam > 0 ? "+" : ""}${p.anomalia_dam} dam`],
    ["Temperatura a ~1.5 km (850 hPa)", p.t850_c != null ? tempCF(p.t850_c) : "—"], ["Persistencia en el pronóstico", `${p.horizontes} de ${p.de_horizontes} días`]];
}

/** Serie diaria para la gráfica: [fecha, valor] de la máxima, la mínima o el índice de calor. */
export const serie = (p, k) => (p.serie || []).map((x) => [x[0], x[{ tmax: 1, tmin: 2, hi: 3 }[k]]]).filter((x) => x[1] != null);
