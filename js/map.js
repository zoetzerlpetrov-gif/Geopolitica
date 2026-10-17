// Mapa con MapLibre GL (WebGL). Todo lo que se dibuja vive en la GPU:
// no se crean elementos HTML por marcador, por eso escala a decenas de miles de puntos.
/* global maplibregl */
import { pinturaEtiqueta, layoutEtiqueta } from "./util.js";

const OFM = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  calles: "https://tiles.openfreemap.org/styles/liberty",
};
// Imagen satelital sin llave: Sentinel-2 cloudless 2016 de EOX (mosaico sin nubes, 10 m por píxel, licencia
// CC BY 4.0; las versiones de años posteriores son no comerciales). Se ve borrosa desde zoom ~15; de cerca entra
// Esri (abajo) si hay llave.
const SAT = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const SAT_ATRIB = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contiene datos modificados de Copernicus Sentinel 2016), CC BY 4.0';

// Imagen nítida de cerca (< 1 m por píxel en buena parte del mundo): Esri World Imagery con la llave pública de
// ArcGIS Location Platform. La llave no vive en el repositorio: el workflow de Pages escribe config/satelite.json
// desde el secreto ESRI_API_KEY. La llave queda visible en el navegador (así funcionan todos los mapas web);
// se protege restringiéndola al dominio del sitio en el panel de ArcGIS. Sin llave, solo Sentinel-2.
const ESRI = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=";
const ESRI_ATRIB = '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a> | Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de SIG';
export const ESRI_DESDE = 11; // por debajo, el mosaico de Sentinel-2 sin nubes se ve mejor y no gasta cuota

/** Mapa base satelital: mosaico Sentinel-2 (+ Esri de cerca si hay llave) + fronteras y nombres de países encima. */
export function estiloSatelite(llaveEsri = "") {
  const local = estiloLocal("dark");
  const esri = llaveEsri ? { esri: { type: "raster", tiles: [ESRI + encodeURIComponent(llaveEsri)], tileSize: 256, minzoom: ESRI_DESDE, maxzoom: 19, attribution: ESRI_ATRIB } } : {};
  return {
    version: 8, glyphs: GLYPHS,
    sources: { ...local.sources, sat: { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 14, attribution: SAT_ATRIB }, ...esri,
      osm: { type: "vector", url: OFM_TILES } },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": "#0b1a2a" } },
      { id: "satelite", type: "raster", source: "sat", paint: { "raster-fade-duration": 0 } },
      ...(llaveEsri ? [{ id: "satelite-esri", type: "raster", source: "esri", minzoom: ESRI_DESDE, paint: { "raster-fade-duration": 0 } }] : []),
      { id: "paises-borde", type: "line", source: "paises", paint: { "line-color": "rgba(255,255,255,0.55)", "line-width": 0.7 } },
      { id: "paises-nombre", type: "symbol", source: "nombres", minzoom: 2.5, maxzoom: 9,
        layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 11, "text-optional": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.2 } },
      { id: "sat-calles", type: "line", source: "osm", "source-layer": "transportation", minzoom: 12,
        paint: { "line-color": "rgba(255,255,255,0.55)", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 18, 3] } },
      { id: "sat-calles-nombre", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 13,
        layout: { "symbol-placement": "line", "text-field": NOMBRE_ES, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 18, 14] },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.85)", "text-halo-width": 1.4 } },
      { id: "sat-lugares", type: "symbol", source: "osm", "source-layer": "place", minzoom: 9,
        layout: { "text-field": NOMBRE_ES, "text-font": FONT, "text-size": 12 },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.85)", "text-halo-width": 1.4 } },
    ],
  };
}
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
// Zoom máximo: 19 deja ver cuadras y nombres de calles. Los mosaicos de OpenFreeMap llegan a zoom 14 y MapLibre
// los amplía sin perder nitidez (son vectores); la imagen satelital (10 m por píxel) se ve borrosa desde ~15.
export const ZOOM_MAX = 19;
// Calles y sus nombres de OpenStreetMap (vía OpenFreeMap) para poner encima de la imagen satelital.
const OFM_TILES = "https://tiles.openfreemap.org/planet";
const FONT = ["Noto Sans Regular"];

