// Capas de entidades (Eje 2). Carga perezosa: nada se descarga hasta que el usuario activa una capa.
//
// - Las capas estáticas son archivos .pmtiles en data/capas/: MapLibre pide solo los mosaicos visibles
//   mediante peticiones HTTP por rangos (el archivo completo nunca se descarga).
// - Solo se dibujan categorías "dibujable": true y subtipos con tipo_capa distinto de "ficha".
//   Las personas (rol público) nunca tienen capa: viven solo dentro de las fichas.
/* global maplibregl, pmtiles */
import { detalle as detalleOrg } from "./buscador_org.js";
import { esc, safeUrl, pinturaEtiqueta, layoutEtiqueta, hayObjetoEncima } from "./util.js";
import { htmlBloque as htmlErupcion } from "./erupcion.js";
import { htmlBandera } from "./banderas.js";

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
      (subtiposDe[s.familia] ||= []).push({ ...s, fuente_nombre: catalogo.fuentes?.[s.fuente]?.nombre || s.fuente });
    }
  }
  return capasCfg.familias
    // «oculta»: familia retirada del menú (p. ej. DENUE, cuya API del INEGI no responde); se conserva su configuración.
    .filter((f) => !f.oculta && catalogo.categorias.some((c) => c.id === f.categoria && c.dibujable))
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
        fuente_nombre: fuente.nombre || f.fuente,
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
    return [`cap-${id}-relleno`, `cap-${id}-linea`, `cap-${id}-ltoque`, `cap-${id}-punto`, `cap-${id}-toque`, `cap-${id}-texto`];
  }

  #filtroCapa(capa, filtroSubtiposBase) {
    // Zoom mínimo por objeto (propiedad "z"): los mosaicos llegan hasta z8 y la GPU oculta lo que no toca.
    const filtroSubtipos = ["all", filtroSubtiposBase, [">=", ["zoom"], ["coalesce", ["get", "z"], 0]]];
    if (capa.endsWith("-relleno")) {
      // Familias de coropleta (relleno: true en config/capas.json) se rellenan completas; en «zonas» solo algunas.
      const fam = this.familias.get(capa.replace(/^cap-/, "").replace(/-relleno$/, ""));
      return fam?.relleno ? ["all", filtroSubtipos, ES_POLIGONO]
        : ["all", filtroSubtipos, ES_POLIGONO, ["in", ["get", "st"], ["literal", RELLENO_ZONAS]]];
    }
    // Líneas: las líneas y, de los polígonos de «zonas» que no se rellenan (países, mares, regiones…), su contorno;
    // así cada subtipo se ve al marcarlo y no solo su nombre (que el mapa oculta si choca con otras etiquetas).
    if (capa.endsWith("-linea") || capa.endsWith("-ltoque")) return ["all", filtroSubtipos, ["any", ES_LINEA, ["all", ES_POLIGONO, ["in", ["get", "st"], ["literal", BORDE_ZONAS]]]]];
    if (capa.endsWith("-punto")) return ["all", filtroSubtipos, ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]]];
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
        // El Cinturón de Fuego va más grueso que el resto de los límites de placas para distinguirlo.
        paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 2, ["*", 0.6, GROSOR], 8, ["*", 1.6, GROSOR]], "line-opacity": 0.85 } }, antes);
      // Franja de toque invisible: las líneas miden menos de 2 px y serían casi imposibles de elegir.
      this.map.addLayer({ id: `${src}-ltoque`, type: "line", source: src, ...sl, filter: this.#filtroCapa("-ltoque", filtro),
        paint: { "line-color": "#000", "line-width": 10, "line-opacity": 0 } }, antes);
    }
    this.map.addLayer({ id: `${src}-punto`, type: "circle", source: src, ...sl, filter: this.#filtroCapa("-punto", filtro),
      paint: {
        "circle-color": color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 5, 12, 7],
        // Recursos operados por una compañía con sede en otro país (nac = e) o mixta (m): borde oscuro y más grueso.
        "circle-stroke-width": ["match", ["get", "nac"], ["e", "m"], 2, 1],
        "circle-stroke-color": ["match", ["get", "nac"], ["e", "m"], "#1A1A1A", "#ffffff"],
      } }, antes);
    // Zona de toque invisible para elegir puntos pequeños (miden 2.5 px a zoom bajo).
    this.map.addLayer({ id: `${src}-toque`, type: "circle", source: src, ...sl, filter: this.#filtroCapa("-punto", filtro),
      paint: { "circle-radius": 9, "circle-opacity": 0, "circle-stroke-width": 0 } }, antes);
    // Etiquetas solo desde cierto zoom y con detección de colisiones (no se encimen).
    this.map.addLayer({ id: `${src}-texto`, type: "symbol", source: src, ...sl, minzoom: f.zoom_etiquetas ?? 6, filter: this.#filtroCapa("-texto", filtro),
      layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 11, "text-offset": [0, 0.9], "text-anchor": "top",
        "symbol-sort-key": ["get", "z"], "symbol-avoid-edges": true, ...layoutEtiqueta(this.map) },
      paint: pinturaEtiqueta() }, antes);

    for (const capa of [`${src}-toque`, ...(f.geometria !== "punto" ? [`${src}-ltoque`] : []), ...(f.relleno ? [`${src}-relleno`] : [])]) {
      this.map.on("click", capa, (e) => {
        if (capa.endsWith("-relleno") && hayObjetoEncima(this.map, e.point)) return;  // el punto de encima tiene prioridad
        if (capa.endsWith("-ltoque") && this.map.queryRenderedFeatures(e.point, { layers: [`${src}-toque`] }).length) return;
        this.onEntidad({ familia: f, props: e.features[0].properties, lngLat: e.lngLat, geom: e.features[0].geometry });
      });
      this.map.on("mouseenter", capa, () => { this.map.getCanvas().style.cursor = "pointer"; });
      this.map.on("mouseleave", capa, () => { this.map.getCanvas().style.cursor = ""; });
    }
  }
}

