// Capas de entidades (Eje 2). Carga perezosa: nada se descarga hasta que el usuario activa una capa.
//
// - Las capas estáticas son archivos .pmtiles en data/capas/: MapLibre pide solo los mosaicos visibles
//   mediante peticiones HTTP por rangos (el archivo completo nunca se descarga).
// - Solo se dibujan categorías "dibujable": true y subtipos con tipo_capa distinto de "ficha".
//   Las personas (rol público) nunca tienen capa: viven solo dentro de las fichas.
/* global maplibregl, pmtiles */
import { esc, safeUrl, pinturaEtiqueta, hayObjetoEncima } from "./util.js";

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
        // "parcial": alguna zona del mundo no respondió (p. ej. límite de Overpass); se muestra con aviso.
        disponible: Boolean(f.habilitada && m && ["ok", "parcial", "desactualizada"].includes(m.estado) && m.archivo),
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
    if (f.manifest.formato !== "geojson") await asegurarPMTiles();
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
    return [`cap-${id}-relleno`, `cap-${id}-linea`, `cap-${id}-punto`, `cap-${id}-toque`, `cap-${id}-texto`];
  }

  #filtroCapa(capa, filtroSubtiposBase) {
    // Zoom mínimo por objeto (propiedad "z"): los mosaicos llegan hasta z8 y la GPU oculta lo que no toca.
    const filtroSubtipos = ["all", filtroSubtiposBase, [">=", ["zoom"], ["coalesce", ["get", "z"], 0]]];
    if (capa.endsWith("-relleno")) {
      // Familias de coropleta (relleno: true en config/capas.json) se rellenan completas; en «zonas» solo algunas.
      const fam = this.familias.get(capa.replace(/^cap-/, "").replace(/-relleno$/, ""));
      return fam?.relleno ? ["all", filtroSubtipos, ["==", ["geometry-type"], "Polygon"]]
        : ["all", filtroSubtipos, ["==", ["geometry-type"], "Polygon"], ["in", ["get", "st"], ["literal", ["desiertos", "cordilleras", "peninsulas"]]]];
    }
    if (capa.endsWith("-linea")) return ["all", filtroSubtipos, ["==", ["geometry-type"], "LineString"]];
    if (capa.endsWith("-punto")) return ["all", filtroSubtipos, ["==", ["geometry-type"], "Point"]];
    return filtroSubtipos;
  }

  #instalar(f) {
    const src = `cap-${f.id}`;
    if (this.map.getSource(src)) return;
    const geojson = f.manifest.formato === "geojson";
    // Familias pequeñas (cientos de puntos) se sirven como GeoJSON; las grandes, como PMTiles por rangos.
    this.map.addSource(src, geojson ? { type: "geojson", data: f.manifest.archivo } : { type: "vector", url: `pmtiles://${new URL(f.manifest.archivo, location.href).href}` });
    const color = ["match", ["get", "st"]];
    for (const s of f.subtipos) color.push(s.id, s.color);
    color.push("#888888");
    const filtro = ["in", ["get", "st"], ["literal", [...this.activas.get(f.id)]]];
    const antes = this.map.getLayer("clusters") ? "clusters" : undefined; // los eventos siempre quedan encima
    const sl = geojson ? {} : { "source-layer": f.id };

    if (f.geometria !== "punto") {
      this.map.addLayer({ id: `${src}-relleno`, type: "fill", source: src, ...sl, filter: this.#filtroCapa(`${src}-relleno`, filtro),
        paint: { "fill-color": f.relleno ? ["coalesce", ["get", "color"], color] : color, "fill-opacity": f.opacidad_relleno ?? 0.08,
          ...(f.relleno ? { "fill-outline-color": "rgba(255,255,255,0.35)" } : {}) } }, antes);
      this.map.addLayer({ id: `${src}-linea`, type: "line", source: src, ...sl, filter: this.#filtroCapa("-linea", filtro),
        paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 8, 1.6], "line-opacity": 0.8 } }, antes);
    }
    this.map.addLayer({ id: `${src}-punto`, type: "circle", source: src, ...sl, filter: this.#filtroCapa("-punto", filtro),
      paint: {
        "circle-color": color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 5, 12, 7],
        "circle-stroke-width": 1, "circle-stroke-color": "#ffffff",
      } }, antes);
    // Zona de toque invisible para elegir puntos pequeños (miden 2.5 px a zoom bajo).
    this.map.addLayer({ id: `${src}-toque`, type: "circle", source: src, ...sl, filter: this.#filtroCapa("-punto", filtro),
      paint: { "circle-radius": 9, "circle-opacity": 0, "circle-stroke-width": 0 } }, antes);
    // Etiquetas solo desde cierto zoom y con detección de colisiones (no se encimen).
    this.map.addLayer({ id: `${src}-texto`, type: "symbol", source: src, ...sl, minzoom: f.zoom_etiquetas ?? 6, filter: this.#filtroCapa("-texto", filtro),
      layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 11, "text-offset": [0, 0.9], "text-anchor": "top",
        "text-optional": true, "symbol-sort-key": ["get", "z"], "symbol-avoid-edges": true },
      paint: pinturaEtiqueta() }, antes);

    for (const capa of [`${src}-toque`, `${src}-linea`, ...(f.relleno ? [`${src}-relleno`] : [])]) {
      this.map.on("click", capa, (e) => {
        if (capa.endsWith("-relleno") && hayObjetoEncima(this.map, e.point)) return;  // el punto de encima tiene prioridad
        if (capa.endsWith("-linea") && this.map.queryRenderedFeatures(e.point, { layers: [`${src}-toque`] }).length) return;
        this.onEntidad({ familia: f, props: e.features[0].properties, lngLat: e.lngLat });
      });
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
  if (ns === "tgc") return `https://www.submarinecablemap.com/submarine-cable/${encodeURIComponent(v)}`;
  if (ns === "tgl") return `https://www.submarinecablemap.com/landing-point/${encodeURIComponent(v)}`;
  if (ns === "wd") return `https://www.wikidata.org/wiki/${encodeURIComponent(v)}`;
  return null;
}

