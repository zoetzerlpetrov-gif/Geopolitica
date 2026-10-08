// Punto de entrada: carga datos, crea el mapa y conecta la interfaz.
/* global maplibregl */
import { getJSON, esc, safeUrl, fecha, storage, distanciaKm, debounce } from "./util.js";
import { estiloBase, crearMapa } from "./map.js";
import { htmlFicha } from "./card.js";
import { iniciarRefresco } from "./refresh.js";
import { GestorCapas, familiasDibujables, htmlFichaEntidad, etiquetaEstado, PRESUPUESTO_CAPAS } from "./capas.js";
import * as seg from "./seguimiento.js";
import { Movimiento, htmlFichaMovil, vueloDeFila, proyectar, SUB } from "./movimiento.js";
import { Imagenes, IMAGENES, ayerUTC, haceDias } from "./imagenes.js";
import { LineaTiempo } from "./linea-tiempo.js";
import * as cuaderno from "./cuaderno.js";

const MAX_LISTA = 200; // la lista lateral muestra los más recientes; el mapa muestra todos

const $ = (id) => document.getElementById(id);
const estado = { areas: new Set(), mexico: false, sevMin: 1, region: "", desde: -Infinity, hasta: Infinity };
let eventos = [];
let visiblesActuales = [];
let linea, capaIndice, analisis;
let historialEv = [];            // eventos del historial ya descargados (sobreviven a la recarga horaria)
const diasHistorial = new Set(); // días del historial descargados completos
let regionDe = {};
let porId = new Map();
let tax, paises, api, gestor, mov, img, riesgos, clima;
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

// El gazetteer (nombres de países) y el contenido de análisis solo se usan en la ficha:
// se descargan la primera vez que se abre una.
let gazPromesa = null;
const cargarPaises = () => (gazPromesa ??= getJSON("config/gazetteer.json").then((g) => (paises = g.paises)));
let analisisCfg = null;
let analisisPromesa = null;
const cargarAnalisisCfg = () => (analisisPromesa ??= getJSON("config/analisis.json").then((a) => (analisisCfg = a)).catch(() => null));

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
  if (ev._t < estado.desde || ev._t > estado.hasta) return false;
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
  visiblesActuales = visibles;
  analisis?.refrescar();
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
    return `<li><button type="button" data-id="${esc(ev.id)}" title="${esc(ev.resumen)}">
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
let fichaEvento = null; // id del evento abierto (para guardar checklist y notas)
async function abrirFicha(id, { volar = false } = {}) {
  const ev = porId.get(id);
  if (!ev) return;
  focoPrevio = document.activeElement;
  if (!paises) await cargarPaises().catch(() => (paises = {}));
  if (!analisisCfg) await cargarAnalisisCfg();
  fichaEvento = id;
  entidadAbierta = null;
  trayectoria?.limpiar();
  $("ficha-cuerpo").innerHTML = htmlFicha(ev, tax, paises, porId, { analisis: analisisCfg, cuaderno: cuaderno.leer(id) });
  $("ficha").hidden = false;
  api.setSeleccion(id);
  if (volar && ev.lat != null) api.volarA(ev.lon, ev.lat);
  history.replaceState(null, "", `#evento=${encodeURIComponent(id)}`);
  $("ficha-cerrar").focus();
}
function abrirFichaHtml(html) {
  focoPrevio = document.activeElement;
  fichaEvento = null;
  $("ficha-cuerpo").innerHTML = html;
  $("ficha").hidden = false;
  $("ficha-cerrar").focus();
}

