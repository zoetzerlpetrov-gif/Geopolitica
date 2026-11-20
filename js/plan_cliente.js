// Experiencia del cliente en la vista de pago (sitio público dominusosint.com y simulación en administración):
// 1) verifica con el Worker el plan de la cuenta que inició sesión (Google o GitHub) y lo recuerda en la pestaña;
// 2) bloquea descargar, exportar e imprimir por debajo del plan que lo incluye (config/planes.json → acciones);
// 3) muestra un botón flotante «Mejorar plan» (Demo, Recon y Analyst) con una ventana que lleva a Planes y a la compra.
// Nota honesta: en un sitio estático esto ordena la experiencia, pero no protege archivos; los datos que deben ser
// exclusivos de un plan tienen que servirse desde el Worker con el plan verificado.
import { ADMIN_ORIGEN } from "./admin_origen.js";
import { esSitioAdmin, planDeSesion, PLAN_SESION, puedeDescargar } from "./licencias.js";
import { precioCorto, enlaceCompra } from "./planes.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const REVISADO = "gp_plan_revisado", CADA_MS = 10 * 60 * 1000;
/** ¿Hay una sesión verificada en esta pestaña (registro gratuito o plan de pago)? */
const conSesion = (almacen = globalThis.sessionStorage) => { try { return Boolean(almacen?.getItem(PLAN_SESION)); } catch { return false; } };

/** Botones de cuenta: «Iniciar sesión» y «Registrarse gratis», o «Mi cuenta» si ya hay sesión. */
export function htmlCuenta(sesion, nombrePlan = "") {
  return sesion
    ? `<a class="plan-cuenta" href="${esc(ADMIN_ORIGEN)}/cuenta/" title="Ver tu cuenta y cerrar sesión">👤 Mi cuenta${nombrePlan ? ` · ${esc(nombrePlan)}` : ""}</a>`
    : `<a class="plan-cuenta" href="${esc(ADMIN_ORIGEN)}/cuenta/" title="Si ya tienes cuenta o ya pagaste">Iniciar sesión</a><a class="plan-cuenta plan-cuenta-alta" href="${esc(ADMIN_ORIGEN)}/cuenta/google" title="Gratis, con tu cuenta de Google">Registrarse gratis</a>`;
}

/** Consulta el plan de la cuenta en el Worker (cookie de sesión del mismo sitio). Si cambió, lo guarda y recarga. */
export async function verificarPlan(planes, { almacen = globalThis.sessionStorage, forzar = /[?&]revisar=1\b/.test(globalThis.location?.search || "") } = {}) {
  if (esSitioAdmin()) return null;
  const ids = (planes?.planes || []).map((p) => p.id), antes = planDeSesion(ids, almacen);
  let ultimo = 0; try { ultimo = Number(almacen.getItem(REVISADO) || 0); } catch { /* */ }
  if (!forzar && Date.now() - ultimo < CADA_MS) return antes;
  try { almacen.setItem(REVISADO, String(Date.now())); } catch { return antes; }
  let plan = antes;
  try {
    const r = await fetch(`${ADMIN_ORIGEN}/cuenta/sesion`, { credentials: "include", cache: "no-store" });
    if (r.ok) { const p = (await r.json())?.plan; plan = ids.includes(p) ? p : null; }
    else if (r.status === 403 || r.status === 401) plan = null;   // sin sesión o sin plan activo: Demo
  } catch { return antes; }  // sin red: se conserva lo que había (no se baja de plan por un corte)
  if (plan === antes) return plan;
  try { if (plan) almacen.setItem(PLAN_SESION, plan); else almacen.removeItem(PLAN_SESION); } catch { return antes; }
  globalThis.location?.reload();
  return plan;
}

// ---------------------------------------------------------------- ventana (descargas bloqueadas y mejorar plan)
function ventana(html) {
  let d = document.getElementById("plan-ventana");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "plan-ventana";
    d.className = "plan-ventana";
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-cerrar]")) d.close(); });
    document.body.append(d);
  }
  d.innerHTML = `<button type="button" class="plan-cerrar" data-cerrar aria-label="Cerrar">✕</button>${html}`;
  if (!d.open) d.showModal?.() ?? d.setAttribute("open", "");
  return d;
}

