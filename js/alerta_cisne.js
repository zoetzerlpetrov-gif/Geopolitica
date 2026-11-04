// Aviso fijo bajo el buscador del mapa para casos excepcionales («cisne negro») emitidos por gobiernos u organismos
// oficiales: p. ej. FORTRESS America o el llamado del Reino Unido a guardar reservas. Sale de la capa de protocolos
// (data/vivos/protocolos.geojson, «cisne_negro»: true) y se queda desde su fecha hasta que se marca «desactivado».
// Va arriba a la derecha del mapa (no tapa las sugerencias del buscador) y se puede arrastrar por su barra roja;
// la posición se recuerda en este navegador y doble clic en la barra la regresa a su lugar.
import { esc } from "./util.js";

const URL_DATOS = "data/vivos/protocolos.geojson";
const REFRESCO_MS = 30 * 60 * 1000;
const CLAVE_POS = "gp_alerta_cisne_pos";

/** Posición dentro del contenedor sin salirse (deja visible al menos la barra). */
export function acotar(x, y, ancho, alto, anchoCont, altoCont) {
  return { x: Math.round(Math.min(Math.max(0, x), Math.max(0, anchoCont - ancho))), y: Math.round(Math.min(Math.max(0, y), Math.max(0, altoCont - Math.min(alto, 40)))) };
}

/** Arrastre con mouse, dedo o lápiz desde la barra (no desde sus botones). La posición se guarda con `clave`. */
export function hacerArrastrable(caja, clave = CLAVE_POS, barra = ".ac-cab") {
  const cont = caja.parentElement;
  const poner = (x, y) => {
    const p = acotar(x, y, caja.offsetWidth, caja.offsetHeight, cont.clientWidth, cont.clientHeight);
    // Se sueltan las anclas de la derecha y de abajo: si no, una ventana anclada abajo (elecciones) se estira al moverla.
    Object.assign(caja.style, { left: `${p.x}px`, top: `${p.y}px`, right: "auto", bottom: "auto" });
    return p;
  };
  const guardada = () => { try { return JSON.parse(localStorage.getItem(clave) || "null"); } catch { return null; } };
  const aplicarGuardada = () => { const g = guardada(); if (g && !caja.hidden) poner(g.x, g.y); };
  let ini = null, enBarra = false;
  caja.addEventListener("pointerdown", (e) => {
    enBarra = !!e.target.closest(barra) && !e.target.closest("button");
    if (!enBarra || e.button > 0) return;
    const r = caja.getBoundingClientRect(), rc = cont.getBoundingClientRect();
    ini = { dx: e.clientX - r.left + rc.left, dy: e.clientY - r.top + rc.top, id: e.pointerId };
    caja.setPointerCapture(e.pointerId);
    caja.classList.add("arrastrando");
    e.preventDefault();
  });
  caja.addEventListener("pointermove", (e) => { if (ini && e.pointerId === ini.id) poner(e.clientX - ini.dx, e.clientY - ini.dy); });
  const soltar = (e) => {
    if (!ini || e.pointerId !== ini.id) return;
    ini = null;
    caja.classList.remove("arrastrando");
    try { localStorage.setItem(clave, JSON.stringify({ x: parseInt(caja.style.left, 10), y: parseInt(caja.style.top, 10) })); } catch { /* sin almacenamiento */ }
  };
  caja.addEventListener("pointerup", soltar);
  caja.addEventListener("pointercancel", soltar);
  // Con la captura del puntero el doble clic llega a la caja, no a la barra: se usa dónde empezó el último toque.
  caja.addEventListener("dblclick", () => {
    if (!enBarra) return;
    Object.assign(caja.style, { left: "", top: "", right: "", bottom: "" });
    try { localStorage.removeItem(clave); } catch { /* nada */ }
  });
  addEventListener("resize", aplicarGuardada);
  return aplicarGuardada;
}

/** Alertas activas hoy: cisne negro, ya en vigor (fecha ≤ hoy) y sin fecha de desactivación pasada. Más graves primero. */
export function alertasActivas(fc, hoy = new Date().toISOString().slice(0, 10)) {
  return (fc?.features || [])
    .filter((f) => {
      const p = f.properties || {};
      const desde = String(p.fecha || "").slice(0, 10), hasta = String(p.desactivado || "").slice(0, 10);
      return p.cisne_negro && (!desde || desde <= hoy) && (!hasta || hasta > hoy);
    })
    .sort((a, b) => (b.properties.nivel || 0) - (a.properties.nivel || 0) || String(b.properties.fecha).localeCompare(String(a.properties.fecha)));
}