async function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
}

/**
 * Estilo local (sin depender de terceros salvo las fuentes de texto): países de Natural Earth y sus nombres.
 * - Respaldo cuando OpenFreeMap no responde: escala 1:50m.
 * - Modo LITE (celular): escala 1:110m (48 KB comprimido), para que el mapa sea usable en < 3 s con 4G.
 */
export function estiloLocal(theme, { ligero = false } = {}) {
  const dark = theme === "dark";
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      paises: { type: "geojson", data: ligero ? "data/base/countries-110m.geojson" : "data/base/countries.geojson" },
      nombres: { type: "geojson", data: "data/base/etiquetas-paises.geojson" },
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": dark ? "#0d1b24" : "#dfe8ee" } },
      { id: "paises-relleno", type: "fill", source: "paises", paint: { "fill-color": dark ? "#1f2a31" : "#f7f7f4" } },
      { id: "paises-borde", type: "line", source: "paises", paint: { "line-color": dark ? "#3b4b56" : "#b9c2c9", "line-width": 0.6 } },
      { id: "paises-nombre", type: "symbol", source: "nombres", minzoom: 2.5,
        layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 11, "text-optional": true },
        paint: { "text-color": dark ? "#dbe4ea" : "#2a343c", "text-halo-color": dark ? "#0d1b24" : "#ffffff", "text-halo-width": 1.2 } },
    ],
  };
}

// Zoom mínimo de las etiquetas del mapa base. Colocar texto (colisiones, glifos) es lo más caro
// que hace MapLibre al mover el mapa; el estilo "dark" de OpenFreeMap trae 13 capas de etiquetas
// activas desde zoom 0 (carreteras, colonias, pueblos). Aquí se retrasan hasta donde aportan.
const MINZOOM_ETIQUETAS = [
  [/highway|road|transportation_name|shield|oneway/, 9],
  [/village|suburb|place_other|label_other/, 9],
  [/airport|aerodrome/, 10],
  [/waterway/, 10],
  [/town/, 6],
];
// En modo LITE además se quitan capas que casi no se ven a la escala de un monitor mundial.
const QUITAR_EN_LITE = /highway|road|transportation_name|shield|oneway|village|suburb|place_other|label_other|airport|aerodrome|waterway|building|aeroway-(taxiway|runway)/;

// Etiquetas en español; si no hay, nombre en alfabeto latino. El estilo original concatena el nombre
// latino con el original (chino, árabe, cirílico…), y cada alfabeto obliga a descargar otro bloque de
// fuentes: en la medición base eran 1.5 MB en 31 peticiones solo de fuentes.
const NOMBRE_ES = ["coalesce", ["get", "name:es"], ["get", "name:latin"], ["get", "name"]];

// Contraste de las etiquetas del mapa base. El estilo «dark» de OpenFreeMap pinta los nombres en gris medio
// (rgb 101,101,101) sobre negro y los mares en negro al 70 % con halo gris: casi no se leen. Aquí todas las
// etiquetas pasan a texto claro con halo oscuro (o al revés en los estilos claros), con halo delgado y casi
// sin difuminar para que el contorno no se coma las letras.
export const CONTRASTE = {
  oscuro: { texto: "#e8eef2", agua: "#9cc7e4", secundario: "#b9c6cf", halo: "#0e1a22" },
  claro: { texto: "#141c22", agua: "#1f4f7a", secundario: "#3b4650", halo: "#f4f5f2" },
};
function contrastar(l, tono) {
  const c = CONTRASTE[tono];
  const id = l.id;
  const color = /water|ocean|sea|lake|river|marine/.test(id) ? c.agua
    : /highway|road|path|airport|aerodrome|poi|other|suburb|village/.test(id) ? c.secundario : c.texto;
  l.paint = { ...(l.paint || {}), "text-color": color, "text-halo-color": c.halo, "text-halo-width": 1, "text-halo-blur": 0 };
}

