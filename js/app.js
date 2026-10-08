// Punto de entrada: carga datos, crea el mapa y conecta la interfaz.
import { getJSON, esc, fecha, storage, distanciaKm } from "./util.js";
import { estiloBase, crearMapa } from "./map.js";
import { htmlFicha } from "./card.js";
import { iniciarRefresco } from "./refresh.js";
import { GestorCapas, familiasDibujables, htmlFichaEntidad, etiquetaEstado, PRESUPUESTO_CAPAS } from "./capas.js";
import * as seg from "./seguimiento.js";
import { Movimiento, htmlFichaMovil } from "./movimiento.js";
import { Imagenes, IMAGENES, ayerUTC } from "./imagenes.js";

const MAX_LISTA = 200; // la lista lateral muestra los más recientes; el mapa muestra todos

const $ = (id) => document.getElementById(id);
const estado = { areas: new Set(), mexico: false, sevMin: 1, region: "" };
let eventos = [];
let porId = new Map();
let tax, paises, api, gestor, mov, img;
let lite = false;

function temaActual() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** LITE: activo por defecto en celular o pantallas táctiles; el usuario puede cambiarlo (se recuerda). */
function modoLite() {
  const guardado = storage.get("gp_lite");
  if (guardado != null) return guardado === "1";
  return matchMedia("(max-width: 760px), (pointer: coarse)").matches;
}

// El gazetteer (nombres de países) solo se usa en la ficha: se descarga la primera vez que se abre una.
let gazPromesa = null;
const cargarPaises = () => (gazPromesa ??= getJSON("config/gazetteer.json").then((g) => (paises = g.paises)));

function prepararTaxonomia(t) {
  const areas = new Map(t.areas.map((a) => [a.id, a]));
  const subtemas = new Map();
  for (const a of t.areas) for (const s of a.subtemas) subtemas.set(s.id, s.nombre);
  return { areas, subtemas, lista: t.areas };
}

// ---------- Filtros ----------
function pasaFiltros(ev, ignorarArea = false) {
  if (!ignorarArea && !estado.areas.has(ev.area_principal)) return false;
  if (estado.mexico && !ev.impacto_mexico) return false;
  if (ev.severidad < estado.sevMin) return false;
  if (estado.region && ev.region !== estado.region) return false;
  return true;
}

// Cada evento se convierte a texto GeoJSON una sola vez (propiedades mínimas: id, área, severidad,
// título). Al filtrar solo se unen los textos visibles en un Blob y MapLibre lo lee y lo agrupa en
// su Web Worker. Así el hilo principal no copia decenas de miles de objetos en cada cambio de filtro.
const featureTxt = new Map();
function textoFeature(ev) {
  let t = featureTxt.get(ev.id);
  if (t === undefined) {
    t = ev.lat == null || ev.lon == null ? "" : JSON.stringify({
      type: "Feature",
      geometry: { type: "Point", coordinates: [ev.lon, ev.lat] },
      properties: { id: ev.id, a: ev.area_principal, s: ev.severidad, t: ev.titulo },
    });
    featureTxt.set(ev.id, t);
  }
  return t;
}

let blobActual = null;
function publicarEnMapa(partes) {
  const anterior = blobActual;
  blobActual = URL.createObjectURL(new Blob(['{"type":"FeatureCollection","features":[', partes.join(","), "]}"], { type: "application/json" }));
  api.setDatos(blobActual);
  // La URL anterior se libera cuando el worker ya terminó de leer la nueva.
  if (anterior) setTimeout(() => URL.revokeObjectURL(anterior), 5000);
}

const BLOQUE = 5000;            // eventos por bloque antes de ceder el hilo principal
let generacion = 0;              // si llega un filtro nuevo, el recorrido anterior se abandona
const ceder = () => new Promise((r) => setTimeout(r, 0));

