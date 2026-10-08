// Capas de entidades (Eje 2). Carga perezosa: nada se descarga hasta que el usuario activa una capa.
//
// - Las capas estáticas son archivos .pmtiles en data/capas/: MapLibre pide solo los mosaicos visibles
//   mediante peticiones HTTP por rangos (el archivo completo nunca se descarga).
// - Solo se dibujan categorías "dibujable": true y subtipos con tipo_capa distinto de "ficha".
//   Las personas (rol público) nunca tienen capa: viven solo dentro de las fichas.
/* global maplibregl, pmtiles */
import { esc } from "./util.js";

export const PRESUPUESTO_CAPAS = 6; // eventos + chokepoints + 4 familias; más allá se avisa

const FONT = ["Noto Sans Regular"];
const NO_DIBUJABLE = "ficha";

/**
 * Familias que se pueden dibujar, con sus subtipos y estado. Función pura (probada en tests/js).
 * @param {object} catalogo  config/entities.json
 * @param {object} capasCfg  config/capas.json
 * @param {object} manifest  data/capas/manifest.json (o {familias:{}})
 */
export function familiasDibujables(catalogo, capasCfg, manifest) {
  const subtiposDe = {};
  for (const c of catalogo.categorias) {
    if (!c.dibujable) continue;
    for (const s of c.subtipos) {
      if (s.tipo_capa === NO_DIBUJABLE || s.tipo_capa !== "estatica" || !s.familia) continue;
      (subtiposDe[s.familia] ||= []).push(s);
    }
  }
  return capasCfg.familias
    .filter((f) => catalogo.categorias.some((c) => c.id === f.categoria && c.dibujable))
    .map((f) => {
      const m = manifest.familias?.[f.id];
      const fuente = catalogo.fuentes[f.fuente] || {};
      return {
        ...f,
        subtipos: subtiposDe[f.id] || [],
        disponible: Boolean(f.habilitada && m && m.estado === "ok"),
        manifest: m || null,
        licencia: fuente.licencia || "",
        estado_dato: (subtiposDe[f.id] || [])[0]?.estado_dato || "estatico",
      };
    });
}

let pmtilesListo = null;
/** Descarga vendor/pmtiles/pmtiles.js la primera vez y registra el protocolo pmtiles:// en MapLibre. */
function asegurarPMTiles() {
  pmtilesListo ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "vendor/pmtiles/pmtiles.js";
    s.onload = () => { maplibregl.addProtocol("pmtiles", new pmtiles.Protocol().tile); ok(); };
    s.onerror = () => mal(new Error("no se pudo cargar pmtiles.js"));
    document.head.append(s);
  });
  return pmtilesListo;
}

export class GestorCapas {
  /**
   * @param {maplibregl.Map} map
   * @param {object} o
   * @param {(f: object) => void} o.onEntidad   clic en un objeto de una capa
   * @param {(n: number) => void} o.onCambio     número de capas activas (incluye eventos y chokepoints)
   * @param {() => boolean} o.chokepointsActivos
   */
  constructor(map, { onEntidad, onCambio, chokepointsActivos }) {
    this.map = map;
    this.onEntidad = onEntidad;
    this.onCambio = onCambio;
    this.chokepointsActivos = chokepointsActivos;
    this.familias = new Map();      // id -> familia
    this.activas = new Map();       // id -> Set(subtipos visibles)
    this.colores = new Map();       // subtipo -> color
  }

  registrar(familias) {
    for (const f of familias) {
      this.familias.set(f.id, f);
      for (const s of f.subtipos) this.colores.set(s.id, s.color);
    }
  }

  totalActivas() {
    return 1 + (this.chokepointsActivos() ? 1 : 0) + this.activas.size;
  }

  async activar(id) {
    const f = this.familias.get(id);
    if (!f || !f.disponible || this.activas.has(id)) return;
    await asegurarPMTiles();
    this.activas.set(id, new Set(f.subtipos.map((s) => s.id)));
    this.#instalar(f);
    this.onCambio(this.totalActivas());
  }

  desactivar(id) {
    if (!this.activas.delete(id)) return;
    for (const capa of this.#idsCapas(id)) if (this.map.getLayer(capa)) this.map.removeLayer(capa);
    if (this.map.getSource(`cap-${id}`)) this.map.removeSource(`cap-${id}`);
    this.onCambio(this.totalActivas());
  }

  /** Muestra solo algunos subtipos de una familia (filtro en GPU, sin volver a descargar). */
  setSubtipos(id, subtipos) {
    if (!this.activas.has(id)) return;
    this.activas.set(id, new Set(subtipos));
    const filtro = ["in", ["get", "st"], ["literal", [...subtipos]]];
    for (const capa of this.#idsCapas(id)) if (this.map.getLayer(capa)) this.map.setFilter(capa, this.#filtroCapa(capa, filtro));
  }

  /** Tras cambiar el estilo base (tema), MapLibre borra las capas: se vuelven a montar las activas. */
  reinstalar() {
    for (const id of this.activas.keys()) this.#instalar(this.familias.get(id));
  }

  #idsCapas(id) {
    return [`cap-${id}-relleno`, `cap-${id}-linea`, `cap-${id}-punto`, `cap-${id}-texto`];
  }

  #filtroCapa(capa, filtroSubtipos) {
    if (capa.endsWith("-relleno")) return ["all", filtroSubtipos, ["==", ["geometry-type"], "Polygon"], ["in", ["get", "st"], ["literal", ["desiertos", "cordilleras", "peninsulas"]]]];
    if (capa.endsWith("-linea")) return ["all", filtroSubtipos, ["==", ["geometry-type"], "LineString"]];
    if (capa.endsWith("-punto")) return ["all", filtroSubtipos, ["==", ["geometry-type"], "Point"]];
    return filtroSubtipos;
  }