// Ficha de un avión con origen, destino y trayectoria (js/vuelos.js, se descarga al abrir la primera).
let trayectoria = null;
async function abrirObjetoMovil(o, catalogo) {
  entidadAbierta = null;
  if (o.tipo === "buques" && o.campos?.includes("estado_nav")) return abrirBuque(o, catalogo);
  if (o.tipo === "satelites") return abrirSatelite(o, catalogo);
  if (o.tipo !== "aeronaves" || !o.campos) { trayectoria?.limpiar(); abrirFichaHtml(htmlFichaMovil(o, catalogo)); return; }
  const V = await import("./vuelos.js");
  const v = vueloDeFila(JSON.parse(o.props.f), o.campos);
  if (o.coords) [v.lon, v.lat] = o.coords; // posición proyectada que se ve en el mapa
  const cat = catalogo.categorias.find((c) => c.id === "aeronaves");
  const comunes = { subtipoNombre: SUB(cat, v.subtipo), edadMin: o.generado ? Math.round((Date.now() - new Date(o.generado).getTime()) / 60000) : null };
  abrirFichaHtml(V.htmlVuelo(v, null, comunes) + `<p class="meta" id="vuelo-cargando">Buscando ruta y trayectoria…</p>`);
  const [extra] = await Promise.all([V.datosVuelo(v), paises ? null : cargarPaises().catch(() => (paises = {}))]);
  const porNombreEn = { ...Object.fromEntries(Object.values(paises || {}).map((p) => [p.en, p.es])), ...V.PAISES_OPENSKY };
  if ($("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(v.indicativo || v.hex)) return; // el usuario ya cerró o cambió de ficha
  $("ficha-cuerpo").innerHTML = V.htmlVuelo(v, extra, { ...comunes, paisEs: (en) => porNombreEn[en] || en });
  trayectoria ??= new V.Trayectoria(api.map);
  if (!V.CON_TRAYECTORIA.has(v.subtipo)) { trayectoria.limpiar(); return; } // aviación general: nada se dibuja
  const gj = V.geojsonTrayectoria(v, extra, proyectar);
  trayectoria.mostrar(gj);
  // Encuadra recorrido, rumbo y destino a la vista, dejando libre el espacio de la ficha.
  encuadrar(V.limites(gj), 7);
}

/** Encuadra lo dibujado dejando libre el espacio de la ficha. */
function encuadrar(caja, maxZoom) {
  if (!caja) return;
  const movil = matchMedia("(max-width: 760px)").matches;
  api.map.fitBounds(caja, { padding: movil ? { top: 40, bottom: Math.round(innerHeight * 0.6), left: 30, right: 30 } : { top: 60, bottom: 60, left: 60, right: 460 },
    maxZoom, duration: lite ? 0 : 800 });
}

async function abrirBuque(o, catalogo) {
  const [B, V] = await Promise.all([import("./buques.js"), import("./vuelos.js")]);
  const b = vueloDeFila(JSON.parse(o.props.f), o.campos);
  if (o.coords) [b.lon, b.lat] = o.coords;
  const cat = catalogo.categorias.find((c) => c.id === "buques");
  const comunes = { subtipoNombre: SUB(cat, b.subtipo), edadMin: o.generado ? Math.round((Date.now() - new Date(o.generado).getTime()) / 60000) : null };
  abrirFichaHtml(B.htmlBuque(b, null, comunes));
  trayectoria ??= new V.Trayectoria(api.map);
  if (B.SIN_TRAYECTORIA.has(b.subtipo)) { trayectoria.limpiar(); return; } // recreo: nada se dibuja
  const extra = await B.datosBuque(b);
  if ($("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(b.nombre || "MMSI " + b.mmsi)) return;
  $("ficha-cuerpo").innerHTML = B.htmlBuque(b, extra, comunes);
  const gj = B.geojsonBuque(b, extra, proyectar);
  trayectoria.mostrar(gj);
  encuadrar(V.limites(gj), 10);
}

async function abrirSatelite(o, catalogo) {
  const [S, V] = await Promise.all([import("./satelites.js"), import("./vuelos.js")]);
  const cat = catalogo.categorias.find((c) => c.id === "satelites");
  const norad = String(o.props.id).replace("sat:", "");
  const base = { n: o.props.n, norad, grupo: SUB(cat, o.props.st), alt: o.props.alt };
  abrirFichaHtml(S.htmlSatelite(base, null));
  const orb = await mov.orbita(norad);
  if (!orb || orb.error || $("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(o.props.n)) return;
  $("ficha-cuerpo").innerHTML = S.htmlSatelite(base, orb);
  trayectoria ??= new V.Trayectoria(api.map);
  const gj = S.geojsonOrbita(orb, [...o.coords, o.props.alt]);
  trayectoria.mostrar(gj);
  // Una órbita completa rodea el planeta: se centra en el satélite (libre de la ficha) en vez de encuadrarla toda.
  const movil = matchMedia("(max-width: 760px)").matches;
  api.map.easeTo({ center: o.coords, zoom: Math.min(api.map.getZoom(), 2.2),
    padding: movil ? { top: 40, bottom: Math.round(innerHeight * 0.6), left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 440 }, duration: lite ? 0 : 800 });
}

function cerrarFicha() {
  trayectoria?.limpiar();
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
  for (const ev of eventos) ev._t = Date.parse(ev.fecha_utc); // para la línea de tiempo (no se publica)
  if (historialEv.length) {
    const ids = new Set(eventos.map((e) => e.id));
    eventos = eventos.concat(historialEv.filter((e) => !ids.has(e.id)));
  }
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
  // El mapa se crea en cuanto hay estilo (en LITE es local e inmediato); los JSON llegan en paralelo
  // y se aplican cuando estén. Así MapLibre arranca su worker y pide fuentes sin esperar a los datos.
  const pTax = getJSON("config/taxonomy.json");
  const pChoke = getJSON("config/chokepoints.json");
  const pRunLog = getJSON("data/run-log.json", { bust: true });
  const pRegiones = getJSON("config/regions.json");
  const pEventos = pTax.then((t) => { tax = prepararTaxonomia(t); return cargarEventos(); });
  const base = await estiloBase(tema, { lite });
  // LITE: si index.html ya descargó el mapa base local, se entrega como objeto (el worker no lo vuelve a pedir).
  if (base.local) {
    for (const [fuente, url] of [["paises", "data/base/countries-110m.geojson"], ["nombres", "data/base/etiquetas-paises.geojson"]]) {
      const p = globalThis.__pre?.[url];
      if (p) { delete globalThis.__pre[url]; base.style.sources[fuente].data = await p.catch(() => url); }
    }
  }

  if (!base.remoto) {
    const aviso = $("aviso-base");
    aviso.textContent = "No se pudo cargar el mapa base de OpenFreeMap; se muestra el mapa local de países.";
    aviso.hidden = false;
  }

  // Colores de área: se conocen hasta tener la taxonomía; mientras tanto el mapa ya dibuja el fondo.
  const t = await pTax;
  tax ??= prepararTaxonomia(t);
  api = crearMapa({
    container: $("map"), style: base.style, tema, lite, chokepoints: null,
    colores: Object.fromEntries(tax.lista.map((a) => [a.id, a.color])),
    onSelect: (id) => abrirFicha(id),
  });
  const [choke, runLog, regiones] = await Promise.all([pChoke, pRunLog, pRegiones, pEventos]);
  estado.areas = new Set(tax.lista.map((a) => a.id));
  api.setChokepointsDatos({
    type: "FeatureCollection",
    features: choke.chokepoints.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id, nombre: c.nombre, tipo: c.tipo } })),
  });

  pintarAreas();
  for (const [id, r] of Object.entries(regiones.regiones)) for (const iso of r.paises) regionDe[iso] = id;
  linea = new LineaTiempo($("linea-tiempo"), (v) => { estado.desde = v.desde; estado.hasta = v.hasta; programarFiltros(); },
    { cargarHistorial: anexarHistorial, permitir90: !lite });
  linea.setEventos(eventos);
  const alCargar = () => {
    aplicarFiltros();
    const m = location.hash.match(/^#evento=(.+)$/);
    if (m) abrirFicha(decodeURIComponent(m[1]), { volar: true });
  };
  // Si el mapa ya terminó de cargar mientras llegaban los datos, se aplica de inmediato.
  api.map.loaded() ? alCargar() : api.map.once("load", alCargar);

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
  $("capa-indice").onchange = (e) => alternarIndice(e.target.checked).catch((err) => {
    e.target.checked = false;
    $("leyenda-indice").hidden = false;
    $("leyenda-indice").textContent = `No se pudo cargar el índice: ${err.message}`;
  });
  $("btn-analisis").onclick = async () => {
    const m = await import("./analisis.js");
    analisis ??= m.crearAnalisis({
      todos: () => eventos, visibles: () => visiblesActuales, tax,
      abrirEvento: (id) => abrirFicha(id, { volar: true }),
    });
    analisis.abrir();
  };
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
  api.map.on("style.load", () => { trayectoria?.reinstalar(); capaIndice?.reinstalar(); img?.reinstalar(); gestor?.reinstalar(); mov?.reinstalar(); riesgos?.reinstalar(); clima?.reinstalar(); });
  iniciarImagenes();
  iniciarClima();
  iniciarRiesgos();
  // Cuaderno del analista: checklist y notas del evento abierto (solo en este navegador).
  $("ficha-cuerpo").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-check]");
    if (!cb || !fichaEvento) return;
    const c = [...$("ficha-cuerpo").querySelectorAll("[data-check]:checked")].map((x) => x.dataset.check);
    cuaderno.actualizar(fichaEvento, { c });
    $("check-avance").textContent = `${c.length}/${analisisCfg.checklist.length}`;
  });
  const guardarNotas = debounce((id, n) => cuaderno.actualizar(id, { n }), 400);
  $("ficha-cuerpo").addEventListener("input", (e) => {
    if (e.target.id === "notas-evento" && fichaEvento) guardarNotas(fichaEvento, e.target.value);
  });
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
    onNuevosDatos: async () => { await cargarEventos(); featureTxt.clear(); porId = new Map(eventos.map((e) => [e.id, e])); linea.setEventos(eventos); aplicarFiltros(); pintarSeguimiento(); },
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
      <div class="meta">${f.disponible ? `${f.manifest.estado === "parcial" ? "⚠️ Cobertura parcial: algunas zonas del mundo no respondieron en la última actualización. " : ""}${f.manifest.estado === "desactualizada" ? `⚠️ Versión anterior (del ${esc((f.manifest.actualizado_utc || "").slice(0, 10))}): la última actualización falló. ` : ""}${f.manifest.objetos.toLocaleString("es-MX")} objetos · ${(f.manifest.bytes / 1e6).toFixed(1)} MB en mosaicos (solo se baja lo visible) · ${esc(f.licencia)}`
        : esc(f.habilitada ? (f.manifest?.estado === "error" ? "Error al construir: " + f.manifest.error : f.manifest?.estado === "pendiente" ? f.manifest.error : "Aún no se construye (workflow «Construir capas»)") : f.motivo || "Deshabilitada")}</div>
      ${f.disponible && f.subtipos.length > 1 ? `<details><summary>Subtipos (${f.subtipos.length})</summary>${f.subtipos.map((st) => `
        <label><input type="checkbox" data-fam-sub="${esc(f.id)}" value="${esc(st.id)}" checked><span class="swatch" style="background:${esc(st.color)}"></span>${esc(st.nombre.es)} <span class="meta">desde zoom ${st.zoom_min}</span></label>`).join("")}</details>` : ""}
    </div>`).join("");
  cont.addEventListener("change", async (e) => {
    const fam = e.target.dataset.fam;
    if (fam) { e.target.checked ? await gestor.activar(fam) : gestor.desactivar(fam); return; }
    const famSub = e.target.dataset.famSub;
    if (famSub) gestor.setSubtipos(famSub, [...cont.querySelectorAll(`[data-fam-sub="${famSub}"]:checked`)].map((x) => x.value));
  });
  // «Imágenes y cámaras» tiene un atajo a la capa de cámaras: ambas casillas quedan sincronizadas.
  const espejo = $("cam-espejo"), camCb = cont.querySelector('[data-fam="camaras"]');
  if (espejo && camCb && !camCb.disabled) {
    espejo.disabled = false;
    espejo.addEventListener("change", () => { camCb.checked = espejo.checked; camCb.dispatchEvent(new Event("change", { bubbles: true })); });
    camCb.addEventListener("change", () => { espejo.checked = camCb.checked; });
  }
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
  let fecha = ayerUTC();
  const dias = [1, 2, 3, 5, 7].map((d) => haceDias(d));
  cont.innerHTML = Object.entries(IMAGENES).map(([id, d]) => `<label class="fila"><span><input type="checkbox" data-img="${id}"> ${esc(d.nombre)}</span></label>`).join("")
    + `<label class="fila"><span>Día (UTC)</span><select id="img-fecha">${dias.map((d, i) => `<option value="${d}">${d}${i === 0 ? " (ayer)" : ""}</option>`).join("")}</select></label>`
    + `<p class="nota-capas" id="img-noche-nota"></p><p class="nota-capas">NASA GIBS. VIIRS cubre todo el planeta cada día sin huecos; MODIS deja cuñas negras entre órbitas cerca del Ecuador (es lo que el satélite no vio). Se descarga solo al activarla.</p>`;
  const notaNoche = (r, error) => {
    $("img-noche-nota").textContent = r === undefined ? "" : r ? `Luces nocturnas: ${r.etiqueta} (${r.fecha}). Zonas de día salen oscuras: el sensor solo ve luz artificial de noche.` : `Luces nocturnas: ${error || "sin imagen"}`;
  };
  cont.addEventListener("change", async (e) => {
    if (e.target.id === "img-fecha") { fecha = e.target.value; const r = await img.setFecha(fecha); if ("viirs_noche" in r) notaNoche(r.viirs_noche); return; }
    const id = e.target.dataset.img;
    if (!id) return;
    if (!e.target.checked) { img.desactivar(id); if (id === "viirs_noche") notaNoche(undefined); avisarPresupuesto(); return; }
    if (id === "viirs_noche") $("img-noche-nota").textContent = "Buscando la imagen disponible más reciente…";
    try { const r = await img.activar(id, fecha); if (id === "viirs_noche") notaNoche(r); } catch (err) { e.target.checked = false; if (id === "viirs_noche") notaNoche(null, err.message); }
    avisarPresupuesto();
  });
}

// ---------- Clima tipo Windy (modelo GFS de NOAA) ----------
async function iniciarClima() {
  const cont = $("clima-capas");
  if (!cont) return;
  if (lite) { cont.innerHTML = `<p class="meta">Desactivado en modo LITE (la animación del viento gasta batería).</p>`; return; }
  const K = await import("./clima.js");
  clima = new K.Clima(api.map);
  let meta;
  try { meta = await clima.cargar(); } catch (e) { cont.innerHTML = `<p class="meta">Aún no hay datos del modelo (los prepara el workflow «Datos en movimiento» cada 6 h).</p>`; return; }
  if (!meta.pasos?.length) { cont.innerHTML = `<p class="meta">Sin horizontes de pronóstico en la última corrida.</p>`; return; }
  const capas = [["viento", "Viento a 10 m (animado)"], ["temp", "Temperatura a 2 m"], ["lluvia", "Lluvia (mm/h)"]];
  cont.innerHTML = capas.map(([id, n]) => `<label class="fila"><span><input type="checkbox" data-clima="${id}"> ${esc(n)}</span></label>`).join("")
    + `<label class="fila"><span>Momento</span><select id="clima-paso">${meta.pasos.map((p, i) => `<option value="${i}">${esc(K.etiquetaPaso(p.valido_utc))}</option>`).join("")}</select></label>`
    + `<div id="clima-leyendas"></div>`
    + `<p class="nota-capas">Modelo GFS de NOAA (1°, ~110 km), corrida ${esc(meta.corrida)}. Es un pronóstico numérico, no una medición: para avisos oficiales consulta al SMN o a tu servicio meteorológico.</p>`;
  const leyendas = () => {
    $("clima-leyendas").innerHTML = [clima.activas.has("viento") ? K.leyenda(K.VELOCIDADES.map(([v, c]) => [Math.round(v * 3.6), c]), "km/h") : "",
      clima.activas.has("temp") ? K.leyenda(meta.leyendas.temp, "°C") : "", clima.activas.has("lluvia") ? K.leyenda(meta.leyendas.lluvia, "mm/h") : ""].join("");
  };
  cont.addEventListener("change", async (e) => {
    if (e.target.id === "clima-paso") { await clima.setPaso(Number(e.target.value)); return; }
    const t = e.target.dataset.clima;
    if (!t) return;
    try { e.target.checked ? await clima.activar(t) : clima.desactivar(t); } catch (err) { e.target.checked = false; alert(`No se pudo cargar: ${err.message}`); }
    leyendas();
    avisarPresupuesto();
  });
}

// ---------- Riesgos naturales y clima (Clima Táctico / WarRoomViajero) ----------
const FUENTE_MANIFIESTO = { ciclones: "storms", incendios: "fires", gdacs: "gdacs", pronostico: "forecast", aire: "airquality", volcanes: "volcanoes",
  seguridad: "security", severo: "severe_weather", deslaves: "mass_movements" };

async function iniciarRiesgos() {
  const cont = $("riesgos-capas");
  if (!cont) return;
  const [R, A] = await Promise.all([import("./riesgos.js"), import("./amenazas.js")]);
  // País de cada objeto: polígonos de países (110m) + nombres del gazetteer.
  const [fronteras] = await Promise.all([getJSON("data/base/countries-110m.geojson").catch(() => null), paises ? null : cargarPaises().catch(() => (paises = {}))]);
  const porNombre = {};
  for (const [iso, p] of Object.entries(paises || {})) { porNombre[(p.en || "").toLowerCase()] = iso; porNombre[(p.es || "").toLowerCase()] = iso; }
  Object.assign(porNombre, { mexico: "MEX", "méxico": "MEX", "united states": "USA", usa: "USA", "puerto rico": "PRI" });
  const nombrePais = (iso) => paises?.[iso]?.es || iso || "Mar / sin país";
  let zona = null;
  const pintar = () => {
    const todas = riesgos.amenazas();
    // Opciones de país y tipo según lo cargado.
    const selP = $("rg-pais"), selT = $("rg-tipo");
    const opts = (sel, valores, etiqueta) => {
      const prev = sel.value;
      sel.innerHTML = `<option value="">${etiqueta}</option>` + valores.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("");
      sel.value = valores.some(([v]) => v === prev) ? prev : "";
    };
    opts(selP, [...new Set(todas.map((a) => a.pais).filter(Boolean))].map((v) => [v, nombrePais(v)]).sort((a, b) => a[1].localeCompare(b[1], "es")), "Todos los países");
    opts(selT, [...new Set(todas.map((a) => a.tipo))].sort((a, b) => a.localeCompare(b, "es")).map((v) => [v, v]), "Todos los tipos");
    const filtro = { pais: selP.value, tipo: selT.value, sevMin: Number($("rg-sev").value) };
    riesgos.setFiltro(filtro);
    const lista = A.ordenar(A.filtrar(todas, { ...filtro, zona }), new Set(todas.filter((a) => a.nuevo).map((a) => a.k)));
    $("riesgos-amenazas").innerHTML = todas.length ? `<h3>Amenazas activas <span class="contador">${lista.length}</span>${zona ? ` <button class="mini" id="rg-zona-quitar">✕ ${esc(zona.nombre)}</button>` : ""}</h3>
      <ul class="lista-amenazas">${lista.slice(0, 40).map((a, n) => `<li><button data-am="${n}"><span class="sev sev-${a.sev}">${a.sev}</span>${a.nuevo ? `<span class="chip nuevo">NUEVO</span>` : ""}
        <span class="ttl">${esc(String(a.titulo).slice(0, 90))}</span><span class="meta">${esc(a.tipo)} · ${esc(nombrePais(a.pais))}</span></button></li>`).join("")}</ul>
      ${lista.length > 40 ? `<p class="meta">Mostrando 40 de ${lista.length}. Usa los filtros para acotar.</p>` : ""}` : "";
    $("riesgos-amenazas").onclick = (e) => {
      if (e.target.id === "rg-zona-quitar") { zona = null; pintar(); return; }
      const b = e.target.closest("[data-am]");
      if (!b) return;
      const a = lista[Number(b.dataset.am)];
      api.map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(api.map.getZoom(), 6), duration: lite ? 0 : 800 });
      riesgos.abrir(a);
    };
  };
  riesgos = new R.Riesgos(api.map, {
    ctx: { indice: fronteras ? A.indicePaises(fronteras) : null, porNombre },
    onCambio: () => pintar(),
    onObjeto: (capa, props, geom) => { entidadAbierta = null; trayectoria?.limpiar(); abrirFichaHtml(R.htmlRiesgo(capa, props, geom)); },
  });
  cont.innerHTML = R.CAPAS.map((c) => `<label class="fila"><span><input type="checkbox" data-riesgo="${c.id}"> ${esc(c.nombre)}</span><span class="meta" id="rg-n-${c.id}"></span></label>`).join("");
  $("riesgos-filtros").innerHTML = `<label class="fila"><span>Severidad mínima</span><select id="rg-sev">${A.SEVERIDADES.map(([n, t]) => `<option value="${n}">${n} · ${t}</option>`).join("")}</select></label>
    <label class="fila"><span>País</span><select id="rg-pais"><option value="">Todos los países</option></select></label>
    <label class="fila"><span>Tipo</span><select id="rg-tipo"><option value="">Todos los tipos</option></select></label>`;
  $("riesgos-filtros").addEventListener("change", pintar);
  // Consola de zona: país o estado de México → filtra la lista de amenazas.
  $("riesgos-zona").innerHTML = `<form id="rg-zona-form" class="fila"><input id="rg-zona-q" placeholder="País o estado de México…" autocomplete="off" aria-label="Consultar zona"><button>Ver zona</button></form><p class="meta" id="rg-zona-res"></p>`;
  $("rg-zona-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("rg-zona-q").value.trim().toLowerCase();
    if (!q) { zona = null; pintar(); return; }
    const estados = await getJSON("config/mx_estados.json").catch(() => ({ estados: [] }));
    const norm = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const est = estados.estados.find((x) => norm(x.nombre) === norm(q) || (x.alias || []).some((a) => norm(a) === norm(q)));
    const iso = porNombre[q] || Object.entries(paises || {}).find(([, p]) => norm(p.es || "") === norm(q))?.[0];
    if (est) zona = { nombre: est.nombre, lat: est.lat, lon: est.lon, radio_km: 200 };
    else if (iso) zona = { nombre: nombrePais(iso), iso3: iso };
    else { $("rg-zona-res").textContent = "No encontré esa zona. Escribe un país o un estado de México."; return; }
    $("rg-zona-res").textContent = est ? `Amenazas a menos de 200 km del centro aproximado de ${est.nombre}.` : `Amenazas en ${nombrePais(iso)}.`;
    if (est) api.map.flyTo({ center: [est.lon, est.lat], zoom: 6, duration: lite ? 0 : 800 });
    pintar();
  });
  cont.addEventListener("change", async (e) => {
    const id = e.target.dataset.riesgo;
    if (!id) return;
    const marca = $(`rg-n-${id}`);
    if (!e.target.checked) { riesgos.desactivar(id); marca.textContent = ""; return; }
    marca.textContent = "cargando…";
    try { const n = await riesgos.activar(id); marca.textContent = `${n.toLocaleString("es-MX")}`; } catch (err) { e.target.checked = false; marca.textContent = "sin datos"; }
  });
  // Valle de México: Hoy No Circula (calculado aquí) + calidad del aire de la CDMX (Clima Táctico).
  const hnc = A.hoyNoCircula();
  $("riesgos-vdm").innerHTML = `<b>Valle de México · Hoy No Circula:</b> ${esc(hnc.texto)} <span id="rg-vdm-aire"></span>
    El Doble No Circula solo aplica con contingencia declarada por la <a href="https://www.gob.mx/comisionambiental" target="_blank" rel="noopener noreferrer">CAMe</a>.`;
  const [man, esp, aire, feed] = await Promise.all([riesgos.manifiesto(), riesgos.espacial(),
    getJSON(R.BASES[0] + "airquality.geojson").catch(() => null), getJSON(R.BASES[0] + "security_feed.json").catch(() => null)]);
  const cdmx = aire?.features?.find((f) => /ciudad de m[eé]xico/i.test(f.properties.name || ""));
  if (cdmx) $("rg-vdm-aire").innerHTML = `Calidad del aire en la CDMX: <b>${esc(cdmx.properties.level_label)}</b> (US AQI ${esc(cdmx.properties.us_aqi ?? "—")})${cdmx.properties.level >= 3 ? " · ⚠ posible contingencia: verifica en la CAMe" : ""}.`;
  if (feed?.items?.length) {
    $("riesgos-feed").innerHTML = `<details><summary>Feed de seguridad (titulares, verificar) · ${feed.items.length}</summary><ul class="fuentes">${feed.items.slice(0, 12).map((it) => `<li><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(String(it.title).slice(0, 140))}</a></li>`).join("")}</ul></details>`;
  }
  if (man) {
    $("riesgos-nota").textContent = `Datos horneados por Clima Táctico el ${(man.generated || "").replace("T", " ").slice(0, 16)} UTC (se actualizan 2 veces al día); sismos y alertas de EUA en vivo. Los eventos nuevos parpadean 1 min y llevan la marca NUEVO 1 h.`;
    for (const [id, k] of Object.entries(FUENTE_MANIFIESTO)) {
      const n = man.sources?.[k]?.count;
      const cb = cont.querySelector(`[data-riesgo="${id}"]`);
      if (n === 0 && cb) { cb.closest("label").classList.add("capa-off"); $(`rg-n-${id}`).textContent = "0 hoy"; }
    }
  }
  const txt = R.textoEspacial(esp);
  if (txt) $("riesgos-espacial").innerHTML = `<b>Clima espacial (NOAA SWPC):</b> ${esc(txt)}. <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer">Fuente ↗</a>`;
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
    onObjeto: (o) => abrirObjetoMovil(o, catalogo),
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
      ${ok ? `<details><summary>Subtipos (${subs.length})</summary>${subs.map((s) => `<label><input type="checkbox" data-mov-sub="${tipo}" value="${esc(tipo === "satelites" ? s.grupo : s.id)}" ${s.inicial === false ? "" : "checked"}><span class="swatch" style="background:${esc(s.color)}"></span>${esc(s.nombre.es)}</label>`).join("")}</details>` : ""}
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

// ---------- Historial (30 o 90 días, bajo demanda) ----------
async function anexarHistorial(horas, avisar) {
  const { cargarHistorial } = await import("./historial.js");
  try {
    const r = await cargarHistorial({
      dias: Math.round(horas / 24), existentes: new Set(eventos.map((e) => e.id)), cargados: diasHistorial, regionDe,
      onProgreso: (h, t) => avisar(t ? `Cargando historial: ${h} de ${t} días…` : "Historial ya cargado."),
    });
    if (r.nuevos.length) {
      historialEv = historialEv.concat(r.nuevos);
      eventos = eventos.concat(r.nuevos);
      for (const e of r.nuevos) porId.set(e.id, e);
      linea.setEventos(eventos);
    }
    console.info(`historial: +${r.nuevos.length} eventos (${r.dias} días publicados, severidad ≥ ${r.sevMin})`);
  } catch (e) {
    avisar(`No hay historial publicado todavía (${e.message}).`);
    await new Promise((ok) => setTimeout(ok, 2500));
  }
}

// ---------- Mapa de calor por país (índice de inestabilidad) ----------
async function alternarIndice(activar) {
  const ley = $("leyenda-indice");
  if (!activar) { capaIndice?.desactivar(); ley.hidden = true; avisarPresupuesto(); return; }
  const { CapaIndice, ESCALA } = await import("./indice.js");
  capaIndice ??= new CapaIndice(api.map, {
    onClic: async (p, lngLat) => {
      if (!paises) await cargarPaises().catch(() => (paises = {}));
      const nombre = paises[p.iso3]?.es || p.iso3;
      const txt = p.indice >= 0 ? `${nombre}: índice ${p.indice} (${p.eventos} eventos en 30 días)` : `${nombre}: sin eventos en 30 días`;
      new maplibregl.Popup({ closeButton: true }).setLngLat(lngLat).setText(txt).addTo(api.map);
    },
  });
  const info = await capaIndice.activar();
  ley.hidden = false;
  ley.innerHTML = `<div class="escala">${ESCALA.map((e) => `<span><span class="mr-muestra" style="background:${e.color}"></span>${e.etiqueta}</span>`).join("")}</div>
    <div class="meta">${info.paises ? `${info.paises} países con eventos en 30 días` : "Sin países con eventos en 30 días todavía"} · indicador propio (docs/INDICADORES.md) · clic en un país para ver su valor</div>`;
  avisarPresupuesto();
}

function avisarPresupuesto() {
  const n = (gestor ? gestor.totalActivas() : 1) + (mov ? mov.activas.size : 0) + (img ? img.activas.size : 0) + (capaIndice?.activa ? 1 : 0);
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