/** HTML de la ventana «Mejorar plan»: planes superiores al actual, con precio en USD y su enlace de compra. */
export function htmlMejorar(planes, plan, conVista, motivo = "") {
  const lista = planes?.planes || [], i = lista.findIndex((p) => p.id === plan), actual = lista[i];
  const superiores = lista.slice(i + 1);
  return `<h2>⬆ Mejora tu plan</h2>
    ${motivo ? `<p class="plan-motivo">${esc(motivo)}</p>` : ""}
    <p>Tu plan actual: <b>${esc(actual?.nombre || plan)}</b>${actual ? ` (${esc(precioCorto(actual))})` : ""}.</p>
    <div class="plan-opciones">${superiores.map((p) => {
      const compra = enlaceCompra(p);
      return `<section><h3>${esc(p.nombre)} · ${esc(precioCorto(p))}</h3><ul>${(p.incluye || []).slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <p>${compra ? `<a class="plan-btn" href="${esc(compra)}" target="_blank" rel="noopener noreferrer">💳 Comprar ${esc(p.nombre)}</a>` : `<span class="plan-btn plan-btn-off" aria-disabled="true" title="El cobro en línea se activa en cuanto estén los enlaces de Mercado Pago">💳 Comprar · muy pronto</span>`}
        <br><a href="${esc(conVista(`planes.html#${p.id}`))}">Ver detalle</a></p></section>`;
    }).join("")}</div>
    <p class="plan-pie"><a class="plan-btn" href="${esc(conVista("planes.html"))}">Ver todos los planes y precios</a></p>
    <p class="plan-pie">${conSesion() ? `<a href="${esc(ADMIN_ORIGEN)}/cuenta/">Mi cuenta</a>` : `¿Ya pagaste? <a href="${esc(ADMIN_ORIGEN)}/cuenta/">Inicia sesión</a> · ¿Aún no tienes cuenta? <a href="${esc(ADMIN_ORIGEN)}/cuenta/google">Regístrate gratis</a> (se necesita para comprar).`}</p>`;
}

const ESTILO = `.plan-flotante{position:fixed;left:14px;bottom:14px;z-index:900;font:600 14px/1 var(--font,system-ui);padding:10px 14px;border-radius:999px;border:1px solid var(--accent,#c9a227);background:var(--surface,#101826);color:var(--text,#e3e7ee);box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer}
.plan-flotante:hover{background:var(--accent,#c9a227);color:#111}
.plan-ventana{max-width:min(760px,94vw);border:1px solid var(--line,#243248);border-radius:10px;background:var(--surface,#101826);color:var(--text,#e3e7ee);padding:18px 20px;font:15px/1.5 var(--font,system-ui)}
.plan-ventana::backdrop{background:rgba(0,0,0,.6)}.plan-ventana h2{margin:0 0 8px}.plan-ventana h3{margin:0 0 4px;font-size:16px}
.plan-opciones{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.plan-opciones section{border:1px solid var(--line,#243248);border-radius:8px;padding:10px}
.plan-opciones ul{margin:4px 0;padding-left:18px;font-size:13px}.plan-cerrar{float:right;background:none;border:0;color:inherit;font-size:20px;cursor:pointer}
.plan-btn{display:inline-block;padding:6px 12px;border-radius:6px;background:var(--accent,#c9a227);color:#111 !important;text-decoration:none;font-weight:700}
.plan-btn-off{opacity:.55;cursor:not-allowed;background:var(--line,#555);color:var(--text,#eee)!important}
.plan-acceso{display:inline-flex;gap:6px;align-items:center;margin-left:8px}.plan-cuenta{font:600 13px/1 var(--font,system-ui);padding:7px 10px;border-radius:6px;border:1px solid var(--line,#243248);color:var(--text,#e3e7ee);text-decoration:none;white-space:nowrap;background:var(--surface,transparent)}
.plan-cuenta-alta{background:var(--accent,#c9a227);color:#111;border-color:var(--accent,#c9a227)}
.plan-acceso-flotante{position:fixed;right:14px;bottom:14px;z-index:900}
@media (max-width:700px){.plan-acceso:not(.plan-acceso-flotante){display:none}.plan-acceso-flotante{bottom:62px;left:14px;right:auto}}
.plan-motivo{border-left:4px solid var(--accent,#c9a227);padding:4px 10px}.plan-bloqueado{opacity:.75}
@media print{body.sin-imprimir>*{display:none!important}body.sin-imprimir::before{content:"🔒 Imprimir y guardar como PDF está disponible en el plan Command.";display:block;padding:40px;font:18px system-ui}}`;

const ES_ARCHIVO = /\.(pdf|pptx?|xlsx?|docx?|csv|zip|md|json|geojson|kml)(?:[?#]|$)/i;
const ES_BOTON_DESCARGA = /descargar|exportar|imprimir|guardar como pdf|powerpoint|⬇|🖨/i;

/** Pone candado a descargas, exportaciones e impresión. Devuelve la función que abre la ventana. */
function bloquearDescargas(planes, plan, conVista) {
  const req = planes.planes.find((p) => p.id === (planes.acceso_por_plan?.acciones?.descargar || "command"));
  const motivo = `Descargar, exportar e imprimir reportes y documentos está disponible desde el plan ${req?.nombre || "Command"}${req ? ` (${precioCorto(req)})` : ""}.`;
  const avisar = () => ventana(htmlMejorar(planes, plan, conVista, motivo));
  document.body.classList.add("sin-imprimir");
  globalThis.print = avisar;
  // Descargas creadas por código (a.download + click() sin estar en la página).
  const clicOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") || /^(blob|data):/i.test(this.getAttribute("href") || "")) return avisar();
    return clicOriginal.call(this);
  };
  // Enlaces y botones visibles: candado y ventana al hacer clic.
  const marcar = (el) => {
    if (el.dataset.planBloqueo) return;
    const enlaceArchivo = el.matches("a[download], a[href]") && (el.hasAttribute("download") || ES_ARCHIVO.test(el.getAttribute("href") || ""));
    const boton = el.matches("button") && ES_BOTON_DESCARGA.test(el.textContent || "");
    if (!enlaceArchivo && !boton) return;
    el.dataset.planBloqueo = "1";
    el.classList.add("plan-bloqueado");
    el.title = motivo;
    if (!el.textContent.includes("🔒")) el.insertAdjacentText("afterbegin", "🔒 ");
  };
  const todo = (raiz) => { for (const el of raiz.querySelectorAll?.("a[href], button") || []) marcar(el); };
  todo(document);
  new MutationObserver((c) => { for (const m of c) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches("a[href], button")) marcar(n); todo(n); } })
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-plan-bloqueo]");
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation(); avisar();
  }, true);
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); avisar(); } }, true);
}