/** Avisos de viaje de nivel 3 («reconsiderar el viaje» o «evitar lo no esencial»): no son cisne negro, pero completan
 * la lista de países con alerta oficial. Van en una sección plegada. */
export function alertasAltas(fc) {
  return (fc?.features || []).filter((f) => f.properties?.tipo === "viaje" && !f.properties.cisne_negro && (f.properties.nivel || 0) >= 3)
    .sort((a, b) => String(a.properties.paises).localeCompare(String(b.properties.paises), "es"));
}

const LS_SECCIONES = "geo_cisne_secciones";
const GRUPOS = [["registro", "🏛️ Llamados oficiales excepcionales"], ["nivel_nacional", "🛡️ Niveles nacionales de amenaza"], ["boletin", "🛡️ Niveles nacionales de amenaza"],
  ["desastre", "🌪️ Desastres en alerta roja (GDACS)"], ["viaje", "⛔ No viajar a todo el país"]];
const grupoDe = (t) => (GRUPOS.find(([k]) => k === t) || [null, "Otras alertas"])[1];

const tarjeta = (p, i, clase = "ac-ir") => `<li data-busca="${esc(`${p.titulo} ${p.paises || ""} ${p.emisor || ""}`.toLowerCase())}">
  <button type="button" class="${clase}" data-i="${i}" title="Ver en el mapa"><b>${esc(p.titulo)}</b></button>
  <span class="ac-meta">Emite: <b>${esc(p.emisor || p.organismo)}</b> · desde ${esc(String(p.fecha || "").slice(0, 10))}${p.estado ? ` · ${esc(p.estado)}` : ""}</span>
  ${p.afectacion ? `<span class="ac-af">Afecta: ${esc(p.afectacion)}</span>` : (p.resumen ? `<span class="ac-af">${esc(p.resumen)}</span>` : "")}
  ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Fuente: ${esc(p.fuente || "oficial")}</a>` : ""}</li>`;

/** HTML del aviso: barra fija (arrastrable), buscador si hay muchas, secciones por tipo y lista con desplazamiento. */
/** Sección plegable: abierta salvo que la persona la haya cerrado (`estado[clave] === false`); «riesgo alto» empieza cerrada. */
const seccion = (clave, titulo, n, cuerpo, estado, abierta = true) =>
  `<li class="ac-sec ac-grupo" data-grupo="${esc(clave)}"><details${(estado[clave] ?? abierta) ? " open" : ""}><summary>${titulo} <span>(${n})</span></summary>`
  + `<ul class="ac-lista ac-sub">${cuerpo}</ul></details></li>`;

export function htmlAlertas(feats, altas = [], estado = {}) {
  if (!feats.length && !altas.length) return "";
  const paises = new Set([...feats, ...altas].map((f) => f.properties.iso3).filter(Boolean)).size;
  const secciones = [];
  for (const [clave, titulo] of GRUPOS.filter((g, i, a) => a.findIndex((x) => x[1] === g[1]) === i)) {
    const items = feats.map((f, i) => [f, i]).filter(([f]) => grupoDe(f.properties.tipo) === titulo);
    if (items.length) secciones.push(seccion(clave, titulo, items.length, items.map(([f, i]) => tarjeta(f.properties, i)).join(""), estado));
  }
  const otros = feats.map((f, i) => [f, i]).filter(([f]) => grupoDe(f.properties.tipo) === "Otras alertas");
  if (otros.length) secciones.push(seccion("otras", "Otras alertas", otros.length, otros.map(([f, i]) => tarjeta(f.properties, i)).join(""), estado));
  if (altas.length) secciones.push(seccion("altas", "⚠️ Riesgo alto: reconsiderar el viaje", `${altas.length} países`, altas.map((f, i) => tarjeta(f.properties, i, "ac-ir2")).join(""), estado, false));
  const varias = secciones.length > 1;
  return `<div class="ac-cab"><b title="Arrastra esta barra para mover el aviso; doble clic lo regresa a su lugar">⚠️ ${feats.length === 1 ? "1 alerta oficial activa" : `${feats.length} alertas oficiales activas`} · ${paises} países</b>
    <button type="button" class="ac-plegar" aria-expanded="true" title="Plegar o desplegar">▾</button></div>
    ${feats.length + altas.length > 8 || varias ? `<div class="ac-herr">${feats.length + altas.length > 8 ? `<input type="search" class="ac-busca" placeholder="Buscar país o alerta…" aria-label="Buscar en las alertas">` : ""}${varias
      ? `<button type="button" class="ac-todas" data-abrir="1" title="Expandir todas las secciones">⊞</button><button type="button" class="ac-todas" data-abrir="0" title="Contraer todas las secciones">⊟</button>` : ""}</div>` : ""}
    <ul class="ac-lista">${secciones.join("")}</ul>`;
}

/** Monta el aviso debajo del buscador de lugares. `irA(lon, lat)` centra el mapa en la alerta. */
export function iniciarAlertaCisne(irA) {
  const form = document.getElementById("lug-form");
  if (!form) return;
  const caja = document.createElement("div");
  caja.id = "alerta-cisne";
  caja.className = "alerta-cisne";
  caja.setAttribute("role", "status");
  caja.hidden = true;
  // En celular empieza plegado (solo la barra roja con el número de alertas): el mapa queda visible.
  if (globalThis.matchMedia?.("(max-width: 760px)").matches) caja.classList.add("plegado");
  form.after(caja);
  const reubicar = hacerArrastrable(caja);
  let feats = [], altas = [];
  // Secciones que la persona abrió o cerró (se recuerdan en este navegador y al refrescar los datos).
  let estado = {};
  try { estado = JSON.parse(localStorage.getItem(LS_SECCIONES) || "{}") || {}; } catch { estado = {}; }
  const guardar = () => { try { localStorage.setItem(LS_SECCIONES, JSON.stringify(estado)); } catch { /* sin almacenamiento */ } };
  const pintar = async () => {
    try {
      const r = await fetch(URL_DATOS, { cache: "no-cache" });
      const fc = r.ok ? await r.json() : null;
      feats = alertasActivas(fc); altas = alertasAltas(fc);
    } catch { feats = []; altas = []; }
    const plegado = caja.classList.contains("plegado");
    const busca = caja.querySelector(".ac-busca")?.value || "";
    caja.innerHTML = htmlAlertas(feats, altas, estado);
    const b = caja.querySelector(".ac-busca");
    if (b && busca) { b.value = busca; filtrar(busca); }
    caja.hidden = !feats.length && !altas.length;
    caja.classList.toggle("plegado", plegado);
    const pl = caja.querySelector(".ac-plegar");
    if (pl && plegado) { pl.setAttribute("aria-expanded", "false"); pl.textContent = "▸"; }
    reubicar();
  };
  const filtrar = (q) => {
    const t = q.trim().toLowerCase();
    for (const li of caja.querySelectorAll("li[data-busca]")) li.hidden = !!t && !li.dataset.busca.includes(t);
    // Al buscar se abren las secciones con coincidencias y se ocultan las vacías; al borrar vuelve lo que la persona eligió.
    for (const g of caja.querySelectorAll(".ac-grupo")) {
      const d = g.querySelector("details");
      const hay = [...g.querySelectorAll("li[data-busca]")].some((li) => !li.hidden);
      g.hidden = !!t && !hay;
      d.open = t ? hay : (estado[g.dataset.grupo] ?? g.dataset.grupo !== "altas");
    }
  };
  caja.addEventListener("toggle", (e) => {
    const g = e.target.closest?.(".ac-grupo");
    if (!g || caja.querySelector(".ac-busca")?.value.trim()) return;  // mientras se busca no se guarda
    estado[g.dataset.grupo] = e.target.open;
    guardar();
  }, true);
  caja.addEventListener("input", (e) => { if (e.target.classList.contains("ac-busca")) filtrar(e.target.value); });
  caja.addEventListener("click", (e) => {
    const todas = e.target.closest(".ac-todas");
    if (todas) {
      for (const g of caja.querySelectorAll(".ac-grupo")) { estado[g.dataset.grupo] = todas.dataset.abrir === "1"; g.querySelector("details").open = estado[g.dataset.grupo]; }
      guardar();
      return;
    }
    const pl = e.target.closest(".ac-plegar");
    if (pl) { const p = caja.classList.toggle("plegado"); pl.setAttribute("aria-expanded", String(!p)); pl.textContent = p ? "▸" : "▾"; return; }
    const ir = e.target.closest(".ac-ir, .ac-ir2");
    if (ir && irA) { const c = (ir.classList.contains("ac-ir2") ? altas : feats)[Number(ir.dataset.i)]?.geometry?.coordinates; if (c) irA(c[0], c[1]); }
  });
  pintar();
  setInterval(pintar, REFRESCO_MS);
}
