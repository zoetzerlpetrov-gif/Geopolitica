// Punto de entrada: carga datos, crea el mapa y conecta la interfaz.
/* global maplibregl */
import { getJSON, esc, safeUrl, fecha, storage, distanciaKm, debounce, sinAcentos, palabrasDe } from "./util.js";
import { estiloBase, crearMapa } from "./map.js";
import { htmlFicha } from "./card.js";
import { iniciarRefresco } from "./refresh.js";
import { GestorCapas, familiasDibujables, htmlFichaEntidad, etiquetaEstado, PRESUPUESTO_CAPAS } from "./capas.js";
import * as seg from "./seguimiento.js";
import { Movimiento, htmlFichaMovil, vueloDeFila, proyectar, SUB } from "./movimiento.js";
import { Imagenes, IMAGENES, ayerUTC, haceDias } from "./imagenes.js";
import { LineaTiempo } from "./linea-tiempo.js";
import * as cuaderno from "./cuaderno.js";
import { iniciarMenu } from "./menu.js";

const MAX_LISTA = 200; // la lista lateral muestra los más recientes; el mapa muestra todos

const $ = (id) => document.getElementById(id);
const estado = { areas: new Set(), mexico: false, sevMin: 1, sevSolo: 0, pais: "", orden: "sev", region: "", desde: -Infinity, hasta: Infinity, palabras: [] };
let eventos = [];
let visiblesActuales = [];
let linea, capaIndice, analisis;
let historialEv = [];            // eventos del historial ya descargados (sobreviven a la recarga horaria)
const diasHistorial = new Set(); // días del historial descargados completos
let regionDe = {};
let porId = new Map();
let tax, paises, api, gestor, mov, img, riesgos, clima, menu;
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

