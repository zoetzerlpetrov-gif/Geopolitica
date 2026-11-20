// Apariencia del sitio: aplica a cualquier página los colores, tipografía, esquinas e íconos guardados en
// Admin → Apariencia (Worker /apariencia/datos.json). Usa una copia en este navegador para pintar al instante y la
// actualiza en segundo plano. Sin datos guardados, el sitio se ve como siempre (css/tema.css).
export const ENDPOINT = "https://admin.dominusosint.com/apariencia/datos.json";
const CLAVE = "gp_apariencia";
export const FUENTES = {
  sistema: { cuerpo: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', titulos: "", mono: 'ui-monospace, "SFMono-Regular", Consolas, monospace' },
  plex: { cuerpo: '"IBM Plex Sans", system-ui, sans-serif', titulos: "", mono: '"IBM Plex Mono", ui-monospace, monospace' },
  "plex-barlow": { cuerpo: '"IBM Plex Sans", system-ui, sans-serif', titulos: '"Barlow Condensed", "IBM Plex Sans", sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace' },
};
// Apariencia predeterminada mientras no haya una publicada desde Admin → Apariencia: tema «Táctico» (un solo acento
// latón, rojo reservado para alertas, esquinas de 3 px, IBM Plex + Barlow Condensed alojadas en el sitio, sin emoji).
export const DEFECTO = { preset: "tactico", nombre: "Táctico (agencia federal)", fuente: "plex-barlow", radio: 3, iconos: "ocultar", titulos_mayusculas: true,
  claro: { bg: "#efeee9", surface: "#fbfaf6", "surface-2": "#e4e2da", text: "#14171c", "text-2": "#4a5260", line: "#c9c6ba", accent: "#7a5c12", focus: "#1f4e8c" },
  oscuro: { bg: "#0a0f17", surface: "#101826", "surface-2": "#172234", text: "#e3e7ee", "text-2": "#8d9ab0", line: "#243248", accent: "#c9a227", focus: "#7fb2ff" } };
const VARS = ["bg", "surface", "surface-2", "text", "text-2", "line", "accent", "focus"];
const EMOJI = /^[\p{Extended_Pictographic}\p{Regional_Indicator}️‍⃣\s]+/u;

/** CSS a partir de la configuración (solo valores validados: colores #RRGGBB y opciones cerradas). */
export function css(c) {
  if (!c || !c.claro || !c.oscuro) return "";
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : null);
  const bloque = (m) => VARS.map((k) => (hex(c[m][k]) ? `--${k}:${c[m][k]};` : "")).join("");
  const f = FUENTES[c.fuente] || FUENTES.sistema, r = Math.max(0, Math.min(16, Number(c.radio) || 0));
  const raiz = `--font:${f.cuerpo};--mono:${f.mono};--radius:${r}px;`;
  const titulos = f.titulos ? `h1,h2,h3,.grupo-tit,.ventana-tit,.marca span{font-family:${f.titulos};letter-spacing:.06em;font-weight:700}` : "";
  const mayus = c.titulos_mayusculas ? "h1,.grupo-tit{text-transform:uppercase}" : "";
  return `:root{${raiz}${bloque("claro")}}:root[data-theme="dark"]{${bloque("oscuro")}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${bloque("oscuro")}}}body{font-family:var(--font)}${titulos}${mayus}`;
}

/** Quita el emoji del inicio de un texto («🛡️ Vigía» → «Vigía»). */
export const sinEmoji = (t) => String(t).replace(EMOJI, "");

const SELECTORES = "summary, h1, h2, h3, h4, .grupo-tit, .admin-menu-contenido a, button, label.fila span, .chip, nav a, .ventana-tit, .concepto span";
function ocultarIconos(raiz) {
  for (const el of raiz.querySelectorAll?.(SELECTORES) || []) {
    const n = [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
    if (n && EMOJI.test(n.textContent) && sinEmoji(n.textContent).trim()) n.textContent = sinEmoji(n.textContent);
    const sp = el.firstElementChild;   // emoji en su propio <span aria-hidden>
    // Solo el emoji en su propio <span>: los íconos dibujados (la cruz roja de la marca, <svg> o <img>) se conservan.
    // El candado del plan (.plan-candado) no es decoración: indica qué no incluye el plan. Si se quitara, plan_cliente.js
    // lo volvería a poner y los dos se alternarían sin fin (parpadeo de candados en el menú).
    if (sp?.tagName === "SPAN" && sp.getAttribute("aria-hidden") === "true" && !sp.classList.contains("plan-candado") && sp.textContent.trim() && !sinEmoji(sp.textContent).trim()) sp.remove();
  }
}

let observador = null;
export function aplicar(c, doc = document) {
  let st = doc.getElementById("apariencia-css");
  if (!st) { st = doc.createElement("style"); st.id = "apariencia-css"; doc.head.append(st); }
  st.textContent = css(c);
  if (c && FUENTES[c.fuente] && c.fuente !== "sistema" && !doc.getElementById("apariencia-fuentes")) {
    const l = doc.createElement("link"); l.id = "apariencia-fuentes"; l.rel = "stylesheet";
    l.href = new URL("../vendor/fonts/fuentes.css", import.meta.url).href;
    doc.head.append(l);
  }
  observador?.disconnect(); observador = null;
  if (c?.iconos === "ocultar") {
    const correr = () => ocultarIconos(doc);
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", correr, { once: true }); else correr();
    let t = null;
    observador = new MutationObserver(() => { clearTimeout(t); t = setTimeout(correr, 120); });
    const iniciarObs = () => observador?.observe(doc.body, { childList: true, subtree: true });
    if (doc.body) iniciarObs(); else doc.addEventListener("DOMContentLoaded", iniciarObs, { once: true });
  }
}

if (typeof document !== "undefined" && !globalThis.__aparienciaVista) {
  let copia = null;
  try { copia = JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch { /* sin copia */ }
  aplicar(copia?.claro ? copia : DEFECTO);
  fetch(ENDPOINT, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((c) => {
    if (!c) return;
    const vacio = !c.claro;
    try { if (vacio) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* */ }
    aplicar(vacio ? DEFECTO : c);
  }).catch(() => {});
}