// Subtipos de «Zonas geográficas» que se rellenan (los demás polígonos, como mares o placas, solo llevan su nombre).
const RELLENO_ZONAS = ["desiertos", "cordilleras", "peninsulas", "mesetas", "llanuras", "valles", "canones", "cuencas", "deltas_humedales",
  "tundras", "glaciares", "istmos", "costas", "piedemonte", "plataformas_hielo", "lagos", "islas"];
// Polígonos de «zonas» que llevan solo contorno (rellenarlos taparía el mapa).
const BORDE_ZONAS = ["paises", "oceanos", "mares", "golfos_bahias", "estrechos", "regiones", "placas_tectonicas"];
// MapLibre puede dar el tipo «Multi…» en GeoJSON: se aceptan ambos.
const ES_POLIGONO = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
const ES_LINEA = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];

const GROSOR = ["match", ["get", "st"], "cinturon_fuego", 3.2, 1];

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

// Países que representa una embajada (OSM los da en ISO2); los no listados se muestran con su código.
const NOMBRES_ISO2 = new Intl.DisplayNames(["es"], { type: "region" });
const nombrePaisCorto = (c) => { try { return c.length === 2 ? NOMBRES_ISO2.of(c.toUpperCase()) : c; } catch (e) { return c; } };

const NACIONALIDAD = { n: "Nacional: la compañía tiene su sede en el mismo país del sitio",
  e: "Extranjera: la compañía tiene su sede en otro país", m: "Mixta: participan compañías nacionales y extranjeras" };

/** Fila «Quién lo opera»: compañía, bandera del país de su sede y si es nacional o extranjera (props.op, o, nac, est). */
export function htmlOperador(props) {
  if (!props?.op && !props?.o) return "";
  const paises = String(props.o || "").split(",").filter(Boolean);
  const banderas = paises.map((c) => `${htmlBandera(c)}${esc(nombrePaisCorto(c))}`).join(", ");
  return `<dt>Quién lo opera</dt><dd>${esc(props.op || "Compañía sin nombre en la fuente")}${banderas ? ` · ${banderas}` : ""}
    ${props.nac ? `<br><span class="chip">${esc(NACIONALIDAD[props.nac] || "")}</span>` : ""}${props.est === "1" || props.est === 1 ? ` <span class="chip">Empresa estatal</span>` : ""}
    <br><small>Sede de la compañía, según Wikidata o la tabla propia de operadores. El recurso del subsuelo suele ser de la nación; la compañía opera por concesión o contrato.</small></dd>`;
}

/** Coordenadas del objeto (si es un punto) o del clic. */
const coordsDe = (geom, lngLat) => (geom?.type === "Point" ? { lon: geom.coordinates[0], lat: geom.coordinates[1] } : { lon: lngLat.lng, lat: lngLat.lat });

