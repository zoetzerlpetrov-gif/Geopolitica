// Punto de entrada: carga datos, crea el mapa y conecta la interfaz.
/* global maplibregl */
import { getJSON, esc, safeUrl, fecha, storage, distanciaKm, debounce, sinAcentos, palabrasDe, resaltar, fragmento, MIN_BUSQUEDA } from "./util.js";
import { estiloBase, crearMapa } from "./map.js";
import { iniciarIdioma } from "./idioma.js";
import { htmlFicha } from "./card.js";
import { iniciarRefresco } from "./refresh.js";
import { GestorCapas, familiasDibujables, htmlFichaEntidad, etiquetaEstado, PRESUPUESTO_CAPAS } from "./capas.js";
import * as seg from "./seguimiento.js";
import { Movimiento, htmlFichaMovil, vueloDeFila, proyectar, SUB } from "./movimiento.js";
import { Imagenes, IMAGENES, ayerUTC, haceDias } from "./imagenes.js";
import { LineaTiempo } from "./linea-tiempo.js";
import * as cuaderno from "./cuaderno.js";
import { iniciarMenu } from "./menu.js";
import { registrarAnimacion, iniciarBotonAnimar } from "./animacion.js";
import * as BO from "./buscador_org.js";
import { idsNuevos, sonar, iniciarSonido, PARPADEO_EV_MS } from "./avisos.js";
import { areasDeSubtemas, clavesSub, claveOtros, pasaSub, religionesEn, RELIGIONES } from "./temas.js";
import * as M3 from "./modelos3d.js";

const MAX_LISTA = 200; // la lista lateral muestra los más recientes; el mapa muestra todos

const $ = (id) => document.getElementById(id);
const estado = { areas: new Set(), subtema: "", religion: "", mexico: false, sevMin: 1, sevSolo: 0, pais: "", orden: "sev", region: "", desde: -Infinity, hasta: Infinity, palabras: [] };
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
let iso2a3 = {};  // «MX» → «MEX» (las embajadas de OSM traen el país que representan en ISO2)
const cargarPaises = () => (gazPromesa ??= getJSON("config/gazetteer.json").then((g) => {
  iso2a3 = Object.fromEntries(Object.entries(g.iso2_a_iso3 || {}).map(([k, v]) => [k.toUpperCase(), v]));
  return (paises = g.paises);
}));
/** Nombre en español de un país dado en ISO3 o ISO2. */
const paisNombre = (c) => (!c ? "" : paises?.[c]?.es || paises?.[iso2a3[String(c).toUpperCase()]]?.es || c);
let analisisCfg = null;
let analisisPromesa = null;
const cargarAnalisisCfg = () => (analisisPromesa ??= getJSON("config/analisis.json").then((a) => (analisisCfg = a)).catch(() => null));

function prepararTaxonomia(t) {
  const areas = new Map(t.areas.map((a) => [a.id, a]));
  const subtemas = new Map();
  for (const a of t.areas) for (const s of a.subtemas) subtemas.set(s.id, s.nombre);
  return { areas, subtemas, lista: t.areas, areaDeSub: areasDeSubtemas(t.areas) };
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
// Religiones mencionadas en título y resumen (se calcula una vez por evento).
const religionCache = new Map();
function religionesDe(ev) {
  let r = religionCache.get(ev.id);
  if (r == null) { r = religionesEn(sinAcentos(`${ev.titulo || ""} ${ev.resumen || ""}`)); religionCache.set(ev.id, r); }
  return r;
}
// Con una subcategoría elegida manda ella (aunque su área esté apagada); si no, las casillas de áreas.
const entraPorTema = (ev) => (estado.subtema ? pasaSub(ev, estado.subtema, tax.areaDeSub) : estado.areas.has(ev.area_principal));

// ---------- Filtros ----------
function pasaFiltros(ev, ignorarArea = false, ignorarPais = false) {
  if (estado.palabras.length) { const t = textoDe(ev); if (!estado.palabras.every((w) => t.includes(w))) return false; }
  if (estado.religion && !religionesDe(ev).includes(estado.religion)) return false;
  if (!ignorarArea && !entraPorTema(ev)) return false;
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
  const conteoSub = {};
  for (let i = 0; i < eventos.length; i++) {
    if (i && i % BLOQUE === 0) { await ceder(); if (mia !== generacion) return; }
    const ev = eventos[i];
    if (!pasaFiltros(ev, true, true)) continue;
    const entra = entraPorTema(ev);
    if (ev.pais_iso3 && entra) porPais[ev.pais_iso3] = (porPais[ev.pais_iso3] || 0) + 1;
    if (estado.pais && ev.pais_iso3 !== estado.pais) continue;
    conteo[ev.area_principal] = (conteo[ev.area_principal] || 0) + 1;
    for (const k of clavesSub(ev, tax.areaDeSub)) conteoSub[k] = (conteoSub[k] || 0) + 1;
    if (!entra) continue;
    visibles.push(ev);
    const t = textoFeature(ev);
    if (t) partes.push(t);
  }
  publicarEnMapa(partes);
  visiblesActuales = visibles;
  analisis?.refrescar();
  for (const el of document.querySelectorAll("[data-num]")) el.textContent = conteo[el.dataset.num] || 0;
  for (const el of document.querySelectorAll("[data-subnum]")) {
    const n = conteoSub[el.dataset.subnum] || 0;
    el.textContent = n;
    el.parentElement.classList.toggle("cero", n === 0);
  }
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
// Cada área lleva sus subcategorías plegadas, con conteo. Tocar una muestra solo esos eventos
// (de cualquier área); tocarla otra vez, o «Quitar filtros», vuelve a las casillas de áreas.
const chipSub = (clave, nombre) =>
  `<button type="button" class="chip-sub${estado.subtema === clave ? " activo" : ""}" data-sub="${esc(clave)}" aria-pressed="${estado.subtema === clave}">${esc(nombre)} <span class="num" data-subnum="${esc(clave)}">0</span></button>`;
function pintarAreas() {
  const ul = $("lista-areas");
  ul.innerHTML = tax.lista.map((a) => `
    <li><label>
      <input type="checkbox" data-area="${esc(a.id)}" ${estado.areas.has(a.id) ? "checked" : ""}>
      <span class="swatch" style="background:${esc(a.color)}"></span>
      <span>${a.numero}. ${esc(a.nombre)}</span>
      <span class="num" data-num="${esc(a.id)}">0</span>
    </label>
    <details class="subs"><summary>Subcategorías (${a.subtemas.length + 1})</summary>
      <div class="chips-sub">${a.subtemas.map((s) => chipSub(s.id, s.nombre)).join("")}${chipSub(claveOtros(a.id), "Sin subcategoría")}</div>
    </details></li>`).join("");
  ul.addEventListener("change", (e) => {
    const id = e.target.dataset.area;
    if (!id) return;
    e.target.checked ? estado.areas.add(id) : estado.areas.delete(id);
    programarFiltros();
  });
  ul.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]");
    if (b) ponerSubtema(estado.subtema === b.dataset.sub ? "" : b.dataset.sub);
  });
}
function ponerSubtema(clave) {
  estado.subtema = clave;
  for (const b of document.querySelectorAll("[data-sub]")) {
    const activo = b.dataset.sub === clave;
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-pressed", activo);
  }
  programarFiltros();
}
const nombreSub = (clave) => (clave.startsWith("otros:") ? `${tax.areas.get(clave.slice(6))?.nombre || ""}: sin subcategoría` : tax.subtemas.get(clave) || clave);

// Resumen de los filtros activos (se ve aunque la sección esté cerrada).
function resumenFiltros() {
  const partes = [];
  if (estado.sevSolo) partes.push(`solo sev. ${estado.sevSolo}`); else if (estado.sevMin > 1) partes.push(`sev. ≥ ${estado.sevMin}`);
  if (estado.pais) partes.push(paises?.[estado.pais]?.es || estado.pais);
  if (estado.region) partes.push($("ev-region").selectedOptions[0]?.textContent || estado.region);
  if (estado.mexico) partes.push("impacto en México");
  if (estado.leyes) partes.push("leyes y reformas");
  if (estado.subtema) partes.push(`subcategoría «${nombreSub(estado.subtema)}»`);
  if (estado.religion) partes.push(`religión: ${RELIGIONES[estado.religion].nombre}`);
  if (estado.palabras.length) partes.push(`texto «${estado.palabras.join(" ")}»`);
  if (tax && !estado.subtema && estado.areas.size < tax.lista.length) partes.push(`${estado.areas.size} de ${tax.lista.length} áreas`);
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
    // Si la coincidencia no está en el título, se muestra dónde está (resumen, fuente o actores).
    const titulo = resaltar(ev.titulo, estado.palabras);
    const otro = estado.palabras.length && !titulo.includes("<mark>")
      ? (fragmento(ev.resumen, estado.palabras) || fragmento([typeof ev.fuente === "string" ? ev.fuente : ev.fuente?.nombre, paises?.[ev.pais_iso3]?.es,
        ...(ev.actores || []).map((x) => (typeof x === "string" ? x : x?.nombre))].filter(Boolean).join(" · "), estado.palabras)) : "";
    return `<li><button type="button" data-id="${esc(ev.id)}" title="${esc(ev.resumen)}">
      <span class="punto" style="background:${esc(a.color)}" aria-hidden="true"></span>
      <span class="sev sev-${ev.severidad}" title="Severidad ${ev.severidad}">${ev.severidad}</span>
      <span>${esNuevo(ev.id) ? `<span class="chip nuevo">NUEVO</span> ` : ""}${titulo}${otro ? `<span class="meta coincide">${otro}</span>` : ""}<span class="meta">${esc(fecha(ev.fecha_utc))} · ${esc(a.nombre)}${ev.pais_iso3 ? ` · ${esc(paises?.[ev.pais_iso3]?.es || ev.pais_iso3)}` : ""}</span></span>
    </button></li>`;
  });
  if (visibles.length > MAX_LISTA) html.push(`<li class="mas">… y ${visibles.length - MAX_LISTA} más en el mapa. Usa los filtros para acotar.</li>`);
  if (!visibles.length) html.push(`<li class="mas">${estado.palabras.length ? `Ninguna noticia contiene «${esc($("ev-q").value.trim())}» con los filtros actuales.` : "Ningún evento coincide con los filtros."}</li>`);
  ol.innerHTML = html.join("");
  estadoBusqueda(visibles.length);
}

/** Línea bajo el buscador: cuántas noticias coinciden, o cuántas letras faltan. */
function estadoBusqueda(n) {
  const q = $("ev-q").value.trim(), el = $("ev-q-estado");
  if (!q) el.textContent = "Busca desde 3 letras, mientras escribes y sin importar acentos. Con varias palabras deben aparecer todas; entre comillas, la frase exacta: \"Banco de México\".";
  else if (q.length < MIN_BUSQUEDA) el.textContent = `Escribe ${MIN_BUSQUEDA - q.length} letra${MIN_BUSQUEDA - q.length === 1 ? "" : "s"} más para buscar.`;
  else if (!estado.palabras.length) el.textContent = "Cada palabra debe tener al menos 3 letras.";
  else el.textContent = `${n.toLocaleString("es-MX")} ${n === 1 ? "noticia coincide" : "noticias coinciden"} con «${q}». También se filtran en el mapa.`;
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
  quitar3d();
  $("ficha-cuerpo").innerHTML = htmlFicha(ev, tax, paises, porId, { analisis: analisisCfg, cuaderno: cuaderno.leer(id) });
  $("ficha").hidden = false;
  api.setSeleccion(id);
  if (volar && ev.lat != null) api.volarA(ev.lon, ev.lat);
  history.replaceState(null, "", `#evento=${encodeURIComponent(id)}`);
  $("ficha-cerrar").focus();
}
// Zona resaltada de la ficha de seguridad, emergencias, red, salud, criminología o carreteras (js/zona_ficha.js).
let ZF = null;
// Vista del mapa antes de un acercamiento automático al abrir una ficha (lista de amenazas); se restaura al cerrarla.
let vistaFicha = null;
const camaraActual = () => ({ center: api.map.getCenter().toArray(), zoom: api.map.getZoom(), pitch: api.map.getPitch(), bearing: api.map.getBearing() });
const quitarZonaFicha = () => ZF?.dibujarZona(api.map, null);
function abrirFichaHtml(html) {
  quitarZonaFicha();
  quitarCeniza();  // otra ficha: los conos del volcán anterior ya no aplican (la de un volcán los vuelve a dibujar)
  if (!html.includes("nota-3d")) quitar3d(); // otra ficha sin modelo: no se deja el anterior dibujado
  focoPrevio = document.activeElement;
  fichaEvento = null;
  $("ficha-cuerpo").innerHTML = html;
  $("ficha").hidden = false;
  $("ficha-cerrar").focus();
}

