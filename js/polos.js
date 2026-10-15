// Polos: Antártida, Groenlandia y Ártico. Capas fijas (reclamos territoriales, rutas árticas) e indicadores del día
// (hielo marino, agujero de ozono, deshielo de Groenlandia) que prepara tools/polos/polos.py en data/vivos/.
import { esc } from "./util.js";

// El mapa (MapLibre, proyección Mercator también en el globo) no dibuja más allá de ~85° de latitud.
const SUR = -85;

/**
 * Reclamos territoriales en la Antártida (al sur de 60° S). El Tratado Antártico (1959, art. IV) los «congela»:
 * no se reconocen ni se niegan y no se pueden ampliar. Noruega no fija límites norte-sur; se dibuja de 60° S al polo.
 * [país, nombre del territorio, lon oeste, lon este, color]
 */
export const RECLAMOS = [
  ["Noruega", "Tierra de la Reina Maud", -20, 45, "#C0392B"],
  ["Australia", "Territorio Antártico Australiano", 45, 136, "#E2711D"],
  ["Francia", "Tierra Adelia", 136, 142, "#2E4A9E"],
  ["Australia", "Territorio Antártico Australiano", 142, 160, "#E2711D"],
  ["Nueva Zelanda", "Dependencia Ross", 160, 210, "#1F8A8A"],
  ["Sin reclamar", "Tierra de Marie Byrd", -150, -90, "#9AA5A0"],
  ["Chile", "Territorio Chileno Antártico", -90, -53, "#D23B3B"],
  ["Reino Unido", "Territorio Antártico Británico", -80, -20, "#6C3483"],
  ["Argentina", "Antártida Argentina", -74, -25, "#5DADE2"],
];

/** Polígono de un sector entre dos meridianos, de 60° S hasta el borde del mapa. */
export function sector(oeste, este, norte = -60, sur = SUR) {
  const borde = [];
  for (let x = oeste; x < este; x += 1) borde.push([x, norte]);
  borde.push([este, norte]);
  const fondo = [];
  for (let x = este; x > oeste; x -= 1) fondo.push([x, sur]);
  fondo.push([oeste, sur]);
  return [[...borde, ...fondo, [oeste, norte]]];
}

/** Traslapes: qué otros reclamos cubren el mismo meridiano (Argentina, Chile y Reino Unido en la Península Antártica). */
export function traslapes(i) {
  const [, , a, b] = RECLAMOS[i];
  return RECLAMOS.filter((r, j) => j !== i && r[0] !== "Sin reclamar" && r[0] !== RECLAMOS[i][0] && r[2] < b && r[3] > a).map((r) => r[0]);
}

export function reclamosAntartida() {
  return {
    type: "FeatureCollection",
    features: RECLAMOS.map(([pais, nombre, oeste, este, color], i) => ({
      type: "Feature", geometry: { type: "Polygon", coordinates: sector(oeste, este) },
      properties: { id: `reclamo-${i}`, pais, nombre, oeste, este, color, opacidad: pais === "Sin reclamar" ? 0.08 : 0.16, traslapes: traslapes(i) },
    })),
  };
}

const lonTxt = (x) => { const v = ((x + 540) % 360) - 180; return `${Math.abs(v)}° ${v < 0 ? "O" : v > 0 ? "E" : ""}`.trim(); };
export const meridianos = (p) => `de ${lonTxt(p.oeste)} a ${lonTxt(p.este)}`;

/**
 * Rutas marítimas árticas, trazo ESQUEMÁTICO por sus estrechos principales (puede desviarse decenas de km de la ruta real).
 * Longitudes > 180 para cruzar el antimeridiano sin cortar la línea.
 */
