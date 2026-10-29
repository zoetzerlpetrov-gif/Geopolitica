// Aviso fijo bajo el buscador del mapa para casos excepcionales («cisne negro») emitidos por gobiernos u organismos
// oficiales: p. ej. FORTRESS America o el llamado del Reino Unido a guardar reservas. Sale de la capa de protocolos
// (data/vivos/protocolos.geojson, «cisne_negro»: true) y se queda desde su fecha hasta que se marca «desactivado».
import { esc } from "./util.js";

const URL_DATOS = "data/vivos/protocolos.geojson";
const REFRESCO_MS = 30 * 60 * 1000;

/** Alertas activas hoy: cisne negro, ya en vigor (fecha ≤ hoy) y sin fecha de desactivación pasada. Más graves primero. */
export function alertasActivas(fc, hoy = new Date().toISOString().slice(0, 10)) {
  return (fc?.features || [])
    .filter((f) => {
      const p = f.properties || {};
      const desde = String(p.fecha || "").slice(0, 10), hasta = String(p.desactivado || "").slice(0, 10);
      return p.cisne_negro && (!desde || desde <= hoy) && (!hasta || hasta > hoy);
    })
    .sort((a, b) => (b.properties.nivel || 0) - (a.properties.nivel || 0) || String(b.properties.fecha).localeCompare(String(a.properties.fecha)));
}

/** HTML del aviso (una tarjeta por alerta). */
export function htmlAlertas(feats) {
  if (!feats.length) return "";
  return `<div class="ac-cab"><b>⚠️ ${feats.length === 1 ? "Alerta oficial activa" : `${feats.length} alertas oficiales activas`}</b>
    <button type="button" class="ac-plegar" aria-expanded="true" title="Plegar o desplegar">▾</button></div><ul class="ac-lista">${feats.map((f, i) => {
    const p = f.properties;
    return `<li><button type="button" class="ac-ir" data-i="${i}" title="Ver en el mapa"><b>${esc(p.titulo)}</b></button>
      <span class="ac-meta">Emite: <b>${esc(p.emisor || p.organismo)}</b> · desde ${esc(String(p.fecha || "").slice(0, 10))}${p.estado ? ` · ${esc(p.estado)}` : ""}</span>
      ${p.afectacion ? `<span class="ac-af">Afecta: ${esc(p.afectacion)}</span>` : ""}
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Fuente: ${esc(p.fuente || "oficial")}</a>` : ""}</li>`;
  }).join("")}</ul>`;
}

/** Monta el aviso debajo del buscador de lugares. `irA(lon, lat)` centra el mapa en la alerta. */
export function iniciarAlertaCisne(irA) {
  const form = document.getElementById("lug-form");
  if (!form) return;
  const caja = document.createElement("div");
  caja.id = "alerta-cisne";
  caja.className = "alerta-cisne";
  caja.setAttribute("role", "status");
  caja.hidden = true;
  // En celular empieza plegado (solo la barra roja con el número de alertas): el mapa queda visible.
  if (globalThis.matchMedia?.("(max-width: 760px)").matches) caja.classList.add("plegado");
  form.after(caja);
  let feats = [];
  const pintar = async () => {
    try {
      const r = await fetch(URL_DATOS, { cache: "no-cache" });
      feats = r.ok ? alertasActivas(await r.json()) : [];
    } catch { feats = []; }
    const plegado = caja.classList.contains("plegado");
    caja.innerHTML = htmlAlertas(feats);
    caja.hidden = !feats.length;
    caja.classList.toggle("plegado", plegado);
    const pl = caja.querySelector(".ac-plegar");
    if (pl && plegado) { pl.setAttribute("aria-expanded", "false"); pl.textContent = "▸"; }
  };
  caja.addEventListener("click", (e) => {
    const pl = e.target.closest(".ac-plegar");
    if (pl) { const p = caja.classList.toggle("plegado"); pl.setAttribute("aria-expanded", String(!p)); pl.textContent = p ? "▸" : "▾"; return; }
    const ir = e.target.closest(".ac-ir");
    if (ir && irA) { const c = feats[Number(ir.dataset.i)]?.geometry?.coordinates; if (c) irA(c[0], c[1]); }
  });
  pintar();
  setInterval(pintar, REFRESCO_MS);
}