/** Ficha de una entidad del mapa (aeropuerto, puerto, central, zona…). */
export function htmlFichaEntidad({ familia, props, cercanos, seguido, personas = [], lngLat, geom }) {
  const sub = familia.subtipos.find((s) => s.id === props.st);
  if (familia.id === "camaras") return htmlFichaCamara(props, sub);
  if (familia.id === "conflicto") return htmlFichaConflicto(props, sub);
  if (familia.id === "religiones") return htmlFichaReligion(props, familia);
  if (familia.id === "gobierno_forma" || familia.id === "gobierno_orientacion") return htmlFichaGobierno(props, familia);
  if (familia.id === "inmuebles_seguimiento") { const c = coordsDe(geom, lngLat || { lng: null, lat: null }); return htmlFichaInmueble({ ...props, _coords: [c.lon, c.lat] }, sub, familia); }
  const url = urlFuente(props.id);
  const extra = familia.id === "centrales" ? `${esc(props.x)} MW` : familia.id === "aeropuertos" && props.x ? `IATA ${esc(props.x)}`
    : familia.id === "embajadas" ? esc(detalleOrg({ familia: "embajadas", x: String(props.x || "") }, nombrePaisCorto)) : esc(props.x || "");
  return `
    <h3 id="ficha-titulo">${esc(props.n || sub?.nombre.es || "(sin nombre)")}</h3>
    <div class="fecha">${esc(sub?.nombre.es || props.st)} · ${esc(familia.nombre)}${props.p ? " · " + esc(props.p) : ""}</div>
    <div class="chips"><span class="chip estado-${esc(familia.estado_dato)}">Dato ${esc(etiquetaEstado(familia.estado_dato))}</span></div>
    <dl>
      ${extra ? `<dt>Detalle</dt><dd>${extra}</dd>` : ""}
      ${htmlOperador(props)}
      <dt>Fuente</dt><dd>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(sub?.fuente_nombre || familia.fuente_nombre || familia.fuente)}</a>` : esc(sub?.fuente_nombre || familia.fuente_nombre || familia.fuente)}</dd>
      <dt>Licencia</dt><dd>${esc(sub?.licencia || familia.licencia)}</dd>
      <dt>Actualizado</dt><dd>${esc(familia.manifest?.actualizado_utc?.slice(0, 10) || "—")}</dd>
    </dl>
    ${familia.id === "zonas" && /^volcanes/.test(props.st) && (geom || lngLat) ? htmlErupcion({ ...coordsDe(geom, lngLat), nombre: props.n || "Volcán",
      tipo: String(props.x || "").split(" · ")[1] || "", pais: String(props.x || "").split(" · ")[0] || "", gvp: (String(props.id).match(/^gvp:(\d+)/) || [])[1] || "" }) : ""}
    ${personas.length ? `<h4>Personas con rol público</h4><ul class="fuentes">${personas.map((p) => `<li>${esc(p.nombre)} · ${esc(p.cargo)} · <a href="${esc(p.wikidata)}" target="_blank" rel="noopener noreferrer">Wikidata</a></li>`).join("")}</ul>` : ""}
    <button type="button" class="link-btn" id="btn-seguir" data-id="${esc(props.id)}" aria-pressed="${seguido}">${seguido ? "★ Siguiendo" : "☆ Seguir"}</button>
    <h4>Eventos a menos de 300 km (${cercanos.length})</h4>
    <ul class="fuentes">${cercanos.slice(0, 8).map((ev) => `<li><a href="#evento=${esc(ev.id)}" data-evento="${esc(ev.id)}">${esc(ev.titulo)}</a></li>`).join("") || "<li>Ninguno en los datos actuales.</li>"}</ul>
  `;
}

/** Ficha de un inmueble en seguimiento (InmuebleWarRoom): precio, riesgo, revisión geológica automática y anuncio original. */
export function htmlFichaInmueble(props, sub, familia) {
  const m2 = (n) => (n == null || n === "" || n === "null" ? "—" : `${Number(n).toLocaleString("es-MX")} m²`);
  const fila = (k, v) => (v && v !== "null" ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : "");
  const si = (v) => v === true || v === "true";
  const alerta = si(props.geo_alerta), auto = si(props.auto);
  const [lon, lat] = props._coords || [];
  const REHAB = { no: "No (nuevo o listo para habitar)", ligera: "Sí, ligera", integral: "Sí, integral", desconocido: "Sin dato" };
  const COMPRA = { "sí": "✅ Sí", "con restricciones": "⚠️ Con restricciones", no: "⛔ No" };
  const evaluar = lat != null ? `inmuebles.html?lat=${Number(lat).toFixed(5)}&lon=${Number(lon).toFixed(5)}&pais=${encodeURIComponent(props.p || "")}&nombre=${encodeURIComponent(props.n || "")}` : "";
  const fuente = props.origen === "ARA/SADASI" ? `<a href="https://github.com/zoetzerlpetrov-gif/InmueblesAraSadasi" target="_blank" rel="noopener noreferrer">InmueblesAraSadasi</a> (sitios de ARA y SADASI, cada lunes)`
    : props.origen === "Desarrollos por país" ? `${esc(props.fuente_t || "sitio de la desarrolladora")}${props.visto ? `, consultado el ${esc(props.visto)}` : ""} (lista de DOMINUS por país)`
    : `<a href="https://github.com/zoetzerlpetrov-gif/inmueblewarroom" target="_blank" rel="noopener noreferrer">InmuebleWarRoom</a> (lista propia, revisada a mano)`;
  return `
    <h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">${esc(props.pais_n)} · ${esc(familia.nombre)}</div>
    <div class="chips"><span class="chip" style="background:${esc(sub?.color || "#999")};color:#111;border-color:${esc(sub?.color || "#999")}">${esc(sub?.nombre.es || props.st)}${auto ? " (geológico automático)" : ""}</span></div>
    <dl>
      ${fila("Precio publicado", props.x)}${fila("Tipo", props.tipo)}${fila("Zona de búsqueda", props.zona_objetivo)}${fila("Desarrolladora o agencia", props.desarrolladora)}${fila("Proyecto", props.proyecto)}${fila("Zona", props.zona)}
      ${fila("Modelos y precios", props.modelos)}
      ${props.terreno != null && props.terreno !== "null" ? `<dt>Terreno</dt><dd>${m2(props.terreno)}</dd>` : ""}
      ${props.construccion != null && props.construccion !== "null" ? `<dt>Construcción</dt><dd>${m2(props.construccion)}${props.construccion_max && props.construccion_max !== "null" ? ` a ${m2(props.construccion_max)}` : ""}</dd>` : ""}
      ${fila("Recámaras", props.recamaras)}${fila("Entrega", props.entrega)}
      ${props.nuevo != null && props.nuevo !== "" ? `<dt>Construcción nueva</dt><dd>${si(props.nuevo) ? "Sí" : "No"}</dd>` : ""}${props.rehab ? `<dt>¿Requiere rehabilitación?</dt><dd>${esc(REHAB[props.rehab] || props.rehab)}</dd>` : ""}
      ${props.compra ? `<dt>¿Una persona mexicana puede comprar?</dt><dd>${esc(COMPRA[props.compra] || props.compra)}</dd>` : ""}
      ${fila("Nota legal", props.legal)}${fila("Costa y playa", props.costa)}
      ${fila("Riesgos del sitio", props.riesgo)}
      ${props.geo ? `<dt>Revisión automática</dt><dd>${alerta ? "⚠️ " : ""}${esc(props.geo)}${alerta ? " (cerca: revisa el atlas de riesgos local)" : ""}</dd>` : ""}
      ${fila("Precio frente al mercado", props.mercado)}${fila("Ciudad cercana", props.ciudad)}${fila("Aeropuerto", props.aeropuerto)}
      ${fila("Nota", props.nota)}${props.precision && props.precision !== "proyecto" ? `<dt>Ubicación</dt><dd>Aproximada (centro de la ${props.precision === "colonia" ? "colonia o barrio" : "ciudad"})</dd>` : ""}
      <dt>Fuente</dt><dd>${fuente}</dd>
    </dl>
    ${props.url ? `<p><a class="boton" href="${esc(safeUrl(props.url))}" target="_blank" rel="noopener noreferrer">Ver la página original ↗</a></p>` : ""}
    ${evaluar ? `<p><a class="boton" href="${esc(evaluar)}" target="_blank" rel="noopener">🧭 Evaluar riesgo completo (sismos, volcanes, pendiente, inundación, política e inseguridad)</a></p>` : ""}
    <p class="meta">El precio y la disponibilidad pueden haber cambiado desde que se registró${auto ? "; confirma con la desarrolladora antes de decidir" : ""}. ${auto ? "El color de este punto solo considera la distancia a volcanes del Holoceno (Smithsonian GVP) y a límites de placas (PB2002); la seguridad, inundación y deslaves se calculan con «Evaluar riesgo completo»." : "La revisión automática solo mide distancias a volcanes del Holoceno y a límites de placas; no sustituye un dictamen de riesgos."} No es una recomendación de inversión.</p>`;
}

/** Ficha de cámara pública; solo solicita medios cuando el usuario abre la ficha. */
export function htmlFichaCamara(props, sub) {
  const oficial = props.t === "organismo_publico";
  const deYoutube = props.t === "canal_youtube";
  const publico = (u) => {
    try {
      const v = new URL(String(u || ""));
      if (v.protocol !== "https:" || v.username || v.password || !v.hostname.includes(".") ||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v.hostname) ||
          /\.(local|internal)$/.test(v.hostname)) return "";
      return v.href;
    } catch { return ""; }
  };
  let imgs = props.imgs || [];
  if (typeof imgs === "string") { try { imgs = JSON.parse(imgs); } catch { imgs = []; } }
  imgs = (Array.isArray(imgs) ? imgs : []).map(publico).filter(Boolean).slice(0, 4);
  const mp4 = publico(props.mp4), hls = publico(props.hls);
  const medio = mp4 || hls;
  const ok = imgs.length > 0 || medio || props.sg || props.catalogo_utc || String(props.v || "").startsWith("ok");
  // Conservar la URL exacta del operador: agregar parámetros rompe algunos servicios y firmas.
  const galeria = imgs.length ? `<div class="cam-imgs">${imgs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Vista ${i + 1} de ${esc(props.n)}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>
    <p class="meta">Imagen fija del servidor de ${esc(props.o)}${props.lic ? ` · licencia ${esc(props.lic)}` : ""}. No se guarda en este sitio. Si no carga, consulta al operador.</p>` : "";
  const original = medio ? `<div class="cam-reproductor"><div class="cam-video"><video controls playsinline preload="none" ${imgs[0] ? `poster="${esc(imgs[0])}"` : ""}>
      <source src="${esc(medio)}" type="${mp4 ? "video/mp4" : "application/vnd.apple.mpegurl"}"></video></div>${hls && !mp4 ? `<button type="button" class="boton" data-camara-hls="${esc(hls)}">Cargar video HLS</button>` : ""}</div>
      <p class="meta">${mp4 ? "Clip reciente; no es una transmisión continua." : "Video HLS del operador; pulsa «Cargar video HLS». Si no responde, abre la página oficial."}
      <a href="${esc(medio)}" target="_blank" rel="noopener noreferrer">Abrir video original ↗</a></p>` : "";
  const yt = /^[\w-]{11}$/.test(String(props.yt || "")) ? props.yt : "";
  const video = yt ? `<div class="cam-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&playsinline=1" title="En vivo: ${esc(props.n)}"
      allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="meta">En vivo con el reproductor de YouTube · transmisión de ${esc(props.o)}${props.lugar ? ` · ${esc(props.lugar)}` : ""}. Si la transmisión cambió, ábrela en su página.</p>` : "";
  const sgId = /^\d{1,6}$/.test(String(props.sg || "")) ? props.sg : "";
  const sg = sgId ? `<figure class="cam-sg" data-sg="${sgId}"><p class="meta">Pidiendo la imagen más reciente a data.gov.sg…</p></figure>` : "";
  return `
    <h3 id="ficha-titulo">${esc(props.n)}</h3>
    <div class="fecha">${esc(sub?.nombre.es || props.st)} · ${esc(props.o)}</div>
    <div class="chips"><span class="chip">${oficial ? "Organismo público" : deYoutube ? "Transmisión pública en YouTube" : "Operador turístico (publicación intencional)"}</span>${yt ? `<span class="chip estado-tiempo_real">En vivo</span>` : ""}
      ${Number(props.aprox) ? `<span class="chip">Ubicación aproximada</span>` : ""}
      ${props.catalogo_anterior ? `<span class="chip alerta">Catálogo anterior: actualización pendiente</span>` : ""}
      ${props.demorada ? `<span class="chip alerta">Imagen demorada según el operador</span>` : ""}
      ${ok ? "" : `<span class="chip alerta">Enlace sin confirmar en la última revisión</span>`}</div>
    ${original}${galeria}${sg}${video}
    <p><a class="boton" href="${esc(safeUrl(props.x))}" target="_blank" rel="noopener noreferrer">${deYoutube ? "Ver en YouTube" : imgs.length || medio ? "Sitio del operador" : "Ver la cámara en el sitio oficial"} ↗</a>
      ${deYoutube && props.canal ? ` <a href="${esc(safeUrl(props.canal))}" target="_blank" rel="noopener noreferrer">Canal ↗</a>` : ""}</p>
    ${props.nota ? `<p>${esc(props.nota)}</p>` : ""}
    ${props.credito ? `<p class="meta">Crédito: ${esc(props.credito)}</p>` : ""}
    ${props.lic_url && publico(props.lic_url) ? `<p class="meta"><a href="${esc(publico(props.lic_url))}" target="_blank" rel="noopener noreferrer">Licencia y condiciones del operador ↗</a></p>` : ""}
    ${props.captura_utc ? `<p class="meta">Fecha de la imagen publicada por el operador: ${esc(props.captura_utc)}</p>` : ""}
    ${props.catalogo_utc ? `<p class="meta">Catálogo consultado: ${esc(props.catalogo_utc)}. No confirma que la imagen sea actual ni que la cámara esté operativa.</p>` : ""}
    ${props.v ? `<dl><dt>Revisión del enlace</dt><dd>${esc(props.v)}</dd></dl>` : ""}
    <p class="meta">Solo se incluyen cámaras que su operador publica para verse en abierto; nunca cámaras expuestas por error. La imagen se muestra desde el servidor del operador, sin copiarla.</p>`;
}

/** Imagen vigente de una cámara de Singapur (API abierta de data.gov.sg, se actualiza cada minuto). */
export async function rellenarCamaraSingapur(fig, pedir = (u) => fetch(u, { cache: "no-store" }).then((r) => r.json())) {
  try {
    const d = await pedir("https://api.data.gov.sg/v1/transport/traffic-images");
    const c = (d?.items?.[0]?.cameras || []).find((x) => String(x.camera_id) === fig.dataset.sg);
    if (!c || !/^https:\/\//.test(c.image || "")) throw new Error("sin imagen");
    fig.innerHTML = `<a href="${esc(c.image)}" target="_blank" rel="noopener noreferrer"><img src="${esc(c.image)}" alt="Cámara ${esc(fig.dataset.sg)}" referrerpolicy="no-referrer"></a>
      <figcaption class="meta">Tomada ${esc(String(c.timestamp || "").replace("T", " ").slice(0, 16))} (hora de Singapur) · LTA vía data.gov.sg, Singapore Open Data Licence.</figcaption>`;
  } catch (e) { fig.innerHTML = `<p class="meta">data.gov.sg no devolvió la imagen ahora; ábrela en el sitio del operador.</p>`; }
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
    ${htmlInstituciones(jsonDe(props.instituciones, {}))}
    ${props.p ? `<p><button type="button" class="boton" data-historia="${esc(props.p)}">📜 Historia de ${esc(props.n)}</button></p>` : ""}
    <p class="meta">La orientación es la del partido de quien encabeza el gobierno (primer ministro en sistemas parlamentarios y monarquías constitucionales; presidente o monarca en los demás), según lo registrado en Wikidata, que cualquiera puede editar y cuyas fuentes varían. No es una opinión de este sitio. Un gobierno de coalición se clasifica por el partido de su jefe. «Deducida»: Wikidata solo dice «república»; si la misma persona encabeza Estado y gobierno se toma como presidencial, y si gobierna un partido comunista, como partido único. «Estimada por ideología»: el partido no tiene alineación registrada y se ubica con sus ideologías. Si hay dos alineaciones a medio camino (p. ej. «derecha» y «extrema derecha»), se toma la más cercana al centro. Para la otra vista activa «${esc(otra === "gobierno_forma" ? "Forma de gobierno" : "Orientación política")}».</p>`;
}

/** Poder ejecutivo (con sitio oficial) y legislativo según Wikidata. */
export function htmlInstituciones(inst) {
  const wdl = (q, t) => `<a href="https://www.wikidata.org/wiki/${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
  const e = inst?.ejecutivo, l = inst?.legislativo;
  if (!e && !l) return "";
  return `<h4>Instituciones</h4><dl>
    ${e ? `<dt>Poder ejecutivo</dt><dd>${wdl(e[1], e[0])}${e[2] ? ` · <a href="${esc(safeUrl(e[2]))}" target="_blank" rel="noopener noreferrer">sitio oficial (gabinete al día)</a>` : ""}</dd>` : ""}
    ${l?.length ? `<dt>Poder legislativo</dt><dd>${(Array.isArray(l[0]) ? l : [l]).map(([n, q]) => wdl(q, n)).join(" · ")}</dd>` : ""}</dl>`;
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