async function aplicarFiltros() {
  const mia = ++generacion;
  const t0 = performance.now();
  const visibles = [];
  const partes = [];
  const conteo = {};
  for (let i = 0; i < eventos.length; i++) {
    if (i && i % BLOQUE === 0) { await ceder(); if (mia !== generacion) return; }
    const ev = eventos[i];
    if (!pasaFiltros(ev, true)) continue;
    conteo[ev.area_principal] = (conteo[ev.area_principal] || 0) + 1;
    if (!estado.areas.has(ev.area_principal)) continue;
    visibles.push(ev);
    const t = textoFeature(ev);
    if (t) partes.push(t);
  }
  publicarEnMapa(partes);
  for (const el of document.querySelectorAll("[data-num]")) el.textContent = conteo[el.dataset.num] || 0;
  pintarLista(visibles);
  console.info(`filtros: ${visibles.length}/${eventos.length} eventos en ${Math.round(performance.now() - t0)} ms`);
}

// Ceder el turno: primero se pinta el cambio del control (casilla, menú) y después se filtra.
// Así la interfaz responde de inmediato aunque haya decenas de miles de eventos.
let pendiente = false;
function programarFiltros() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => setTimeout(() => { pendiente = false; aplicarFiltros(); }, 0));
}

// ---------- Panel ----------
function pintarAreas() {
  const ul = $("lista-areas");
  ul.innerHTML = tax.lista.map((a) => `
    <li><label>
      <input type="checkbox" data-area="${esc(a.id)}" ${estado.areas.has(a.id) ? "checked" : ""}>
      <span class="swatch" style="background:${esc(a.color)}"></span>
      <span>${a.numero}. ${esc(a.nombre)}</span>
      <span class="num" data-num="${esc(a.id)}">0</span>
    </label></li>`).join("");
  ul.addEventListener("change", (e) => {
    const id = e.target.dataset.area;
    if (!id) return;
    e.target.checked ? estado.areas.add(id) : estado.areas.delete(id);
    programarFiltros();
  });
}

function pintarLista(visibles) {
  const ol = $("lista-eventos");
  $("contador").textContent = `(${visibles.length})`;
  const html = visibles.slice(0, MAX_LISTA).map((ev) => {
    const a = tax.areas.get(ev.area_principal);
    return `<li><button type="button" data-id="${esc(ev.id)}">
      <span class="punto" style="background:${esc(a.color)}" aria-hidden="true"></span>
      <span>${esc(ev.titulo)}<span class="meta">${esc(fecha(ev.fecha_utc))} · ${esc(a.nombre)} · sev. ${ev.severidad}</span></span>
    </button></li>`;
  });
  if (visibles.length > MAX_LISTA) html.push(`<li class="mas">… y ${visibles.length - MAX_LISTA} más en el mapa. Usa los filtros para acotar.</li>`);
  if (!visibles.length) html.push(`<li class="mas">Ningún evento coincide con los filtros.</li>`);
  ol.innerHTML = html.join("");
}

// ---------- Ficha ----------
let focoPrevio = null;
async function abrirFicha(id, { volar = false } = {}) {
  const ev = porId.get(id);
  if (!ev) return;
  focoPrevio = document.activeElement;
  if (!paises) await cargarPaises().catch(() => (paises = {}));
  $("ficha-cuerpo").innerHTML = htmlFicha(ev, tax, paises, porId);
  $("ficha").hidden = false;
  api.setSeleccion(id);
  if (volar && ev.lat != null) api.volarA(ev.lon, ev.lat);
  history.replaceState(null, "", `#evento=${encodeURIComponent(id)}`);
  $("ficha-cerrar").focus();
}
function abrirFichaHtml(html) {
  focoPrevio = document.activeElement;
  $("ficha-cuerpo").innerHTML = html;
  $("ficha").hidden = false;
  $("ficha-cerrar").focus();
}

function cerrarFicha() {
  $("ficha").hidden = true;
  api.setSeleccion("");
  history.replaceState(null, "", location.pathname + location.search);
  if (focoPrevio && document.contains(focoPrevio)) focoPrevio.focus();
}

// ---------- Datos ----------
async function cargarEventos() {
  const data = await getJSON("data/events.json", { bust: true });
  eventos = data.eventos;
  const n = Number(new URLSearchParams(location.search).get("carga"));
  if (n > 0) eventos = eventos.concat(eventosSinteticos(Math.min(n, 200000)));
  porId = new Map(eventos.map((e) => [e.id, e]));
}