/** Ajusta el estilo de OpenFreeMap para que pese menos al moverse y se lea mejor. No cambia su aspecto a zoom mundial.
 *  `tono`: «oscuro» o «claro» fuerza el contraste de las etiquetas (null las deja como vienen). */
export function aligerarEstilo(style, { lite = false, tono = null } = {}) {
  const layers = [];
  for (const l of style.layers) {
    if (lite && QUITAR_EN_LITE.test(l.id)) continue;
    if (l.type === "symbol" && l.layout) {
      if (JSON.stringify(l.layout["text-field"] || "").includes("name:latin")) l.layout["text-field"] = NOMBRE_ES;
      // Una sola familia tipográfica menos: la cursiva (nombres de mares) pasa a regular.
      if (JSON.stringify(l.layout["text-font"] || "").includes("Italic")) l.layout["text-font"] = ["Noto Sans Regular"];
    }
    if (l.type === "symbol" && tono && l.layout?.["text-field"]) contrastar(l, tono);
    if (l.type === "symbol") {
      const regla = MINZOOM_ETIQUETAS.find(([re]) => re.test(l.id));
      if (regla && (l.minzoom ?? 0) < regla[1]) l.minzoom = regla[1];
    }
    layers.push(l);
  }
  // Fuentes declaradas que ninguna capa usa (p. ej. el relieve "ne2_shaded"): se eliminan.
  const usadas = new Set(layers.map((l) => l.source).filter(Boolean));
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([id]) => usadas.has(id)));
  return { ...style, layers, sources };
}

let llaveCache;
/** Llave de Esri publicada en config/satelite.json (solo existe si el secreto ESRI_API_KEY está configurado). */
async function llaveSatelite() {
  if (llaveCache === undefined) {
    try { const r = await fetchTimeout("config/satelite.json", 4000); llaveCache = r.ok ? String((await r.json()).esri_llave || "") : ""; }
    catch { llaveCache = ""; }
  }
  return llaveCache;
}

/**
 * LITE: mapa local ligero. Si no, estilo de OpenFreeMap; si no responde en 6 s, el respaldo local.
 * `base`: «tematico» (claro u oscuro según el tema), «calles» (OpenFreeMap Liberty) o «satelite» (Sentinel-2 y, de cerca, Esri).
 */
