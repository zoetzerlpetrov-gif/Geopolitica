// Versión de pago en todas las páginas (Fase 7): los enlaces internos conservan ?vista=pago&plan=…, para que volver al
// mapa o pasar a otra sección no lleve a la versión completa (admin) ni a otro plan. También impide abrir directo una
// sección de solo admin o de un plan superior. Sin ?vista=pago no hace nada: la versión completa queda igual.
import { vistaActual, planActual, planFaltante } from "./licencias.js";
import { paginaSoloAdmin } from "./planes.js";

const PAGINA = /^(?:\.\/|\.\.?$|[\w-]+\.html)?(?:[?#].*)?$/i;

/** ¿El enlace es a una página de este sitio? (relativo: «./», «index.html?x=1», «#a» no cuenta: no cambia de página). */
export function esInterno(href) {
  const h = String(href || "").trim();
  if (!h || h.startsWith("#") || /^[a-z][\w+.-]*:/i.test(h) || h.startsWith("//") || h.startsWith("/")) return false;
  return PAGINA.test(h);
}

/** Nombre del archivo de un enlace interno («./» → index.html). */
export const paginaDe = (href) => String(href || "").split(/[?#]/)[0].replace(/^\.\/?$/, "").split("/").pop() || "index.html";

/** Mismo enlace con vista=pago y el plan; respeta los demás parámetros y el «#». Idempotente. */
export function conVista(href, plan) {
  const [sinHash, ...h] = String(href).split("#");
  const [ruta, q = ""] = sinHash.split("?");
  const p = new URLSearchParams(q);
  p.delete("vista"); p.delete("plan");
  const resto = p.toString();
  return `${ruta || "./"}?vista=pago&plan=${encodeURIComponent(plan)}${resto ? "&" + resto : ""}${h.length ? "#" + h.join("#") : ""}`;
}

async function iniciar() {
  if (vistaActual() !== "pago") return;
  const planes = await fetch("config/planes.json").then((r) => r.json());
  const plan = planActual(planes);
  const aqui = paginaDe(location.pathname.split("/").pop() || "index.html");
  const salir = (titulo, texto) => {
    document.body.innerHTML = `<main style="max-width:640px;margin:15vh auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif">
      <h1>${titulo}</h1><p>${texto}</p><p><a href="${conVista("./", plan)}">Volver al mapa</a> · <a href="${conVista("planes.html", plan)}">Ver planes</a></p></main>`;
  };
  if (paginaSoloAdmin(planes, aqui)) return salir("Sección no disponible", "Esta sección no forma parte de los planes.");
  const falta = planFaltante(planes, plan, "paginas", aqui);
  if (falta) return salir(`🔒 Disponible desde el plan ${falta.nombre}`, "Tu plan actual no incluye esta sección.");

  const arreglar = (a) => {
    const href = a.getAttribute("href");
    if (!esInterno(href)) return;
    const destino = paginaDe(href);
    if (paginaSoloAdmin(planes, destino)) { a.remove(); return; }
    // Sección de un plan superior: se ve con candado y lleva a la comparación de planes.
    const req = !a.classList.contains("enlace-bloqueado") && planFaltante(planes, plan, "paginas", destino);
    if (req) {
      a.classList.add("enlace-bloqueado");
      a.textContent = `🔒 ${a.textContent.trim()} · plan ${req.nombre}`;
      a.title = `Disponible desde el plan ${req.nombre}`;
      a.setAttribute("href", conVista(`planes.html#${req.id}`, plan));
      return;
    }
    const nuevo = conVista(href, plan);
    if (nuevo !== href) a.setAttribute("href", nuevo);
  };
  const todo = (raiz) => { if (raiz.matches?.("a[href]")) arreglar(raiz); for (const a of raiz.querySelectorAll?.("a[href]") || []) arreglar(a); };
  todo(document);
  // Enlaces que las páginas dibujan después (fichas, listas, reportes) o a los que se les cambia el href.
  new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === "attributes") arreglar(c.target);
      else for (const n of c.addedNodes) if (n.nodeType === 1) todo(n);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  // Formularios GET internos: llevan la vista y el plan como campos ocultos.
  for (const f of document.querySelectorAll("form[action]")) if (esInterno(f.getAttribute("action"))) {
    f.insertAdjacentHTML("beforeend", `<input type="hidden" name="vista" value="pago"><input type="hidden" name="plan" value="${encodeURIComponent(plan)}">`);
  }
}

if (typeof document !== "undefined") iniciar().catch((e) => console.error("vista de pago (enlaces)", e));