/** Prueba de carga: ?carga=50000 agrega N eventos ficticios (marcados como ejemplo) para medir rendimiento. */
function eventosSinteticos(n) {
  const ids = tax ? tax.lista.map((a) => a.id) : ["geografia"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const area = ids[i % ids.length];
    out.push({
      id: `sintetico-${i}`, fecha_utc: new Date(Date.now() - (i % 720) * 3600000).toISOString(),
      titulo: `Evento sintético ${i} (prueba de carga)`, resumen: "Dato ficticio generado en el navegador para medir rendimiento.",
      fuente: "Prueba de carga", url: "https://example.org/", tipo_fuente: "base_datos",
      pais_iso3: null, region: null, lat: Math.random() * 140 - 60, lon: Math.random() * 360 - 180,
      area_principal: area, areas_secundarias: [], subtemas: [], actores: [], severidad: 1 + (i % 5),
      confianza_clasificacion: 0, verificado: false, impacto_mexico: i % 7 === 0 ? "Prueba" : null,
      fuentes: [{ fuente: "Prueba de carga", url: "https://example.org/", tipo_fuente: "base_datos" }], es_ejemplo: true,
    });
  }
  return out;
}

async function main() {
  const tema = temaActual();
  lite = modoLite();
  document.documentElement.classList.toggle("lite", lite);
  // Todas las descargas arrancan a la vez; la taxonomía se espera primero porque los eventos
  // sintéticos de la prueba de carga la usan.
  const pendientes = [getJSON("config/chokepoints.json"), getJSON("data/run-log.json", { bust: true }), estiloBase(tema, { lite }), getJSON("config/regions.json")];
  tax = prepararTaxonomia(await getJSON("config/taxonomy.json"));
  const [choke, runLog, base, regiones] = await Promise.all([...pendientes, cargarEventos()]);
  estado.areas = new Set(tax.lista.map((a) => a.id));

  if (!base.remoto) {
    const aviso = $("aviso-base");
    aviso.textContent = "No se pudo cargar el mapa base de OpenFreeMap; se muestra el mapa local de países.";
    aviso.hidden = false;
  }

  const chokeGeo = {
    type: "FeatureCollection",
    features: choke.chokepoints.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id, nombre: c.nombre, tipo: c.tipo } })),
  };

  api = crearMapa({
    container: $("map"), style: base.style, tema, lite, chokepoints: chokeGeo,
    colores: Object.fromEntries(tax.lista.map((a) => [a.id, a.color])),
    onSelect: (id) => abrirFicha(id),
  });

  pintarAreas();
  api.map.once("load", () => {
    aplicarFiltros();
    const m = location.hash.match(/^#evento=(.+)$/);
    if (m) abrirFicha(decodeURIComponent(m[1]), { volar: true });
  });

  // Controles
  $("areas-todas").onclick = () => { estado.areas = new Set(tax.lista.map((a) => a.id)); pintarAreas2(); };
  $("areas-ninguna").onclick = () => { estado.areas.clear(); pintarAreas2(); };
  function pintarAreas2() {
    for (const cb of document.querySelectorAll("[data-area]")) cb.checked = estado.areas.has(cb.dataset.area);
    programarFiltros();
  }
  const selRegion = $("f-region");
  for (const [id, r] of Object.entries(regiones.regiones)) selRegion.add(new Option(r.nombre, id));
  selRegion.onchange = (e) => { estado.region = e.target.value; programarFiltros(); };
  $("f-mexico").onchange = (e) => { estado.mexico = e.target.checked; programarFiltros(); };
  $("f-severidad").onchange = (e) => { estado.sevMin = Number(e.target.value); programarFiltros(); };
  $("capa-chokepoints").onchange = (e) => { api.setChokepoints(e.target.checked); avisarPresupuesto(); };
  $("lista-eventos").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) abrirFicha(b.dataset.id, { volar: true });
  });
  $("ficha-cerrar").onclick = cerrarFicha;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("ficha").hidden) cerrarFicha(); });

  $("btn-panel").onclick = () => {
    const layout = document.querySelector(".layout");
    const oculto = layout.classList.toggle("sin-panel");
    $("btn-panel").setAttribute("aria-expanded", String(!oculto));
    setTimeout(() => api.map.resize(), 0);
  };
  if (matchMedia("(max-width: 760px)").matches) $("btn-panel").click();

  $("btn-tema").onclick = async () => {
    const nuevo = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    storage.set("gp_theme", nuevo);
    const b = await estiloBase(nuevo, { lite });
    api.setTema(nuevo, b.style);
    api.map.once("style.load", () => aplicarFiltros());
  };

  // Capas de entidades: el catálogo se pide cuando el mapa ya está quieto (no compite con la carga inicial).
  api.map.once("idle", () => iniciarCapas().catch((e) => { $("capas-entidades").textContent = `No se pudo cargar el catálogo: ${e.message}`; }));
  api.map.on("style.load", () => { img?.reinstalar(); gestor?.reinstalar(); mov?.reinstalar(); });
  iniciarImagenes();
  $("ficha-cuerpo").addEventListener("click", (e) => {
    const a = e.target.closest("[data-evento]");
    if (a) { e.preventDefault(); abrirFicha(a.dataset.evento, { volar: true }); return; }
    const b = e.target.closest("#btn-seguir");
    if (b && entidadAbierta) {
      const ok = seg.alternar({ id: entidadAbierta.props.id, n: entidadAbierta.props.n, familia: entidadAbierta.familia.id, lon: entidadAbierta.lngLat.lng, lat: entidadAbierta.lngLat.lat });
      b.setAttribute("aria-pressed", String(ok));
      b.textContent = ok ? "★ Siguiendo" : "☆ Seguir";
      pintarSeguimiento();
    }
  });
  $("lista-seguimiento").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-seg]");
    if (!b) return;
    const x = seg.leer().find((y) => y.id === b.dataset.seg);
    if (!x) return;
    seg.marcarVisto(x.id);
    api.volarA(x.lon, x.lat);
    pintarSeguimiento();
  });
  pintarSeguimiento();

  const btnLite = $("btn-lite");
  btnLite.setAttribute("aria-pressed", String(lite));
  btnLite.onclick = () => { storage.set("gp_lite", lite ? "0" : "1"); location.reload(); };

  iniciarRefresco({
    runLog, elDatos: $("estado-datos"), elProxima: $("estado-proxima"),
    onNuevosDatos: async () => { await cargarEventos(); featureTxt.clear(); aplicarFiltros(); pintarSeguimiento(); },
  });
}

