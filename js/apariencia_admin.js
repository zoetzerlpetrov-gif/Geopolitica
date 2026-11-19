// Admin → Apariencia (apariencia.html): elige un tema o ajusta colores, tipografía, esquinas e íconos; la vista previa
// es la propia página y el mapa en miniatura. «Guardar y publicar» escribe en el Worker (/admin/huella/apariencia, con la
// sesión de administración) y todas las páginas lo aplican en menos de un minuto.
import { aplicar, FUENTES } from "./apariencia.js";

export const PRESETS = {
  actual: { nombre: "DOMINUS actual", fuente: "sistema", radio: 8, iconos: "mostrar", titulos_mayusculas: false,
    claro: { bg: "#f5f6f7", surface: "#ffffff", "surface-2": "#eef1f3", text: "#1c2329", "text-2": "#4f5b66", line: "#d5dbe0", accent: "#2e6f8e", focus: "#1a5fb4" },
    oscuro: { bg: "#0f1418", surface: "#161d22", "surface-2": "#1e272e", text: "#e4e9ed", "text-2": "#a3b0ba", line: "#2d3943", accent: "#6fb0cf", focus: "#8ab4f8" } },
  tactico: { nombre: "Táctico (agencia federal)", fuente: "plex-barlow", radio: 3, iconos: "ocultar", titulos_mayusculas: true,
    claro: { bg: "#efeee9", surface: "#fbfaf6", "surface-2": "#e4e2da", text: "#14171c", "text-2": "#4a5260", line: "#c9c6ba", accent: "#7a5c12", focus: "#1f4e8c" },
    oscuro: { bg: "#0a0f17", surface: "#101826", "surface-2": "#172234", text: "#e3e7ee", "text-2": "#8d9ab0", line: "#243248", accent: "#c9a227", focus: "#7fb2ff" } },
  ejecutivo: { nombre: "Ejecutivo sobrio", fuente: "plex", radio: 6, iconos: "ocultar", titulos_mayusculas: false,
    claro: { bg: "#f4f6f9", surface: "#ffffff", "surface-2": "#e9edf3", text: "#111827", "text-2": "#4b5563", line: "#d1d9e4", accent: "#1d4ed8", focus: "#1e40af" },
    oscuro: { bg: "#0b1120", surface: "#111a2e", "surface-2": "#1a2540", text: "#e5e9f2", "text-2": "#9aa6bc", line: "#273452", accent: "#60a5fa", focus: "#93c5fd" } },
  operaciones: { nombre: "Centro de operaciones", fuente: "plex-barlow", radio: 2, iconos: "ocultar", titulos_mayusculas: true,
    claro: { bg: "#eef0ea", surface: "#f9faf6", "surface-2": "#e1e5da", text: "#161a14", "text-2": "#4b5446", line: "#c5ccbb", accent: "#3f5d2a", focus: "#2b5e8c" },
    oscuro: { bg: "#0c100c", surface: "#131a13", "surface-2": "#1b251b", text: "#e2e8dc", "text-2": "#93a08a", line: "#2a3828", accent: "#9cbf5a", focus: "#8fbfff" } },
};
export const NOMBRES = { bg: "Fondo", surface: "Paneles", "surface-2": "Campos y botones", text: "Texto", "text-2": "Texto secundario", line: "Líneas", accent: "Acento (enlaces, selección)", focus: "Foco del teclado" };

/** Contraste WCAG entre dos colores #RRGGBB. */
export function contraste(a, b) {
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
}

/** Avisos de accesibilidad (WCAG 2.2 AA: 4.5 para texto, 3 para elementos grandes o de interfaz). */
export function revisar(c) {
  const out = [];
  for (const m of ["claro", "oscuro"]) {
    const t = c[m];
    if (contraste(t.text, t.surface) < 4.5) out.push(`${m}: el texto sobre los paneles tiene contraste ${contraste(t.text, t.surface)} (mínimo 4.5).`);
    if (contraste(t["text-2"], t.surface) < 4.5) out.push(`${m}: el texto secundario tiene contraste ${contraste(t["text-2"], t.surface)} (mínimo 4.5).`);
    if (contraste(t.accent, t.surface) < 3) out.push(`${m}: el acento tiene contraste ${contraste(t.accent, t.surface)} con los paneles (mínimo 3).`);
  }
  return out;
}

