// Punto de entrada: carga datos, crea el mapa y conecta la interfaz.
import { getJSON, esc, fecha, storage } from "./util.js";
import { estiloBase, crearMapa } from "./map.js";
import { htmlFicha } from "./card.js";
import { iniciarRefresco } from "./refresh.js";

const MAX_LISTA = 200; // la lista lateral muestra los más recientes; el mapa muestra todos

const $ = (id) => document.getElementById(id);
const estado = { areas: new Set(), mexico: false, sevMin: 1 };
let eventos = [];
let porId = new Map();
let tax, paises, api;

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
  $("ficha-cuerpo").innerHTML = htmlFicha(ev, tax, paises);
  $("ficha").hidden = false;
  api.setSeleccion(id);
  if (volar && ev.lat != null) api.volarA(ev.lon, ev.lat);
  history.replaceState(null, "", `#evento=${encodeURIComponent(id)}`);
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
  const ids = ["geografia", "seguridad", "geoeconomia", "energia", "tecnologia", "demografia", "clima", "instituciones", "identidad", "regional", "riesgo"];
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
  const lite = modoLite();
  document.documentElement.classList.toggle("lite", lite);
  const [taxonomia, choke, runLog, base] = await Promise.all([
    getJSON("config/taxonomy.json"),
    getJSON("config/chokepoints.json"),
    getJSON("data/run-log.json", { bust: true }),
    estiloBase(tema, { lite }),
    cargarEventos(),
  ]);
  tax = prepararTaxonomia(taxonomia);
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
  $("f-mexico").onchange = (e) => { estado.mexico = e.target.checked; programarFiltros(); };
  $("f-severidad").onchange = (e) => { estado.sevMin = Number(e.target.value); programarFiltros(); };
  $("capa-chokepoints").onchange = (e) => api.setChokepoints(e.target.checked);
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

  const btnLite = $("btn-lite");
  btnLite.setAttribute("aria-pressed", String(lite));
  btnLite.onclick = () => { storage.set("gp_lite", lite ? "0" : "1"); location.reload(); };

  iniciarRefresco({
    runLog, elDatos: $("estado-datos"), elProxima: $("estado-proxima"),
    onNuevosDatos: async () => { await cargarEventos(); featureTxt.clear(); aplicarFiltros(); },
  });
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
