// Menú lateral: secciones plegables que se recuerdan, buscador dentro del menú, «Contraer todo» y una
// barra con las capas encendidas (cada una con ✕ para apagarla sin buscarla en el menú).
import { esc, storage } from "./util.js";

const LS_ABIERTOS = "geo_menu_abiertos";
// Casillas que encienden una capa del mapa (las de subtipos, áreas o ciudades no cuentan como capa).
const SELECTOR_CAPAS = "[data-riesgo], [data-mov], [data-img], [data-clima], [data-fam], #capa-indice, #capa-chokepoints, #cam-espejo";

const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Texto corto de la casilla: el de su etiqueta, sin contadores ni notas. */
function nombreCasilla(cb) {
  if (cb.dataset.nombre) return cb.dataset.nombre;
  const lbl = cb.closest("label");
  const span = lbl?.querySelector("span") || lbl;
  return (span?.textContent || cb.id || "").replace(/\s+/g, " ").trim().replace(/\s*\(.*$/, "").slice(0, 38);
}

export function iniciarMenu(panel) {
  // 1) Recordar qué secciones quedaron abiertas.
  let abiertos = {};
  try { abiertos = JSON.parse(storage.get(LS_ABIERTOS) || "{}"); } catch (e) { abiertos = {}; }
  const restaurar = (raiz) => { for (const d of raiz.querySelectorAll?.("details[id]") || []) if (d.id in abiertos) d.open = abiertos[d.id]; };
  restaurar(panel);
  // «toggle» no burbujea: se escucha en captura para incluir las secciones que se agregan después.
  panel.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.id && !buscando) { abiertos[d.id] = d.open; storage.set(LS_ABIERTOS, JSON.stringify(abiertos)); }
  }, true);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.("details[id]") && n.id in abiertos) n.open = abiertos[n.id]; restaurar(n); } })
    .observe(panel, { childList: true, subtree: true });

  // 2) Contraer todo (deja abierto solo el grupo de eventos y su lista).
  panel.querySelector("#menu-contraer")?.addEventListener("click", () => {
    for (const d of panel.querySelectorAll("details")) d.open = d.id === "g-eventos" || d.id === "b-ev-lista";
  });

  // 3) Buscador: muestra solo filas que contienen el texto y abre las secciones donde están.
  const buscar = panel.querySelector("#menu-buscar");
  let buscando = false;
  let estadoPrevio = null;
  buscar?.addEventListener("input", () => {
    const q = normalizar(buscar.value.trim());
    buscando = Boolean(q);
    const filas = panel.querySelectorAll(".fila, .lista-areas li, .capa-fam, .lista-seguimiento li");
    if (!q) {
      for (const f of filas) f.hidden = false;
      if (estadoPrevio) { for (const [d, o] of estadoPrevio) d.open = o; estadoPrevio = null; }
      return;
    }
    estadoPrevio ??= [...panel.querySelectorAll("details")].map((d) => [d, d.open]);
    for (const f of filas) {
      const ok = normalizar(f.textContent).includes(q);
      f.hidden = !ok && !f.querySelector(".fila:not([hidden])");
      if (ok) for (let d = f.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
    }
  });

  // 4) Barra de capas activas. Tiene alto fijo para 20 chips (3 columnas): encender o apagar capas no mueve
  //    el resto del menú; a partir de la 21.ª crece una fila por cada 3.
  const barra = panel.querySelector("#activas");
  const pintarActivas = () => {
    const activas = [...panel.querySelectorAll(SELECTOR_CAPAS)].filter((cb) => cb.checked && !cb.disabled && cb.id !== "capa-chokepoints");
    barra.hidden = false;
    barra.innerHTML = `<div class="activas-tit"><span class="meta">${activas.length ? `Encendidas (${activas.length})` : "Ninguna capa encendida"}</span>`
      + `${activas.length > 1 ? `<button type="button" class="txt-btn" data-todas>Apagar todas</button>` : ""}</div>`
      + (activas.length ? activas.map((cb, i) => { const n = esc(nombreCasilla(cb)); return `<button type="button" class="chip-activa" data-i="${i}" title="Apagar «${n}»"><span>${n}</span>✕</button>`; }).join("")
        : `<p class="meta activas-vacio">Las capas que enciendas aparecen aquí; su ✕ las apaga.</p>`);
    const apagar = (cb) => { cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true })); };
    barra.onclick = (e) => {
      if (e.target.closest("[data-todas]")) { activas.forEach(apagar); return; }
      const b = e.target.closest("[data-i]");
      if (b) apagar(activas[Number(b.dataset.i)]);
    };
  };
  pintarActivas();
  panel.addEventListener("change", (e) => { if (e.target.matches?.(SELECTOR_CAPAS)) setTimeout(pintarActivas, 0); });
  return { pintarActivas };
}