/** Ficha de una entidad del mapa (aeropuerto, puerto, central, zona…). */
export function htmlFichaEntidad({ familia, props, cercanos, seguido, personas = [] }) {
  const sub = familia.subtipos.find((s) => s.id === props.st);
  if (familia.id === "camaras") return htmlFichaCamara(props, sub);
  if (familia.id === "conflicto") return htmlFichaConflicto(props, sub);
  if (familia.id === "religiones") return htmlFichaReligion(props, familia);
  if (familia.id === "gobierno_forma" || familia.id === "gobierno_orientacion") return htmlFichaGobierno(props, familia);
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
    ${personas.length ? `<h4>Personas con rol público</h4><ul class="fuentes">${personas.map((p) => `<li>${esc(p.nombre)} · ${esc(p.cargo)} · <a href="${esc(p.wikidata)}" target="_blank" rel="noopener noreferrer">Wikidata</a></li>`).join("")}</ul>` : ""}
    <button type="button" class="link-btn" id="btn-seguir" data-id="${esc(props.id)}" aria-pressed="${seguido}">${seguido ? "★ Siguiendo" : "☆ Seguir"}</button>
    <h4>Eventos a menos de 300 km (${cercanos.length})</h4>
    <ul class="fuentes">${cercanos.slice(0, 8).map((ev) => `<li><a href="#evento=${esc(ev.id)}" data-evento="${esc(ev.id)}">${esc(ev.titulo)}</a></li>`).join("") || "<li>Ninguno en los datos actuales.</li>"}</ul>
  `;
}

/** Ficha de una cámara: solo enlace a la página oficial del operador (la imagen no se copia). */
export function htmlFichaCamara(props, sub) {
  const oficial = props.t === "organismo_publico";
  // MapLibre entrega los arreglos de propiedades como texto JSON.
  let imgs = props.imgs || [];
  if (typeof imgs === "string") { try { imgs = JSON.parse(imgs); } catch (e) { imgs = []; } }
  imgs = imgs.filter((u) => /^https:\/\//.test(u)).slice(0, 4);
  const ok = imgs.length > 0 || String(props.v || "").startsWith("ok");
  const t = Math.floor(Date.now() / 300000); // evita la caché del navegador: imagen de los últimos 5 min
  const galeria = imgs.length ? `<div class="cam-imgs">${imgs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}${u.includes("?") ? "&" : "?"}t=${t}" alt="Vista ${i + 1} de ${esc(props.n)}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>
    <p class="meta">Imagen fija del servidor de ${esc(props.o)}${props.lic ? ` · licencia ${esc(props.lic)}` : ""}. No se guarda en este sitio.</p>` : "";
  return `
    <h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">${esc(sub?.nombre.es || props.st)} · ${esc(props.o)}</div>
    <div class="chips"><span class="chip">${oficial ? "Organismo público" : "Operador turístico (publicación intencional)"}</span>
      ${ok ? "" : `<span class="chip alerta">Enlace sin confirmar en la última revisión</span>`}</div>
    ${galeria}
    <p><a class="boton" href="${esc(safeUrl(props.x))}" target="_blank" rel="noopener noreferrer">${imgs.length ? "Sitio del operador" : "Ver la cámara en el sitio oficial"} ↗</a></p>
    ${props.nota ? `<p>${esc(props.nota)}</p>` : ""}
    ${props.v ? `<dl><dt>Revisión del enlace</dt><dd>${esc(props.v)}</dd></dl>` : ""}
    <p class="meta">Solo se incluyen cámaras que su operador publica para verse en abierto; nunca cámaras expuestas por error. La imagen se muestra desde el servidor del operador, sin copiarla.</p>`;
}

const jsonDe = (v, def) => { if (typeof v !== "string") return v ?? def; try { return JSON.parse(v); } catch (e) { return def; } };

/** Ficha de una celda de conflicto (UCDP): actores con su parte de la violencia registrada. */
export function htmlFichaConflicto(props, sub) {
  const actores = jsonDe(props.actores, []);
  return `<h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">${esc(sub?.nombre.es || props.st)} · ${esc(props.p || "")}</div>
    <div class="barras">${actores.map(([a, pct]) => `<div class="barra-fila"><span>${esc(a)}</span><span class="barra"><i style="width:${Number(pct) || 0}%"></i></span><b>${esc(pct)} %</b></div>`).join("")}</div>
    <dl><dt>Eventos</dt><dd>${esc(props.eventos)} en 24 meses</dd><dt>Muertes estimadas</dt><dd>${esc(props.muertes)}</dd><dt>Último evento</dt><dd>${esc(props.ultima || "—")}</dd>
      <dt>Fuente</dt><dd><a href="https://ucdp.uu.se/" target="_blank" rel="noopener noreferrer">UCDP, Universidad de Uppsala</a> (CC BY 4.0)</dd></dl>
    <p class="meta">Celda de 1° (~110 km). El porcentaje es la parte de la violencia registrada (eventos + muertes) atribuida a cada grupo no estatal. Mide violencia, no control: un grupo puede dominar sin violencia visible, y UCDP solo registra hechos con al menos una muerte.</p>`;
}

/** Ficha de un país en las capas de gobierno: forma, quién gobierna, su partido y la orientación según Wikidata. */
export function htmlFichaGobierno(props, familia) {
  const wd = (q, txt) => (q ? `<a href="https://www.wikidata.org/wiki/${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${esc(txt || q)}</a>` : esc(txt || "—"));
  const lista = (v) => jsonDe(v, []).join(", ");
  const color = (pre, id) => (familia.subtipos || []).find((s) => s.id === `${pre}${id}`)?.color || "#888";
  const otra = familia.id === "gobierno_forma" ? "gobierno_orientacion" : "gobierno_forma";
  return `<h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">${esc(familia.nombre)} · según Wikidata (${esc(props.fecha || "")})</div>
    <div class="chips">
      <span class="chip" style="border-color:${esc(familia.id === "gobierno_forma" ? color("gobforma_", props.forma) : "#888")}">🏛 ${esc(props.forma_txt)}${props.federal === true || props.federal === "true" ? " · federal" : ""}${props.forma_inferida === true || props.forma_inferida === "true" ? " (deducida)" : ""}</span>
      <span class="chip" style="border-color:${esc(familia.id === "gobierno_orientacion" ? color("gobor_", props.espectro) : "#888")}">🧭 ${esc(props.espectro_txt)}${props.origen_espectro === "ideología" && props.espectro !== "comunista" ? " (estimada por ideología)" : ""}</span>
    </div>
    <dl>
      <dt>Formas registradas</dt><dd>${esc(lista(props.formas_wd) || "—")}</dd>
      <dt>Jefe de Estado</dt><dd>${wd(props.jefe_estado_wd, props.jefe_estado)}</dd>
      <dt>Jefe de gobierno</dt><dd>${wd(props.jefe_gobierno_wd, props.jefe_gobierno)}</dd>
      <dt>Se clasifica por</dt><dd>${props.gobierna === "gobierno" ? "el jefe de gobierno" : props.gobierna === "estado" ? "el jefe de Estado" : "—"}</dd>
      <dt>Partido</dt><dd>${props.partido_wd ? wd(props.partido_wd, props.partido) : "Sin partido registrado"}</dd>
      <dt>Alineación del partido</dt><dd>${esc(lista(props.alineacion) || "sin dato")}</dd>
      <dt>Corrientes</dt><dd>${esc(lista(props.corrientes) || "—")}</dd>
      <dt>Ideologías</dt><dd>${esc(lista(props.ideologias) || "—")}</dd>
      <dt>Fuente</dt><dd>${wd(props.wd, "Wikidata")} (CC0)</dd>
    </dl>
    <p class="meta">La orientación es la del partido de quien encabeza el gobierno (primer ministro en sistemas parlamentarios y monarquías constitucionales; presidente o monarca en los demás), según lo registrado en Wikidata, que cualquiera puede editar y cuyas fuentes varían. No es una opinión de este sitio. Un gobierno de coalición se clasifica por el partido de su jefe. «Deducida»: Wikidata solo dice «república»; si la misma persona encabeza Estado y gobierno se toma como presidencial, y si gobierna un partido comunista, como partido único. «Estimada por ideología»: el partido no tiene alineación registrada y se ubica con sus ideologías. Si hay dos alineaciones a medio camino (p. ej. «derecha» y «extrema derecha»), se toma la más cercana al centro. Para la otra vista activa «${esc(otra === "gobierno_forma" ? "Forma de gobierno" : "Orientación política")}».</p>`;
}

