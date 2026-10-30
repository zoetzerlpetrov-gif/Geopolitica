// Aviso fijo bajo el buscador del mapa para casos excepcionales («cisne negro») emitidos por gobiernos u organismos
// oficiales: p. ej. FORTRESS America o el llamado del Reino Unido a guardar reservas. Sale de la capa de protocolos
// (data/vivos/protocolos.geojson, «cisne_negro»: true) y se queda desde su fecha hasta que se marca «desactivado».
// Va arriba a la derecha del mapa (no tapa las sugerencias del buscador) y se puede arrastrar por su barra roja;
// la posición se recuerda en este navegador y doble clic en la barra la regresa a su lugar.
import { esc } from "./util.js";

const URL_DATOS = "data/vivos/protocolos.geojson";
const REFRESCO_MS = 30 * 60 * 1000;
const CLAVE_POS = "gp_alerta_cisne_pos";

/** Posición dentro del contenedor sin salirse (deja visible al menos la barra). */
export function acotar(x, y, ancho, alto, anchoCont, altoCont) {
  return { x: Math.round(Math.min(Math.max(0, x), Math.max(0, anchoCont - ancho))), y: Math.round(Math.min(Math.max(0, y), Math.max(0, altoCont - Math.min(alto, 40)))) };
}

/** Arrastre con mouse, dedo o lápiz desde la barra roja (no desde sus botones). */
function hacerArrastrable(caja) {
  const cont = caja.parentElement;
  const poner = (x, y) => {
    const p = acotar(x, y, caja.offsetWidth, caja.offsetHeight, cont.clientWidth, cont.clientHeight);
    Object.assign(caja.style, { left: `${p.x}px`, top: `${p.y}px`, right: "auto" });
    return p;
  };
  const guardada = () => { try { return JSON.parse(localStorage.getItem(CLAVE_POS) || "null"); } catch { return null; } };
  const aplicarGuardada = () => { const g = guardada(); if (g && !caja.hidden) poner(g.x, g.y); };
  let ini = null, enBarra = false;
  caja.addEventListener("pointerdown", (e) => {
    enBarra = !!e.target.closest(".ac-cab") && !e.target.closest("button");
    if (!enBarra || e.button > 0) return;
    const r = caja.getBoundingClientRect(), rc = cont.getBoundingClientRect();
    ini = { dx: e.clientX - r.left + rc.left, dy: e.clientY - r.top + rc.top, id: e.pointerId };
    caja.setPointerCapture(e.pointerId);
    caja.classList.add("arrastrando");
    e.preventDefault();
  });
  caja.addEventListener("pointermove", (e) => { if (ini && e.pointerId === ini.id) poner(e.clientX - ini.dx, e.clientY - ini.dy); });
  const soltar = (e) => {
    if (!ini || e.pointerId !== ini.id) return;
    ini = null;
    caja.classList.remove("arrastrando");
    try { localStorage.setItem(CLAVE_POS, JSON.stringify({ x: parseInt(caja.style.left, 10), y: parseInt(caja.style.top, 10) })); } catch { /* sin almacenamiento */ }
  };
  caja.addEventListener("pointerup", soltar);
  caja.addEventListener("pointercancel", soltar);
  // Con la captura del puntero el doble clic llega a la caja, no a la barra: se usa dónde empezó el último toque.
  caja.addEventListener("dblclick", () => {
    if (!enBarra) return;
    Object.assign(caja.style, { left: "", top: "", right: "" });
    try { localStorage.removeItem(CLAVE_POS); } catch { /* nada */ }
  });
  addEventListener("resize", aplicarGuardada);
  return aplicarGuardada;
}

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
  return `<div class="ac-cab"><b title="Arrastra esta barra para mover el aviso; doble clic lo regresa a su lugar">⚠️ ${feats.length === 1 ? "Alerta oficial activa" : `${feats.length} alertas oficiales activas`}</b>
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
  const reubicar = hacerArrastrable(caja);
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
    reubicar();
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