// ---------- Capas de entidades ----------
let entidadAbierta = null;
async function iniciarCapas() {
  const sinDatos = () => ({ familias: {} });
  const [catalogo, capasCfg, mCapas, mEntidades] = await Promise.all([
    getJSON("config/entities.json"), getJSON("config/capas.json"),
    getJSON("data/capas/manifest.json", { bust: true }).catch(sinDatos),
    getJSON("data/entidades/manifest.json", { bust: true }).catch(sinDatos),
  ]);
  // Dos constructores (PMTiles mensual y Wikidata semanal) escriben manifiestos separados; aquí se combinan.
  const manifest = { familias: { ...mCapas.familias, ...mEntidades.familias } };
  const familias = familiasDibujables(catalogo, capasCfg, manifest);
  gestor = new GestorCapas(api.map, {
    chokepointsActivos: () => $("capa-chokepoints").checked,
    onCambio: avisarPresupuesto,
    onEntidad: async (ent) => {
      entidadAbierta = ent;
      const cercanos = eventos.filter((ev) => ev.lat != null && distanciaKm(ent.lngLat.lat, ent.lngLat.lng, ev.lat, ev.lon) <= 300);
      const personas = ent.familia.id === "organismos" ? await personasDe(ent.props.id.replace(/^wd:/, "")) : [];
      abrirFichaHtml(htmlFichaEntidad({ ...ent, cercanos, personas, seguido: seg.sigue(ent.props.id) }));
    },
  });
  gestor.registrar(familias);
  const cont = $("capas-entidades");
  cont.innerHTML = familias.map((f) => `
    <div class="capa-fam ${f.disponible ? "" : "capa-off"}">
      <label class="fila"><span><input type="checkbox" data-fam="${esc(f.id)}" ${f.disponible ? "" : "disabled"}> ${esc(f.nombre)}</span>
        <span class="chip estado-${esc(f.estado_dato)}" title="Estado del dato">${esc(etiquetaEstado(f.estado_dato))}</span></label>
      <div class="meta">${f.disponible ? `${f.manifest.objetos.toLocaleString("es-MX")} objetos · ${(f.manifest.bytes / 1e6).toFixed(1)} MB en mosaicos (solo se baja lo visible) · ${esc(f.licencia)}`
        : esc(f.habilitada ? (f.manifest?.estado === "error" ? "Error al construir: " + f.manifest.error : "Aún no se construye (workflow «Construir capas»)") : f.motivo || "Deshabilitada")}</div>
      ${f.disponible && f.subtipos.length > 1 ? `<details><summary>Subtipos (${f.subtipos.length})</summary>${f.subtipos.map((st) => `
        <label><input type="checkbox" data-fam-sub="${esc(f.id)}" value="${esc(st.id)}" checked><span class="swatch" style="background:${esc(st.color)}"></span>${esc(st.nombre.es)} <span class="meta">desde zoom ${st.zoom_min}</span></label>`).join("")}</details>` : ""}
    </div>`).join("");
  cont.addEventListener("change", async (e) => {
    const fam = e.target.dataset.fam;
    if (fam) { e.target.checked ? await gestor.activar(fam) : gestor.desactivar(fam); return; }
    const famSub = e.target.dataset.famSub;
    if (famSub) gestor.setSubtipos(famSub, [...cont.querySelectorAll(`[data-fam-sub="${famSub}"]:checked`)].map((x) => x.value));
  });
  await iniciarMovimiento(catalogo);
  // Enlaces compartibles y pruebas de carga: ?capas=aeropuertos,centrales&mov=aeronaves activa capas al abrir.
  const q = new URLSearchParams(location.search);
  for (const id of (q.get("capas") || "").split(",").filter(Boolean)) {
    const cb = cont.querySelector(`[data-fam="${CSS.escape(id)}"]`);
    if (cb && !cb.disabled) { cb.checked = true; await gestor.activar(id); }
  }
  for (const t of (q.get("mov") || "").split(",").filter(Boolean)) {
    const cb = $("mov-capas").querySelector(`[data-mov="${CSS.escape(t)}"]`);
    if (cb && (!cb.disabled || (t === "aeronaves" && q.get("aviones")))) { cb.disabled = false; cb.checked = true; await mov?.activar(t); }
  }
}