const RELIGIONES = [["cristianismo", "Cristianismo"], ["islam", "Islam"], ["hinduismo", "Hinduismo"], ["budismo", "Budismo"], ["judaismo", "Judaísmo"],
  ["populares", "Populares o tradicionales"], ["otras", "Otras religiones"], ["sin_religion", "Sin afiliación"]];

/**
 * Our World in Data publica unas series en número de personas y otras en porcentaje. Si vienen conteos
 * (> 100), se convierten a % sobre la suma de los conteos y se descartan los porcentajes sueltos.
 */
export function porcentajesReligion(v) {
  const e = Object.entries(v);
  if (!e.some(([, x]) => x > 100)) return v;
  const cuentas = e.filter(([, x]) => x > 100 || x === 0);
  const total = cuentas.reduce((s, [, x]) => s + x, 0) || 1;
  return Object.fromEntries(cuentas.map(([k, x]) => [k, Math.round((x / total) * 1000) / 10]));
}

/** Ficha de un país en la capa de religiones: composición en barras. */
export function htmlFichaReligion(props, familia) {
  const pct = porcentajesReligion(jsonDe(props.porcentajes, {}));
  const color = Object.fromEntries((familia.subtipos || []).map((s) => [s.id.replace("religion_", ""), s.color]));
  const filas = RELIGIONES.filter(([k]) => pct[k] != null).sort((a, b) => pct[b[0]] - pct[a[0]]);
  return `<h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">Composición religiosa · ${esc(props.anio || "2020")}</div>
    <div class="barras">${filas.map(([k, n]) => `<div class="barra-fila"><span>${esc(n)}</span><span class="barra"><i style="width:${Math.min(100, pct[k])}%;background:${esc(color[k] || "#888")}"></i></span><b>${esc(pct[k])} %</b></div>`).join("")}</div>
    <p class="meta">«Populares o tradicionales» incluye religiones indígenas, chamanismo y animismo; «Otras», bahaí, sij, jainismo, sintoísmo, taoísmo, wicca y otras. Brujería y esoterismo no se miden por separado. «Sin afiliación» reúne a ateos, agnósticos y quienes no se identifican con ninguna.</p>
    <dl><dt>Fuente</dt><dd><a href="https://ourworldindata.org/religion" target="_blank" rel="noopener noreferrer">Pew Research Center vía Our World in Data</a> (CC BY 4.0)</dd></dl>`;
}
