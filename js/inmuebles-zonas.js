// Fase 5: zonas inmobiliarias de México en seguimiento (inmuebles.html, pestaña «Zonas México»).
// Funciones puras. DOMINUS no copia anuncios de portales: arma enlaces de búsqueda que abre la persona usuaria
// y cruza las zonas con los desarrollos que ya tiene (ARA, SADASI y config/inmuebles_desarrollos).
import { esc, safeUrl } from "./util.js";

const R_TIERRA = 6371;
export function distanciaKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(h));
}

const TIPO_BUSQUEDA = { departamento: "departamento", casa: "casa", terreno: "terreno", hacienda: "hacienda", "condominio de playa": "condominio frente al mar" };

/**
 * Consulta de texto para una colonia o zona: «casa en venta Cholul Mérida Yucatán». Fuera de México se arma en el idioma
 * del país (`venta` y `tipos` del catálogo mundial: «appartamento vendita Positano»), que es como buscan sus portales.
 */
export const consulta = (z, tipo = "", colonia = "", { venta = "en venta", tipos = null } = {}) =>
  [(tipos ? tipos[tipo] : TIPO_BUSQUEDA[tipo]) || tipo, venta, colonia, colonia === z.ciudad ? "" : z.ciudad, z.estado].filter(Boolean).join(" ");

/**
 * Enlaces de búsqueda («solo enlace») de una zona: uno por portal (búsqueda del sitio en Google, porque las URL internas
 * de los portales cambian) y uno general. La página del portal la abre quien consulta; aquí no se descarga nada.
 */
export function enlacesZona(z, portales = [], { tipo = "", colonia = "", idioma = null } = {}) {
  const q = consulta(z, tipo, colonia, idioma || {});
  const g = (s) => `https://www.google.com/search?q=${encodeURIComponent(s)}`;
  return [
    ...portales.map((p) => [p.nombre, g(`site:${p.dominio} ${q}`)]),
    ["Búsqueda general", g(q)],
    ["Desarrollos nuevos y preventas", g(idioma ? `${q} new development` : `preventa ${q.replace(" en venta", "")} desarrolladora`)],
  ];
}

/** Desarrollos ya en seguimiento dentro del radio de la zona, del más cercano al más lejano. */
export function ofertasEnZona(z, ofertas = []) {
  return ofertas.filter((o) => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)) && o.lat !== null && o.lon !== null)
    .map((o) => ({ ...o, km: distanciaKm(z.lat, z.lon, Number(o.lat), Number(o.lon)) }))
    .filter((o) => o.km <= z.radio_km)
    .sort((a, b) => a.km - b.km);
}

export const ciudadesZonas = (cat, pais = "") => [...new Set((cat?.zonas || []).filter((z) => !pais || z.pais_iso3 === pais).map((z) => z.ciudad))];

export function filtrarZonas(cat, { pais = "", ciudad = "", tipo = "" } = {}) {
  return (cat?.zonas || []).filter((z) => (!pais || z.pais_iso3 === pais) && (!ciudad || z.ciudad === ciudad) && (!tipo || z.tipos.includes(tipo)));
}

/** Une el catálogo de México y el mundial en uno: cada zona sabe sus portales, su idioma y el nombre de su país. */
export function unirCatalogos(mx, mundo) {
  const paises = { MEX: { nombre: "México", portales: mx?.portales || [], riesgos: [], compra: "" }, ...(mundo?.paises || {}) };
  const idiomaDe = (iso) => {
    const l = paises[iso]?.idioma;
    return l ? { venta: mundo.venta[l], tipos: mundo.tipos_idioma[l] } : null;
  };
  return { paises, oficiales: mx?.oficiales || [], idiomaDe, zonas: [...(mx?.zonas || []), ...(mundo?.zonas || [])] };
}

const a = (t, u) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
const fmt = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("es-MX"));

/** Tarjeta de una zona: búsquedas por tipo, colonias, riesgos, referencias de prensa y desarrollos cercanos. */
export function htmlZona(z, portales, ofertas = [], tipoElegido = "", { idioma = null, pais = null, compra = "" } = {}) {
  const tipos = tipoElegido && z.tipos.includes(tipoElegido) ? [tipoElegido] : z.tipos;
  const cerca = ofertasEnZona(z, ofertas);
  const riesgos = [...z.riesgos, ...(pais?.riesgos || [])];
  return `<details class="tarjeta" data-zona="${esc(z.id)}"><summary>${pais && z.pais_iso3 !== "MEX" ? `${esc(pais.nombre)} · ` : ""}<b>${esc(z.ciudad)}</b> · ${esc(z.zona)} <span class="meta">(${esc(z.tipos.join(", "))}${cerca.length ? ` · ${cerca.length} desarrollo(s) en seguimiento` : ""})</span></summary>
    ${tipos.map((t) => `<p><b>Buscar ${esc(t)} (solo enlace):</b> ${enlacesZona(z, portales, { tipo: t, idioma }).map(([n, u]) => a(n, u)).join(" · ")}</p>`).join("")}
    <p><b>Por ${z.pais_iso3 === "MEX" ? "colonia" : "barrio o lugar"}:</b> ${z.colonias.map((c) => a(c, enlacesZona(z, [], { tipo: tipos[0], colonia: c, idioma })[0][1])).join(" · ")}</p>
    ${z.excluir ? `<p class="meta">Fuera de alcance: ${esc(z.excluir)}</p>` : ""}
    ${compra ? `<p><b>🇲🇽 Para una persona mexicana:</b> ${esc(compra)}</p>` : ""}
    ${riesgos.length ? `<p><b>Riesgos de la zona y del país</b></p><ul class="lista-corta">${riesgos.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    ${(z.referencias || []).length ? `<p><b>Referencias de precio (prensa):</b></p><ul class="lista-corta">${z.referencias.map((r) => `<li>${esc(r.texto)} ${a(`${r.fuente}, ${r.fecha}`, r.url)}</li>`).join("")}</ul>` : ""}
    ${cerca.length ? `<p><b>Desarrollos en seguimiento a ${esc(String(z.radio_km))} km o menos:</b></p><ul class="lista-corta">${cerca.slice(0, 12).map((o) =>
      `<li>${o.url ? a(`${o.desarrolladora || ""} · ${o.proyecto || o.ciudad || ""}`, o.url) : esc(o.proyecto || "")} <span class="meta">· desde ${fmt(o.precio_desde)} ${esc(o.moneda || "")} · ${o.km.toFixed(1)} km${o.visto ? ` · consultado ${esc(o.visto)}` : ""}</span></li>`).join("")}</ul>` : ""}
    <p class="meta">Centro de la zona: ${z.lat}, ${z.lon} (${esc(z.precision)}), radio ${esc(String(z.radio_km))} km.</p>
    <p><button type="button" class="btn" data-evaluar="${z.lat},${z.lon},${esc(z.pais_iso3)}" data-nombre="${esc(`${z.ciudad} · ${z.zona}`)}">Evaluar el centro de la zona</button>
      ${a("Ver en OpenStreetMap", `https://www.openstreetmap.org/?mlat=${z.lat}&mlon=${z.lon}#map=14/${z.lat}/${z.lon}`)}</p></details>`;
}