// ---------- Imágenes satelitales ----------
function iniciarImagenes() {
  const cont = $("img-capas");
  if (lite) { cont.innerHTML = `<p class="meta">Desactivadas en modo LITE.</p>`; return; }
  img = new Imagenes(api.map);
  cont.innerHTML = Object.entries(IMAGENES).map(([id, d]) => `<label class="fila"><span><input type="checkbox" data-img="${id}"> ${esc(d.nombre)}</span><span class="chip estado-retrasado">${ayerUTC()}</span></label>`).join("")
    + `<p class="nota-capas">NASA GIBS, imagen del día anterior (UTC). Se descarga solo al activarla.</p>`;
  cont.addEventListener("change", (e) => {
    const id = e.target.dataset.img;
    if (id) { e.target.checked ? img.activar(id) : img.desactivar(id); avisarPresupuesto(); }
  });
}

// ---------- Capas en movimiento ----------
async function iniciarMovimiento(catalogo) {
  const cont = $("mov-capas");
  if (lite) {
    cont.innerHTML = `<p class="meta">Desactivadas en modo LITE (ahorran batería y datos). Pulsa «LITE» arriba para usarlas.</p>`;
    return;
  }
  const estado = await getJSON("data/vivos/estado.json", { bust: true }).catch(() => ({ pasos: {} }));
  const avisos = {};
  mov = new Movimiento(api.map, {
    catalogo,
    onCambio: () => avisarPresupuesto(),
    onAviso: (tipo, texto) => { avisos[tipo] = texto; const a = $("aviso-mov"); a.textContent = Object.values(avisos).filter(Boolean).join(" "); a.hidden = !a.textContent; },
    onObjeto: (o) => { entidadAbierta = null; abrirFichaHtml(htmlFichaMovil(o, catalogo)); },
  });
  const pasoDe = { aeronaves: "aeronaves", buques: "buques", satelites: "satelites" };
  cont.innerHTML = ["aeronaves", "buques", "satelites"].map((tipo) => {
    const cat = catalogo.categorias.find((c) => c.id === tipo);
    const p = estado.pasos[pasoDe[tipo]];
    const ok = p && (p.estado === "ok" || p.objetos);
    const vistos = new Set();
    const subs = cat.subtipos.filter((s) => { const k = tipo === "satelites" ? s.grupo : s.id; if (vistos.has(k)) return false; vistos.add(k); return true; });
    return `<div class="capa-fam ${ok ? "" : "capa-off"}">
      <label class="fila"><span><input type="checkbox" data-mov="${tipo}" ${ok ? "" : "disabled"}> ${esc(cat.nombre.es)}</span>
        <span class="chip estado-${esc(cat.subtipos[0].estado_dato)}">${tipo === "satelites" ? "Estimado" : "Retrasado"}</span></label>
      <div class="meta">${ok ? `${(p.objetos || 0).toLocaleString("es-MX")} objetos · actualizado ${esc((p.actualizado_utc || "").replace("T", " ").slice(0, 16))} UTC`
        : esc(p?.error || "Aún no hay instantánea (workflow «Datos en movimiento»)")}</div>
      ${ok ? `<details><summary>Subtipos (${subs.length})</summary>${subs.map((s) => `<label><input type="checkbox" data-mov-sub="${tipo}" value="${esc(tipo === "satelites" ? s.grupo : s.id)}" checked><span class="swatch" style="background:${esc(s.color)}"></span>${esc(s.nombre.es)}</label>`).join("")}</details>` : ""}
    </div>`;
  }).join("");
  cont.addEventListener("change", async (e) => {
    const t = e.target.dataset.mov;
    if (t) { try { e.target.checked ? await mov.activar(t) : mov.desactivar(t); } catch (err) { e.target.checked = false; alert(`No se pudo cargar: ${err.message}`); } return; }
    const ts = e.target.dataset.movSub;
    if (ts) mov.setSubtipos(ts, [...cont.querySelectorAll(`[data-mov-sub="${ts}"]:checked`)].map((x) => x.value));
  });
}