// Imágenes de medios: si el servidor del medio no la entrega (bloqueo, 404), se quita el recuadro en vez de dejar un hueco.
$("ficha-cuerpo").addEventListener("error", (e) => { if (e.target.matches?.("img[data-quitar-si-falla]")) e.target.closest("figure")?.remove(); }, true);
// Imagen representativa del tipo (avión, buque, tren, satélite): las fichas dejan un hueco y aquí se completa.
new MutationObserver(() => {
  const c = $("ficha-cuerpo");
  if (c.querySelector("figure[data-img-tipo]:not([data-listo])")) import("./imagen_tipo.js").then((I) => I.rellenarImagenes(c));
  if (c.querySelector("button[data-camara-hls]:not([data-listo]), video[data-camara-native]:not([data-listo])")) import("./camaras_video.js").then((V) => V.iniciarCamarasVideo(c, $("ficha")));
  const sg = c.querySelector("figure.cam-sg[data-sg]:not([data-listo])");
  if (sg) { sg.dataset.listo = "1"; import("./capas.js").then((K) => K.rellenarCamaraSingapur(sg)); }
}).observe($("ficha-cuerpo"), { childList: true });

// Ficha de un avión con origen, destino y trayectoria (js/vuelos.js, se descarga al abrir la primera).
let trayectoria = null;
// Animación 3D (aviones y satélites a su altura) y vista desde la cabina (js/altura3d.js, se descarga al usarla).
let alt3d = null, cabina = null, vueloAbierto = null;
const BOTON_CABINA = `<p><button type="button" id="btn-cabina">🎮 Vista desde la cabina (simulación)</button></p>`;
async function iniciarCabina() {
  if (!vueloAbierto || !api?.map) return;
  const A = await import("./altura3d.js");
  cabina ??= new A.Cabina(api.map);
  const v = vueloAbierto;
  $("ficha").hidden = true;
  $("cabina-info").textContent = `✈️ ${v.indicativo || v.hex} · ${Math.round(v.alt_m || 0).toLocaleString("es-MX")} m · ${Math.round(v.vel_kmh || 0)} km/h · rumbo ${Math.round(v.rumbo || 0)}° · simulación con la última señal`;
  $("cabina-barra").hidden = false;
  const d = vueloAbierto.destino;
  cabina.iniciar(v, { onSalir: () => { $("cabina-barra").hidden = true; },
    datos: { indicativo: v.indicativo || v.hex, tipo: v.tipo_av || "", squawk: v.squawk || "",
      destino: d ? `Destino ${d.iata || d.icao || ""} ${d.ciudad || d.nombre || ""}`.trim() : "", destinoCoord: d && d.lon != null ? [d.lon, d.lat] : null } });
}
$("cabina-salir")?.addEventListener("click", () => cabina?.detener());
$("ficha-cuerpo").addEventListener("click", (e) => { if (e.target.closest("#btn-cabina")) iniciarCabina(); });
// Modelo 3D animado dibujado en el mapa, en el lugar del elemento al que se le dio clic (js/mapa3d.js y three.js se
// descargan con el primero). Uno a la vez: se quita al cerrar la ficha, al abrir otra o con «Quitar del mapa».
let modelos3d = null, nota3d = "";
const puntoDe = (geom, respaldo) => {
  if (geom?.type === "Point") return geom.coordinates.slice(0, 2);
  if (respaldo) return Array.isArray(respaldo) ? respaldo : [respaldo.lng, respaldo.lat];
  let c = geom?.coordinates;
  while (Array.isArray(c?.[0])) c = c[Math.floor(c.length / 2)];
  return c ? c.slice(0, 2) : null;
};
/** Dibuja el modelo del contexto (ver js/modelos3d.js) y devuelve la nota para la ficha ("" si no hay modelo). */
function dibujar3d(ctx, punto, geom = null) {
  const m = M3.modeloPara(ctx);
  if (!m || !punto || !api?.map) { modelos3d?.quitar(); nota3d = ""; return ""; }
  nota3d = M3.notaModelo(m);
  import("./mapa3d.js").then((D) => { modelos3d ??= new D.Modelos3D(api.map); modelos3d.mostrar(m, punto, geom); })
    .catch((err) => console.warn("modelo 3D:", err.message));
  return nota3d;
}
function quitar3d() { modelos3d?.quitar(); nota3d = ""; }
$("ficha-cuerpo").addEventListener("click", (e) => { if (e.target.closest("#quitar-3d")) { quitar3d(); e.target.closest(".nota-3d")?.remove(); } });
// Coordenadas bajo el puntero (opción del usuario; se recuerda en este navegador).
export function formatoCoords(lat, lon) {
  const g = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return `${g(lat, "N", "S")}, ${g(((lon + 540) % 360) - 180, "E", "O")}`;
}
let coordsUlt = null;
const alMoverPuntero = (e) => { coordsUlt = e.lngLat; $("coords-puntero").textContent = `📍 ${formatoCoords(e.lngLat.lat, e.lngLat.lng)}`; };
function ponerCoords(on) {
  const caja = $("coords-puntero");
  if (!api?.map || !caja) return;
  caja.hidden = !on;
  api.map[on ? "on" : "off"]("mousemove", alMoverPuntero);
  api.map[on ? "on" : "off"]("contextmenu", copiarConClicDerecho);
  if (on) caja.textContent = "📍 Mueve el puntero sobre el mapa";
  storage.set("gp_coords", on ? "1" : "0");
}
/** Clic derecho con las coordenadas encendidas: copia «latitud, longitud» (formato que acepta Google Maps). */
function textoCoords(lngLat) { return `${lngLat.lat.toFixed(6)}, ${lngLat.lng.toFixed(6)}`; }
async function copiarConClicDerecho(e) {
  e.preventDefault?.();
  const t = textoCoords(e.lngLat);
  let ok = true;
  try { await navigator.clipboard.writeText(t); } catch { ok = false; }
  const aviso = document.createElement("div");
  aviso.className = "aviso-copiado";
  aviso.textContent = ok ? `📋 Copiado: ${t}` : `Copia a mano: ${t}`;
  Object.assign(aviso.style, { left: `${e.point.x}px`, top: `${e.point.y}px` });
  api.map.getContainer().appendChild(aviso);
  setTimeout(() => aviso.remove(), 1700);
  $("coords-puntero").textContent = ok ? `✅ Copiado (pégalo en Google Maps): ${t}` : t;
}
$("chk-coords")?.addEventListener("change", (e) => ponerCoords(e.target.checked));
$("coords-puntero")?.addEventListener("click", async () => {
  if (!coordsUlt) return;
  const t = `${coordsUlt.lat.toFixed(5)}, ${coordsUlt.lng.toFixed(5)}`;
  try { await navigator.clipboard.writeText(t); $("coords-puntero").textContent = `✅ Copiado: ${t}`; } catch { $("coords-puntero").textContent = t; }
});
(function restaurarCoords(n = 0) {
  if (storage.get("gp_coords") !== "1") return;
  if (!api?.map) { if (n < 60) setTimeout(() => restaurarCoords(n + 1), 500); return; }
  $("chk-coords").checked = true;
  ponerCoords(true);
})();
// Cielo real detrás del globo (js/universo.js): encendido por defecto salvo en LITE o si el usuario lo apagó.
let universo = null;
async function ponerUniverso(si) {
  if (!api?.map) return;
  if (si && !universo) universo = new (await import("./universo.js")).Universo(api.map);
  await universo?.activar(si).catch(() => null);
}
$("chk-universo")?.addEventListener("change", (e) => { storage.set("gp_universo", e.target.checked ? "1" : "0"); ponerUniverso(e.target.checked); });
(function restaurarUniverso(n = 0) {
  if (!api?.map) { if (n < 60) setTimeout(() => restaurarUniverso(n + 1), 500); return; }
  const si = storage.get("gp_universo") ? storage.get("gp_universo") === "1" : !lite;
  $("chk-universo").checked = si;
  if (si) ponerUniverso(true);
})();
// La casilla solo aparece si hay un intermediario publicado en config/envivo.json.
getJSON("config/envivo.json").then((c) => { if (c.proxy_vuelos) $("lbl-envivo").hidden = false; }).catch(() => null);
$("chk-envivo")?.addEventListener("change", async (e) => {
  const est = $("envivo-estado");
  const cfg = await getJSON("config/envivo.json").catch(() => ({}));
  if (!cfg.proxy_vuelos || !mov) {
    e.target.checked = false;
    est.textContent = cfg.proxy_vuelos ? "" : "· falta publicar el intermediario (ver SOURCES)";
    return;
  }
  mov.setVivo(cfg.proxy_vuelos, e.target.checked, (t) => { est.textContent = t ? `· ${t}` : ""; });
});
$("chk-3d")?.addEventListener("change", async (e) => {
  if (!api?.map) { e.target.checked = false; return; }
  const A = await import("./altura3d.js");
  alt3d ??= new A.Altura3D(api.map);
  if (e.target.checked) alt3d.activar(); else alt3d.desactivar();
});
async function abrirObjetoMovil(o, catalogo) {
  entidadAbierta = null;
  if (o.tipo === "buques" && o.campos?.includes("estado_nav")) return abrirBuque(o, catalogo);
  if (o.tipo === "satelites") return abrirSatelite(o, catalogo);
  if (o.tipo !== "aeronaves" || !o.campos) { trayectoria?.limpiar(); abrirFichaHtml(htmlFichaMovil(o, catalogo)); return; }
  const V = await import("./vuelos.js");
  const v = vueloDeFila(JSON.parse(o.props.f), o.campos);
  if (o.coords) [v.lon, v.lat] = o.coords; // posición proyectada que se ve en el mapa
  vueloAbierto = v;
  const cat = catalogo.categorias.find((c) => c.id === "aeronaves");
  const comunes = { subtipoNombre: SUB(cat, v.subtipo), edadMin: o.generado ? Math.round((Date.now() - new Date(o.generado).getTime()) / 60000) : null,
    envivo: o.envivo ? Math.round((Date.now() - new Date(o.generado).getTime()) / 1000) : null };
  const boton3d = dibujar3d({ fuente: "aeronave", ...v }, [v.lon, v.lat]);
  abrirFichaHtml(V.htmlVuelo(v, null, comunes) + BOTON_CABINA + boton3d + `<p class="meta" id="vuelo-cargando">Buscando ruta y trayectoria…</p>`);
  const [extra] = await Promise.all([V.datosVuelo(v), paises ? null : cargarPaises().catch(() => (paises = {}))]);
  const porNombreEn = { ...Object.fromEntries(Object.values(paises || {}).map((p) => [p.en, p.es])), ...V.PAISES_OPENSKY };
  if ($("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(v.indicativo || v.hex)) return; // el usuario ya cerró o cambió de ficha
  v.destino = extra.destino || null; // la cabina muestra distancia y hora estimada de llegada
  $("ficha-cuerpo").innerHTML = V.htmlVuelo(v, extra, { ...comunes, paisEs: (en) => porNombreEn[en] || en }) + BOTON_CABINA + boton3d;
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
  const boton3d = dibujar3d({ fuente: "buque", subtipo: b.subtipo, nombre: b.nombre, rumbo: b.rumbo }, [b.lon, b.lat]);
  abrirFichaHtml(B.htmlBuque(b, null, comunes) + boton3d);
  trayectoria ??= new V.Trayectoria(api.map);
  if (B.SIN_TRAYECTORIA.has(b.subtipo)) { trayectoria.limpiar(); return; } // recreo: nada se dibuja
  const extra = await B.datosBuque(b);
  if ($("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(b.nombre || "MMSI " + b.mmsi)) return;
  $("ficha-cuerpo").innerHTML = B.htmlBuque(b, extra, comunes) + boton3d;
  const gj = B.geojsonBuque(b, extra, proyectar);
  trayectoria.mostrar(gj);
  encuadrar(V.limites(gj), 10);
}

async function abrirSatelite(o, catalogo) {
  const [S, V] = await Promise.all([import("./satelites.js"), import("./vuelos.js")]);
  const cat = catalogo.categorias.find((c) => c.id === "satelites");
  const norad = String(o.props.id).replace("sat:", "");
  const base = { n: o.props.n, norad, grupo: SUB(cat, o.props.st), st: o.props.st, alt: o.props.alt };
  const boton3d = dibujar3d({ fuente: "satelite", st: o.props.st, nombre: o.props.n, alt: o.props.alt }, o.coords || puntoDe(o.geom));
  abrirFichaHtml(S.htmlSatelite(base, null) + boton3d);
  const [orb, catalogoSat] = await Promise.all([mov.orbita(norad), S.fichaCatalogo(norad).catch(() => null)]);
  base.catalogo = catalogoSat;
  if (!orb || orb.error || $("ficha").hidden || !$("ficha-titulo")?.textContent.startsWith(o.props.n)) return;
  $("ficha-cuerpo").innerHTML = S.htmlSatelite(base, orb) + boton3d;
  trayectoria ??= new V.Trayectoria(api.map);
  const gj = S.geojsonOrbita(orb, [...o.coords, o.props.alt]);
  trayectoria.mostrar(gj);
  // Una órbita completa rodea el planeta: se centra en el satélite (libre de la ficha) en vez de encuadrarla toda.
  const movil = matchMedia("(max-width: 760px)").matches;
  api.map.easeTo({ center: o.coords, zoom: Math.min(api.map.getZoom(), 2.2),
    padding: movil ? { top: 40, bottom: Math.round(innerHeight * 0.6), left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 440 }, duration: lite ? 0 : 800 });
}

// Conos de ceniza de un volcán: se quitan al cerrar la ficha o al apagar la capa de volcanes.
const quitarCeniza = () => {
  if (api?.map?.getSource("ceniza")) import("./ceniza.js").then((C) => C.limpiarCeniza(api.map));
  if (api?.map?.getSource("erupcion")) import("./erupcion.js").then((E) => E.limpiarErupcion(api.map));
};
/** Escenarios de erupción en la ficha de un volcán (Riesgos o Zonas geográficas): se conectan al abrirla. */
const prepararErupcion = () => {
  const div = document.querySelector("#ficha-cuerpo .erupcion");
  if (div) import("./erupcion.js").then((E) => E.prepararErupcion(api.map, div));
};

function cerrarFicha() {
  quitarZonaFicha();
  trayectoria?.limpiar();
  const vista = vistaFicha;
  vistaFicha = null;
  quitar3d(); // si hubo modelo 3D, regresa a la vista de antes de su acercamiento…
  if (vista) api.map.easeTo({ ...vista, duration: lite ? 0 : 1000, essential: true }); // …salvo que la ficha se abriera desde la lista
  quitarCeniza();
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
  globalThis.__eventosIngesta = data.eventos; // señales de seguridad del mundo en js/riesgos.js (sin otra descarga)
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
  // Reportes diarios: enlaces a los PDF del día (si ya se generaron).
  getJSON("data/reportes/indice.json", { bust: true }).then((ix) => {
    const pdf = (t) => ix[t]?.[0]?.pdf ? `<a href="data/${esc(ix[t][0].pdf)}" download>PDF ${t === "mexico" ? "México" : "global"}</a>` : "";
    const enlaces = [pdf("mexico"), pdf("global")].filter(Boolean).join(" · ");
    if (ix.mexico?.[0]) $("reportes-ultimo").innerHTML = `Último: ${esc(ix.mexico[0].fecha)}${enlaces ? ` · ${enlaces}` : ""}`;
  }).catch(() => {});
  // La herramienta de fotos no depende de los datos: se activa ya, para que responda aunque el resto siga cargando.
  $("docs-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const D = await import("./documentos.js");
    const l = D.enlaces($("docs-q").value);
    $("docs-res").innerHTML = l.length ? l.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a></li>`).join("") : `<li class="meta">Escribe al menos 2 letras.</li>`;
  });
  import("./foto.js").then((F) => F.iniciarFoto({ mapa: () => api?.map, lite: () => lite })).catch((e) => console.error("foto", e));
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
  iniciarIdioma({ map: api.map });
  const [choke, runLog, regiones] = await Promise.all([pChoke, pRunLog, pRegiones, pEventos]);
  estado.areas = new Set(tax.lista.map((a) => a.id));
  api.setChokepointsDatos({
    type: "FeatureCollection",
    features: choke.chokepoints.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id, nombre: c.nombre, tipo: c.tipo } })),
  });

  pintarAreas();
  for (const [id, r] of Object.entries(regiones.regiones)) for (const iso of r.paises) regionDe[iso] = id;
  linea = new LineaTiempo($("linea-tiempo"), (v) => { estado.desde = v.desde; estado.hasta = v.hasta; programarFiltros(); },
    { cargarHistorial: anexarHistorial, permitir90: true });
  linea.setEventos(eventos);
  registrarAnimacion({ id: "eventos", nombre: "eventos en la línea de tiempo", disponible: () => linea.eventos?.length > 0,
    activa: () => Boolean(linea.timer), iniciar: () => linea.reproducir(), detener: () => linea.detener() });
  iniciarBotonAnimar($("btn-animar"));
  const alCargar = () => {
    aplicarFiltros();
    const m = location.hash.match(/^#evento=(.+)$/);
    if (m) abrirFicha(decodeURIComponent(m[1]), { volar: true });
    irAPaisDelEnlace();
  };
  // Enlaces «./#pais=MEX» (analítica y otras páginas): filtra los eventos de ese país y encuadra el país.
  async function irAPaisDelEnlace() {
    const iso = location.hash.match(/^#pais=([A-Za-z]{3})$/)?.[1]?.toUpperCase();
    if (!iso) return;
    estado.pais = iso;
    programarFiltros();
    try {
      const g = await getJSON("data/base/countries-110m.geojson");
      const caja = [Infinity, Infinity, -Infinity, -Infinity];
      const pts = (c) => (typeof c[0] === "number" ? [c] : c.flatMap(pts));
      for (const f of g.features.filter((x) => x.properties.iso3 === iso)) {
        for (const [x, y] of pts(f.geometry.coordinates)) { caja[0] = Math.min(caja[0], x); caja[1] = Math.min(caja[1], y); caja[2] = Math.max(caja[2], x); caja[3] = Math.max(caja[3], y); }
      }
      // Países que cruzan el antimeridiano (Rusia, Fiyi): se usa el punto central del nomenclátor.
      if (Number.isFinite(caja[0]) && caja[2] - caja[0] < 180) encuadrar([[caja[0], caja[1]], [caja[2], caja[3]]], 6);
      else { if (!paises) await cargarPaises(); const p = paises?.[iso]; if (p) api.map.flyTo({ center: [p.lon, p.lat], zoom: 3, duration: lite ? 0 : 800 }); }
    } catch (err) { /* sin geometría: solo queda el filtro */ }
    setTimeout(() => { const sel = $("ev-pais"); if (sel && [...sel.options].some((o) => o.value === iso)) sel.value = iso; }, 1500);
  }
  addEventListener("hashchange", irAPaisDelEnlace);
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
  const selRel = $("ev-religion");
  for (const [id, r] of Object.entries(RELIGIONES)) selRel.add(new Option(r.nombre, id));
  selRel.onchange = (e) => { estado.religion = e.target.value; programarFiltros(); };
  let tBusca = 0;
  // Filtra letra por letra desde 3 caracteres (una pausa de 120 ms evita recalcular en cada tecla al escribir rápido).
  $("ev-q").addEventListener("input", (e) => {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => {
      const nuevas = palabrasDe(e.target.value);
      const cambio = nuevas.join("\u0001") !== estado.palabras.join("\u0001");
      estado.palabras = nuevas;
      if (cambio) programarFiltros(); else estadoBusqueda(visiblesActuales.length);
    }, 120);
  });
  $("ev-q").addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  $("f-severidad").onchange = (e) => { estado.sevMin = Number(e.target.value); programarFiltros(); };
  $("ev-limpiar").onclick = () => {
    Object.assign(estado, { sevMin: 1, sevSolo: 0, pais: "", mexico: false, leyes: false, palabras: [], religion: "" });
    $("ev-religion").value = "";
    ponerSubtema("");
    $("ev-q").value = "";
    for (const [id, v] of [["f-severidad", "1"], ["ev-sev", "0"], ["ev-pais", ""], ["f-region", ""], ["ev-region", ""]]) $(id).value = v;
    $("f-mexico").checked = false;
    $("f-leyes").checked = false;
    estado.areas = new Set(tax.lista.map((a) => a.id));
    ponerRegion("");
    pintarAreas2();
  };
  menu = iniciarMenu($("panel"));
  iniciarSonido($("aviso-sonido"));
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

  document.addEventListener("click", (e) => {
    for (const m of [$("menu-opciones"), $("menu-secciones")]) if (m?.open && !m.contains(e.target)) m.open = false;
  });
  // Al abrir un menú se cierra el otro y, en el celular, el menú se coloca justo debajo de su botón (ver .menu-pop en app.css).
  for (const m of [$("menu-opciones"), $("menu-secciones")]) {
    m?.addEventListener("toggle", () => {
      if (!m.open) return;
      for (const otro of [$("menu-opciones"), $("menu-secciones")]) if (otro && otro !== m) otro.open = false;
      m.style.setProperty("--pop-top", `${Math.round(m.querySelector("summary").getBoundingClientRect().bottom + 8)}px`);
    });
  }
  $("btn-analisis")?.addEventListener("click", () => { $("menu-secciones").open = false; });
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
  // «Peters (tamaño real)»: vista aparte dibujada en un lienzo encima del mapa (MapLibre no tiene esa proyección).
  let peters = null;
  const vistaPeters = async (on) => {
    if (!on) { peters?.ocultar(); return; }
    if (!peters) {
      const P = await import("./peters.js");
      peters = new P.VistaPeters($("map"), async () => {
        const [paises, etiquetas] = await Promise.all([getJSON("data/base/countries-110m.geojson"), getJSON("data/base/etiquetas-paises.geojson").catch(() => ({ features: [] }))]);
        const nombres = Object.fromEntries(etiquetas.features.map((f) => [f.properties.iso3, f.properties.n]));
        const puntos = visiblesActuales.filter((e) => e.lat != null && e.lon != null).map((e) => [e.lon, e.lat, ({ 5: "#6A1B9A", 4: "#C62828", 3: "#E2711D", 2: "#F2B134", 1: "#2E7D32" })[e.severidad] || "#C8102E"]);
        return { paises, nombres, puntos };
      });
    }
    await peters.mostrar();
  };
  $("sel-proyeccion").onchange = async () => {
    const tipo = $("sel-proyeccion").value;
    storage.set("gp_proyeccion", tipo);
    await vistaPeters(tipo === "peters");
    if (tipo === "peters") return;
    api.setProyeccion(tipo);
    // «Plano 2D» es plano de verdad: sin inclinación ni giro, y sin las columnas 3D (que necesitan inclinar).
    if (tipo === "mercator") {
      if (alt3d?.activo) { alt3d.desactivar(); $("chk-3d").checked = false; }
      api.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  };
  if ($("sel-base").value !== "tematico") cambiarBase();
  if ($("sel-proyeccion").value === "peters") vistaPeters(true);
  else if ($("sel-proyeccion").value !== "mercator") api.setProyeccion($("sel-proyeccion").value);

  // Capas de entidades: el catálogo se pide cuando el mapa ya está quieto (no compite con la carga inicial).
  // Se arma cuando el mapa queda quieto o, a más tardar, a los 5 s: si un servicio del mapa base no responde (p. ej. las
  // calles de OpenFreeMap en la vista satelital), el mapa nunca queda «quieto» y el menú no debe quedarse sin construir.
  let capasIniciadas = false;
  const arrancarCapas = () => {
    if (capasIniciadas) return;
    capasIniciadas = true;
    iniciarCapas().catch((e) => { $("capas-entidades").textContent = `No se pudo cargar el catálogo: ${e.message}`; });
  };
  api.map.once("idle", arrancarCapas);
  setTimeout(arrancarCapas, 5000);
  api.map.on("style.load", () => { trayectoria?.reinstalar(); capaIndice?.reinstalar(); img?.reinstalar(); timelapse?.reinstalar(); gestor?.reinstalar(); mov?.reinstalar(); riesgos?.reinstalar(); clima?.reinstalar(); avisarPresupuesto(); });
  iniciarImagenes();
  iniciarClima();
  iniciarRiesgos();
  iniciarHistoria();
  $("verif-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const V = await import("./verificador.js");
    $("verif-res").innerHTML = V.htmlResultado(V.analizarMensaje($("verif-texto").value));
  });
  iniciarInvestigacion();
  iniciarChatIA();
  $("pwd-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const X = await import("./exposicion.js"), campo = $("pwd-texto"), res = $("pwd-res");
    if (!campo.value) return;
    res.textContent = "Revisando…";
    try { res.innerHTML = X.htmlResultado(await X.revisar(campo.value)); } catch (err) { res.textContent = `No se pudo consultar Have I Been Pwned (${err.message}). Intenta más tarde.`; }
    campo.value = "";  // la contraseña no se queda en la página
  });
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
    // ×: deja de seguir el lugar (también los que se agregaron desde Inteligencia corporativa).
    const q = e.target.closest("button[data-seg-quitar]");
    if (q) {
      const x = seg.leer().find((y) => y.id === q.dataset.segQuitar);
      if (x) seg.alternar(x);
      if (entidadAbierta?.props?.id === q.dataset.segQuitar && $("btn-seguir")) { $("btn-seguir").setAttribute("aria-pressed", "false"); $("btn-seguir").textContent = "☆ Seguir"; }
      pintarSeguimiento();
      return;
    }
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
    onNuevosDatos: async () => {
      const antes = new Set(porId.keys());
      await cargarEventos(); featureTxt.clear(); porId = new Map(eventos.map((e) => [e.id, e])); linea.setEventos(eventos); await aplicarFiltros(); pintarSeguimiento();
      avisarNuevos(idsNuevos(antes, eventos));
    },
  });
}

// ---------- Eventos nuevos: parpadeo de 60 s, marca NUEVO 1 h y sonido opcional ----------
const NUEVO_LISTA_MS = 3600000;
const nuevosEv = new Map();   // id → hora en que llegó en esta sesión
function avisarNuevos(ids) {
  if (!ids.length) return;
  const ahora = Date.now();
  for (const id of ids) nuevosEv.set(id, ahora);
  // Solo parpadea y suena lo que pasa los filtros actuales (lo que el usuario está mirando).
  const vis = new Set(visiblesActuales.map((e) => e.id));
  const evs = ids.map((id) => porId.get(id)).filter((e) => e && vis.has(e.id) && e.lat != null && e.lon != null);
  pintarLista(visiblesActuales);
  if (!evs.length) return;
  pulsar(evs.map((e) => [e.lon, e.lat]));
  sonar({ severo: evs.some((e) => e.severidad >= 4) });
}
let pulsoEv = null;
function pulsar(coords) {
  const m = api.map, src = "ev-nuevos", capa = "ev-nuevos-pulso";
  const fc = { type: "FeatureCollection", features: coords.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} })) };
  if (m.getSource(src)) m.getSource(src).setData(fc);
  else {
    m.addSource(src, { type: "geojson", data: fc });
    m.addLayer({ id: capa, type: "circle", source: src,
      paint: { "circle-color": "#ffe600", "circle-opacity": 0.25, "circle-radius": 10, "circle-stroke-color": "#ffe600", "circle-stroke-width": 3, "circle-stroke-opacity": 0.95 } });
  }
  cancelAnimationFrame(pulsoEv);
  const t0 = performance.now();
  const paso = (t) => {
    if (!m.getLayer(capa)) return;  // cambió el estilo del mapa
    if (t - t0 > PARPADEO_EV_MS) { m.getSource(src).setData({ type: "FeatureCollection", features: [] }); return; }
    const fase = ((t - t0) % 1000) / 1000;   // un latido por segundo
    m.setPaintProperty(capa, "circle-radius", 8 + fase * 24);
    m.setPaintProperty(capa, "circle-stroke-opacity", 0.95 * (1 - fase));
    m.setPaintProperty(capa, "circle-opacity", 0.3 * (1 - fase));
    pulsoEv = requestAnimationFrame(paso);
  };
  pulsoEv = requestAnimationFrame(paso);
}
const esNuevo = (id) => { const t = nuevosEv.get(id); return t != null && Date.now() - t < NUEVO_LISTA_MS; };

/** Anillo temporal sobre un punto buscado (6 s), para ubicarlo de un vistazo. */
function marcarPunto(m, lngLat) {
  const src = "org-marca", datos = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: lngLat }, properties: {} }] };
  if (m.getSource(src)) m.getSource(src).setData(datos);
  else {
    m.addSource(src, { type: "geojson", data: datos });
    m.addLayer({ id: src, type: "circle", source: src, paint: { "circle-radius": 18, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#E2711D", "circle-stroke-width": 3 } });
  }
  clearTimeout(marcarPunto.t);
  marcarPunto.t = setTimeout(() => m.getSource(src)?.setData({ type: "FeatureCollection", features: [] }), 6000);
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
      abrirFichaHtml(htmlFichaEntidad({ ...ent, cercanos, personas, seguido: seg.sigue(ent.props.id) })
        + dibujar3d({ fuente: "entidad", st: ent.props.st, familia: ent.familia.id, nombre: ent.props.n || ent.props.nombre }, puntoDe(ent.geom, ent.lngLat), ent.geom));
      prepararErupcion();
    },
  });
  gestor.registrar(familias);
  const cont = $("capas-entidades");
  // Las casillas de las familias viven en «Infraestructura…», salvo Cámaras públicas, que se mueve a «Imágenes satelitales
  // y cámaras»: por eso los eventos y búsquedas usan la sección completa (raiz) y no solo este contenedor.
  const raiz = $("g-capas") || cont;
  // Subtítulo por categoría del catálogo (Infraestructura, Conflictos, Religiones…), en el orden del catálogo.
  const ordenCat = catalogo.categorias.map((c) => c.id);
  const nombreCat = Object.fromEntries(catalogo.categorias.map((c) => [c.id, c.nombre.es]));
  familias.sort((a, b) => ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria));
  // Subsección plegable por categoría del catálogo (Organizaciones, Infraestructura, Recursos…).
  // «Zonas geográficas» tiene 35 subtipos: los agregados después (relieve fino, placas, volcanes) empiezan apagados
  // y se encienden uno por uno en «Subtipos».
  const ZONAS_APAGADAS = new Set(["mesetas", "llanuras", "valles", "canones", "cuencas", "deltas_humedales", "tundras", "glaciares", "istmos", "costas",
    "piedemonte", "islas", "montes_picos", "pasos_montana", "cabos", "cascadas", "placas_tectonicas", "limite_subduccion", "limite_convergente",
    "limite_divergente", "limite_transformante", "cinturon_fuego", "volcanes_cinturon", "volcanes", "volcanes_inactivos", "plataformas_hielo", "fiordos", "geiseres"]);
  // Volcanes vigilados (capa en vivo de Amenazas) también desde los subtipos de Zonas geográficas: la casilla es un
  // espejo de [data-riesgo="volcanes"] (mismos datos, misma ficha con alerta oficial y viento para la ceniza).
  const ESPEJO_VOLCANES = `<label class="espejo-riesgo"><input type="checkbox" data-espejo-riesgo="volcanes"><span class="swatch" style="background:#D23B3B"></span>Volcanes vigilados en vivo (alerta oficial y ceniza) <span class="meta">también en Riesgos → Amenazas</span></label>`;
  // Bienes raíces: cada subtipo es un tipo de inmueble con su propio color por cambio de precio; se ve uno a la vez.
  const UNO_A_LA_VEZ = { inmuebles_pais: "inm_vivienda", inmuebles_mx: "mx_casa" };
  const RAMPA_PRECIOS = [["#2166AC", "baja más de 5 %"], ["#67A9CF", "baja 1–5 %"], ["#D9D9D9", "estable (±1 %)"], ["#EF8A62", "sube 1–5 %"], ["#B2182B", "sube más de 5 %"]];
  // Cuántos objetos tiene cada subtipo y desde qué zoom aparecen de verdad (manifiesto de la última construcción).
  const infoSubtipo = (f, st) => {
    const n = f.manifest?.por_subtipo?.[st.id], z = f.manifest?.zoom_por_subtipo?.[st.id] ?? st.zoom_min;
    if (f.manifest?.por_subtipo && !n) return "sin datos en la última construcción";
    return `${n != null ? `${n.toLocaleString("es-MX")} · ` : ""}desde zoom ${z}`;
  };
  const marcadoInicial = (f, st) => (f.id in UNO_A_LA_VEZ ? st.id === UNO_A_LA_VEZ[f.id] : !(f.id === "zonas" && ZONAS_APAGADAS.has(st.id)));
  const htmlFam = (f) => `
    <div class="capa-fam ${f.disponible ? "" : "capa-off"}">
      <label class="fila"><span><input type="checkbox" data-fam="${esc(f.id)}" ${f.disponible ? "" : "disabled"}> ${esc(f.nombre)}</span>
        <span class="chip estado-${esc(f.estado_dato)}" title="Estado del dato">${esc(etiquetaEstado(f.estado_dato))}</span></label>
      <div class="meta">${f.disponible ? `${f.manifest.estado === "parcial" ? "⚠️ Cobertura parcial: algunas zonas del mundo no respondieron en la última actualización. " : ""}${f.manifest.estado === "desactualizada" ? `⚠️ Versión anterior (del ${esc((f.manifest.actualizado_utc || "").slice(0, 10))}): la última actualización falló. ` : ""}${f.manifest.objetos.toLocaleString("es-MX")} objetos · ${(f.manifest.bytes / 1e6).toFixed(1)} MB en mosaicos (solo se baja lo visible) · ${esc(f.licencia)}`
        : esc(f.habilitada ? (f.manifest?.estado === "error" ? "Error al construir: " + f.manifest.error : f.manifest?.estado === "pendiente" ? f.manifest.error : "Aún no se construye (workflow «Construir capas»)") : f.motivo || "Deshabilitada")}</div>
      ${f.disponible && f.id in UNO_A_LA_VEZ ? `<div class="rampa-precios" aria-label="Cambio de precio en 12 meses">${RAMPA_PRECIOS.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")}</div>` : ""}
      ${f.disponible && f.subtipos.length > 1 ? `<details${f.id in UNO_A_LA_VEZ ? " open" : ""}><summary>${f.id in UNO_A_LA_VEZ ? "Tipo de inmueble (uno a la vez)" : `Subtipos (${f.subtipos.length})`}</summary>${f.subtipos.map((st) => `
        <label><input type="checkbox" data-fam-sub="${esc(f.id)}" value="${esc(st.id)}" ${marcadoInicial(f, st) ? "checked" : ""}>${f.id in UNO_A_LA_VEZ ? "" : `<span class="swatch" style="background:${esc(st.color)}"></span>`}${esc(st.nombre.es)} <span class="meta">${infoSubtipo(f, st)}</span></label>${f.id === "zonas" && st.id === "volcanes" ? ESPEJO_VOLCANES : ""}`).join("")}</details>` : ""}
    </div>`;
  // Categorías que comparten sección del menú (mismo tema, datos y capas separados).
  const SECCION = { conflicto: "grupos_armados", grupos_criminales: "grupos_armados", religiones: "religion", lugares_religiosos: "religion" };
  const NOMBRE_SECCION = { grupos_armados: "Grupos armados, criminales y terroristas: dominio, disputa y presencia", religion: "Religión" };
  const secs = [...new Set(familias.map((f) => SECCION[f.categoria] || f.categoria))];
  cont.innerHTML = secs.map((c) => {
    const fs = familias.filter((f) => (SECCION[f.categoria] || f.categoria) === c);
    return `<details class="subgrupo-d" id="sg-capas-${esc(c)}"><summary class="subgrupo"><span class="punto" style="--c:${esc(fs[0].subtipos[0]?.color || "#888")}"></span>${esc(NOMBRE_SECCION[c] || nombreCat[c] || c)}
      <span class="sg-n" data-sg-cat="${esc(c)}">${((n) => `${n} ${n === 1 ? "capa" : "capas"}`)(fs.filter((f) => f.disponible).length)}</span></summary>${fs.map(htmlFam).join("")}</details>`;
  }).join("");
  // Cámaras públicas: una sola opción, dentro de «Imágenes satelitales y cámaras» (con sus subtipos y fuentes).
  const famCam = cont.querySelector('[data-fam="camaras"]')?.closest(".capa-fam");
  if (famCam && $("cam-capas")) $("cam-capas").append(famCam);
  // Su subsección de origen («Cámaras públicas» en Infraestructura, conflictos y sociedad) queda vacía: se quita el título.
  for (const sg of cont.querySelectorAll(".subgrupo-d")) if (!sg.querySelector(".capa-fam")) sg.remove();
  for (const n of cont.querySelectorAll("[data-sg-cat]")) {
    const sec = n.closest("details");
    const k = sec?.querySelectorAll(".capa-fam:not(.capa-off)").length ?? 0;
    n.textContent = `${k} ${k === 1 ? "capa" : "capas"}`;
  }
  // Buscador de Organizaciones: empresas, organismos y embajadas/consulados por nombre → vuela al punto y abre la ficha.
  const sgOrg = $("sg-capas-organizaciones");
  if (sgOrg) {
    const caja = document.createElement("div");
    caja.className = "buscador-org";
    caja.innerHTML = `<label class="fila"><span>🔎 Buscar empresa, organismo, embajada o consulado</span></label>
      <input type="search" id="org-q" placeholder="Ej.: Pemex, OTAN, «embajada de Japón», consulado México" autocomplete="off" aria-describedby="org-estado">
      <p class="meta" id="org-estado" aria-live="polite">Desde 3 letras, sin importar acentos. Puedes buscar por país: «embajada Francia».</p>
      <ul id="org-res" class="fuentes org-res"></ul>`;
    sgOrg.querySelector("summary").after(caja);
    const famOrg = familias.filter((f) => f.categoria === "organizaciones");
    let indice = null, resultados = [];
    const pintarOrg = async () => {
      const q = $("org-q").value;
      if (palabrasDe(q).length === 0) { $("org-res").innerHTML = ""; $("org-estado").textContent = "Desde 3 letras, sin importar acentos. Puedes buscar por país: «embajada Francia»."; return; }
      if (!indice) {
        $("org-estado").textContent = "Cargando el índice de organizaciones…";
        [indice] = await Promise.all([BO.cargarIndices(famOrg), paises ? null : cargarPaises().catch(() => (paises = {}))]);
      }
      resultados = BO.filtrar(indice, q, paisNombre);
      const ps = palabrasDe(q);
      $("org-estado").textContent = indice.length ? `${resultados.length === BO.MAX_RESULTADOS ? `Primeros ${BO.MAX_RESULTADOS}` : resultados.length} resultado(s) en ${indice.length.toLocaleString("es-MX")} registros.`
        : "Aún no hay índice: se genera en la próxima construcción de capas.";
      $("org-res").innerHTML = resultados.map((r, i) => {
        const fam = famOrg.find((f) => f.id === r.familia);
        const sub = fam?.subtipos.find((s) => s.id === r.st);
        const det = BO.detalle(r, paisNombre);
        return `<li><button type="button" class="link-btn" data-org="${i}"><span>${resaltar(r.n, ps)}</span></button>
          <span class="meta">${esc(sub?.nombre.es || fam?.nombre || "")}${det && det !== r.n ? ` · ${resaltar(det, ps)}` : ""}${r.p ? ` · ${esc(paisNombre(r.p))}` : ""}</span></li>`;
      }).join("") + `<li class="org-registros"><span class="meta">Buscar «${esc(q)}» en registros públicos de empresas (cotizan o no):</span>
        ${BO.registrosPublicos(q).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`).join(" · ")}</li>`;
    };
    $("org-q").addEventListener("input", debounce(pintarOrg, 250));
    $("org-res").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-org]");
      if (!b) return;
      const r = resultados[Number(b.dataset.org)];
      const fam = familias.find((f) => f.id === r.familia);
      // Enciende la capa (y el subtipo del resultado, si lo habías desmarcado) para que el punto se vea.
      const cb = raiz.querySelector(`[data-fam="${r.familia}"]`);
      if (cb && !cb.checked) { cb.checked = true; await gestor.activar(r.familia); }
      const subs = [...raiz.querySelectorAll(`[data-fam-sub="${r.familia}"]`)];
      const subRes = subs.find((x) => x.value === r.st);
      if (subRes && !subRes.checked) { subRes.checked = true; gestor.setSubtipos(r.familia, subs.filter((x) => x.checked).map((x) => x.value)); }
      api.map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(api.map.getZoom(), 14), duration: lite ? 0 : 1200 });
      marcarPunto(api.map, [r.lon, r.lat]);
      await gestor.onEntidad({ familia: fam, props: { id: r.id, n: r.n, st: r.st, p: r.p, x: r.x }, lngLat: { lng: r.lon, lat: r.lat } });
    });
  }
  // Enciende o apaga una capa de Amenazas desde su casilla espejo (y al revés: la casilla original actualiza el espejo).
  function espejoRiesgo(id, encender) {
    const original = document.querySelector(`[data-riesgo="${id}"]`);
    if (original && original.checked !== encender) { original.checked = encender; original.dispatchEvent(new Event("change", { bubbles: true })); }
    for (const x of document.querySelectorAll(`[data-espejo-riesgo="${id}"]`)) x.checked = encender;
  }
  document.addEventListener("change", (e) => {
    const id = e.target.dataset?.riesgo;
    if (id) for (const x of document.querySelectorAll(`[data-espejo-riesgo="${id}"]`)) x.checked = e.target.checked;
  });
  raiz.addEventListener("change", async (e) => {
    if (e.target.dataset.espejoRiesgo) { espejoRiesgo(e.target.dataset.espejoRiesgo, e.target.checked); return; }
    const fam = e.target.dataset.fam;
    if (fam) {
      if (!e.target.checked) { gestor.desactivar(fam); return; }
      await gestor.activar(fam);
      // Al encender (o volver a encender) la familia se respetan los subtipos que dejaste marcados.
      const subs = [...raiz.querySelectorAll(`[data-fam-sub="${fam}"]`)];
      if (subs.length && subs.some((x) => !x.checked)) gestor.setSubtipos(fam, subs.filter((x) => x.checked).map((x) => x.value));
      return;
    }
    const famSub = e.target.dataset.famSub;
    if (famSub in UNO_A_LA_VEZ && e.target.checked) for (const x of raiz.querySelectorAll(`[data-fam-sub="${famSub}"]`)) x.checked = x === e.target;
    if (famSub) gestor.setSubtipos(famSub, [...raiz.querySelectorAll(`[data-fam-sub="${famSub}"]:checked`)].map((x) => x.value));
    // Un subtipo que solo aparece de cerca parece «no hacer nada» con el mapa lejos: se avisa desde qué zoom se ve.
    if (famSub && e.target.checked && raiz.querySelector(`[data-fam="${famSub}"]`)?.checked) {
      const fam = familias.find((x) => x.id === famSub), st = fam?.subtipos.find((x) => x.id === e.target.value);
      const z = fam?.manifest?.zoom_por_subtipo?.[st?.id] ?? st?.zoom_min ?? 0;
      if (st && api.map.getZoom() < z) avisoMapa(`«${st.nombre.es}» aparece desde zoom ${z}: acércate al mapa (ahora estás en zoom ${api.map.getZoom().toFixed(1)}).`);
      else if (st && fam.manifest?.por_subtipo && !fam.manifest.por_subtipo[st.id]) avisoMapa(`«${st.nombre.es}» no tiene datos en la última construcción de la capa.`);
    }
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
  // En LITE también: nada se descarga hasta que marcas una imagen.
  img = new Imagenes(api.map);
  let fecha = ayerUTC();
  const dias = [1, 2, 3, 5, 7].map((d) => haceDias(d));
  // Cada opción muestra solo su nombre; la escala de colores o la explicación aparece al marcarla (CSS .opcion-capa).
  cont.innerHTML = Object.entries(IMAGENES).map(([id, d]) => `<div class="opcion-capa"><label class="fila"><span><input type="checkbox" data-img="${id}"> ${esc(d.nombre)}</span></label>${d.escala ? `<div class="detalle-capa">${htmlEscalaImagen(d)}</div>` : d.leyenda ? `<p class="meta detalle-capa">${esc(d.leyenda)}</p>` : ""}</div>`).join("")
    + `<div class="opcion-capa"><label class="fila"><span><input type="checkbox" data-tl> 🕰️ Cambio en el tiempo: la misma zona año por año (2018–2025)</span></label>
      <p class="meta detalle-capa">Mosaicos sin nubes de Sentinel-2 (10 m por píxel), uno por año. Acércate a una ciudad, mina, presa, costa o bosque (zoom 10 a 14) y usa ▶ o el deslizador de la barra sobre el mapa. Cada píxel mide 10 × 10 m: se ven obras, manchas urbanas y deforestación, no autos ni personas. Fuente: EOX (s2maps.eu), uso no comercial.</p></div>`
    + `<div class="opcion-capa"><label class="fila"><span><input type="checkbox" data-eei> 🛰️ Cámara de la Estación Espacial apuntando a la Tierra (NASA, en vivo)</span></label>
      <p class="meta detalle-capa">Video en vivo del canal oficial de la NASA y un punto amarillo con la posición de la estación cada 10 s. Del lado nocturno o sin enlace la imagen sale negra.</p></div>`
    + `<div class="detalle-imagenes"><label class="fila"><span>Día (UTC)</span><select id="img-fecha">${dias.map((d, i) => `<option value="${d}">${d}${i === 0 ? " (ayer)" : ""}</option>`).join("")}</select></label>`
    + `<p class="nota-capas" id="img-noche-nota"></p><p class="nota-capas">NASA GIBS. VIIRS cubre todo el planeta cada día sin huecos; MODIS deja cuñas negras entre órbitas cerca del Ecuador (es lo que el satélite no vio). Se descarga solo al activarla.</p></div>`;
  const notaNoche = (r, error) => {
    $("img-noche-nota").textContent = r === undefined ? "" : r ? `Luces nocturnas: ${r.etiqueta} (${r.fecha}). Zonas de día salen oscuras: el sensor solo ve luz artificial de noche.` : `Luces nocturnas: ${error || "sin imagen"}`;
  };
  cont.addEventListener("change", async (e) => {
    if (e.target.matches("[data-tl]")) { alternarTimelapse(e.target); return; }
    if (e.target.matches("[data-eei]")) { alternarEEI(e.target); return; }
    if (e.target.id === "img-fecha") { fecha = e.target.value; const r = await img.setFecha(fecha); if ("viirs_noche" in r) notaNoche(r.viirs_noche); return; }
    const id = e.target.dataset.img;
    if (!id) return;
    if (!e.target.checked) { img.desactivar(id); if (id === "viirs_noche") notaNoche(undefined); avisarPresupuesto(); return; }
    if (id === "viirs_noche") $("img-noche-nota").textContent = "Buscando la imagen disponible más reciente…";
    try { const r = await img.activar(id, fecha); if (id === "viirs_noche") notaNoche(r); } catch (err) { e.target.checked = false; if (id === "viirs_noche") notaNoche(null, err.message); }
    avisarPresupuesto();
  });
}

// ---------- Chat sobre las noticias con Groq (llave de cada persona, guardada solo en su navegador) ----------
async function iniciarChatIA() {
  const form = $("ia-form");
  if (!form) return;
  const C = await import("./chat_ia.js");
  const res = $("ia-res"), boton = form.querySelector("button"), cancelar = $("ia-cancelar"), ok = $("ia-llave-ok"), formLlave = $("ia-llave-form");
  const pintarLlave = () => {
    const g = C.leerLlave();
    formLlave.hidden = !!g; ok.hidden = !g; boton.disabled = !g;
    $("ia-como").open = !g;
    if (g) ok.innerHTML = `✅ Llave guardada ${g.recordada ? "en este navegador" : "hasta que cierres la pestaña"} (…${esc(g.llave.slice(-4))}). <button type="button" id="ia-llave-borrar">Quitar llave</button>`;
    $("ia-llave-borrar")?.addEventListener("click", () => { C.borrarLlave(); res.innerHTML = ""; pintarLlave(); });
  };
  formLlave.addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("ia-llave").value.trim();
    if (!C.llaveValida(k)) { res.innerHTML = `<p class="meta">⚠️ Eso no parece una llave de Groq: debe empezar con «gsk_» y no llevar espacios.</p>`; return; }
    C.guardarLlave(k, $("ia-recordar").checked);
    $("ia-llave").value = ""; res.innerHTML = "";
    pintarLlave();
  });
  pintarLlave();
  let ctrl = null;
  cancelar.addEventListener("click", () => ctrl?.abort(new DOMException("cancelada", "AbortError")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("ia-texto").value.trim(), g = C.leerLlave();
    if (q.length < 4 || ctrl || !g) return;
    ctrl = new AbortController();
    boton.disabled = true; cancelar.hidden = false;
    res.innerHTML = `<p class="meta">Consultando a Groq…</p>`;
    try {
      const reales = eventos.filter((x) => !x.es_ejemplo);  // los de ejemplo solo si no hay otros
      const r = await C.preguntar(q, reales.length ? reales : eventos, g.llave, { signal: ctrl.signal,
        onTexto: (t) => { res.innerHTML = `<div class="ia-resp">${esc(t).replace(/\n/g, "<br>")}</div>`; } });
      res.innerHTML = C.htmlRespuesta(r.texto, r.noticias, r.modelo);
    } catch (err) {
      res.innerHTML = `<p class="meta">⚠️ ${esc(C.mensajeError(err))}</p>`;
    } finally {
      ctrl = null; cancelar.hidden = true; boton.disabled = !C.leerLlave();
    }
  });
}

