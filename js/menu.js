// Menú lateral: secciones plegables que se recuerdan, buscador dentro del menú, «Contraer todo» y una
// barra con las capas encendidas (cada una con ✕ para apagarla sin buscarla en el menú).
import { esc, storage } from "./util.js";

const LS_ABIERTOS = "geo_menu_abiertos";
// Casillas que encienden una capa del mapa (las de subtipos, áreas o ciudades no cuentan como capa).
const SELECTOR_CAPAS = "[data-riesgo], [data-mov], [data-img], [data-clima], [data-fam], #capa-indice, #capa-chokepoints, #cam-espejo";

const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Texto corto de la casilla: el de su etiqueta, sin contadores ni notas. */
function nombreCasilla(cb) {
  const lbl = cb.closest("label");
  const span = lbl?.querySelector("span") || lbl;
  return (span?.textContent || cb.id || "").replace(/\s+/g, " ").trim().replace(/\s*\(.*$/, "").slice(0, 38);
}

export function iniciarMenu(panel) {
  // 1) Recordar qué secciones quedaron abiertas.
  let abiertos = {};
  try { abiertos = JSON.parse(storage.get(LS_ABIERTOS) || "{}"); } catch (e) { abiertos = {}; }
  for (const d of panel.querySelectorAll("details[id]")) {
    if (d.id in abiertos) d.open = abiertos[d.id];
    d.addEventListener("toggle", () => { abiertos[d.id] = d.open; storage.set(LS_ABIERTOS, JSON.stringify(abiertos)); });
  }

  // 2) Contraer todo (deja abierto solo el grupo de eventos y su lista).
  panel.querySelector("#menu-contraer")?.addEventListener("click", () => {
    for (const d of panel.querySelectorAll("details")) d.open = d.id === "g-eventos" || d.id === "b-ev-lista";
  });

  // 3) Buscador: muestra solo filas que contienen el texto y abre las secciones donde están.
  const buscar = panel.querySelector("#menu-buscar");
  let estadoPrevio = null;
  buscar?.addEventListener("input", () => {
    const q = normalizar(buscar.value.trim());
    const filas = panel.querySelectorAll(".fila, .lista-areas li, .capa-fam, .subgrupo");
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

  // 4) Barra de capas activas.
  const barra = panel.querySelector("#activas");
  const pintarActivas = () => {
    const activas = [...panel.querySelectorAll(SELECTOR_CAPAS)].filter((cb) => cb.checked && !cb.disabled && cb.id !== "capa-chokepoints");
    barra.hidden = !activas.length;
    barra.innerHTML = activas.length ? `<span class="meta">Encendidas (${activas.length}):</span> ${activas.map((cb, i) => `<button type="button" class="chip-activa" data-i="${i}" title="Apagar">${esc(nombreCasilla(cb))} ✕</button>`).join("")}` : "";
    barra.onclick = (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      const cb = activas[Number(b.dataset.i)];
      cb.checked = false;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    };
  };
  panel.addEventListener("change", (e) => { if (e.target.matches?.(SELECTOR_CAPAS)) setTimeout(pintarActivas, 0); });
  return { pintarActivas };
}