export const RUTAS = [
  ["Ruta del Mar del Norte (costa de Rusia)", "#E2711D", "Murmansk → Puertas de Kara → Estrecho de Vilkitski → Mar de Laptev → Mar de Siberia Oriental → Estrecho de Bering. Rusia la administra y exige permiso y, en ciertos tramos, escolta de rompehielos.",
    [[33.1, 69.1], [42, 70.5], [58, 70.4], [68, 72.5], [80.5, 73.6], [95, 76.5], [104.5, 77.9], [118, 76.8], [130, 75.5], [140, 74.8], [152, 73.2], [165, 71.5], [178, 70.2], [186, 67.5], [191.1, 65.9]]],
  ["Paso del Noroeste (archipiélago canadiense)", "#1F6FB2", "Estrecho de Davis → Bahía de Baffin → Lancaster Sound → Estrecho de Barrow → Golfo de Amundsen → Mar de Beaufort → Estrecho de Bering. Canadá lo considera aguas interiores; EUA y otros, un estrecho internacional.",
    [[-57, 66.5], [-63, 71], [-74, 74], [-82, 74.2], [-91, 74.4], [-96.5, 72.5], [-98, 70], [-101, 68.5], [-107, 68.8], [-114, 68.8], [-118, 69.5], [-124, 70.6], [-134, 70.8], [-145, 70.6], [-156.8, 71.6], [-164, 69.5], [-168.9, 65.9]]],
  ["Ruta Transpolar (posible a futuro)", "#8E44AD", "Del Estrecho de Bering al Estrecho de Fram cruzando cerca del Polo Norte. Hoy solo la usan rompehielos; podría abrirse si el Ártico queda sin hielo en verano.",
    [[-168.9, 65.9], [-170, 75], [-175, 84], [-120, 85], [0, 85], [5, 82], [2, 79]]],
];

export function rutasArticas() {
  return { type: "FeatureCollection", features: RUTAS.map(([nombre, color, nota, coords], i) => ({
    type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { id: `ruta-${i}`, nombre, color, nota } })) };
}

// ---------- Indicadores ----------

const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d }));
const signo = (v, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d);

/** Puntos del mapa para cada indicador disponible (las fichas leen el dato completo de `d`). */
export function indicadoresFC(d) {
  const f = (coords, kind, extra) => ({ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: { id: `ind-${kind}`, kind, ...extra } });
  const out = [];
  if (d?.hielo?.artico) out.push(f([40, 82], "hielo_artico", { dato: d.hielo.artico, fuente: d.hielo.fuente }));
  if (d?.hielo?.antartico) out.push(f([-35, -68], "hielo_antartico", { dato: d.hielo.antartico, fuente: d.hielo.fuente }));
  if (d?.ozono) out.push(f([60, -80], "ozono", { dato: d.ozono }));
  if (d?.groenlandia) out.push(f([-41, 72], "groenlandia", { dato: d.groenlandia }));
  return { type: "FeatureCollection", features: out };
}

export const NOMBRES = { hielo_artico: "Hielo marino del Ártico", hielo_antartico: "Hielo marino de la Antártida", ozono: "Agujero de ozono antártico",
  groenlandia: "Capa de hielo de Groenlandia" };

/** Etiqueta corta en el mapa. */
export function etiquetaIndicador(p) {
  const d = p.dato || {};
  if (p.kind.startsWith("hielo")) return `${NOMBRES[p.kind]}: ${fmt(d.valor)} M km² (${signo(d.anomalia)})`;
  if (p.kind === "ozono") return `Agujero de ozono: ${fmt(d.area, 1)} M km²`;
  if (p.kind === "groenlandia") return `Groenlandia: ${signo(d.smb_dia_gt, 1)} Gt/día`;
  return "";
}

