// Recuerda lo que el usuario dejó encendido y filtrado en el mapa (capas, subtipos, filtros) y dónde estaba la vista,
// para que al ir a otra sección y regresar no tenga que activarlo todo otra vez. Se guarda en sessionStorage: dura
// lo que dure la pestaña y no sale del navegador.
const CLAVE = "gp_estado_mapa_v1";
const DATOS = ["riesgo", "mov", "img", "tl", "clima", "fam", "famSub", "movSub", "espejoRiesgo"];
const SUBTIPOS = new Set(["famSub", "movSub"]);

/** Clave estable de un control del menú: su id o su atributo data-* (más el valor en los subtipos). */
export function claveDe(el) {
  if (!el || el.closest?.("[data-solo-admin], #menu-buscar")) return null;
  if (el.id) return `#${el.id}`;
  const d = el.dataset || {};
  for (const k of DATOS) if (d[k] != null) return `${k}:${d[k]}${SUBTIPOS.has(k) ? `:${el.value}` : ""}`;
  return null;
}

export function leer(almacen = globalThis.sessionStorage) {
  try { return JSON.parse(almacen?.getItem(CLAVE) || "{}") || {}; } catch { return {}; }
}
function guardar(estado, almacen = globalThis.sessionStorage) {
  try { almacen?.setItem(CLAVE, JSON.stringify(estado)); } catch { /* modo privado o lleno: se ignora */ }
}

const controles = (raiz) => [...(raiz.querySelectorAll?.("input[type=checkbox], input[type=radio], select") || [])];
const valorDe = (el) => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.value);

/**
 * Aplica lo guardado a los controles presentes. `soloSubtipos` vuelve a aplicar los subtipos después de que una
 * capa termina de encenderse (al encender una capa se marcan todos sus subtipos).
 */
export function aplicar(raiz, estado, { soloSubtipos = false } = {}) {
  let n = 0;
  for (const el of controles(raiz)) {
    const k = claveDe(el);
    if (!k || !(k in (estado.controles || {}))) continue;
    if (soloSubtipos && !/^(famSub|movSub):/.test(k)) continue;
    const v = estado.controles[k];
    if (valorDe(el) === v || el.disabled) continue;
    if (el.type === "checkbox" || el.type === "radio") el.checked = Boolean(v); else el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    n++;
  }
  return n;
}

export function iniciarEstadoMapa(panel, map, { almacen = globalThis.sessionStorage, conHash = Boolean(globalThis.location?.hash) } = {}) {
  if (!panel) return;
  const estado = leer(almacen);
  estado.controles ||= {};
  // 1) Vista del mapa (si el enlace no pide ir a un evento o país concreto).
  if (map && estado.vista && !conHash) {
    try { map.jumpTo(estado.vista); } catch { /* vista inválida: se ignora */ }
  }
  map?.on?.("moveend", () => {
    const c = map.getCenter();
    estado.vista = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    guardar(estado, almacen);
  });
  // 2) Cada cambio del usuario en el menú se recuerda.
  panel.addEventListener("change", (e) => {
    const k = claveDe(e.target);
    if (!k || !e.isTrusted) return;
    estado.controles[k] = valorDe(e.target);
    guardar(estado, almacen);
  });
  // 3) Restaurar ahora, cuando aparezcan controles nuevos (catálogos que se cargan después) y los subtipos al final.
  aplicar(panel, estado);
  let t = null;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => aplicar(panel, estado), 250); });
  obs.observe(panel, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 30000);
  for (const ms of [2500, 6000]) setTimeout(() => aplicar(panel, estado, { soloSubtipos: true }), ms);
}