// ---------- Búsqueda por texto ----------
// Sin acentos ni mayúsculas: «Mexico» encuentra «México». Se busca en título, resumen, fuente, país y actores.
const textoBusqueda = new Map();
function textoDe(ev) {
  let t = textoBusqueda.get(ev.id);
  if (t == null) {
    t = sinAcentos([ev.titulo, ev.resumen, ev.fuente, ev.pais_iso3, paises?.[ev.pais_iso3]?.es, paises?.[ev.pais_iso3]?.en,
      ...(ev.actores || []).map((a) => (typeof a === "string" ? a : a?.nombre))].filter(Boolean).join(" "));
    textoBusqueda.set(ev.id, t);
  }
  return t;
}
// ---------- Filtros ----------
function pasaFiltros(ev, ignorarArea = false, ignorarPais = false) {
  if (estado.palabras.length) { const t = textoDe(ev); if (!estado.palabras.every((w) => t.includes(w))) return false; }
  if (!ignorarArea && !estado.areas.has(ev.area_principal)) return false;
  if (!ignorarPais && estado.pais && ev.pais_iso3 !== estado.pais) return false;
  if (estado.mexico && !ev.impacto_mexico) return false;
  if (estado.leyes && !(ev.subtemas || []).includes("leyes_reformas")) return false;
  if (ev.severidad < estado.sevMin) return false;
  if (estado.sevSolo && ev.severidad !== estado.sevSolo) return false;
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
  const porPais = {};
  for (let i = 0; i < eventos.length; i++) {
    if (i && i % BLOQUE === 0) { await ceder(); if (mia !== generacion) return; }
    const ev = eventos[i];
    if (!pasaFiltros(ev, true, true)) continue;
    if (ev.pais_iso3 && estado.areas.has(ev.area_principal)) porPais[ev.pais_iso3] = (porPais[ev.pais_iso3] || 0) + 1;
    if (estado.pais && ev.pais_iso3 !== estado.pais) continue;
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
  opcionesPaisLista(porPais);
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

// Resumen de los filtros activos (se ve aunque la sección esté cerrada).
function resumenFiltros() {
  const partes = [];
  if (estado.sevSolo) partes.push(`solo sev. ${estado.sevSolo}`); else if (estado.sevMin > 1) partes.push(`sev. ≥ ${estado.sevMin}`);
  if (estado.pais) partes.push(paises?.[estado.pais]?.es || estado.pais);
  if (estado.region) partes.push($("ev-region").selectedOptions[0]?.textContent || estado.region);
  if (estado.mexico) partes.push("impacto en México");
  if (estado.leyes) partes.push("leyes y reformas");
  if (estado.palabras.length) partes.push(`texto «${estado.palabras.join(" ")}»`);
  if (tax && estado.areas.size < tax.lista.length) partes.push(`${estado.areas.size} de ${tax.lista.length} áreas`);
  $("ev-resumen").textContent = partes.length ? partes.join(" · ") : "sin filtros";
  $("ev-resumen").classList.toggle("activo", partes.length > 0);
  if (tax) $("areas-resumen").textContent = `${estado.areas.size} de ${tax.lista.length}`;
}

// Orden de la lista: severidad de mayor a menor (y dentro de cada nivel, lo más reciente primero) o solo por fecha.
function ordenarLista(visibles) {
  const reciente = (a, b) => (b._t ?? 0) - (a._t ?? 0);
  return [...visibles].sort(estado.orden === "sev" ? (a, b) => b.severidad - a.severidad || reciente(a, b) : reciente);
}

// El menú de países de la lista se llena solo con los países que tienen eventos con los demás filtros.
let firmaPaises = "";
function opcionesPaisLista(porPais) {
  const sel = $("ev-pais");
  if (!sel) return;
  const filas = Object.entries(porPais).map(([iso, n]) => [iso, paises?.[iso]?.es || iso, n]).sort((a, b) => a[1].localeCompare(b[1], "es"));
  const firma = filas.map((f) => f.join(":")).join("|") + estado.pais;
  if (firma === firmaPaises) return;
  firmaPaises = firma;
  if (estado.pais && !porPais[estado.pais]) filas.unshift([estado.pais, paises?.[estado.pais]?.es || estado.pais, 0]);
  sel.innerHTML = `<option value="">Todos los países</option>` + filas.map(([iso, n, c]) => `<option value="${esc(iso)}">${esc(n)} (${c})</option>`).join("");
  sel.value = estado.pais;
}

function pintarLista(visibles) {
  const ol = $("lista-eventos");
  $("contador").textContent = `(${visibles.length})`;
  $("lista-resumen").textContent = `${visibles.length.toLocaleString("es-MX")}${visibles.length > MAX_LISTA ? ` · se listan ${MAX_LISTA}` : ""}`;
  resumenFiltros();
  const html = ordenarLista(visibles).slice(0, MAX_LISTA).map((ev) => {
    const a = tax.areas.get(ev.area_principal);
    return `<li><button type="button" data-id="${esc(ev.id)}" title="${esc(ev.resumen)}">
      <span class="punto" style="background:${esc(a.color)}" aria-hidden="true"></span>
      <span class="sev sev-${ev.severidad}" title="Severidad ${ev.severidad}">${ev.severidad}</span>
      <span>${esc(ev.titulo)}<span class="meta">${esc(fecha(ev.fecha_utc))} · ${esc(a.nombre)}${ev.pais_iso3 ? ` · ${esc(paises?.[ev.pais_iso3]?.es || ev.pais_iso3)}` : ""}</span></span>
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
  const [orb, catalogoSat] = await Promise.all([mov.orbita(norad), S.fichaCatalogo(norad).catch(() => null)]);
  base.catalogo = catalogoSat;
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
  const selRegionLista = $("ev-region");
  for (const [id, r] of Object.entries(regiones.regiones)) selRegionLista.add(new Option(r.nombre, id));
  const ponerRegion = (v) => { estado.region = v; selRegion.value = v; selRegionLista.value = v; programarFiltros(); };
  selRegion.onchange = (e) => ponerRegion(e.target.value);
  selRegionLista.onchange = (e) => ponerRegion(e.target.value);
  $("ev-orden").onchange = (e) => { estado.orden = e.target.value; pintarLista(visiblesActuales); };
  $("ev-sev").onchange = (e) => { estado.sevSolo = Number(e.target.value); programarFiltros(); };
  $("ev-pais").onchange = (e) => { estado.pais = e.target.value; programarFiltros(); };
  cargarPaises().then(() => { firmaPaises = ""; programarFiltros(); }).catch(() => {});
  $("f-mexico").onchange = (e) => { estado.mexico = e.target.checked; programarFiltros(); };
  $("f-leyes").onchange = (e) => { estado.leyes = e.target.checked; programarFiltros(); };
  let tBusca = 0;
  $("ev-q").addEventListener("input", (e) => {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => { estado.palabras = palabrasDe(e.target.value); programarFiltros(); }, 180);  // filtra mientras escribes
  });
  $("f-severidad").onchange = (e) => { estado.sevMin = Number(e.target.value); programarFiltros(); };
  $("ev-limpiar").onclick = () => {
    Object.assign(estado, { sevMin: 1, sevSolo: 0, pais: "", mexico: false, leyes: false, palabras: [] });
    $("ev-q").value = "";
    for (const [id, v] of [["f-severidad", "1"], ["ev-sev", "0"], ["ev-pais", ""], ["f-region", ""], ["ev-region", ""]]) $(id).value = v;
    $("f-mexico").checked = false;
    $("f-leyes").checked = false;
    estado.areas = new Set(tax.lista.map((a) => a.id));
    ponerRegion("");
    pintarAreas2();
  };
  menu = iniciarMenu($("panel"));
  import("./foto.js").then((F) => F.iniciarFoto({ map: api.map, lite })).catch(() => {});
  Promise.all([import("./alerta-sismos-ui.js"), cargarPaises().catch(() => ({}))])
    .then(([m]) => m.iniciarAlertaSismos({ map: api.map, paises: paises || {} })).catch(() => {});
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

  // Vista: tema claro/oscuro, mapa base (temático, calles, satélite) y proyección (plano o globo 3D).
  const cambiarBase = async () => {
    const b = await estiloBase(temaActual(), { lite, base: $("sel-base").value });
    api.setTema(temaActual(), b.style);
    api.map.once("style.load", () => aplicarFiltros());
  };
  $("btn-tema").onclick = async () => {
    const nuevo = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    storage.set("gp_theme", nuevo);
    await cambiarBase();
  };
  $("sel-base").value = storage.get("gp_base") || "tematico";
  $("sel-proyeccion").value = storage.get("gp_proyeccion") || "mercator";
  $("sel-base").onchange = () => { storage.set("gp_base", $("sel-base").value); cambiarBase(); };
  $("sel-proyeccion").onchange = () => { storage.set("gp_proyeccion", $("sel-proyeccion").value); api.setProyeccion($("sel-proyeccion").value); };
  if ($("sel-base").value !== "tematico") cambiarBase();
  if ($("sel-proyeccion").value !== "mercator") api.setProyeccion($("sel-proyeccion").value);

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
  // Subtítulo por categoría del catálogo (Infraestructura, Conflictos, Religiones…), en el orden del catálogo.
  const ordenCat = catalogo.categorias.map((c) => c.id);
  const nombreCat = Object.fromEntries(catalogo.categorias.map((c) => [c.id, c.nombre.es]));
  familias.sort((a, b) => ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria));
  // Subsección plegable por categoría del catálogo (Organizaciones, Infraestructura, Recursos…).
  const htmlFam = (f) => `
    <div class="capa-fam ${f.disponible ? "" : "capa-off"}">
      <label class="fila"><span><input type="checkbox" data-fam="${esc(f.id)}" ${f.disponible ? "" : "disabled"}> ${esc(f.nombre)}</span>
        <span class="chip estado-${esc(f.estado_dato)}" title="Estado del dato">${esc(etiquetaEstado(f.estado_dato))}</span></label>
      <div class="meta">${f.disponible ? `${f.manifest.estado === "parcial" ? "⚠️ Cobertura parcial: algunas zonas del mundo no respondieron en la última actualización. " : ""}${f.manifest.estado === "desactualizada" ? `⚠️ Versión anterior (del ${esc((f.manifest.actualizado_utc || "").slice(0, 10))}): la última actualización falló. ` : ""}${f.manifest.objetos.toLocaleString("es-MX")} objetos · ${(f.manifest.bytes / 1e6).toFixed(1)} MB en mosaicos (solo se baja lo visible) · ${esc(f.licencia)}`
        : esc(f.habilitada ? (f.manifest?.estado === "error" ? "Error al construir: " + f.manifest.error : f.manifest?.estado === "pendiente" ? f.manifest.error : "Aún no se construye (workflow «Construir capas»)") : f.motivo || "Deshabilitada")}</div>
      ${f.disponible && f.subtipos.length > 1 ? `<details><summary>Subtipos (${f.subtipos.length})</summary>${f.subtipos.map((st) => `
        <label><input type="checkbox" data-fam-sub="${esc(f.id)}" value="${esc(st.id)}" checked><span class="swatch" style="background:${esc(st.color)}"></span>${esc(st.nombre.es)} <span class="meta">desde zoom ${st.zoom_min}</span></label>`).join("")}</details>` : ""}
    </div>`;
  const cats = [...new Set(familias.map((f) => f.categoria))];
  cont.innerHTML = cats.map((c) => {
    const fs = familias.filter((f) => f.categoria === c);
    return `<details class="subgrupo-d" id="sg-capas-${esc(c)}"><summary class="subgrupo"><span class="punto" style="--c:${esc(fs[0].subtipos[0]?.color || "#888")}"></span>${esc(nombreCat[c] || c)}
      <span class="sg-n" data-sg-cat="${esc(c)}">${((n) => `${n} ${n === 1 ? "capa" : "capas"}`)(fs.filter((f) => f.disponible).length)}</span></summary>${fs.map(htmlFam).join("")}</details>`;
  }).join("");
  cont.addEventListener("change", async (e) => {
    const fam = e.target.dataset.fam;
    if (fam) {
      if (!e.target.checked) { gestor.desactivar(fam); return; }
      await gestor.activar(fam);
      // Al encender (o volver a encender) la familia se respetan los subtipos que dejaste marcados.
      const subs = [...cont.querySelectorAll(`[data-fam-sub="${fam}"]`)];
      if (subs.length && subs.some((x) => !x.checked)) gestor.setSubtipos(fam, subs.filter((x) => x.checked).map((x) => x.value));
      return;
    }
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
const FUENTE_MANIFIESTO = { incendios: "fires", gdacs: "gdacs", pronostico: "forecast", aire: "airquality", volcanes: "volcanoes",
  severo: "severe_weather" };

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
  let apagadas = [];  // amenazas de capas no activadas (solo para llenar los filtros)
  let ultimaFirma = "";
  const pintar = () => {
    const todas = riesgos.amenazas();
    // Opciones de país y tipo con conteos que respetan los OTROS filtros (severidad, país o tipo, zona).
    // Tipo: también cuenta lo de capas apagadas (elegirlo enciende esa sola capa). País: solo lo encendido,
    // con un aviso de cuánto hay en capas apagadas (elegir un país no enciende nada por sí solo).
    const selP = $("rg-pais"), selT = $("rg-tipo");
    const sevMin = Number($("rg-sev").value), prevP = selP.value, prevT = selT.value;
    const pasa = (a, { sinPais = false, sinTipo = false } = {}) => (a.sev || 1) >= sevMin && (sinPais || !prevP || a.pais === prevP)
      && (sinTipo || !prevT || a.tipo === prevT) && (!zona || A.filtrar([a], { zona }).length);
    const contar = (lista, clave, opc) => {
      const m = new Map();
      for (const a of lista) { if (!a[clave] || !pasa(a, opc)) continue; const c = m.get(a[clave]) || { n: 0, off: 0, capa: a.capa }; c.n++; if (a.apagada) c.off++; m.set(a[clave], c); }
      return m;
    };
    const cp = contar(todas, "pais", { sinPais: true }), cpOff = contar(apagadas, "pais", { sinPais: true });
    const ct = contar([...todas, ...apagadas], "tipo", { sinTipo: true });
    const paisesOpc = new Set([...cp.keys(), ...cpOff.keys(), ...(prevP ? [prevP] : [])]);
    selP.innerHTML = `<option value="">Todos los países</option>` + [...paisesOpc].map((v) => [v, nombrePais(v)]).sort((x, y) => x[1].localeCompare(y[1], "es"))
      .map(([v, n]) => { const on = cp.get(v)?.n || 0, off = cpOff.get(v)?.n || 0;
        return `<option value="${esc(v)}">${esc(`${n} (${on}${off ? ` · +${off} en capas apagadas` : ""})`)}</option>`; }).join("");
    selT.innerHTML = `<option value="">Todos los tipos</option>` + R.CAPAS.map((capa) => {
      const tipos = [...ct].filter(([, c]) => c.capa === capa.id).sort((x, y) => x[0].localeCompare(y[0], "es"));
      if (prevT && !tipos.some(([v]) => v === prevT) && todas.concat(apagadas).some((a) => a.tipo === prevT && a.capa === capa.id)) tipos.push([prevT, { n: 0, off: 0 }]);
      return tipos.length ? `<optgroup label="${esc(capa.nombre)}">${tipos.map(([v, c]) => `<option value="${esc(v)}">${esc(`${v} (${c.n})${c.n && c.off === c.n ? " · se enciende al elegirlo" : ""}`)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    selP.value = paisesOpc.has(prevP) ? prevP : "";
    selT.value = [...selT.options].some((o) => o.value === prevT) ? prevT : "";
    if (!apagadas.length && !riesgos.catalogo) $("rg-filtro-nota").textContent = "Abre un filtro para ver también los países y tipos de las capas apagadas.";
    else if (prevP && cpOff.get(prevP)?.n) {
      const capasOff = [...new Set(apagadas.filter((a) => a.pais === prevP && pasa(a, { sinPais: true })).map((a) => a.capa))];
      $("rg-filtro-nota").innerHTML = `Hay ${cpOff.get(prevP).n} amenazas más en ${esc(nombrePais(prevP))} en ${capasOff.length} capa(s) apagada(s). <button type="button" class="txt-btn" id="rg-encender" data-capas="${esc(capasOff.join(","))}">Encenderlas</button>`;
    } else if (apagadas.length) $("rg-filtro-nota").textContent = "Elegir un tipo de una capa apagada la enciende; elegir un país no enciende nada.";
    const filtro = { pais: selP.value, tipo: selT.value, sevMin: Number($("rg-sev").value) };
    riesgos.setFiltro(filtro);
    const lista = A.ordenar(A.filtrar(todas, { ...filtro, zona }), new Set(todas.filter((a) => a.nuevo).map((a) => a.k)));
    const aplicados = [filtro.sevMin > 1 ? `severidad ≥ ${filtro.sevMin}` : "", filtro.pais ? nombrePais(filtro.pais) : "", filtro.tipo, zona ? `zona: ${zona.nombre}` : ""].filter(Boolean);
    $("am-resumen").textContent = todas.length ? `${lista.length} de ${todas.length}` : "";
    $("amenazas-resumen").textContent = riesgos.activas.size ? `${riesgos.activas.size} activas` : "";
    const firmaLista = `${lista.length}|${aplicados.join("|")}`;
    $("riesgos-amenazas").innerHTML = todas.length ? `<div class="am-cab${firmaLista !== ultimaFirma ? " destello" : ""}"><b>${lista.length.toLocaleString("es-MX")}</b> de ${todas.length.toLocaleString("es-MX")} amenazas
        ${aplicados.length ? `<span class="meta">· filtro: ${esc(aplicados.join(" · "))}</span> <button type="button" class="txt-btn" id="rg-limpiar">Quitar filtros</button>` : `<span class="meta">· sin filtros</span>`}
        ${zona ? ` <button class="mini" id="rg-zona-quitar">✕ ${esc(zona.nombre)}</button>` : ""}</div>
      <ul class="lista-amenazas">${lista.slice(0, 40).map((a, n) => `<li><button data-am="${n}"><span class="sev sev-${a.sev}">${a.sev}</span>${a.nuevo ? `<span class="chip nuevo">NUEVO</span>` : ""}
        <span class="ttl">${esc(String(a.titulo).slice(0, 90))}</span><span class="meta">${esc(a.tipo)} · ${esc(nombrePais(a.pais))}</span></button></li>`).join("")}</ul>
      ${lista.length > 40 ? `<p class="meta">Mostrando 40 de ${lista.length}. Usa los filtros para acotar.</p>` : ""}` : `<p class="meta">Activa al menos una capa en «Amenazas: capas en el mapa».</p>`;
    ultimaFirma = firmaLista;
    $("riesgos-amenazas").onclick = (e) => {
      if (e.target.id === "rg-limpiar") { $("rg-sev").value = "1"; $("rg-pais").value = ""; $("rg-tipo").value = ""; zona = null; api.map.getSource("rg-zona-circulo")?.setData({ type: "FeatureCollection", features: [] }); pintar(); return; }
      if (e.target.id === "rg-zona-quitar") { zona = null; api.map.getSource("rg-zona-circulo")?.setData({ type: "FeatureCollection", features: [] }); $("rg-zona-res").textContent = ""; pintar(); return; }
      const b = e.target.closest("[data-am]");
      if (!b) return;
      const a = lista[Number(b.dataset.am)];
      api.map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(api.map.getZoom(), 6), duration: lite ? 0 : 800 });
      riesgos.abrir(a);
    };
  };
  riesgos = new R.Riesgos(api.map, {
    ctx: { indice: fronteras ? A.indicePaises(fronteras) : null, porNombre },
    onCambio: () => { if (riesgos?.catalogo) riesgos.explorar().then((x) => { apagadas = x; pintar(); }); else pintar(); },
    onObjeto: (capa, props, geom) => {
      entidadAbierta = null; trayectoria?.limpiar(); abrirFichaHtml(R.htmlRiesgo(capa, props, geom));
      const div = document.querySelector("#ficha-cuerpo .ceniza");
      if (div) import("./ceniza.js").then((C) => C.mostrarCeniza(api.map, div)).catch((e) => { div.innerHTML = `<p class="meta">No se pudo calcular el viento: ${esc(e.message)}</p>`; });
    },
  });
  cont.innerHTML = R.GRUPOS.map(([g, ic, color], i) => `<details class="subgrupo-d" id="sg-rg-${i}" open><summary class="subgrupo" style="--c:${color}"><span class="punto"></span>${ic} ${esc(g)}
      <span class="sg-n">${R.CAPAS.filter((c) => c.grupo === g).length} capas</span></summary>`
    + R.CAPAS.filter((c) => c.grupo === g).map((c) => `<label class="fila"><span><input type="checkbox" data-riesgo="${c.id}"> ${esc(c.nombre)}</span><span class="meta" id="rg-n-${c.id}"></span></label>
      ${c.leyenda ? `<div class="ley-wrap" id="rg-ley-${c.id}" hidden>${R.htmlLeyenda(c)}</div>` : ""}`).join("") + `</details>`).join("");
  $("riesgos-filtros").innerHTML = `<label class="fila"><span>Severidad mínima</span><select id="rg-sev">${A.SEVERIDADES.map(([n, t]) => `<option value="${n}">${n} · ${t}</option>`).join("")}</select></label>
    <label class="fila"><span>País</span><select id="rg-pais"><option value="">Todos los países</option></select></label>
    <label class="fila"><span>Tipo</span><select id="rg-tipo"><option value="">Todos los tipos</option></select></label>
    <p class="meta" id="rg-filtro-nota"></p>`;
  // La primera vez que se abre la sección o un filtro se leen también las capas apagadas.
  const explorar = async () => {
    if (riesgos.catalogo) return;
    $("rg-filtro-nota").textContent = "Leyendo todas las capas para llenar los filtros…";
    apagadas = await riesgos.explorar();
    $("rg-filtro-nota").textContent = "Si eliges un país o tipo de una capa apagada, esa capa se activa sola.";
    pintar();
  };
  cont.closest("details")?.addEventListener("toggle", (e) => { if (e.target.open) explorar(); });
  $("riesgos-filtros").addEventListener("focusin", explorar);
  $("riesgos-filtros").addEventListener("click", (e) => {
    if (e.target.id !== "rg-encender") return;
    for (const id of e.target.dataset.capas.split(",").filter(Boolean)) {
      const cb = cont.querySelector(`[data-riesgo="${id}"]`);
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });
  $("riesgos-filtros").addEventListener("change", async (e) => {
    if (e.target.id === "rg-tipo" && e.target.value) {
      const capas = new Set(apagadas.filter((a) => a.tipo === e.target.value).map((a) => a.capa));
      for (const id of capas) {
        const cb = cont.querySelector(`[data-riesgo="${id}"]`);
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      if (capas.size) $("rg-filtro-nota").textContent = `Se encendió: ${[...capas].map((id) => R.CAPAS.find((c) => c.id === id).nombre).join("; ")}.`;
    }
    pintar();
  });
  // Consola de zona: país, estado de México o ciudad del mundo (radio de 200 km) → filtra la lista de amenazas.
  $("riesgos-zona").innerHTML = `<form id="rg-zona-form" class="fila"><input id="rg-zona-q" list="rg-zona-sug" placeholder="Ciudad, estado o país…" autocomplete="off" aria-label="Consultar zona"><datalist id="rg-zona-sug"></datalist><button>Ver zona</button></form>
    <p class="meta" id="rg-zona-res">Ej.: «Acapulco», «Guerrero», «Bogotá», «Lyon, Francia». Ciudades: radio de ${A.RADIO_ZONA_KM} km.</p>
    <div id="rg-zona-pases"></div>`;
  let fuentesZona = null;
  const cargarFuentesZona = () => (fuentesZona ??= Promise.all([getJSON("config/mx_estados.json").catch(() => ({ estados: [], ciudades: [] })),
    getJSON("config/ciudades.json").catch(() => ({ ciudades: [] }))])
    .then(([mx, c]) => ({ estados: mx.estados || [], ciudadesMx: mx.ciudades || [], ciudades: c.ciudades || [], paises: paises || {} })));
  const circuloZona = (z) => {
    const m = api.map, src = "rg-zona-circulo";
    const data = { type: "FeatureCollection", features: z?.radio_km ? [{ type: "Feature", geometry: { type: "Polygon", coordinates: [A.circuloKm([z.lon, z.lat], z.radio_km)] }, properties: {} }] : [] };
    if (m.getSource(src)) { m.getSource(src).setData(data); return; }
    m.addSource(src, { type: "geojson", data });
    m.addLayer({ id: `${src}-l`, type: "line", source: src, paint: { "line-color": "#E0A100", "line-width": 1.6, "line-dasharray": [3, 2] } });
  };
  let sugTimer = 0, ultimos = [];
  $("rg-zona-q").addEventListener("input", (e) => {
    clearTimeout(sugTimer);
    sugTimer = setTimeout(async () => {
      const f = await cargarFuentesZona();
      ultimos = A.candidatosZona(e.target.value, f, 12);
      $("rg-zona-sug").innerHTML = ultimos.map((c) => `<option value="${esc(c.etiqueta)}"></option>`).join("");
    }, 150);
  });
  const ponerZona = (z, texto) => {
    zona = z;
    circuloZona(z);
    $("rg-zona-res").textContent = texto;
    $("rg-zona-pases").innerHTML = z?.radio_km && z.lat != null ? `<button type="button" class="mini" id="rg-pases">🛰 Satélites visibles a simple vista desde aquí (24 h)</button>` : "";
    if (z?.radio_km) api.map.flyTo({ center: [z.lon, z.lat], zoom: 6, duration: lite ? 0 : 800 });
    pintar();
  };
  $("rg-zona-pases").addEventListener("click", async (e) => {
    if (e.target.id !== "rg-pases" || !zona) return;
    const caja = $("rg-zona-pases"), z = zona;
    caja.innerHTML = `<p class="meta">Calculando pases de ${esc(z.nombre)} (estaciones espaciales y satélites más brillantes)…</p>`;
    try {
      const S = await import("./satelites.js");
      const r = await S.calcularPases(z.lat, z.lon);
      if (zona !== z) return;
      caja.innerHTML = S.htmlPases(r, z.etiqueta || z.nombre);
    } catch (err) { caja.innerHTML = `<p class="meta">No se pudieron calcular los pases: ${esc(err.message)}</p>`; }
  });
  $("rg-zona-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("rg-zona-q").value.trim();
    if (!q) { ponerZona(null, ""); return; }
    const f = await cargarFuentesZona();
    // Si eligió una sugerencia, se usa tal cual; si no, el mejor candidato del texto.
    let z = ultimos.find((c) => c.etiqueta === q) || A.candidatosZona(q, f, 1)[0];
    if (!z) {
      // Lugares que no están en la lista (pueblos, playas): geocodificador de Open-Meteo (GeoNames), sin llave.
      $("rg-zona-res").textContent = "Buscando el lugar…";
      try {
        const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.split(",")[0])}&count=1&language=es`);
        const g = r.results?.[0];
        if (g) z = { nombre: g.name, etiqueta: `${g.name}${g.admin1 ? `, ${g.admin1}` : ""}, ${g.country || ""}`, lat: g.latitude, lon: g.longitude, radio_km: A.RADIO_ZONA_KM };
      } catch (err) { /* sin conexión al geocodificador */ }
    }
    if (!z) { $("rg-zona-res").textContent = "No encontré esa zona. Escribe una ciudad, un estado de México o un país."; return; }
    ponerZona(z, z.iso3 ? `Amenazas en ${z.nombre} (todo el país).` : `Amenazas a menos de ${z.radio_km} km de ${z.etiqueta || z.nombre} (distancia en línea recta).`);
  });
  cont.addEventListener("change", async (e) => {
    const id = e.target.dataset.riesgo;
    if (!id) return;
    const marca = $(`rg-n-${id}`);
    const ley = $(`rg-ley-${id}`);
    if (ley) ley.hidden = !e.target.checked;
    if (!e.target.checked) { riesgos.desactivar(id); marca.textContent = ""; return; }
    marca.textContent = "cargando…";
    try { const n = await riesgos.activar(id); marca.textContent = `${n.toLocaleString("es-MX")}`; } catch (err) { e.target.checked = false; marca.textContent = "sin datos"; }
  });
  // Valle de México: Hoy No Circula (calculado aquí) + calidad del aire de la CDMX y otras ciudades (Clima Táctico).
  const hnc = A.hoyNoCircula();
  $("riesgos-vdm").innerHTML = `<div class="vdm"><h4>🚗 Hoy No Circula · Valle de México</h4>
    <div class="hnc-semana">${A.semanaHNC().map((d) => `<div class="hnc-dia${d.claro ? " claro" : ""}${d.hoy ? " hoy" : ""}" style="--c:${d.color}" title="${esc(d.engomado)}: placas ${esc(d.placas)}">
      ${d.hoy ? "HOY" : d.dia}<b>${esc(d.placas.replace(" y ", "·"))}</b>${esc(d.engomado)}</div>`).join("")}</div>
    <p class="hnc-texto">${esc(hnc.texto)} El Doble No Circula solo aplica con contingencia declarada por la <a href="https://www.gob.mx/comisionambiental" target="_blank" rel="noopener noreferrer">CAMe</a>.</p>
    <div id="rg-vdm-aire"></div></div>`;
  const [man, esp, aireWrv, aireProp, feed] = await Promise.all([riesgos.manifiesto(), riesgos.espacial(),
    R.leerArchivo("airquality.geojson").catch(() => null), getJSON("data/vivos/aire_ciudades.geojson", { bust: true }).catch(() => null),
    R.leerArchivo("security_feed.json").catch(() => null)]);
  // Calidad del aire: archivo propio (~490 ciudades) + Clima Táctico (~530 puntos, muchos turísticos de México).
  const indice = fronteras ? A.indicePaises(fronteras) : null;
  const aireFeats = R.sinCiudadesRepetidas([...(aireWrv?.features || []), ...(aireProp?.features || [])])  // mismo orden que la capa (las claves deben coincidir)
    .filter((f) => f.properties.us_aqi != null)
    .map((f) => ({ f, iso: f.properties.pais_iso3 || (indice ? A.paisEn(indice, ...f.geometry.coordinates.slice(0, 2)) : null) || "" }));
  const cdmx = aireFeats.find(({ f }) => /ciudad de m[eé]xico/i.test(f.properties.name || ""))?.f;
  if (cdmx) {
    const b = A.bandaAQI(cdmx.properties.us_aqi);
    $("rg-vdm-aire").innerHTML = b ? `<h4 style="margin-top:10px">🌫️ Calidad del aire en la CDMX (US AQI)</h4>
      <div class="aqi-principal"><span class="aqi-num" style="background:${b.color};color:${b.texto}">${esc(cdmx.properties.us_aqi)}</span>
        <span><b>${esc(b.etiqueta)}</b>${b.i >= 2 ? " · ⚠ posible contingencia: verifica en la CAMe" : ""}<br><span class="meta">PM2.5 ${esc(cdmx.properties.pm2_5 ?? "—")} µg/m³ · ozono ${esc(cdmx.properties.ozone ?? "—")} µg/m³</span></span></div>
      <div class="aqi-escala">${A.BANDAS_AQI.map(([, n, c]) => `<span style="background:${c}" title="${esc(n)}"></span>`).join("")}<i class="aqi-marca" style="left:${(b.pos * 100).toFixed(1)}%"></i></div>
      <div class="aqi-ejes"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300</span><span>+</span></div>
      <p class="meta">Es el mismo índice que la capa «Calidad del aire»: un modelo (CAMS, vía Open-Meteo), no las estaciones oficiales. El dato oficial de la CDMX es el del
        <a href="http://www.aire.cdmx.gob.mx/" target="_blank" rel="noopener noreferrer">SIMAT</a>, y las contingencias las declara la CAMe.</p>` : "";
  }
  pintarAire(aireFeats);
  if (feed?.items?.length) {
    const enlace = (it) => `<li><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(String(it.title).trim().slice(0, 140))}</a>${it.source ? ` <span class="meta">· ${esc(it.source)}</span>` : ""}</li>`;
    const grupos = A.agruparFeed(feed.items);
    $("feed-resumen").textContent = `${feed.items.length} titulares`;
    $("riesgos-feed").innerHTML = grupos.map(([g, l]) => `<details class="feed-grupo feed-${g.id}"><summary>${g.ic} ${esc(g.nombre)} <span class="contador">${l.length}</span></summary><ul class="fuentes">${l.map(enlace).join("")}</ul></details>`).join("")
      + `<p class="meta">Titulares de Clima Táctico agrupados por palabras (puede equivocarse). Abre la nota original para confirmar. En el mapa: capa «Señales de seguridad en noticias».</p>`;
  } else $("riesgos-feed").innerHTML = `<p class="meta">Sin titulares por ahora.</p>`;

  // ---- Calidad del aire por ciudad: lista con casillas (las desmarcadas no se dibujan) ----
  function pintarAire(items) {
    const cont2 = $("aire-ciudades");
    if (!items.length) { cont2.innerHTML = `<p class="meta">Sin datos de calidad del aire por ahora.</p>`; return; }
    const LS = "geo_aire_ocultas";
    let ocultas = new Set();
    try { ocultas = new Set(JSON.parse(storage.get(LS) || "[]")); } catch (e) { /* vacío */ }
    const filas = items.map(({ f, iso }) => ({ f, iso, k: A.claveDe("aire", f.properties, f.geometry), b: A.bandaAQI(f.properties.us_aqi), pais: nombrePais(iso) }))
      .sort((x, y) => y.f.properties.us_aqi - x.f.properties.us_aqi);
    const peor = filas[0];
    $("aire-resumen").textContent = `${filas.length} ciudades · peor: ${peor.f.properties.name} ${peor.f.properties.us_aqi}`;
    const conteo = A.BANDAS_AQI.map(([, n, c], i) => [n, c, filas.filter((x) => x.b.i === i).length]).filter(([, , n]) => n);
    cont2.innerHTML = `<div class="aire-barra">${conteo.map(([n, c, k]) => `<span style="flex:${k};background:${c}" title="${esc(n)}: ${k}"></span>`).join("")}</div>
      <div class="aire-cuentas">${conteo.map(([n, c, k]) => `<span><i style="background:${c}"></i>${esc(n)}: ${k}</span>`).join("")}</div>
      <label class="fila"><span><input type="checkbox" id="aire-mapa"> Ver en el mapa</span></label>
      <div class="aire-herr"><input id="aire-q" type="search" placeholder="Buscar ciudad o país…" aria-label="Buscar ciudad">
        <select id="aire-ambito" aria-label="Ámbito"><option value="">Todas</option><option value="MEX">Solo México</option><option value="otros">Resto del mundo</option></select></div>
      <div class="mini-acc"><button type="button" class="txt-btn" data-aire-acc="todas">Marcar todas</button><button type="button" class="txt-btn" data-aire-acc="ninguna">Desmarcar todas</button>
        <button type="button" class="txt-btn" data-aire-acc="mx">Solo México</button></div>
      <ul class="aire-lista">${filas.map((x) => `<li data-pais="${esc(x.iso)}" data-txt="${esc(`${x.f.properties.name} ${x.pais}`.toLowerCase())}"><label>
        <input type="checkbox" data-aire-ciudad="${esc(x.k)}" ${ocultas.has(x.k) ? "" : "checked"}>
        <span class="aqi-ciudad" style="background:${x.b.color};color:${x.b.texto}">${esc(x.f.properties.us_aqi)}</span>
        <span>${esc(x.f.properties.name)}<span class="meta"> · ${esc(x.pais)}</span></span></label>
        <button type="button" class="mini" data-aire-ir="${x.f.geometry.coordinates.slice(0, 2).join(",")}" title="Ver en el mapa">📍</button></li>`).join("")}</ul>
      <p class="meta">Índice US AQI de la EPA calculado con el modelo CAMS (vía Open-Meteo) por Clima Táctico, 2 veces al día. Las casillas deciden qué ciudades se dibujan en el mapa.</p>`;
    const aplicar = () => { storage.set(LS, JSON.stringify([...ocultas])); riesgos.setOcultos("aire", ocultas); };
    const cbCapa = cont.querySelector('[data-riesgo="aire"]');
    $("aire-mapa").checked = cbCapa?.checked || false;
    $("aire-mapa").onchange = (e) => { if (cbCapa && cbCapa.checked !== e.target.checked) { cbCapa.checked = e.target.checked; cbCapa.dispatchEvent(new Event("change", { bubbles: true })); } };
    cbCapa?.addEventListener("change", () => { $("aire-mapa").checked = cbCapa.checked; });
    const filtrarLista = () => {
      const q = A.normalizar($("aire-q").value), amb = $("aire-ambito").value;
      for (const li of cont2.querySelectorAll(".aire-lista li")) {
        li.hidden = (q && !A.normalizar(li.dataset.txt).includes(q)) || (amb === "MEX" && li.dataset.pais !== "MEX") || (amb === "otros" && li.dataset.pais === "MEX");
      }
    };
    $("aire-q").oninput = filtrarLista;
    $("aire-ambito").onchange = filtrarLista;
    cont2.onchange = (e) => {
      const k = e.target.dataset.aireCiudad;
      if (!k) return;
      e.target.checked ? ocultas.delete(k) : ocultas.add(k);
      aplicar();
    };
    cont2.onclick = (e) => {
      const ir = e.target.closest("[data-aire-ir]");
      if (ir) { const [lon, lat] = ir.dataset.aireIr.split(",").map(Number); api.map.flyTo({ center: [lon, lat], zoom: 8, duration: lite ? 0 : 800 }); if (!cbCapa?.checked) $("aire-mapa").click(); return; }
      const acc = e.target.dataset.aireAcc;
      if (!acc) return;
      ocultas = new Set(acc === "todas" ? [] : filas.filter((x) => acc === "ninguna" || x.iso !== "MEX").map((x) => x.k));
      for (const cb of cont2.querySelectorAll("[data-aire-ciudad]")) cb.checked = !ocultas.has(cb.dataset.aireCiudad);
      aplicar();
    };
    aplicar();
  }
  if (man) {
    $("riesgos-nota").textContent = `Datos horneados por Clima Táctico el ${(man.generated || "").replace("T", " ").slice(0, 16)} UTC (se actualizan 2 veces al día); sismos y alertas de EUA en vivo. Los eventos nuevos parpadean 1 min y llevan la marca NUEVO 1 h.`;
    for (const [id, k] of Object.entries(FUENTE_MANIFIESTO)) {
      const n = man.sources?.[k]?.count;
      const cb = cont.querySelector(`[data-riesgo="${id}"]`);
      if (n === 0 && cb) $(`rg-n-${id}`).textContent = "0 hoy";  // se puede activar igual; solo se avisa que hoy no hay eventos
    }
  }
  pintarEspacial(esp);
  // ---- Clima espacial: escalas G, R y S de NOAA con color y lo que puede afectar cada nivel ----
  function pintarEspacial(s) {
    if (!s?.G) { $("riesgos-espacial").innerHTML = `<p class="meta">Sin datos de clima espacial por ahora.</p>`; return; }
    const g = s.G.scale ?? 0, r = s.R?.scale ?? 0, sv = s.S?.scale ?? 0;  // niveles actuales de NOAA
    const kp = s.kp?.value != null ? Number(s.kp.value) : null;
    const tarjeta = (k, nivel, extra) => `<div class="esc-tarjeta" style="--c:${A.COLOR_ESCALA[nivel]}"><b>${k}${nivel}</b><span>${esc(A.ESCALAS_NOAA[k].nombre)}</span><span class="meta">${esc(A.ESCALAS_NOAA[k].niveles[nivel].n)}${extra ? ` · ${esc(extra)}` : ""}</span></div>`;
    const peor = Math.max(g, r, sv);
    $("espacial-resumen").textContent = `G${g} · R${r} · S${sv}${kp != null ? ` · Kp ${kp.toFixed(1)}` : ""}`;
    $("espacial-resumen").style.color = peor >= 2 ? A.COLOR_ESCALA[peor] : "";
    const efectos = [["G", g], ["R", r], ["S", sv]].filter(([, n]) => n > 0)
      .map(([k, n]) => `<div class="efectos" style="--c:${A.COLOR_ESCALA[n]}"><b>${k}${n} · ${esc(A.ESCALAS_NOAA[k].nombre)}: puede afectar</b><ul>${A.ESCALAS_NOAA[k].niveles[n].ef.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
    $("riesgos-espacial").innerHTML = `<div class="esc-fila">${tarjeta("G", g, kp != null ? `Kp ${kp.toFixed(1)}` : "")}${tarjeta("R", r, s.flare?.class ? `última llamarada ${s.flare.class} (≈R${A.rDeLlamarada(s.flare.class)}) ${(s.flare.time || "").slice(11, 16)} UTC` : "")}${tarjeta("S", sv)}</div>
      ${kp != null ? `<div class="kp-barra">${Array.from({ length: 9 }, (_, i) => `<span style="background:${A.COLOR_ESCALA[A.gDeKp(i + 1)]};opacity:${i + 1 <= Math.round(kp) ? 1 : 0.25}">${i + 1}</span>`).join("")}</div><div class="meta">Índice Kp (0–9): desde 5 hay tormenta geomagnética.</div>` : ""}
      ${efectos || `<p class="meta">Nivel tranquilo: sin efectos en tecnología.</p>`}
      ${(s.predicted || []).length ? `<div class="meta" style="margin-top:6px">Pronóstico NOAA:</div><div class="esc-pron">${s.predicted.map((d) => `<span>${esc(d.date.slice(5))}: ${["G", "R", "S"].map((k) => `<i style="background:${A.COLOR_ESCALA[d[k] || 0]}">${k}${d[k] || 0}</i>`).join("")}</span>`).join("")}</div>` : ""}
      <p class="meta">${esc(A.NO_AFECTA)} Activa «Auroras» en Amenazas para ver hasta dónde se verían. <a href="https://www.swpc.noaa.gov/noaa-scales-explanation" target="_blank" rel="noopener noreferrer">Escalas de NOAA ↗</a></p>`;
  }
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
    const ic = { aeronaves: "✈️", buques: "🚢", satelites: "🛰️" }[tipo];
    return `<details class="subgrupo-d" id="sg-mov-${tipo}" open><summary class="subgrupo"><span class="punto" style="--c:${esc(cat.subtipos[0].color)}"></span>${ic} ${esc(cat.nombre.es)}
      <span class="sg-n">${ok ? `${(p.objetos || 0).toLocaleString("es-MX")} objetos` : "sin datos"}</span></summary><div class="capa-fam ${ok ? "" : "capa-off"}">
      <label class="fila"><span><input type="checkbox" data-mov="${tipo}" data-nombre="${esc(cat.nombre.es)}" ${ok ? "" : "disabled"}> Mostrar en el mapa</span>
        <span class="chip estado-${esc(cat.subtipos[0].estado_dato)}">${tipo === "satelites" ? "Estimado" : "Retrasado"}</span></label>
      <div class="meta">${ok ? `${(p.objetos || 0).toLocaleString("es-MX")} objetos · actualizado ${esc((p.actualizado_utc || "").replace("T", " ").slice(0, 16))} UTC`
        : esc(p?.error || "Aún no hay instantánea (workflow «Datos en movimiento»)")}</div>
      ${ok ? `<details><summary>Subtipos (${subs.length})</summary>${subs.map((s) => `<label><input type="checkbox" data-mov-sub="${tipo}" value="${esc(tipo === "satelites" ? s.grupo : s.id)}" ${s.inicial === false ? "" : "checked"}><span class="swatch" style="background:${esc(s.color)}"></span>${esc(s.nombre.es)}</label>`).join("")}</details>` : ""}
    </div></details>`;
  }).join("");
  cont.addEventListener("change", async (e) => {
    const t = e.target.dataset.mov;
    if (t) {
      try {
        if (!e.target.checked) { mov.desactivar(t); return; }
        await mov.activar(t);
        // Se respetan los subtipos marcados (activar() usa los iniciales del catálogo).
        mov.setSubtipos(t, [...cont.querySelectorAll(`[data-mov-sub="${t}"]:checked`)].map((x) => x.value));
      } catch (err) { e.target.checked = false; alert(`No se pudo cargar: ${err.message}`); }
      return;
    }
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
  // Agrupado por tipo de capa (aeropuertos, puertos, embajadas…); cada grupo se pliega.
  const fila = (x) => `<li><button type="button" class="txt-btn" data-seg="${esc(x.id)}">${esc(x.n || x.id)}</button>
    <span>${x.eventos.length} eventos ${x.nuevos ? `<span class="badge-nuevo">${x.nuevos} nuevos</span>` : ""}</span></li>`;
  const grupos = new Map();
  for (const x of items) { const k = x.familia || "otros"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); }
  const nombreFam = (k) => gestor?.familias?.get(k)?.nombre || { otros: "Otros" }[k] || k;
  $("lista-seguimiento").innerHTML = items.length ? [...grupos].sort((a, b) => nombreFam(a[0]).localeCompare(nombreFam(b[0]), "es")).map(([k, l]) =>
    `<li class="seg-grupo"><details class="subgrupo-d" id="sg-seg-${esc(k)}" open><summary class="subgrupo">${esc(nombreFam(k))}
      <span class="sg-n">${l.length}${l.some((x) => x.nuevos) ? ` · <span class="badge-nuevo">${l.reduce((s, x) => s + x.nuevos, 0)} nuevos</span>` : ""}</span></summary>
      <ul class="lista-seguimiento">${l.map(fila).join("")}</ul></details></li>`).join("")
    : `<li class="meta">Todavía no sigues ningún lugar.</li>`;
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
