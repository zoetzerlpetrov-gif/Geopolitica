// Versión de pago en todas las páginas (Fase 7). En el sitio público (dominusosint.com) siempre está activa: el plan es
// el de la cuenta verificada o Demo. En administración se simula con ?vista=pago&plan=… y los enlaces internos lo
// conservan, para que volver al mapa no lleve a la versión completa ni a otro plan. También impide abrir directo una
// sección de solo admin o de un plan superior. En administración sin ?vista=pago no hace nada.
import "./bitacora.js";
import "./idioma_pagina.js";  // el idioma elegido en el mapa se aplica también aquí  // bitácora local de errores para soporte (soporte.html), en todas las páginas
import { vistaActual, planActual, planFaltante, esSitioAdmin } from "./licencias.js";
import { iniciarPlanCliente } from "./plan_cliente.js";
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

/** Páginas que se comparten por enlace con terceros (demostración para directivos y vista de directivo de la cartera):
 *  se abren tal cual, sin candados ni botón de planes. */
// Las «empresa-*.html» son las herramientas de DOMINUS OPS, Caja e Inteligencia corporativa para las empresas cliente:
// solo funcionan dentro de Mi empresa, con la sesión de un miembro (js/sincronizar.js revisa el acceso con el servidor).
export const COMPARTIDAS = new Set(["demo.html", "cartera.html", "empresa-ops.html", "empresa-caja.html", "empresa-corporativo.html"]);

async function iniciar() {
  if (vistaActual() !== "pago") return;
  const admin = esSitioAdmin();
  for (const elemento of document.querySelectorAll("[data-solo-admin]")) elemento.remove();
  const [planes, ops] = await Promise.all([
    fetch("config/planes.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("config/paginas_admin.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ paginas: [] })),
  ]);
  // Páginas de administración (las que se publican en /ops/): nunca forman parte de un plan.
  const deOps = new Set((ops.paginas || []).map((p) => `${p}.html`));
  const soloAdmin = (pagina) => deOps.has(pagina) || paginaSoloAdmin(planes, pagina);
  const plan = planActual(planes);
  const ultimo = location.pathname.split("/").pop() || "index.html";
  const aqui = paginaDe(/\.html$/i.test(ultimo) ? ultimo : ultimo + ".html");  // Cloudflare sirve /tutorial sin «.html»
  if (!admin && COMPARTIDAS.has(aqui)) return;
  // En el sitio público el plan no viaja en el enlace (sale de la sesión); en administración sí, para simularlo.
  const enlace = (href) => (admin ? conVista(href, plan) : href);
  const salir = (titulo, texto) => {
    document.body.innerHTML = `<main style="max-width:640px;margin:15vh auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif">
      <h1>${titulo}</h1><p>${texto}</p><p><a href="${enlace("./")}">Volver al mapa</a> · <a href="${enlace("planes.html")}">Ver planes</a></p></main>`;
  };
  if (location.pathname.includes("/ops/") || soloAdmin(aqui)) return salir("Sección no disponible", "Esta sección no forma parte de los planes.");
  const falta = planFaltante(planes, plan, "paginas", aqui);
  if (falta) return salir(`🔒 Disponible desde el plan ${falta.nombre}`, "Tu plan actual no incluye esta sección.");

  const arreglar = (a) => {
    if (a.hasAttribute("data-solo-admin")) { a.remove(); return; }  // enlaces de administración agregados después del inicio
    const href = a.getAttribute("href");
    if (!esInterno(href)) return;
    const destino = paginaDe(href);
    if (soloAdmin(destino)) {
      // Invisible para clientes: si el enlace es lo único de su renglón de lista, se quita el renglón entero.
      const li = a.closest("li");
      if (li && li.querySelectorAll("a[href]").length === 1) li.remove(); else a.remove();
      return;
    }
    // Sección de un plan superior: se ve con candado y lleva a la comparación de planes.
    const req = !a.classList.contains("enlace-bloqueado") && planFaltante(planes, plan, "paginas", destino);
    if (req) {
      a.classList.add("enlace-bloqueado");
      a.textContent = `🔒 ${a.textContent.trim()} · plan ${req.nombre}`;
      a.title = `Disponible desde el plan ${req.nombre}`;
      a.setAttribute("href", enlace(`planes.html#${req.id}`));
      return;
    }
    const nuevo = enlace(href);
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
  iniciarPlanCliente(planes, plan, enlace);
  if (!admin) return;
  for (const f of document.querySelectorAll("form[action]")) if (esInterno(f.getAttribute("action"))) {
    f.insertAdjacentHTML("beforeend", `<input type="hidden" name="vista" value="pago"><input type="hidden" name="plan" value="${encodeURIComponent(plan)}">`);
  }
}

if (typeof document !== "undefined") iniciar().catch((e) => console.error("vista de pago (enlaces)", e));
