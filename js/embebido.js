// Modo incrustado: cuando una página de herramientas (DOMINUS OPS, Caja del analista, Inteligencia corporativa, Clientes,
// Cartera) se abre dentro de «Proyectos de principio a fin» (proyectos.html) con ?embebido=1&panel=<pestaña>,
// oculta su encabezado y su barra de pestañas, abre solo la pestaña pedida y avisa su altura a la página contenedora.
// Fuera de ese modo no hace nada. Solo habla con la página contenedora del mismo origen.
const q = new URLSearchParams(location.search);
if (q.get("embebido") === "1" && window.parent !== window) {
  const panel = q.get("panel") || "";
  document.documentElement.classList.add("embebido");
  const css = document.createElement("style");
  css.textContent = `.embebido header.topbar, .embebido .pestanas, .embebido nav[role=tablist], .embebido .mejorar-plan, .embebido #btn-mejorar { display: none !important; }
    .embebido body { padding-top: 0 !important; margin-top: 0 !important; } .embebido main { padding-top: 6px !important; }`;
  document.head.append(css);
  // Abre la pestaña pedida cuando la página ya montó sus botones (sus módulos cargan después).
  let intentos = 0;
  const abrir = () => {
    if (!panel) return;
    const b = document.querySelector(`[role=tab][data-p="${CSS.escape(panel)}"]`);
    if (b) { if (b.getAttribute("aria-selected") !== "true") b.click(); return; }
    if (++intentos < 50) setTimeout(abrir, 100);
  };
  const avisar = () => window.parent.postMessage({ dominusEmbebido: true, panel, alto: Math.ceil(document.body?.scrollHeight || document.documentElement.scrollHeight) }, location.origin);
  window.addEventListener("load", () => { abrir(); avisar(); });
  if (document.readyState !== "loading") abrir(); else document.addEventListener("DOMContentLoaded", abrir);
  new ResizeObserver(avisar).observe(document.documentElement);
  // Si la página cambia sola a otra pestaña (p. ej. «Abrir en la pestaña Bitácora»), las pestañas están ocultas:
  // aparece un botón para volver a la pestaña de este paso.
  if (panel) {
    const volver = document.createElement("button");
    volver.type = "button"; volver.hidden = true;
    volver.style.cssText = "position:sticky;top:0;z-index:20;margin:6px 0;font:inherit;font-weight:700;padding:6px 14px;border-radius:8px;border:2px solid var(--accent,#C8102E);background:var(--surface,#fff);color:var(--text,#111);cursor:pointer";
    const original = () => document.querySelector(`[role=tab][data-p="${CSS.escape(panel)}"]`);
    volver.addEventListener("click", () => { original()?.click(); volver.hidden = true; window.scrollTo(0, 0); });
    const revisar = () => {
      const o = original(); if (!o) return;
      const activa = document.querySelector('[role=tab][aria-selected="true"]');
      volver.hidden = !activa || activa === o;
      if (!volver.hidden) volver.textContent = `↩ Volver a «${o.textContent.trim()}»`;
    };
    document.addEventListener("click", () => setTimeout(revisar, 50), true);
    document.addEventListener("DOMContentLoaded", () => (document.querySelector("main") || document.body).prepend(volver));
    if (document.readyState !== "loading") (document.querySelector("main") || document.body).prepend(volver);
  }
  // Enlaces a otras páginas: se abren en otra pestaña (la página de proyectos no se pierde).
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (a && !a.target && !a.getAttribute("href").startsWith("#")) { a.target = "_blank"; a.rel = "noopener"; }
  }, true);
}