  #instalar(f) {
    const src = `cap-${f.id}`;
    if (this.map.getSource(src)) return;
    this.map.addSource(src, { type: "vector", url: `pmtiles://${new URL(f.manifest.archivo, location.href).href}` });
    const color = ["match", ["get", "st"]];
    for (const s of f.subtipos) color.push(s.id, s.color);
    color.push("#888888");
    const filtro = ["in", ["get", "st"], ["literal", [...this.activas.get(f.id)]]];
    const antes = this.map.getLayer("clusters") ? "clusters" : undefined; // los eventos siempre quedan encima
    const sl = f.id;

    if (f.geometria !== "punto") {
      this.map.addLayer({ id: `${src}-relleno`, type: "fill", source: src, "source-layer": sl, filter: this.#filtroCapa("-relleno", filtro),
        paint: { "fill-color": color, "fill-opacity": 0.08 } }, antes);
      this.map.addLayer({ id: `${src}-linea`, type: "line", source: src, "source-layer": sl, filter: this.#filtroCapa("-linea", filtro),
        paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 8, 1.6], "line-opacity": 0.8 } }, antes);
    }
    this.map.addLayer({ id: `${src}-punto`, type: "circle", source: src, "source-layer": sl, filter: this.#filtroCapa("-punto", filtro),
      paint: {
        "circle-color": color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 5, 12, 7],
        "circle-stroke-width": 1, "circle-stroke-color": "#ffffff",
      } }, antes);
    // Etiquetas solo desde cierto zoom y con detección de colisiones (no se encimen).
    this.map.addLayer({ id: `${src}-texto`, type: "symbol", source: src, "source-layer": sl, minzoom: f.zoom_etiquetas ?? 6, filter: filtro,
      layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 10, "text-offset": [0, 0.9], "text-anchor": "top",
        "text-optional": true, "symbol-sort-key": ["get", "z"] },
      paint: { "text-color": "#333F48", "text-halo-color": "#ffffff", "text-halo-width": 1.2 } }, antes);

    for (const capa of [`${src}-punto`, `${src}-linea`]) {
      this.map.on("click", capa, (e) => this.onEntidad({ familia: f, props: e.features[0].properties, lngLat: e.lngLat }));
      this.map.on("mouseenter", capa, () => { this.map.getCanvas().style.cursor = "pointer"; });
      this.map.on("mouseleave", capa, () => { this.map.getCanvas().style.cursor = ""; });
    }
  }
}

const ESTADO = { tiempo_real: "Tiempo real", retrasado: "Retrasado", estimado: "Estimado", estatico: "Estático" };
export const etiquetaEstado = (e) => ESTADO[e] || e;

/** Enlace a la ficha original de la fuente, cuando el id lo permite. */
export function urlFuente(id) {
  const [ns, v] = String(id).split(":");
  if (ns === "osm") return `https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[v[0]]}/${v.slice(1)}`;
  if (ns === "ourairports") return `https://ourairports.com/airports/${encodeURIComponent(v)}/`;
  if (ns === "gppd") return "https://datasets.wri.org/dataset/globalpowerplantdatabase";
  if (ns === "wpi") return "https://msi.nga.mil/Publications/WPI";
  if (ns === "ne") return "https://www.naturalearthdata.com";
  return null;
}

/** Ficha de una entidad del mapa (aeropuerto, puerto, central, zona…). */
export function htmlFichaEntidad({ familia, props, cercanos, seguido }) {
  const sub = familia.subtipos.find((s) => s.id === props.st);
  const url = urlFuente(props.id);
  const extra = familia.id === "centrales" ? `${esc(props.x)} MW` : familia.id === "aeropuertos" && props.x ? `IATA ${esc(props.x)}` : esc(props.x || "");
  return `
    <h3 id="ficha-titulo">${esc(props.n || "(sin nombre)")}</h3>
    <div class="fecha">${esc(sub?.nombre.es || props.st)} · ${esc(familia.nombre)}${props.p ? " · " + esc(props.p) : ""}</div>
    <div class="chips"><span class="chip estado-${esc(familia.estado_dato)}">Dato ${esc(etiquetaEstado(familia.estado_dato))}</span></div>
    <dl>
      ${extra ? `<dt>Detalle</dt><dd>${extra}</dd>` : ""}
      <dt>Fuente</dt><dd>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(familia.fuente)}</a>` : esc(familia.fuente)}</dd>
      <dt>Licencia</dt><dd>${esc(familia.licencia)}</dd>
      <dt>Actualizado</dt><dd>${esc(familia.manifest?.actualizado_utc?.slice(0, 10) || "—")}</dd>
    </dl>
    <button type="button" class="link-btn" id="btn-seguir" data-id="${esc(props.id)}" aria-pressed="${seguido}">${seguido ? "★ Siguiendo" : "☆ Seguir"}</button>
    <h4>Eventos a menos de 300 km (${cercanos.length})</h4>
    <ul class="fuentes">${cercanos.slice(0, 8).map((ev) => `<li><a href="#evento=${esc(ev.id)}" data-evento="${esc(ev.id)}">${esc(ev.titulo)}</a></li>`).join("") || "<li>Ninguno en los datos actuales.</li>"}</ul>
  `;
}