/** Filas de la ficha de un indicador. */
export function filasIndicador(p) {
  const d = p.dato || {};
  if (p.kind.startsWith("hielo")) {
    return [["Mes", `${d.mes} de ${d.anio}`], ["Extensión promedio", `${fmt(d.valor)} millones de km²`],
      ["Frente al promedio 1991-2020", `${signo(d.anomalia)} millones de km² (promedio: ${fmt(d.media_1991_2020)})`],
      ["Lugar", `${d.lugar_mas_bajo}.º más bajo de ${d.anios} años (desde 1979)`], ["Récord mínimo de ese mes", `${fmt(d.record_minimo?.[1])} millones de km² en ${d.record_minimo?.[0]}`]];
  }
  if (p.kind === "ozono") {
    const dif = d.area - d.media;
    return [["Fecha del dato", d.fecha], ["Área del agujero", `${fmt(d.area, 1)} millones de km² (México mide ~2)`],
      ["Frente al promedio de ese día (1979-2025)", `${signo(dif, 1)} millones de km² (promedio: ${fmt(d.media, 1)})`],
      ["Máximo de este año", `${fmt(d.maximo_anio, 1)} millones de km² el ${d.fecha_maximo}`]];
  }
  if (p.kind === "groenlandia") {
    return [["Fecha del dato", d.fecha], ["Balance de masa del día", `${signo(d.smb_dia_gt, 2)} Gt (miles de millones de toneladas)`],
      ["Acumulado desde el 1 de septiembre", `${signo(d.smb_acum_gt, 1)} Gt`],
      ...(d.deshielo_pct != null ? [["Superficie con deshielo", `${fmt(d.deshielo_pct, 1)} % de la capa de hielo (${d.deshielo_fecha})`]] : [])];
  }
  return [];
}

/** Gráfica SVG sencilla: líneas y banda sombreada. series = [{puntos: [[x, y]], color, ancho, guiones}], banda = [[x, y0, y1]]. */
export function grafica({ series = [], banda = null, ancho = 320, alto = 120, etiquetaX = [], unidad = "", cero = false }) {
  const xs = series.flatMap((s) => s.puntos.map((p) => p[0])).concat((banda || []).map((b) => b[0]));
  const ys = series.flatMap((s) => s.puntos.map((p) => p[1])).concat((banda || []).flatMap((b) => [b[1], b[2]])).filter((v) => v != null);
  if (!xs.length || !ys.length) return "";
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (cero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  if (y1 === y0) { y1 += 1; y0 -= 1; }
  const m = { i: 34, d: 6, a: 8, b: 18 };
  const X = (x) => m.i + ((x - x0) / Math.max(1e-9, x1 - x0)) * (ancho - m.i - m.d);
  const Y = (y) => alto - m.b - ((y - y0) / (y1 - y0)) * (alto - m.a - m.b);
  const ruta = (pts) => pts.filter((p) => p[1] != null).map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const bandaSvg = banda ? `<path d="${ruta(banda.map((b) => [b[0], b[2]]))}${banda.slice().reverse().map((b) => `L${X(b[0]).toFixed(1)},${Y(b[1]).toFixed(1)}`).join("")}Z" fill="currentColor" opacity="0.12"/>` : "";
  const ticks = [y0, (y0 + y1) / 2, y1].map((v) => `<text x="${m.i - 4}" y="${Y(v) + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity="0.7">${fmt(v, Math.abs(y1 - y0) < 5 ? 1 : 0)}</text>`).join("");
  const lineaCero = cero && y0 < 0 && y1 > 0 ? `<line x1="${m.i}" x2="${ancho - m.d}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity="0.3"/>` : "";
  const ex = etiquetaX.map(([x, t]) => `<text x="${X(x)}" y="${alto - 4}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">${esc(t)}</text>`).join("");
  return `<svg class="grafica-polo" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Gráfica ${esc(unidad)}" style="width:100%;max-width:${ancho}px;height:auto">
    ${bandaSvg}${lineaCero}${series.map((s) => `<path d="${ruta(s.puntos)}" fill="none" stroke="${s.color}" stroke-width="${s.ancho || 2}"${s.guiones ? ` stroke-dasharray="${s.guiones}"` : ""}/>`).join("")}
    ${ticks}${ex}<text x="${ancho - m.d}" y="${m.a + 2}" text-anchor="end" font-size="9" fill="currentColor" opacity="0.7">${esc(unidad)}</text></svg>`;
}

const diaDelAnio = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5); };

