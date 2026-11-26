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
  // Enlaces a otras páginas: se abren en otra pestaña (la página de proyectos no se pierde).
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (a && !a.target && !a.getAttribute("href").startsWith("#")) { a.target = "_blank"; a.rel = "noopener"; }
  }, true);
}