export async function iniciar(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const enWorker = /\.workers\.dev$/.test(location.hostname);
  let c = structuredClone(PRESETS.actual);
  if (enWorker) { try { const r = await fetch("/admin/huella/apariencia", { cache: "no-store" }); if (r.ok) { const d = (await r.json()).datos; if (d?.claro) c = d; } } catch { /* */ } }
  else $("ap-aviso").hidden = false;
  $("ap-presets").innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}" class="preset" style="background:${p.oscuro.bg};color:${p.oscuro.text};border-color:${p.oscuro.accent}"><b style="color:${p.oscuro.accent}">■</b> ${p.nombre}</button>`).join("");
  const fila = (m, k) => `<label class="color"><input type="color" data-m="${m}" data-k="${k}"> ${NOMBRES[k]}</label>`;
  $("ap-colores").innerHTML = ["claro", "oscuro"].map((m) => `<fieldset><legend>Tema ${m}</legend>${Object.keys(NOMBRES).map((k) => fila(m, k)).join("")}</fieldset>`).join("");
  $("ap-fuente").innerHTML = Object.keys(FUENTES).map((k) => `<option value="${k}">${{ sistema: "Del sistema (la actual)", plex: "IBM Plex Sans (corporativa)", "plex-barlow": "IBM Plex + títulos Barlow Condensed (táctica)" }[k]}</option>`).join("");
  const poner = () => {
    for (const i of doc.querySelectorAll("input[data-m]")) i.value = c[i.dataset.m][i.dataset.k];
    $("ap-fuente").value = c.fuente; $("ap-radio").value = c.radio; $("ap-radio-v").textContent = `${c.radio} px`; $("ap-iconos").checked = c.iconos === "ocultar"; $("ap-mayus").checked = !!c.titulos_mayusculas;
  };
  const vista = () => {
    aplicar(c);
    const f = $("ap-mapa"); try { f.contentWindow?.postMessage({ tipo: "apariencia-vista", datos: c }, location.origin); } catch { /* */ }
    const av = revisar(c);
    $("ap-revision").innerHTML = av.length ? `<ul>${av.map((x) => `<li>⚠️ ${x}</li>`).join("")}</ul>` : "<p>✅ Cumple el contraste mínimo de WCAG 2.2 AA en ambos temas.</p>";
  };
  $("ap-presets").addEventListener("click", (e) => { const b = e.target.closest("[data-preset]"); if (!b) return; c = { ...structuredClone(PRESETS[b.dataset.preset]), preset: b.dataset.preset }; poner(); vista(); });
  doc.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset?.m) c[t.dataset.m][t.dataset.k] = t.value;
    else if (t.id === "ap-fuente") c.fuente = t.value;
    else if (t.id === "ap-radio") { c.radio = Number(t.value); $("ap-radio-v").textContent = `${c.radio} px`; }
    else if (t.id === "ap-iconos") c.iconos = t.checked ? "ocultar" : "mostrar";
    else if (t.id === "ap-mayus") c.titulos_mayusculas = t.checked;
    else return;
    c.preset = "personalizado"; vista();
  });
  $("ap-tema").addEventListener("click", () => { const h = doc.documentElement, osc = h.dataset.theme !== "dark"; h.dataset.theme = osc ? "dark" : "light"; });
  $("ap-guardar").addEventListener("click", async () => {
    if (!enWorker) { $("ap-estado").textContent = "Para publicar, abre esta página desde 🔐 Acceso administrativo."; return; }
    $("ap-estado").textContent = "Guardando…";
    try {
      const r = await fetch("/admin/huella/apariencia", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      const j = await r.json().catch(() => ({}));
      $("ap-estado").textContent = r.ok ? `✅ Publicado ${new Date().toLocaleString("es-MX")}. Todo el sitio lo aplica en menos de un minuto.` : `❌ ${j.error || r.status}`;
    } catch { $("ap-estado").textContent = "❌ No se pudo conectar con el Worker."; }
  });
  $("ap-exportar").addEventListener("click", () => { const a = doc.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 1)], { type: "application/json" })); a.download = "apariencia-dominus.json"; a.click(); });
  $("ap-importar").addEventListener("change", async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); if (!d.claro || !d.oscuro) throw Error(); c = d; poner(); vista(); } catch { $("ap-estado").textContent = "El archivo no es una apariencia válida."; } });
  poner(); vista();
}

if (typeof document !== "undefined" && document.getElementById("ap-colores")) { globalThis.__aparienciaVista = true; iniciar(); }
