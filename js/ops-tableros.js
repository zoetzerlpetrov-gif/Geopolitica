// DOMINUS OPS → Tableros: predefinidos y propios (con ayuda de la IA), y War Room para el cliente (warroom.html).
import * as T from "./tableros-logica.js";
import * as I from "./ops-informe-logica.js";
import { dmi, nivelDMI } from "./ops-logica.js";
import { exportarDocumento, htmlSelectorDocumento } from "./exportar.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const getJ = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** Datos para los widgets: lo capturado en OPS + eventos e índice de los países del cliente. */
export async function datosTablero(cfg, publicos) {
  const c = leer("gp_ops_cliente", {}), d = { cliente: c, dmi: leer("gp_ops_dmi", { puntos: {} }), gob: leer("gp_ops_gob", {}), raci: leer("gp_ops_raci", { filas: [] }),
    pl: leer("gp_ops_pl", {}), kpi: leer("gp_ops_kpi", []), esc: leer("gp_ops_esc", []) };
  const total = dmi(d.dmi.puntos || {});
  const paisesCliente = [c.pais, ...String(c.paises || "").split(/[,\s]+/)].map((x) => String(x || "").toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x));
  return { ...publicos(paisesCliente), cliente: c, kpi: d.kpi, esc: d.esc, gob: d.gob, gobDims: cfg.gobernanza.map(([x]) => x), paisesCliente,
    dmi: { total, nivel: nivelDMI(total, cfg.dmi.niveles), puntos: d.dmi.puntos, dimensiones: cfg.dmi.dimensiones }, fases: I.estadoFases(cfg, d) };
}

/** Eventos, índice y nombres públicos (se piden al sitio). Devuelve una función que filtra por países. */
export async function publicosDelSitio() {
  const [ev, idx, gz, tax] = await Promise.all([getJ(`data/events.json?t=${Date.now()}`), getJ(`data/indice-paises.json?t=${Date.now()}`), getJ("config/gazetteer.json"), getJ("config/taxonomy.json")]);
  const paises = Object.fromEntries(Object.entries(gz?.paises || {}).map(([k, v]) => [k, v.es]));
  const nombresArea = Object.fromEntries((tax?.areas || []).map((a) => [a.id, a.nombre]));
  return (ps) => ({ eventos: (ev?.eventos || []).filter((e) => !ps.length || ps.includes(e.pais_iso3)), indice: idx?.paises || {}, paises, nombresArea, actualizado: ev?.generado_utc || ev?.generado || "" });
}