// ---------- Zonas de conflicto: noticias del monitor y videos en la ficha
let videosConf = null;
async function llenarConflicto(div, conf) {
  const C = await import("./conflictos.js");
  videosConf ??= getJSON("data/vivos/conflictos_videos.json", { bust: true }).catch(() => null);
  const v = await videosConf;
  if (!div.isConnected) return;
  div.innerHTML = `<h4>Noticias recientes</h4>${C.htmlNoticias(C.noticiasDe(conf, eventos))}<h4>Videos</h4>${C.htmlVideos(v?.videos?.[conf.id], conf.videos || conf.nombre)}`;
  div.addEventListener("click", (e) => { const b = e.target.closest(".conf-video"); if (b) C.reproducir(b); });
}

// ---------- Investigación: SAT 69-B, fichas oficiales, cadena de custodia y cuaderno de vínculos ----------
async function iniciarInvestigacion() {
  if (!$("g-investigacion")) return;
  const I = await import("./investigacion.js");
  const lista = (pares) => pares.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("");
  $("inv-listas").innerHTML = lista(I.LISTAS_OFICIALES);
  $("inv-fuentes").innerHTML = lista(I.FUENTES_INVESTIGACION);
  const cache = {};
  const cargar = async (k, url) => (cache[k] ??= getJSON(url, { bust: true }).catch(() => null));
  // Lote E: leyes por mes, contratos, poder político y guías.
  $("inv-focos").innerHTML = I.FOCOS_CONTRATOS.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join("");
  $("inv-poder").innerHTML = lista(I.FUENTES_PODER);
  $("inv-guias").innerHTML = I.GUIAS.map(I.htmlGuia).join("");
  $("b-inv-leyes").addEventListener("toggle", async () => {
    if (!$("b-inv-leyes").open || $("inv-dof-mes").options.length) return;
    const [r, l] = await Promise.all([cargar("dof", "data/vivos/dof_resumen.json"), cargar("leyes", "data/vivos/leyes_federales.json")]);
    const meses = I.mesesDof(r);
    $("inv-dof-mes").innerHTML = meses.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    const pintarMes = () => { $("inv-dof-res").innerHTML = r ? I.htmlMesDof(r, $("inv-dof-mes").value) : `<p class="meta">El historial del DOF aún no está disponible.</p>`; };
    $("inv-dof-mes").onchange = pintarMes;
    pintarMes();
    const pintarLeyes = () => { $("inv-leyes-res").innerHTML = l ? I.htmlLeyes(l, I.buscarLeyes(l, $("inv-leyes-q").value)) : `<p class="meta">El índice de leyes aún no está disponible (se actualiza cada semana).</p>`; };
    $("inv-leyes-form").onsubmit = (e) => { e.preventDefault(); pintarLeyes(); };
    pintarLeyes();
  });
  $("inv-prov-btn").addEventListener("click", async () => {
    const d = await cargar("efos", "data/vivos/efos_69b.json");
    $("inv-prov-res").innerHTML = d ? I.htmlProveedores(I.verificarProveedores(d, $("inv-prov-texto").value), d) : `<p class="meta">El listado 69-B aún no está disponible.</p>`;
  });
  // Licitaciones: avisos abiertos (data/licitaciones.json), portales oficiales y contratos adjudicados en EUA.
  const pintarPortales = () => import("./licitaciones-logica.js").then((LZ) => {
    $("lic-portales").innerHTML = LZ.enlacesBusqueda($("lic-q").value || "").map(([n, u, nota]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>${nota ? ` <span class="meta">— ${esc(nota)}</span>` : ""}</li>`).join("");
  });
  $("b-inv-licitaciones").addEventListener("toggle", pintarPortales, { once: true });
  $("lic-q").addEventListener("input", debounce(pintarPortales, 300));
  $("lic-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const LZ = await import("./licitaciones-logica.js");
    pintarPortales();
    const d = await cargar("licitaciones", "data/licitaciones.json");
    if (!d) { $("lic-res").innerHTML = `<p class="meta">Los avisos aún no están disponibles (se generan con la siguiente ingesta). Usa los portales oficiales de abajo.</p>`; return; }
    const res = LZ.filtrarAvisos(d.avisos, { q: $("lic-q").value, fuente: $("lic-fuente").value, soloAbiertas: $("lic-abiertas").checked });
    const fuentes = Object.entries(d.fuentes || {}).map(([k, v]) => `${k}: ${v.estado === "ok" ? v.avisos : "sin respuesta"}`).join(" · ");
    $("lic-res").innerHTML = `<p class="meta">${res.length} de ${d.avisos.length} avisos · actualizado ${esc(fecha(d.generado_utc))} · ${esc(fuentes)}</p>`
      + (res.length ? `<ul class="fuentes">${res.map((a) => { const dc = LZ.diasParaCierre(a.cierre);
        return `<li><a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.titulo || a.id)}</a><br><span class="meta">${esc(a.fuente)} · ${esc(a.comprador || "")}${a.pais ? ` · ${esc(paises?.[a.pais]?.es || a.pais)}` : ""} · publicada ${esc(a.publicado || "—")}${a.cierre ? ` · cierra ${esc(a.cierre)}${dc != null ? ` (${dc >= 0 ? `faltan ${dc} días` : "cerrada"})` : ""}` : ""}${a.cpv?.length ? ` · ${esc(a.cpv.join(", "))}` : ""}</span></li>`; }).join("")}</ul>`
        : `<p class="meta">Sin coincidencias. Prueba con otra palabra o en otro idioma (los avisos de la UE vienen en el idioma del comprador; muchos traen título en inglés).</p>`);
  });
  $("lic-usa").addEventListener("click", async () => {
    const q = $("lic-q").value.trim();
    if (q.length < 3) { $("lic-usa-res").innerHTML = `<p class="meta">Escribe arriba al menos una palabra clave (en inglés funciona mejor: cybersecurity, water, bridge…).</p>`; return; }
    const LZ = await import("./licitaciones-logica.js");
    $("lic-usa-res").innerHTML = `<p class="meta">Consultando USAspending…</p>`;
    try {
      const r = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(LZ.consultaUSAspending(q)) });
      const d = await r.json();
      const usd = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      $("lic-usa-res").innerHTML = (d.results || []).length ? `<ul class="fuentes">${d.results.map((x) => `<li><a href="https://www.usaspending.gov/award/${encodeURIComponent(x.generated_internal_id)}" target="_blank" rel="noopener noreferrer">${esc(x["Recipient Name"] || "")}</a> — <b>${usd(x["Award Amount"])}</b><br><span class="meta">${esc(x["Awarding Agency"] || "")} · ${esc(x["Start Date"] || "")} · ${esc(String(x.Description || "").slice(0, 180))}</span></li>`).join("")}</ul>`
        : `<p class="meta">Sin contratos con esas palabras en los últimos 12 meses.</p>`;
    } catch (err) { $("lic-usa-res").innerHTML = `<p class="meta">USAspending no respondió: ${esc(err.message)}</p>`; }
  });
  $("inv-69b-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = await cargar("efos", "data/vivos/efos_69b.json");
    $("inv-69b-res").innerHTML = d ? I.html69b(I.buscar69b(d, $("inv-69b-q").value), d) : `<p class="meta">El listado aún no está disponible (se descarga una vez por semana del SAT).</p>`;
  });
  $("inv-fbi-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = await cargar("fbi", "data/vivos/buscados_fbi.json");
    $("inv-fbi-res").innerHTML = d ? I.htmlFbi(I.buscarFbi(d, $("inv-fbi-q").value)) : `<p class="meta">Las fichas aún no están disponibles.</p>`;
  });
  // Cadena de custodia
  let registros = [];
  const descargar = (nombre, tipo, texto) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const datosCaso = () => ({ caso: $("cus-caso").value, responsable: $("cus-resp").value, descripcion: $("cus-desc").value });
  $("cus-archivos").addEventListener("change", async (e) => {
    $("cus-res").innerHTML = `<p class="meta">Calculando huellas…</p>`;
    registros = registros.concat(await Promise.all([...e.target.files].map((f) => I.registroEvidencia(f))));
    e.target.value = "";
    $("cus-res").innerHTML = `<ol class="lista-inv">${registros.map((r) => `<li>${esc(r.nombre)} <span class="meta">(${r.bytes.toLocaleString("es-MX")} bytes)</span><br><code>${esc(r.sha256)}</code></li>`).join("")}</ol>
      <div class="fila-botones"><button type="button" id="cus-acta">Descargar acta (para imprimir o PDF)</button><button type="button" id="cus-csv">Descargar CSV</button><button type="button" id="cus-limpiar">Limpiar</button></div>`;
  });
  $("cus-res").addEventListener("click", (e) => {
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (e.target.id === "cus-acta") descargar(`acta-huellas-${sello}.html`, "text/html", I.htmlActa(datosCaso(), registros));
    if (e.target.id === "cus-csv") descargar(`huellas-${sello}.csv`, "text/csv", I.csvActa(registros));
    if (e.target.id === "cus-limpiar") { registros = []; $("cus-res").innerHTML = ""; }
  });
  // Cuaderno de vínculos
  let cuaderno = I.cargarCuaderno();
  $("vin-tipo").innerHTML = Object.entries(I.TIPOS_ENTIDAD).map(([k, [n]]) => `<option value="${k}">${esc(n)}</option>`).join("");
  const pintarVin = () => {
    I.guardarCuaderno(cuaderno);
    const ops = cuaderno.entidades.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("");
    $("vin-a").innerHTML = ops; $("vin-b").innerHTML = ops;
    const nombre = Object.fromEntries(cuaderno.entidades.map((x) => [x.id, x.nombre])), g = I.grados(cuaderno);
    $("vin-grafico").innerHTML = I.svgVinculos(cuaderno);
    $("vin-lista").innerHTML = `<ul class="lista-inv">${cuaderno.entidades.map((x) => `<li><span class="swatch" style="background:${I.TIPOS_ENTIDAD[x.tipo]?.[1]}"></span>${esc(x.nombre)} <span class="meta">${esc(I.TIPOS_ENTIDAD[x.tipo]?.[0] || "")} · ${g[x.id] || 0} relaciones</span> <button type="button" class="mini" data-quitar="${esc(x.id)}" aria-label="Quitar ${esc(x.nombre)}">✕</button></li>`).join("")}</ul>
      ${cuaderno.relaciones.length ? `<ul class="lista-inv">${cuaderno.relaciones.map((r) => `<li>${esc(nombre[r.a])} — <i>${esc(r.tipo)}</i> — ${esc(nombre[r.b])}${r.fuente ? ` <span class="meta">(${esc(r.fuente)})</span>` : ""}</li>`).join("")}</ul>` : ""}`;
  };
  pintarVin();
  $("vin-ent").addEventListener("submit", (e) => { e.preventDefault(); cuaderno = I.agregarEntidad(cuaderno, $("vin-nombre").value, $("vin-tipo").value); $("vin-nombre").value = ""; pintarVin(); });
  $("vin-rel").addEventListener("submit", (e) => { e.preventDefault(); cuaderno = I.agregarRelacion(cuaderno, $("vin-a").value, $("vin-b").value, $("vin-tipo-rel").value, $("vin-fuente").value); $("vin-tipo-rel").value = ""; $("vin-fuente").value = ""; pintarVin(); });
  $("vin-lista").addEventListener("click", (e) => { const id = e.target.closest("[data-quitar]")?.dataset.quitar; if (id) { cuaderno = I.quitarEntidad(cuaderno, id); pintarVin(); } });
  $("vin-exportar").onclick = () => descargar(`vinculos-${new Date().toISOString().slice(0, 10)}.json`, "application/json", JSON.stringify(cuaderno, null, 1));
  $("vin-importar").onchange = async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); if (Array.isArray(d.entidades) && Array.isArray(d.relaciones)) { cuaderno = d; pintarVin(); } } catch { alert("El archivo no es un cuaderno de vínculos válido."); } e.target.value = ""; };
  $("vin-borrar").onclick = () => { if (confirm("¿Borrar todas las entidades y relaciones de este navegador? Exporta antes si quieres conservarlas.")) { cuaderno = { entidades: [], relaciones: [] }; pintarVin(); } };
}

// ---------- Cambio en el tiempo (Sentinel-2 cloudless por año) ----------
let camaraEEI = null;
async function alternarEEI(cb) {
  const E = await import("./eei.js");
  camaraEEI ??= new E.CamaraEEI(api.map, document.querySelector(".mapa-wrap"), { onCerrar: () => { cb.checked = false; } });
  cb.checked ? camaraEEI.abrir() : camaraEEI.cerrar();
}

let timelapse = null;
async function alternarTimelapse(cb) {
  const T = await import("./timelapse.js");
  let barra = document.querySelector(".tl-barra");
  if (!cb.checked) { timelapse?.desactivar(); barra?.remove(); return; }
  if (!barra) {
    barra = document.createElement("div");
    barra.className = "tl-barra"; barra.setAttribute("role", "group"); barra.setAttribute("aria-label", "Cambio en el tiempo");
    barra.innerHTML = T.htmlBarra();
    document.querySelector(".mapa-wrap").appendChild(barra);
    const play = barra.querySelector(".tl-play"), rango = barra.querySelector(".tl-rango"), anio = barra.querySelector(".tl-anio");
    const fuente = barra.querySelector(".tl-fuente"), dia = barra.querySelector(".tl-dia"), diaIn = barra.querySelector(".tl-dia-in"), aviso = barra.querySelector(".tl-aviso");
    const marcas = barra.querySelector(".tl-marcas");
    timelapse ??= new T.Timelapse(api.map, {
      onCambio: (st) => {
        rango.max = st.n - 1; rango.value = st.i; anio.textContent = st.cargando ? `${st.anio} · bajando ${st.cargando}…` : st.anio; fuente.value = st.fuente; dia.hidden = st.fuente !== "nasa";
        marcas.innerHTML = `<span>${T.FUENTES[st.fuente].anios[0]}</span><span>${T.FUENTES[st.fuente].anios.at(-1)}</span>`;
        play.textContent = st.reproduciendo ? "⏸" : "▶"; play.setAttribute("aria-label", st.reproduciendo ? "Pausar" : "Reproducir");
      },
      onAviso: (t) => { aviso.textContent = t; aviso.hidden = false; setTimeout(() => { aviso.hidden = true; }, 10000); },
    });
    play.onclick = () => (timelapse.reloj ? timelapse.pausar() : timelapse.reproducir());
    rango.oninput = () => { const i = Number(rango.value); timelapse.pausar(); timelapse.setIndice(i); };  // se lee antes: pausar() repinta el deslizador
    fuente.onchange = () => timelapse.setFuente(fuente.value);
    diaIn.onchange = () => { diaIn.value = T.diaValido(diaIn.value); timelapse.setDia(diaIn.value); };
    barra.querySelector(".tl-cerrar").onclick = () => { cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true })); };
  }
  timelapse.activar();
  registrarAnimacion({ id: "timelapse", nombre: "cambio en el tiempo (imágenes por año)", disponible: () => Boolean(timelapse?.activo),
    activa: () => Boolean(timelapse?.reloj), iniciar: () => timelapse.reproducir(), detener: () => timelapse.pausar() });
  avisarPresupuesto();
}

// ---------- Clima tipo Windy (modelo GFS de NOAA) ----------
async function iniciarClima() {
  const cont = $("clima-capas");
  if (!cont) return;
  // En LITE también: la animación solo corre si la activas (gasta batería; el aviso queda en el menú).
  const K = await import("./clima.js");
  clima = new K.Clima(api.map);
  let meta;
  try { meta = await clima.cargar(); } catch (e) { cont.innerHTML = `<p class="meta">Aún no hay datos del modelo (los prepara el workflow «Datos en movimiento» cada 6 h).</p>`; return; }
  if (!meta.pasos?.length) { cont.innerHTML = `<p class="meta">Sin horizontes de pronóstico en la última corrida.</p>`; return; }
  const capas = [["viento", "Viento a 10 m (animado)"], ["temp", "Temperatura a 2 m"], ["lluvia", "Lluvia (mm/h)"],
    ["polar", "🥶 Aire polar y frentes de aire frío (temperatura a ~1,500 m)"], ["rayos", "⚡ Rayos en tiempo real (satélites GOES, últimos 20 min)"], ["nubes_ir", "☁️ Nubes en vivo (satélites, infrarrojo, animado)"],
    ["geocolor", "🛰️ Color real GOES de día y de noche (América, animado)"], ["lluvia_sat", "🌧️ Lluvia medida por satélite (IMERG, animada)"]];
  cont.innerHTML = capas.map(([id, n]) => `<label class="fila"><span><input type="checkbox" data-clima="${id}"> ${esc(n)}</span></label>`).join("")
    + `<label class="fila"><span>Momento</span><select id="clima-paso">${meta.pasos.map((p, i) => `<option value="${i}">${esc(K.etiquetaPaso(p.valido_utc))}</option>`).join("")}</select>
        <button type="button" class="icon-btn" id="clima-animar" aria-pressed="false" title="Recorre los momentos del pronóstico uno tras otro">▶</button></label>`
    + `<div id="clima-leyendas"></div>`
    + `<p class="nota-capas">Modelo GFS de NOAA (1°, ~110 km), corrida ${esc(meta.corrida)}. Es un pronóstico numérico, no una medición: para avisos oficiales consulta al SMN o a tu servicio meteorológico.</p>`;
  const leyendas = () => {
    $("clima-leyendas").innerHTML = [clima.activas.has("viento") ? K.leyenda(K.VELOCIDADES.map(([v, c]) => [Math.round(v * 3.6), c]), "km/h") : "",
      clima.activas.has("temp") ? K.leyenda(meta.leyendas.temp, "°C") : "",
      clima.activas.has("polar") && meta.leyendas.polar ? `${K.leyenda(meta.leyendas.polar, "°C a 850 hPa")}<p class="meta">Azul y morado: aire de origen polar o ártico a ~1,500 m de altura (850 hPa), donde no influye el calor del suelo. Las líneas marcan 0, −10 y −20 °C. Usa «Momento» o ▶ para ver hacia dónde avanza en los próximos 3 días. Pronóstico numérico GFS: para avisos, el SMN.</p>` : "", clima.activas.has("lluvia") ? K.leyenda(meta.leyendas.lluvia, "mm/h") : "",
      clima.activas.has("rayos") ? `${K.leyenda(K.LEYENDA_RAYOS, "min desde el último rayo")}<p class="meta">GLM de NOAA en GOES-19 y GOES-18: América, Atlántico y Pacífico oriental. El destello animado ocurre donde de verdad cayeron rayos, a su ritmo acelerado ×20.</p>` : "",
      ...["nubes_ir", "geocolor", "lluvia_sat"].filter((t) => clima.activas.has(t)).map((t) => `<p class="meta" id="momento-${t}">${{ nubes_ir: "Nubes (infrarrojo: blanco = topes fríos y altos, tormentas)", geocolor: "Color real GOES (de noche, luces de ciudades)", lluvia_sat: "Lluvia IMERG de NASA (mm/h)" }[t]}</p>`
        + `<div class="carga-bucle" id="carga-${t}" role="status"><div class="carga-barra"><span></span></div><small>Descargando imágenes del satélite…</small></div>`)].join("");
  };
  // Avance de descarga de los cuadros: la animación arranca con los que ya llegaron y la barra se oculta al tener todos.
  clima.onProgreso = (t, n, total) => {
    const d = document.getElementById(`carga-${t}`);
    if (!d) return;
    d.hidden = n >= total;
    d.querySelector("span").style.width = `${Math.round((n / total) * 100)}%`;
    d.querySelector("small").textContent = n ? `Descargando imágenes del satélite: ${n} de ${total} cuadros listos (la animación usa los que ya llegaron)` : `Descargando imágenes del satélite: 0 de ${total} cuadros…`;
  };
  clima.onMomento = (t, m) => {
    const p = document.getElementById(`momento-${t}`);
    if (p) p.dataset.momento = `${m.slice(11, 16)} UTC · hace ${Math.round((Date.now() - Date.parse(m)) / 60000)} min`;
  };
  // ▶ recorre los horizontes del pronóstico (p. ej. para ver avanzar el aire polar o una tormenta) cada 1.8 s.
  let animacion = null;
  const pintarBoton = () => { const b = $("clima-animar"); if (b) { b.textContent = animacion ? "⏸" : "▶"; b.setAttribute("aria-pressed", String(Boolean(animacion))); } };
  const detenerClima = () => { clearInterval(animacion); animacion = null; pintarBoton(); };
  const iniciarClima = () => {
    const sel = $("clima-paso");
    if (!sel || animacion) return;
    animacion = setInterval(() => { sel.value = String((Number(sel.value) + 1) % sel.options.length); clima.setPaso(Number(sel.value)).catch(() => null); }, 1800);
    pintarBoton();
  };
  cont.addEventListener("click", (e) => {
    if (!e.target.closest("#clima-animar")) return;
    animacion ? detenerClima() : iniciarClima();
  });
  // El pronóstico se anima desde el botón global solo si hay alguna capa del modelo encendida (con varios momentos).
  registrarAnimacion({ id: "clima", nombre: "pronóstico del clima", disponible: () => clima.activas.size > 0 && ($("clima-paso")?.options.length || 0) > 1,
    activa: () => Boolean(animacion), iniciar: iniciarClima, detener: detenerClima });
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
      vistaFicha ??= camaraActual();
      api.map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(api.map.getZoom(), 6), duration: lite ? 0 : 800 });
      riesgos.abrir(a);
    };
  };
  riesgos = new R.Riesgos(api.map, {
    onNuevas: (n, severo) => sonar({ severo }),
    ctx: { indice: fronteras ? A.indicePaises(fronteras) : null, porNombre },
    onCambio: () => { if (riesgos?.catalogo) riesgos.explorar().then((x) => { apagadas = x; pintar(); }); else pintar(); },
    onObjeto: (capa, props, geom) => {
      entidadAbierta = null; trayectoria?.limpiar();
      const punto = puntoDe(geom);
      abrirFichaHtml(R.htmlRiesgo(capa, props, geom) + dibujar3d({ fuente: "riesgo", capa: capa.id, props: R.desanidar(props), lat: punto?.[1] }, punto, geom));
      const ce = document.querySelector("#ficha-cuerpo .conf-extra");
      if (ce) llenarConflicto(ce, R.desanidar(props));
      if (punto && geom?.type === "Point") zonaYVideos(capa, R.desanidar(props), punto);
      const div = document.querySelector("#ficha-cuerpo .ceniza");
      if (div) import("./ceniza.js").then((C) => C.mostrarCeniza(api.map, div)).catch((e) => { div.innerHTML = `<p class="meta">No se pudo calcular el viento: ${esc(e.message)}</p>`; });
      prepararErupcion();
    },
  });
  // Zona (estado o país) y videos de canales de noticias en la ficha; solo para los grupos de GRUPOS_ZONA.
  let estadosZona = null;
  async function zonaYVideos(capa, props, punto) {
    ZF ??= await import("./zona_ficha.js");
    if (!ZF.GRUPOS_ZONA.has(capa.grupo)) return;
    estadosZona ??= getJSON("data/vivos/zonas_eventos.geojson", { bust: true }).catch(() => null);
    videosConf ??= getJSON("data/vivos/conflictos_videos.json", { bust: true }).catch(() => null);
    const [estados, v, C] = await Promise.all([estadosZona, videosConf, import("./conflictos.js")]);
    const cuerpo = $("ficha-cuerpo");
    if ($("ficha").hidden || !cuerpo) return;
    const zona = ZF.zonaDe(punto, props, { estados, paises: fronteras, nombrePais });
    ZF.dibujarZona(api.map, zona);
    const vids = ZF.videosPara(v?.recientes, ZF.lugaresDe(props, nombrePais), capa.grupo);
    const div = document.createElement("div");
    div.className = "zona-videos";
    div.innerHTML = `${ZF.htmlZona(zona)}<h4>Videos de canales de noticias</h4>${C.htmlVideos(vids, `${props.title || props.titulo || props.tipo || ""} ${props.lugar || ""}`.trim())}`;
    div.addEventListener("click", (e) => { const b = e.target.closest(".conf-video"); if (b) C.reproducir(b); });
    cuerpo.appendChild(div);
  }
  const filaCapa = (c) => `<label class="fila"><span><input type="checkbox" data-riesgo="${c.id}"> ${esc(c.nombre)}</span><span class="meta" id="rg-n-${c.id}"></span></label>
      ${c.leyenda ? `<div class="ley-wrap" id="rg-ley-${c.id}" hidden>${R.htmlLeyenda(c)}</div>` : ""}`;
  const delGrupo = (g) => R.CAPAS.filter((c) => c.grupo === g && !c.menu);
  // Polos: atajo que enciende sus capas, pasa a la vista de globo (en el plano los polos se ven deformados) y centra el polo.
  const ATAJO_POLOS = `<div class="atajos-polos"><button type="button" class="mini" data-polo="sur">🧊 Ver la Antártida</button>
    <button type="button" class="mini" data-polo="norte">🧊 Ver Groenlandia y el Ártico</button></div>`;
  cont.innerHTML = R.GRUPOS.map(([g, ic, color], i) => `<details class="subgrupo-d" id="sg-rg-${i}" open><summary class="subgrupo" style="--c:${color}"><span class="punto"></span>${ic} ${esc(g)}
      <span class="sg-n">${delGrupo(g).length} capas</span></summary>` + (g.startsWith("Polos") ? ATAJO_POLOS : "") + delGrupo(g).map(filaCapa).join("") + `</details>`).join("");
  cont.addEventListener("click", (e) => {
    const b = e.target.closest("[data-polo]");
    if (!b) return;
    for (const x of cont.querySelectorAll('[data-riesgo^="polos_"]')) if (!x.checked) { x.checked = true; x.dispatchEvent(new Event("change", { bubbles: true })); }
    const hielo = document.querySelector('[data-img="hielo_marino"]');
    if (hielo && !hielo.checked) { hielo.checked = true; hielo.dispatchEvent(new Event("change", { bubbles: true })); }
    $("sel-proyeccion").value = "globe";
    $("sel-proyeccion").dispatchEvent(new Event("change"));
    const sur = b.dataset.polo === "sur";
    // En el globo el zoom compensa la latitud (cerca del polo, el mismo zoom se ve ~4 veces más cerca): por eso es bajo.
    api.map.flyTo({ center: sur ? [0, -78] : [-40, 74], zoom: 0.6, duration: lite ? 0 : 1200 });
  });
  // Capas que viven en otro menú (trenes en «En movimiento → Trenes»; fenómenos anómalos en su propio grupo): mismo motor, otra ubicación.
  for (const [menu, idCont] of [["trenes", "trenes-capas"], ["anomalias", "anomalias-capas"]]) {
    const c = $(idCont);
    if (!c) continue;
    const capas = R.CAPAS.filter((x) => x.menu === menu);
    const subgrupos = [...new Set(capas.map((x) => x.subgrupo).filter(Boolean))];
    // Con subgrupos (fenómenos anómalos: casos y lugares / por tipo), cada uno plegable como en «Amenazas».
    c.innerHTML = subgrupos.length > 1 ? subgrupos.map((g, i) => `<details class="subgrupo-d" id="sg-${menu}-${i}"${i ? "" : " open"}><summary class="subgrupo" style="--c:var(--g-anomalias)"><span class="punto"></span>${esc(g)}
        <span class="sg-n">${capas.filter((x) => x.subgrupo === g).length} capas</span></summary>${capas.filter((x) => x.subgrupo === g).map(filaCapa).join("")}</details>`).join("")
      : capas.map(filaCapa).join("");
  }
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
      const cb = document.querySelector(`[data-riesgo="${id}"]`);
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });
  $("riesgos-filtros").addEventListener("change", async (e) => {
    if (e.target.id === "rg-tipo" && e.target.value) {
      const capas = new Set(apagadas.filter((a) => a.tipo === e.target.value).map((a) => a.capa));
      for (const id of capas) {
        const cb = document.querySelector(`[data-riesgo="${id}"]`);
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
  const alCambiarCapa = async (e) => {
    const id = e.target.dataset.riesgo;
    if (!id) return;
    const marca = $(`rg-n-${id}`);
    const ley = $(`rg-ley-${id}`);
    if (ley) ley.hidden = !e.target.checked;
    if (!e.target.checked) { riesgos.desactivar(id); marca.textContent = ""; if (id === "volcanes") quitarCeniza(); return; }
    marca.textContent = "cargando…";
    try { const n = await riesgos.activar(id); marca.textContent = `${n.toLocaleString("es-MX")}`; } catch (err) { e.target.checked = false; marca.textContent = "sin datos"; }
  };
  cont.addEventListener("change", alCambiarCapa);
  for (const idCont of ["trenes-capas", "anomalias-capas"]) $(idCont)?.addEventListener("change", alCambiarCapa);
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
      const cb = document.querySelector(`[data-riesgo="${id}"]`);
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
  // En LITE también (empiezan apagadas; gastan datos y batería solo si las enciendes).
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
        if (!e.target.checked) {
          mov.desactivar(t);
          // Lo que dependía de esa capa también se va: trayectoria dibujada, columnas 3D y la cabina del avión.
          if (t === "aeronaves" || t === "buques") trayectoria?.limpiar();
          if (t === "aeronaves") { cabina?.detener(); vueloAbierto = null; }
          alt3d?.refrescar();
          return;
        }
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

// ---------- Historia por país (Wikipedia + Wikidata, al pedirla) ----------
async function abrirHistoria(iso3) {
  if (!paises) await cargarPaises().catch(() => (paises = {}));
  const nombre = paises?.[iso3]?.es || iso3;
  $("hist-estado").textContent = `Consultando la historia de ${nombre}…`;
  abrirFichaHtml(`<h3 id="ficha-titulo">📜 Historia de ${esc(nombre)}</h3><p class="meta">Consultando Wikipedia y Wikidata…</p>`);
  const H = await import("./historia.js");
  const d = await H.cargarHistoria(iso3, nombre);
  abrirFichaHtml(H.htmlHistoria(nombre, d));
  $("hist-estado").textContent = `${nombre}: ${d.articulo ? `${d.articulo.etapas.length} etapas` : "sin artículo"} · ${d.hechos ? `${d.hechos.length} hechos fechados` : "Wikidata sin respuesta"}.`;
}
function iniciarHistoria() {
  const sug = $("hist-sug"), form = $("hist-form"), q = $("hist-q");
  if (!form) return;
  const cargar = async () => { if (!paises) await cargarPaises().catch(() => (paises = {})); };
  // Sugerencias propias (no <datalist>): ignoran acentos y mayúsculas y aceptan el nombre en inglés o el código ISO.
  const buscar = (txt) => {
    const t = sinAcentos(txt.trim());
    if (!t) return [];
    const filas = Object.entries(paises || {}).map(([iso, p]) => ({ iso, es: p.es, claves: [sinAcentos(p.es), sinAcentos(p.en), iso.toLowerCase()] }));
    const empieza = filas.filter((f) => f.claves.some((k) => k.startsWith(t)));
    const contiene = filas.filter((f) => !empieza.includes(f) && f.claves.some((k) => k.includes(t)));
    return [...empieza, ...contiene].slice(0, 8);
  };
  const pintar = async () => {
    await cargar();
    const r = buscar(q.value);
    sug.hidden = !r.length;
    sug.innerHTML = r.map((f) => `<li><button type="button" data-hist-iso="${esc(f.iso)}">${esc(f.es)}</button></li>`).join("");
  };
  q.addEventListener("input", pintar);
  sug.addEventListener("click", (e) => { const b = e.target.closest("[data-hist-iso]"); if (!b) return; q.value = b.textContent; sug.hidden = true; abrirHistoria(b.dataset.histIso); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await cargar();
    const t = sinAcentos(q.value.trim());
    const exacto = Object.keys(paises).find((k) => sinAcentos(paises[k].es) === t || sinAcentos(paises[k].en) === t || k.toLowerCase() === t);
    const iso = exacto || buscar(q.value)[0]?.iso;
    sug.hidden = true;
    if (!iso) { $("hist-estado").textContent = "No encontré ese país; revisa la escritura (con o sin acentos funciona)."; return; }
    abrirHistoria(iso);
  });
  // Botones «📜 Historia» dentro de otras fichas (p. ej. la de gobierno de un país).
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-historia]"); if (b) abrirHistoria(b.dataset.historia); });
}

/** Escala de colores de una imagen satelital: barra con los colores reales de la paleta y qué significa cada tramo. */
function htmlEscalaImagen(d) {
  const e = d.escala;
  return `<div class="escala-img"><div class="escala-barra" style="background:linear-gradient(90deg,${e.colores.map(esc).join(",")})"></div>
    <div class="escala-marcas">${e.marcas.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
    <ul class="escala-tramos">${e.tramos.map(([c, t]) => `<li><i style="background:${esc(c)}"></i>${esc(t)}</li>`).join("")}</ul>
    <p class="meta">${esc(d.leyenda || "")}</p></div>`;
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

/** Aviso breve sobre el mapa (desaparece solo). */
function avisoMapa(texto, ms = 6000) {
  let el = $("aviso-zoom");
  if (!el) { el = document.createElement("div"); el.id = "aviso-zoom"; el.className = "aviso-base"; el.setAttribute("role", "status"); $("map").parentElement.appendChild(el); }
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoMapa.t);
  avisoMapa.t = setTimeout(() => { el.hidden = true; }, ms);
}

function avisarPresupuesto() {
  if (api?.map) import("./contornos.js").then((C) => C.actualizarContornos(api.map)).catch(() => null);
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
    <span>${x.eventos.length} eventos ${x.nuevos ? `<span class="badge-nuevo">${x.nuevos} nuevos</span>` : ""}
      <button type="button" class="seg-quitar" data-seg-quitar="${esc(x.id)}" title="Dejar de seguir" aria-label="Dejar de seguir ${esc(x.n || x.id)}">×</button></span></li>`;
  const grupos = new Map();
  for (const x of items) { const k = x.familia || "otros"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); }
  const nombreFam = (k) => gestor?.familias?.get(k)?.nombre || { otros: "Otros", corporativo: "Mis instalaciones (inteligencia corporativa)" }[k] || k;
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
  // Si ya había un service worker y se instala uno nuevo (se publicó una versión), se recarga una vez para que
  // toda la página use la versión nueva y no una mezcla de archivos viejos y nuevos.
  if (navigator.serviceWorker.controller) {
    let recargado = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!recargado) { recargado = true; location.reload(); } });
  }
}

main().catch((e) => {
  console.error(e);
  $("estado-datos").textContent = `Error al cargar: ${e.message}`;
});