// Personas (rol público) y organizaciones: índices ligeros que se descargan la primera vez que se abre
// la ficha de una organización. Las personas nunca se dibujan en el mapa.
let indicesEntidades = null;
async function personasDe(orgId) {
  indicesEntidades ??= Promise.all([
    getJSON("data/entidades/organizaciones.json").catch(() => ({ registros: [] })),
    getJSON("data/entidades/personas.json").catch(() => ({ registros: [] })),
  ]).then(([o, p]) => ({ orgs: new Map(o.registros.map((x) => [x.id, x])), personas: new Map(p.registros.map((x) => [x.id, x])) }));
  const { orgs, personas } = await indicesEntidades;
  return (orgs.get(orgId)?.personas || []).map((id) => personas.get(id)).filter(Boolean);
}

function avisarPresupuesto() {
  const n = (gestor ? gestor.totalActivas() : 1) + (mov ? mov.activas.size : 0) + (img ? img.activas.size : 0);
  const aviso = $("aviso-capas");
  aviso.hidden = n <= PRESUPUESTO_CAPAS;
  aviso.textContent = `Tienes ${n} capas activas. Más de ${PRESUPUESTO_CAPAS} puede hacer lento el mapa en equipos modestos.`;
}

function pintarSeguimiento() {
  const items = seg.resumen(eventos);
  $("seg-total").textContent = items.length ? `(${items.length})` : "";
  $("lista-seguimiento").innerHTML = items.map((x) => `<li><button type="button" class="txt-btn" data-seg="${esc(x.id)}">${esc(x.n || x.id)}</button>
    <span>${x.eventos.length} eventos ${x.nuevos ? `<span class="badge-nuevo">${x.nuevos} nuevos</span>` : ""}</span></li>`).join("")
    || `<li class="meta">Todavía no sigues ningún lugar.</li>`;
}

// Service worker: guarda MapLibre, estilos, fuentes y mosaicos del mapa base para que la segunda
// visita no los vuelva a descargar. Los datos (events.json, run-log.json) siempre se piden a la red primero.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker:", e.message));
}

main().catch((e) => {
  console.error(e);
  $("estado-datos").textContent = `Error al cargar: ${e.message}`;
});