export async function estiloBase(theme, { lite = false, base = "tematico" } = {}) {
  if (base === "satelite") return { style: estiloSatelite(await llaveSatelite()), remoto: true };
  // LITE con el mapa «Temático»: países locales, sin calles. Con «Calles» sí se carga el mapa de calles y se
  // conservan sus nombres: quien lo elige quiere ver el detalle aunque el equipo sea lento.
  if (lite && base !== "calles") return { style: estiloLocal(theme, { ligero: true }), remoto: true, local: true };
  try {
    const r = await fetchTimeout(base === "calles" ? OFM.calles : OFM[theme], 6000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // «Calles» (Liberty) colorea sus etiquetas por tipo y ya se lee bien; solo se ajustan los estilos temáticos.
    const tono = base === "calles" ? null : theme === "dark" ? "oscuro" : "claro";
    return { style: aligerarEstilo(await r.json(), { lite: lite && base !== "calles", tono }), remoto: true };
  } catch (e) {
    console.warn("OpenFreeMap no disponible, se usa el mapa base local:", e.message);
    return { style: estiloLocal(theme), remoto: false };
  }
}

/** Botones de zoom abajo al centro, en fila: «−» a la izquierda y «+» a la derecha. */
export function controlZoom(map) {
  const div = document.createElement("div");
  div.className = "zoom-centro maplibregl-ctrl maplibregl-ctrl-group";
  div.setAttribute("role", "group");
  div.setAttribute("aria-label", "Zoom del mapa");
  div.innerHTML = `<button type="button" class="zoom-menos" aria-label="Alejar" title="Alejar">−</button><button type="button" class="zoom-mas" aria-label="Acercar" title="Acercar">+</button>`;
  const menos = div.querySelector(".zoom-menos"), mas = div.querySelector(".zoom-mas");
  menos.onclick = () => map.zoomOut();
  mas.onclick = () => map.zoomIn();
  // Se desactiva el botón al llegar al zoom mínimo o máximo (como el control original de MapLibre).
  const actualizar = () => { menos.disabled = map.getZoom() <= map.getMinZoom() + 1e-3; mas.disabled = map.getZoom() >= map.getMaxZoom() - 1e-3; };
  map.on("zoom", actualizar);
  map.once("load", actualizar);
  map.getContainer().appendChild(div);
  return div;
}

/**
 * Crea el mapa y devuelve una API mínima para el resto de la app.
 * @param {object} o
 * @param {HTMLElement} o.container
 * @param {object} o.style            estilo inicial
 * @param {Record<string,string>} o.colores  id de área -> color
 * @param {object} o.chokepoints      GeoJSON
 * @param {"light"|"dark"} o.tema
 * @param {boolean} o.lite            modo LITE: menos píxeles, sin copias del mundo, sin animaciones
 * @param {(id:string)=>void} o.onSelect
 */
export function crearMapa({ container, style, colores, chokepoints, tema: temaInicial, lite = false, onSelect }) {
  const map = new maplibregl.Map({
    container, style, center: [-20, 22], zoom: container.clientWidth < 600 ? 0.6 : 1.6, minZoom: 0.5, maxZoom: ZOOM_MAX,
    attributionControl: { compact: true },
    // Un celular con pantalla 3x dibuja 9 veces más píxeles que una 1x. Por encima de 2x la
    // diferencia casi no se nota en un mapa, pero el costo para la GPU sí: se limita.
    pixelRatio: Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2),
    // Las copias del mundo a izquierda y derecha triplican mosaicos a zoom bajo.
    renderWorldCopies: !lite,
    fadeDuration: 0, maxTileCacheSize: lite ? 80 : 200,
    refreshExpiredTiles: false,
  });
  controlZoom(map);
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  let datos = { type: "FeatureCollection", features: [] };
  let seleccion = "";
  let tema = temaInicial;
  let chokeVisible = true;
  let chokeDatos = chokepoints || { type: "FeatureCollection", features: [] };

  const colorArea = ["match", ["get", "a"]];
  for (const [id, c] of Object.entries(colores)) colorArea.push(id, c);
  colorArea.push("#888888");

  function agregarCapas() {
    const dark = tema === "dark";
    const texto = dark ? "#e4e9ed" : "#1c2329";

    map.addSource("chokepoints", { type: "geojson", data: chokeDatos });
    map.addLayer({
      id: "choke-anillo", type: "circle", source: "chokepoints",
      layout: { visibility: chokeVisible ? "visible" : "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 6, 12],
        "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2,
        "circle-stroke-color": ["match", ["get", "tipo"], "ruta_alternativa", "#8a8f94", "#2E6F8E"],
      },
    });
    map.addLayer({
      id: "choke-texto", type: "symbol", source: "chokepoints", minzoom: 2.2,
      layout: {
        visibility: chokeVisible ? "visible" : "none",
        "text-field": ["get", "nombre"], "text-font": FONT, "text-size": 11,
        "text-offset": [0, 1.3], "text-anchor": "top", ...layoutEtiqueta(map),
      },
      paint: pinturaEtiqueta(),
    });

    // Agrupación (clusters) calculada en un Web Worker por MapLibre (supercluster).
    map.addSource("eventos", {
      type: "geojson", data: datos, cluster: true, clusterRadius: 42, clusterMaxZoom: 7,
      clusterProperties: { sev_max: ["max", ["get", "s"]] },
    });
    map.addLayer({
      id: "clusters", type: "circle", source: "eventos", filter: ["has", "point_count"],
      paint: {
        "circle-color": dark ? "#2a3640" : "#ffffff",
        "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 50, 22, 200, 28],
        "circle-stroke-width": 3,
        "circle-stroke-color": ["step", ["get", "sev_max"], "#7c8b96", 3, "#d08a1a", 4, "#c0392b"],
      },
    });
    map.addLayer({
      id: "clusters-num", type: "symbol", source: "eventos", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true },
      paint: { "text-color": texto },
    });
    map.addLayer({
      id: "evento", type: "circle", source: "eventos", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": colorArea,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 3, ["get", "s"]], 8, ["+", 6, ["*", 2, ["get", "s"]]]],
        "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "evento-sel", type: "circle", source: "eventos",
      filter: ["==", ["get", "id"], seleccion],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 12, 8, 22],
        "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 3, "circle-stroke-color": dark ? "#ffffff" : "#111111",
      },
    });
  }

  // Cada vez que cambia el estilo base (tema claro/oscuro) se vuelven a montar las capas propias.
  map.on("style.load", agregarCapas);
  let proyeccion = "mercator";
  map.on("style.load", () => { if (proyeccion !== "mercator") try { map.setProjection({ type: proyeccion }); } catch (e) { /* sin globo */ } });

  // Interacción
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("click", "clusters", async (e) => {
    const f = e.features[0];
    const zoom = await map.getSource("eventos").getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: f.geometry.coordinates, zoom });
  });
  map.on("click", "evento", (e) => onSelect(e.features[0].properties.id));
  for (const capa of ["clusters", "evento"]) {
    map.on("mouseenter", capa, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", capa, () => { map.getCanvas().style.cursor = ""; popup.remove(); });
  }
  let ultimoHover = "";
  map.on("mousemove", "evento", (e) => {
    const f = e.features[0];
    if (f.properties.id === ultimoHover) return; // no recalcula el globo mientras sigue sobre el mismo punto
    ultimoHover = f.properties.id;
    popup.setLngLat(f.geometry.coordinates).setText(f.properties.t).addTo(map);
  });
  map.on("mouseleave", "evento", () => { ultimoHover = ""; });

  return {
    map,
    /** Reemplaza los puntos visibles (objeto GeoJSON o URL). El reagrupado ocurre en el worker. */
    setDatos(fc) { datos = fc; map.getSource("eventos")?.setData(fc); },
    setSeleccion(id) {
      seleccion = id || "";
      if (map.getLayer("evento-sel")) map.setFilter("evento-sel", ["==", ["get", "id"], seleccion]);
    },
    /** Los chokepoints pueden llegar después de crear el mapa (el mapa no espera a los JSON). */
    setChokepointsDatos(fc) { chokeDatos = fc; map.getSource("chokepoints")?.setData(fc); },
    setChokepoints(visible) {
      chokeVisible = visible;
      for (const l of ["choke-anillo", "choke-texto"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", visible ? "visible" : "none");
    },
    setTema(nuevo, style) { tema = nuevo; map.setStyle(style); },
    /** «globe» (globo 3D) o «mercator» (plano). Se vuelve a aplicar tras cada cambio de estilo. */
    setProyeccion(tipo) {
      proyeccion = tipo;
      try { map.setProjection({ type: tipo }); } catch (e) { console.warn("proyección no disponible:", e.message); }
    },
    volarA(lon, lat) {
      const destino = { center: [lon, lat], zoom: Math.max(map.getZoom(), 4) };
      lite ? map.jumpTo(destino) : map.flyTo({ ...destino, essential: true });
    },
  };
}