export async function iniciarTableros(cfg) {
  let propios = leer("gp_ops_tab", { tableros: [] }).tableros || [];
  const todos = () => [...T.PREDEFINIDOS, ...propios];
  const actual = () => todos().find((t) => t.id === $("tb-sel").value) || T.PREDEFINIDOS[0];
  const esPropio = () => propios.some((t) => t.id === $("tb-sel").value);
  const guardarP = () => guardar("gp_ops_tab", { tableros: propios });
  let publicos = await publicosDelSitio();

  function llenarSel(id) {
    $("tb-sel").innerHTML = `<optgroup label="De fábrica">${T.PREDEFINIDOS.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("")}</optgroup>`
      + (propios.length ? `<optgroup label="Míos">${propios.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("")}</optgroup>` : "");
    if (id) $("tb-sel").value = id;
  }
  $("tb-tipo").innerHTML = Object.entries(T.WIDGETS).map(([k, [n]]) => `<option value="${k}">${esc(n)}</option>`).join("");
  async function pintar() {
    const t = actual(), d = await datosTablero(cfg, publicos);
    $("tb-vista").innerHTML = t.widgets.map((w) => T.widgetHTML(w, d)).join("");
    $("tb-editor").hidden = false;
    $("tb-nombre").value = t.nombre; $("tb-nombre").disabled = !esPropio();
    $("tb-lista").innerHTML = t.widgets.map((w, i) => `<li>${esc(w.titulo)} <span class="meta">(${esc(T.WIDGETS[w.tipo]?.[0] || w.tipo)}, ${w.ancho || T.WIDGETS[w.tipo]?.[2] || 1} col.)</span>
      ${esPropio() ? `<button type="button" data-mv="${i},-1" aria-label="Subir">↑</button><button type="button" data-mv="${i},1" aria-label="Bajar">↓</button><button type="button" data-del="${i}" aria-label="Quitar">✕</button>` : ""}</li>`).join("");
    $("tb-estado").textContent = esPropio() ? "" : "Tablero de fábrica: «Duplicar» para editarlo.";
    $("tb-borrar").disabled = !esPropio();
  }
  const nuevo = (base) => { const t = { id: `t${Date.now().toString(36)}`, nombre: base ? `${base.nombre} (copia)` : "Mi tablero", widgets: base ? structuredClone(base.widgets) : [] }; propios.push(t); guardarP(); llenarSel(t.id); pintar(); };
  $("tb-nuevo").onclick = () => nuevo(null);
  $("tb-dup").onclick = () => nuevo(actual());
  $("tb-borrar").onclick = () => { if (esPropio() && confirm("¿Eliminar este tablero?")) { propios = propios.filter((t) => t.id !== $("tb-sel").value); guardarP(); llenarSel(); pintar(); } };
  $("tb-sel").onchange = pintar;
  $("tb-nombre").oninput = () => { const t = actual(); if (esPropio()) { t.nombre = $("tb-nombre").value; guardarP(); $("tb-sel").selectedOptions[0].textContent = t.nombre; } };
  $("tb-add").onclick = () => {
    if (!esPropio()) nuevo(actual());
    const t = actual(), tipo = $("tb-tipo").value;
    t.widgets.push({ tipo, titulo: $("tb-titulo").value || T.WIDGETS[tipo][0], ancho: Number($("tb-ancho").value), ...(tipo === "texto" ? { texto: prompt("Texto de la nota:") || "" } : {}) });
    guardarP(); pintar();
  };
  $("tb-lista").addEventListener("click", (e) => {
    const t = actual(), mv = e.target.closest("[data-mv]"), del = e.target.closest("[data-del]");
    if (mv) { const [i, s] = mv.dataset.mv.split(",").map(Number), j = i + s; if (j >= 0 && j < t.widgets.length) [t.widgets[i], t.widgets[j]] = [t.widgets[j], t.widgets[i]]; }
    else if (del) t.widgets.splice(Number(del.dataset.del), 1); else return;
    guardarP(); pintar();
  });
  $("tb-ia").onclick = async () => {
    const CH = await import("./chat_ia.js"), k = CH.leerLlave()?.llave;
    if (!k) { $("tb-ia-estado").textContent = "Guarda tu llave de Groq en el mapa para usar esta opción."; return; }
    $("tb-ia-estado").textContent = "Diseñando…";
    try {
      const c = leer("gp_ops_cliente", {});
      const r = await CH.completar(T.promptTablero($("tb-ia-txt").value || "tablero ejecutivo", `${c.nombre || ""}, sector ${c.sector || "—"}, país ${c.pais || "—"}`), k, { maxTokens: 900 });
      const t = T.leerTableroIA(typeof r === "string" ? r : r?.texto);
      if (!t) { $("tb-ia-estado").textContent = "La IA no devolvió un diseño válido; intenta describirlo de otra forma."; return; }
      const nuevoT = { id: `t${Date.now().toString(36)}`, ...t };
      propios.push(nuevoT); guardarP(); llenarSel(nuevoT.id); await pintar();
      $("tb-ia-estado").textContent = `Listo: «${t.nombre}» con ${t.widgets.length} widgets. Puedes moverlos o quitarlos.`;
    } catch (e) { $("tb-ia-estado").textContent = CH.mensajeError ? CH.mensajeError(e) : e.message; }
  };
  const enlace = async () => {
    const d = await datosTablero(cfg, () => ({}));
    const paquete = await T.empaquetar({ tablero: actual(), datos: T.instantanea(d) });
    return new URL(`warroom.html#d=${paquete}`, location.href).href;
  };
  $("tb-wr").onclick = async () => window.open(await enlace(), "_blank", "noopener");
  $("tb-enlace").onclick = async () => {
    const u = await enlace();
    try { await navigator.clipboard.writeText(u); $("tb-estado").textContent = `Enlace copiado (${Math.round(u.length / 1024)} KB). Quien lo abra verá este tablero; los eventos se actualizan solos, los datos de la empresa son los de hoy.`; }
    catch (e) { $("tb-estado").textContent = `Copia este enlace: ${u}`; }
  };
  $("tb-doc").innerHTML = htmlSelectorDocumento("tbd");
  $("tbd-btn").onclick = () => exportarDocumento($("tbd-fmt").value, { titulo: `Tablero ${actual().nombre}`, html: `<style>${T.CSS_TABLEROS}</style><h1>${esc(actual().nombre)}</h1><p class="meta">${esc(leer("gp_ops_cliente", {}).nombre || "")} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p><div class="tb-grid">${$("tb-vista").innerHTML}</div>` }).catch((e) => { $("tb-estado").textContent = e.message; });
  const st = document.createElement("style"); st.textContent = T.CSS_TABLEROS; document.head.appendChild(st);
  llenarSel();
  document.querySelector('.pestanas button[data-p="tableros"]')?.addEventListener("click", pintar);
  setInterval(async () => { if (!$("p-tableros").hidden) { publicos = await publicosDelSitio(); pintar(); } }, 60000);
}