/** Gráfica y explicación de cada indicador (va debajo de las filas de la ficha). */
export function extraIndicador(p) {
  const d = p.dato || {};
  if (p.kind.startsWith("hielo")) {
    const serie = d.serie || [];
    return `<h4>Extensión de ${esc(d.mes)} de cada año (1979-${esc(d.anio)})</h4>
      ${grafica({ series: [{ puntos: serie, color: "#1F6FB2" }, { puntos: serie.length ? [[serie[0][0], d.media_1991_2020], [serie.at(-1)[0], d.media_1991_2020]] : [], color: "#888", ancho: 1, guiones: "4 3" }],
        etiquetaX: serie.length ? [[serie[0][0], serie[0][0]], [serie.at(-1)[0], serie.at(-1)[0]]] : [], unidad: "millones de km²" })}
      <p class="meta">Línea gris: promedio 1991-2020. «Extensión» es el área del océano con al menos 15 % de hielo. ${p.kind === "hielo_artico"
        ? "En el Ártico el mínimo llega en septiembre y el máximo en marzo; la tendencia de septiembre es de bajada desde 1979."
        : "En la Antártida el máximo llega en septiembre y el mínimo en febrero; varió poco (incluso creció) hasta 2015 y desde 2016 bajó, con mínimos récord en 2022 y 2023."}</p>`;
  }
  if (p.kind === "ozono") {
    const s = (d.serie || []).map((r) => [diaDelAnio(r[0]), ...r.slice(1)]);
    const meses = [[182, "jul"], [213, "ago"], [244, "sep"], [274, "oct"], [305, "nov"], [335, "dic"]];
    return `<h4>Temporada ${esc(String(d.fecha).slice(0, 4))} frente al promedio</h4>
      ${grafica({ series: [{ puntos: s.map((r) => [r[0], r[2]]), color: "#888", ancho: 1, guiones: "4 3" }, { puntos: s.map((r) => [r[0], r[1]]), color: "#8E44AD" }],
        banda: s.map((r) => [r[0], r[3], r[4]]), etiquetaX: meses, unidad: "millones de km²", cero: true })}
      <p class="meta">Morado: este año. Gris punteado: promedio 1979-2025; banda: 80 % de los años (percentiles 10 a 90). El agujero se abre en agosto,
        llega a su máximo entre septiembre y principios de octubre y se cierra en noviembre o diciembre. Lo causan el cloro y el bromo de los CFC, que el
        Protocolo de Montreal (1987) prohibió; se espera que se recupere hacia 2066 (evaluación de la OMM y el PNUMA de 2022).</p>`;
  }
  if (p.kind === "groenlandia") {
    const s = (d.serie || []).map((r, i) => [i, r[2]]);
    return `<h4>Balance acumulado desde el 1 de septiembre</h4>
      ${grafica({ series: [{ puntos: s, color: "#1F8A8A" }], etiquetaX: d.serie?.length ? [[0, d.serie[0][0].slice(5)], [s.length - 1, d.serie.at(-1)[0].slice(5)]] : [], unidad: "Gt", cero: true })}
      <p class="meta">El balance de masa superficial es la nieve que cae menos el agua que se derrite y escurre. Positivo: la superficie gana hielo
        (lo normal en otoño e invierno); negativo: pierde (días de deshielo en verano). No incluye el hielo que los glaciares vierten al mar ni el que se
        funde por debajo; con todo eso, Groenlandia pierde en promedio unas 270 Gt al año (NASA, satélites GRACE, 2002-2023).
        Por eso este número sube en invierno aunque el total anual sea una pérdida. El modelo del DMI se actualiza a diario.</p>`;
  }
  return "";
}

export const URL_FUENTE = { ozono: "https://ozonewatch.gsfc.nasa.gov/meteorology/SH.html", groenlandia: "https://polarportal.dk/en/greenland/surface-conditions/" };
export const ICONOS_SITIO = { base: "🔬", capital: "🏛️", puerto: "⚓", aeropuerto: "✈️", mineria: "⛏️", glaciar: "🧊" };
export const meridianoTexto = lonTxt;
