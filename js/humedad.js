// Humedad relativa, punto de rocío, CO₂ y agua que se podría obtener del aire (bloque «Clima: humedad, punto de rocío y
// CO₂» del menú izquierdo, disponible en todos los planes). Lee data/vivos/humedad_estaciones.geojson
// (tools/clima/humedad.py: reportes METAR de ~5,000 aeropuertos) y data/vivos/co2.json (tools/clima/co2.py: NOAA).
// Los cálculos repiten los de tools/clima/humedad.py para la calculadora (mismas constantes).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FUENTE = "humedad", CAPA = "humedad-pts";

export const REF = { bobina_c: 5, caudal_m3h: 200, eficiencia: 0.7, noche_h: 10, enfriamiento_max_c: 5, potencia_max_w: 60 };
const CALOR_LATENTE = 2.45e6;

export const presionVapor = (t) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));
export const humedadRelativa = (t, td) => Math.max(0, Math.min(100, (100 * presionVapor(td)) / presionVapor(t)));
export const humedadAbsoluta = (t, td) => (216.7 * presionVapor(td)) / (273.15 + t);
export function puntoRocio(t, hr) {
  const g = Math.log(Math.max(hr, 0.1) / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
}
const factorViento = (ms) => (ms == null || ms <= 2 ? 1 : Math.max(0.3, 1 - (0.7 * (ms - 2)) / 5));
const factorNubes = (n) => 1 - 0.85 * Math.max(0, Math.min(1, n || 0));

/** Mismo cálculo que agua_del_aire() de tools/clima/humedad.py. */
export function aguaDelAire(t, td, vientoMs = null, nubes = 0, ref = REF) {
  const hr = humedadRelativa(t, td), ah = humedadAbsoluta(t, td), deficit = t - td;
  const caida = ref.enfriamiento_max_c * factorNubes(nubes) * factorViento(vientoMs);
  const margen = caida - deficit;
  const [condensacion, nivel] = margen >= 2 ? ["alta", 3] : margen >= 0 ? ["media", 2] : margen >= -2 ? ["baja", 1] : ["muy baja", 0];
  const maximo = ((ref.potencia_max_w * ref.noche_h * 3600) / CALOR_LATENTE) * 1000;
  const rocio = margen > 0 ? Math.round(maximo * factorNubes(nubes) * factorViento(vientoMs) * Math.min(1, margen / ref.enfriamiento_max_c)) : 0;
  const mlM3 = td > ref.bobina_c ? Math.max(0, ah - humedadAbsoluta(ref.bobina_c, ref.bobina_c)) : 0;
  return { hr: +hr.toFixed(1), humedad_abs_g_m3: +ah.toFixed(2), deficit_c: +deficit.toFixed(1), enfriamiento_c: +caida.toFixed(1), condensacion, nivel,
    rocio_ml_m2_noche: rocio, generador_ml_m3: +mlM3.toFixed(2), generador_l_dia: +((mlM3 * ref.caudal_m3h * 24 * ref.eficiencia) / 1000).toFixed(1) };
}

// Colores por modo. Humedad: de seco (ocre) a saturado (azul oscuro). Condensación: 0 muy baja … 3 alta.
export const MODOS = {
  hr: { nombre: "Humedad relativa (%)", campo: "hr", cortes: [[30, "#C8A15A"], [50, "#E3D58A"], [70, "#8CC9A4"], [85, "#3E9CC7"], [101, "#1D4E89"]] },
  rocio: { nombre: "Punto de rocío (°C)", campo: "rocio_c", cortes: [[-10, "#B39DDB"], [0, "#90CAF9"], [10, "#80CBC4"], [16, "#FFE082"], [21, "#FFB74D"], [99, "#E65100"]] },
  condensacion: { nombre: "Probabilidad de condensar rocío de noche", campo: "nivel", cortes: [[0.5, "#B0A99F"], [1.5, "#E6C36A"], [2.5, "#5FB0C9"], [9, "#1565C0"]] },
  generador: { nombre: "Agua con generador eléctrico (mL por m³ de aire)", campo: "generador_ml_m3", cortes: [[0.01, "#B0A99F"], [3, "#E6C36A"], [7, "#8CC9A4"], [12, "#3E9CC7"], [99, "#1D4E89"]] },
};
const ETIQUETAS = {
  hr: ["menos de 30 %", "30 a 49 %", "50 a 69 %", "70 a 84 %", "85 % o más"],
  rocio: ["menos de −10 °C", "−10 a −1 °C", "0 a 9 °C", "10 a 15 °C", "16 a 20 °C (bochorno)", "21 °C o más (muy húmedo)"],
  condensacion: ["Muy baja", "Baja", "Media", "Alta"],
  generador: ["Nada (rocío ≤ 5 °C)", "Menos de 3 mL/m³", "3 a 6 mL/m³", "7 a 11 mL/m³", "12 mL/m³ o más"],
};

export function colorDe(modo, p) {
  const m = MODOS[modo] || MODOS.hr, v = Number(p?.[m.campo]);
  if (!Number.isFinite(v)) return "#9aa5ad";
  return (m.cortes.find(([max]) => v < max) || m.cortes[m.cortes.length - 1])[1];
}

/** Expresión de MapLibre equivalente a colorDe (paso por cortes). */
export function expresionColor(modo) {
  const m = MODOS[modo] || MODOS.hr, c = m.cortes;
  const e = ["step", ["to-number", ["get", m.campo], -999], c[0][1]];
  for (let i = 1; i < c.length; i++) e.push(c[i - 1][0], c[i][1]);
  return e;
}

export const htmlLeyenda = (modo) => `<div class="leyenda-humedad">${(MODOS[modo] || MODOS.hr).cortes.map(([, c], i) =>
  `<span><i style="background:${c}"></i>${esc(ETIQUETAS[modo]?.[i] ?? "")}</span>`).join("")}</div>`;

const n1 = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-MX", { maximumFractionDigits: d }));

export function htmlFicha(p, ref = REF) {
  const nubes = p.nubes == null ? "—" : p.nubes >= 1 ? "cubierto" : p.nubes >= 0.75 ? "muy nublado" : p.nubes >= 0.45 ? "medio nublado" : p.nubes > 0 ? "pocas nubes" : "despejado";
  return `<h2>💧 ${esc(p.id)} · humedad y agua del aire</h2>
  <p class="meta">Reporte METAR del aeropuerto ${esc(p.id)} · ${esc(String(p.hora_utc || "").replace("T", " ").slice(0, 16))} UTC${p.elev_m != null ? ` · ${n1(p.elev_m, 0)} m de altitud` : ""}</p>
  <table class="tabla-ficha">
    <tr><th>Temperatura del aire</th><td>${n1(p.t_c)} °C</td></tr>
    <tr><th>Punto de rocío</th><td>${n1(p.rocio_c)} °C <span class="meta">(temperatura a la que el aire se satura y aparece agua líquida)</span></td></tr>
    <tr><th>Humedad relativa</th><td>${n1(p.hr)} %</td></tr>
    <tr><th>Humedad absoluta</th><td>${n1(p.humedad_abs_g_m3, 2)} g de vapor por m³ de aire</td></tr>
    <tr><th>Diferencia aire − rocío</th><td>${n1(p.deficit_c)} °C</td></tr>
    <tr><th>Viento · nubes</th><td>${n1(p.viento_ms)} m/s · ${nubes}</td></tr>
  </table>
  <h3>Colector pasivo de rocío (sin electricidad)</h3>
  <p>Probabilidad de condensación esta noche si siguen estas condiciones: <b>${esc(p.condensacion)}</b>${p.noche === false ? " <span class=\"meta\">(el reporte es de día: el cálculo supone que así seguirá de noche)</span>" : ""}.</p>
  <p>Una lámina expuesta al cielo bajaría ~${n1(p.enfriamiento_c)} °C por debajo del aire; necesita bajar ${n1(p.deficit_c)} °C para llegar al punto de rocío.
     Agua posible: <b>${n1(p.rocio_ml_m2_noche, 0)} mL por m² de colector</b> en una noche de ${ref.noche_h} h.</p>
  <h3>Generador eléctrico de agua atmosférica</h3>
  <p>Al enfriar el aire a ${ref.bobina_c} °C se condensan <b>${n1(p.generador_ml_m3, 2)} mL por cada m³</b> de aire.
     Un equipo de referencia que mueve ${ref.caudal_m3h} m³/h con ${Math.round(ref.eficiencia * 100)} % de eficiencia daría ≈ <b>${n1(p.generador_l_dia)} L por día</b>${p.generador_ml_m3 > 0 ? "" : " (con punto de rocío de 5 °C o menos el condensador tendría que bajar de 0 °C y se congela)"}.</p>
  <h3>Agua posible por mes (historial de este aeropuerto)</h3>
  <div class="hum-hist" data-id="${esc(p.id)}"><p class="meta">Cargando historial…</p></div>
  <p class="meta">Estimación física simplificada (cálculo propio), no medición. Los colectores pasivos reales registran de 0.1 a 0.6 L/m² en noches buenas; cada generador publica su propia curva de producción. Antes de beber, el agua condensada debe filtrarse y desinfectarse (en México, NOM-127-SSA1-2021).</p>
  <p class="meta">Fuente: reportes METAR (NOAA Aviation Weather Center, dominio público).</p>`;
}

export function htmlCO2(d) {
  const s = d?.series || {};
  const fila = (x, t) => (x ? `<li><b>${n1(x.ppm, 2)} ppm</b> ${esc(t)} (${esc(x.mes)}); un año antes ${n1(x.ppm_anterior, 2)} ppm: <b>+${n1(x.aumento_ppm, 2)} ppm</b>. <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">NOAA</a></li>` : "");
  if (!s.mauna_loa && !s.global) return `<p class="meta">Aún no hay datos de CO₂ (se generan con «Datos en movimiento» una vez al día).</p>`;
  return `<ul class="lista-co2">${fila(s.mauna_loa, "en Mauna Loa, Hawái (promedio mensual)")}${fila(s.global, "promedio global en la superficie del mar")}</ul>
  <p class="meta">ppm = partes por millón: de cada millón de moléculas de aire seco, cuántas son de CO₂. Al aire libre varía unas pocas ppm entre lugares (sube cerca de ciudades e industrias); dentro de una oficina cerrada puede pasar de 1,000 ppm, y ahí sí conviene un sensor propio. No hay una red abierta de medición por ciudad, por eso se muestra la referencia mundial de la NOAA.</p>`;
}

const NOMBRE_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diasDelMes = (ym) => { const [a, m] = ym.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

/** Promedios mensuales de un aeropuerto: entrada = {m: {"AAAA-MM": [obs, Σ mL/m³, noches, Σ mL/m² rocío]}}. */
export function resumenMensual(entrada, ref = REF) {
  return Object.entries(entrada?.m || {}).sort(([a], [b]) => a.localeCompare(b)).map(([mes, [n, sumaGen, noches, sumaRocio]]) => {
    const mlM3 = n ? sumaGen / n : 0, lDia = (mlM3 * ref.caudal_m3h * 24 * ref.eficiencia) / 1000, rocio = noches ? sumaRocio / noches : null, dias = diasDelMes(mes);
    return { mes, obs: n, noches, ml_m3: +mlM3.toFixed(2), l_dia: +lDia.toFixed(1), l_mes: Math.round(lDia * dias),
      rocio_ml_noche: rocio == null ? null : Math.round(rocio), rocio_l_m2_mes: rocio == null ? null : +((rocio * dias) / 1000).toFixed(1) };
  });
}

export function htmlHistorial(entrada, desde = "", ref = REF) {
  const filas = resumenMensual(entrada, ref);
  if (!filas.length) return `<p class="meta">Todavía no hay historial de este aeropuerto: se acumula cada hora desde ${esc(desde || "la primera corrida")}.</p>`;
  return `<table class="tabla-ficha"><tr><th>Mes</th><th>Generador (L/día · L/mes)</th><th>Rocío pasivo (mL/m² por noche · L/m² al mes)</th><th>Datos</th></tr>
    ${filas.map((f) => `<tr><td>${NOMBRE_MES[Number(f.mes.slice(5)) - 1]} ${f.mes.slice(0, 4)}</td><td>${n1(f.l_dia)} · <b>${n1(f.l_mes, 0)}</b></td>
      <td>${f.rocio_ml_noche == null ? "sin noches medidas" : `${n1(f.rocio_ml_noche, 0)} · <b>${n1(f.rocio_l_m2_mes)}</b>`}</td><td class="meta">${f.obs} obs.${f.noches ? `, ${f.noches} nocturnas` : ""}</td></tr>`).join("")}</table>
    <p class="meta">Promedio de las observaciones horarias del mes (historial desde ${esc(desde)}). L/mes = promedio diario × días del mes; un mes con pocas observaciones es menos representativo. Generador de referencia: ${ref.caudal_m3h} m³/h, ${Math.round(ref.eficiencia * 100)} % de eficiencia.</p>`;
}

/** Calculadora: temperatura y humedad relativa → punto de rocío y agua posible. */
export function htmlCalculo(t, hr, viento = 1, nubes = 0) {
  if (!Number.isFinite(t) || !Number.isFinite(hr) || hr <= 0 || hr > 100) return `<p class="meta">Escribe una temperatura y una humedad entre 1 y 100 %.</p>`;
  const td = puntoRocio(t, hr), c = aguaDelAire(t, td, viento, nubes);
  return `<p>Punto de rocío <b>${n1(td)} °C</b> · humedad absoluta <b>${n1(c.humedad_abs_g_m3, 2)} g/m³</b>.</p>
    <p>Rocío esta noche (colector pasivo): probabilidad <b>${esc(c.condensacion)}</b>, ≈ <b>${n1(c.rocio_ml_m2_noche, 0)} mL/m²</b>.</p>
    <p>Generador eléctrico: <b>${n1(c.generador_ml_m3, 2)} mL por m³</b> de aire ≈ <b>${n1(c.generador_l_dia)} L/día</b> con el equipo de referencia (${REF.caudal_m3h} m³/h).</p>`;
}

export async function iniciarHumedad({ map, cont, abrirFicha, getJSON }) {
  if (!cont || !map) return;
  cont.innerHTML = `<label class="fila"><span><input type="checkbox" id="hum-capa"> 💧 Humedad, punto de rocío y agua del aire (~5,000 aeropuertos)</span></label>
    <label class="fila"><span>Colorear por</span><select id="hum-modo">${Object.entries(MODOS).map(([k, m]) => `<option value="${k}">${esc(m.nombre)}</option>`).join("")}</select></label>
    <div id="hum-leyenda" hidden></div>
    <p class="meta" id="hum-estado">Toca un punto del mapa para ver su humedad, punto de rocío y cuánta agua se podría obtener.</p>
    <h4>🌫️ Dióxido de carbono (CO₂)</h4><div id="hum-co2"><p class="meta">Cargando…</p></div>
    <details class="hum-calc"><summary>🧮 Calculadora de agua del aire</summary>
      <label class="fila"><span>Temperatura (°C)</span><input type="number" id="hum-t" value="25" step="0.5"></label>
      <label class="fila"><span>Humedad relativa (%)</span><input type="number" id="hum-hr" value="70" min="1" max="100" step="1"></label>
      <label class="fila"><span>Viento (m/s)</span><input type="number" id="hum-v" value="1" min="0" step="0.5"></label>
      <label class="fila"><span>Cielo</span><select id="hum-n"><option value="0">Despejado</option><option value="0.45">Medio nublado</option><option value="1">Cubierto</option></select></label>
      <div id="hum-res"></div></details>`;
  const $ = (id) => cont.querySelector(`#${id}`);
  const calcular = () => { $("hum-res").innerHTML = htmlCalculo(Number($("hum-t").value), Number($("hum-hr").value), Number($("hum-v").value), Number($("hum-n").value)); };
  cont.querySelector(".hum-calc").addEventListener("input", calcular);
  calcular();
  getJSON("data/vivos/co2.json", { bust: true }).then((d) => { $("hum-co2").innerHTML = htmlCO2(d); }).catch(() => { $("hum-co2").innerHTML = htmlCO2(null); });

  let datos = null, ref = REF;
  const pintar = () => {
    const modo = $("hum-modo").value;
    $("hum-leyenda").innerHTML = htmlLeyenda(modo);
    if (map.getLayer(CAPA)) map.setPaintProperty(CAPA, "circle-color", expresionColor(modo));
  };
  const quitar = () => { if (map.getLayer(CAPA)) map.removeLayer(CAPA); if (map.getSource(FUENTE)) map.removeSource(FUENTE); $("hum-leyenda").hidden = true; };
  const poner = async () => {
    $("hum-estado").textContent = "Cargando estaciones…";
    datos ??= await getJSON("data/vivos/humedad_estaciones.geojson", { bust: true });
    ref = { ...REF, ...(datos.referencia || {}) };
    if (!map.getSource(FUENTE)) map.addSource(FUENTE, { type: "geojson", data: datos });
    if (!map.getLayer(CAPA)) map.addLayer({ id: CAPA, type: "circle", source: FUENTE,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 5, 4.5, 9, 7], "circle-color": expresionColor($("hum-modo").value),
        "circle-stroke-width": 0.5, "circle-stroke-color": "rgba(0,0,0,.35)", "circle-opacity": 0.9 } });
    $("hum-leyenda").hidden = false;
    pintar();
    $("hum-estado").textContent = `${datos.features.length.toLocaleString("es-MX")} aeropuertos · reportes de ${String(datos.generado_utc || "").replace("T", " ").slice(0, 16)} UTC. Toca un punto para ver el detalle.`;
  };
  $("hum-capa").addEventListener("change", async (e) => {
    try { e.target.checked ? await poner() : quitar(); } catch { e.target.checked = false; quitar(); $("hum-estado").textContent = "Aún no hay datos (se generan con «Datos en movimiento» cada hora)."; }
  });
  $("hum-modo").addEventListener("change", pintar);
  let historial = null;
  map.on("click", CAPA, async (e) => {
    const f = e.features?.[0];
    if (!f) return;
    abrirFicha(htmlFicha(f.properties, ref));
    const div = document.querySelector(`.hum-hist[data-id="${CSS.escape(f.properties.id)}"]`);
    try {
      historial ??= getJSON("data/vivos/humedad_historial.json", { bust: true });
      const h = await historial;
      if (div?.isConnected) div.innerHTML = htmlHistorial(h.estaciones?.[f.properties.id], h.desde, { ...ref, ...(h.referencia || {}) });
    } catch { historial = null; if (div?.isConnected) div.innerHTML = `<p class="meta">El historial aún no está disponible.</p>`; }
  });
  map.on("mouseenter", CAPA, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", CAPA, () => { map.getCanvas().style.cursor = ""; });
  // Al cambiar el estilo del mapa (claro/oscuro, satélite) se borran las capas propias: se vuelven a poner.
  map.on("style.load", () => { if ($("hum-capa").checked) poner().catch(() => null); });
}