/** Arranca la experiencia del cliente en una página con vista de pago. */
export function iniciarPlanCliente(planes, plan, conVista, { compartida = false } = {}) {
  if (typeof document === "undefined" || compartida) return;
  const s = document.createElement("style"); s.textContent = ESTILO; document.head.append(s);
  if (!puedeDescargar(planes, plan)) bloquearDescargas(planes, plan, conVista);
  const ids = planes.planes.map((p) => p.id);
  if (ids.indexOf(plan) < ids.length - 1 && !/planes(\.html)?$/.test(location.pathname)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "plan-flotante"; b.id = "plan-mejorar";
    b.textContent = "⬆ Mejorar plan";
    b.title = "Ver planes y precios";
    b.addEventListener("click", () => ventana(htmlMejorar(planes, plan, conVista)));
    document.body.append(b);
  }
  // Acceso a la cuenta (solo en el sitio público): en la barra superior si existe; si no, flotante.
  if (!esSitioAdmin()) {
    const nombre = planes.planes.find((p) => p.id === plan)?.nombre || "";
    const caja = document.createElement("span");
    caja.className = "plan-acceso"; caja.id = "plan-acceso";
    caja.innerHTML = htmlCuenta(conSesion(), nombre);
    const ancla = document.querySelector(".topbar .vista-pago, .topbar .marca, header .marca");
    if (ancla) ancla.after(caja); else { caja.classList.add("plan-acceso-flotante"); document.body.append(caja); }
    // En pantallas chicas la barra se oculta: copia flotante.
    if (ancla && matchMedia?.("(max-width:700px)").matches) { const f = caja.cloneNode(true); f.id = "plan-acceso-movil"; f.classList.add("plan-acceso-flotante"); document.body.append(f); }
    verificarPlan(planes).catch(() => {});
  }
}

export { PLAN_SESION };
