// Monitor México (grupo «🇲🇽 Monitor México» del menú izquierdo). Lee data/vivos/monitor_mx.json
// (tools/mexico/monitor_mx.py, series del SIE de Banxico): alertas de movimientos atípicos, indicadores y tres capas
// del mapa (remesas por estado, por país de origen y envíos por país de destino).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-MX", { maximumFractionDigits: d }));

export const CAPAS = {
  remesas_estado: { nombre: "Remesas recibidas por estado (trimestral)", color: "#2E7D32" },
  remesas_pais_origen: { nombre: "Remesas recibidas por país de origen (trimestral)", color: "#1565C0" },
  remesas_pais_destino: { nombre: "Remesas enviadas desde México por país de destino (trimestral)", color: "#6A1B9A" },
};
export const ALERTA = { salto: ["🔺", "Salto", "#C62828"], "a cero": ["⛔", "Cae a cero", "#4E342E"], reaparece: ["🔁", "Reaparece", "#E65100"], desplome: ["🔻", "Desplome", "#1565C0"] };

const PER = (p) => { const m = /^(\d{4})-(T\d|\d{2})$/.exec(String(p || "")); if (!m) return esc(p); return m[2].startsWith("T") ? `${m[2].replace("T", "")}.º trim. ${m[1]}` : `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m[2]) - 1]} ${m[1]}`; };

export function textoAlerta(a) {
  const [ic, t] = ALERTA[a.alerta] || ["•", a.alerta];
  const veces = a.razon != null && a.alerta === "salto" ? ` (×${num(a.razon)} su promedio)` : a.alerta === "desplome" && a.razon != null ? ` (${num(a.razon * 100, 0)} % de su promedio)` : "";
  return `${ic} <b>${esc(t)}</b>: ${esc(a.que)}${a.donde && a.donde !== "México" ? ` ${esc(a.donde)}` : ""} · ${PER(a.periodo)}: ${num(a.valor, 2)} ${esc(a.unidad || "")}${veces}; promedio previo ${num(a.promedio_previo, 2)}`;
}

export function htmlAlertas(alertas, max = 15) {
  if (!alertas?.length) return `<p class="meta">Sin movimientos atípicos en el último dato de cada serie.</p>`;
  return `<ul class="mx-alertas">${alertas.slice(0, max).map((a) => `<li>${textoAlerta(a)}</li>`).join("")}</ul>${alertas.length > max ? `<p class="meta">y ${alertas.length - max} más.</p>` : ""}`;
}

/** Variación contra el mismo periodo del año anterior. */
export function variacion(i) {
  const a = i?.mismo_periodo_anio_anterior;
  if (a == null || !Number.isFinite(i.valor) || a === 0) return "";
  const p = ((i.valor - a) / Math.abs(a)) * 100;
  return `<span class="${p >= 0 ? "sube" : "baja"}">${p >= 0 ? "▲" : "▼"} ${num(Math.abs(p))} % vs. un año antes</span>`;
}

export function htmlIndicadores(ind) {
  const grupos = {};
  for (const i of ind || []) (grupos[i.grupo] ??= []).push(i);
  return Object.entries(grupos).map(([g, lista]) => `<h4>${esc(g)}</h4><table class="tabla-ficha mx-ind">${lista.map((i) =>
    `<tr><th>${esc(i.nombre)}${i.alerta ? ` ${ALERTA[i.alerta]?.[0] || ""}` : ""}</th><td><b>${num(i.valor, 2)}</b> ${esc(i.unidad)}<br><span class="meta">${PER(i.periodo)}</span> ${variacion(i)}</td></tr>`).join("")}</table>`).join("");
}

export function htmlFicha(p, capa) {
  const serie = typeof p.serie === "string" ? JSON.parse(p.serie) : p.serie || [];
  return `<h2>${esc(p.nombre)}</h2><p class="meta">${esc(CAPAS[capa]?.nombre || "")} · millones de dólares · Banxico (SIE)</p>
    ${p.alerta ? `<p>${textoAlerta({ ...p, que: "Último dato", donde: "", unidad: "millones de USD" })}</p>` : ""}
    <table class="tabla-ficha"><tr><th>Periodo</th><th>Millones de USD</th></tr>${serie.slice().reverse().map(([per, v]) => `<tr><td>${PER(per)}</td><td>${num(v, 2)}</td></tr>`).join("")}</table>
    <p class="meta">Cifras preliminares sujetas a revisión por Banxico. <a href="https://www.banxico.org.mx/SieInternet/" target="_blank" rel="noopener noreferrer">Ver en el SIE</a></p>`;
}

export async function iniciarMonitorMx({ map, cont, abrirFicha, getJSON }) {
  if (!cont) return;
  let d;
  try { d = await getJSON("data/vivos/monitor_mx.json", { bust: true }); } catch {
    cont.innerHTML = `<p class="meta">Aún no hay datos (se generan una vez al día con «Datos en movimiento»).</p>`;
    return;
  }
  cont.innerHTML = `<h3>🚨 Movimientos atípicos</h3><div id="mx-alertas">${htmlAlertas(d.alertas)}</div>
    <h3>🗺️ En el mapa</h3>${Object.entries(CAPAS).map(([k, c]) => `<label class="fila"><span><input type="checkbox" data-mx-capa="${k}"> ${esc(c.nombre)}</span></label>`).join("")}
    <p class="meta">Tamaño del círculo: monto del último trimestre. Borde rojo: movimiento atípico. Toca un punto para ver su serie.</p>
    <h3>📊 Indicadores de Banxico</h3>${htmlIndicadores(d.indicadores)}
    <p class="meta">Fuente: ${esc(d.fuente)} · actualizado ${esc(String(d.generado_utc || "").replace("T", " ").slice(0, 16))} UTC · ${d.series_recibidas} de ${d.series_pedidas} series. ${esc(d.nota || "")}</p>`;
  if (!map) return;
  const id = (k) => `mx-${k}`, conEventos = new Set();
  const poner = (k) => {
    const fc = d.capas?.[k];
    if (!fc) return;
    if (!map.getSource(id(k))) map.addSource(id(k), { type: "geojson", data: fc });
    if (map.getLayer(id(k))) return;
    map.addLayer({ id: id(k), type: "circle", source: id(k), paint: {
      "circle-radius": ["interpolate", ["linear"], ["sqrt", ["max", 0, ["to-number", ["get", "valor"], 0]]], 0, 3, 10, 9, 40, 22],
      "circle-color": CAPAS[k].color, "circle-opacity": 0.6,
      "circle-stroke-width": ["case", ["to-boolean", ["get", "alerta"]], 3, 0.8], "circle-stroke-color": ["case", ["to-boolean", ["get", "alerta"]], "#C62828", "#ffffff"] } });
    if (conEventos.has(k)) return;  // los eventos por id de capa siguen activos aunque la capa se quite y se vuelva a poner
    conEventos.add(k);
    map.on("click", id(k), (e) => { const f = e.features?.[0]; if (f) abrirFicha(htmlFicha(f.properties, k)); });
    map.on("mouseenter", id(k), () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id(k), () => { map.getCanvas().style.cursor = ""; });
  };
  const quitar = (k) => { if (map.getLayer(id(k))) map.removeLayer(id(k)); if (map.getSource(id(k))) map.removeSource(id(k)); };
  cont.addEventListener("change", (e) => { const k = e.target.dataset?.mxCapa; if (k) e.target.checked ? poner(k) : quitar(k); });
  map.on("style.load", () => { for (const c of cont.querySelectorAll("input[data-mx-capa]:checked")) poner(c.dataset.mxCapa); });
}
