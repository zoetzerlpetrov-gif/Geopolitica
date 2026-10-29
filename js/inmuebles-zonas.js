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

/** Consulta de texto para una colonia o zona: «casa en venta Cholul Mérida Yucatán». */
export const consulta = (z, tipo = "", colonia = "") =>
  [TIPO_BUSQUEDA[tipo] || tipo, "en venta", colonia, z.ciudad, z.estado].filter(Boolean).join(" ");

/**
 * Enlaces de búsqueda («solo enlace») de una zona: uno por portal (búsqueda del sitio en Google, porque las URL internas
 * de los portales cambian) y uno general. La página del portal la abre quien consulta; aquí no se descarga nada.
 */
export function enlacesZona(z, portales = [], { tipo = "", colonia = "" } = {}) {
  const q = consulta(z, tipo, colonia);
  const g = (s) => `https://www.google.com/search?q=${encodeURIComponent(s)}`;
  return [
    ...portales.map((p) => [p.nombre, g(`site:${p.dominio} ${q}`)]),
    ["Búsqueda general", g(q)],
    ["Desarrollos nuevos y preventas", g(`preventa ${q.replace(" en venta", "")} desarrolladora`)],
  ];
}

/** Desarrollos ya en seguimiento dentro del radio de la zona, del más cercano al más lejano. */
export function ofertasEnZona(z, ofertas = []) {
  return ofertas.filter((o) => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)) && o.lat !== null && o.lon !== null)
    .map((o) => ({ ...o, km: distanciaKm(z.lat, z.lon, Number(o.lat), Number(o.lon)) }))
    .filter((o) => o.km <= z.radio_km)
    .sort((a, b) => a.km - b.km);
}

export const ciudadesZonas = (cat) => [...new Set((cat?.zonas || []).map((z) => z.ciudad))];

export function filtrarZonas(cat, { ciudad = "", tipo = "" } = {}) {
  return (cat?.zonas || []).filter((z) => (!ciudad || z.ciudad === ciudad) && (!tipo || z.tipos.includes(tipo)));
}

const a = (t, u) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
const fmt = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("es-MX"));

/** Tarjeta de una zona: búsquedas por tipo, colonias, riesgos, referencias de prensa y desarrollos cercanos. */
export function htmlZona(z, portales, ofertas = [], tipoElegido = "") {
  const tipos = tipoElegido ? [tipoElegido] : z.tipos;
  const cerca = ofertasEnZona(z, ofertas);
  return `<details class="tarjeta" data-zona="${esc(z.id)}"><summary><b>${esc(z.ciudad)}</b> · ${esc(z.zona)} <span class="meta">(${esc(z.tipos.join(", "))}${cerca.length ? ` · ${cerca.length} desarrollo(s) en seguimiento` : ""})</span></summary>
    ${tipos.map((t) => `<p><b>Buscar ${esc(t)} (solo enlace):</b> ${enlacesZona(z, portales, { tipo: t }).map(([n, u]) => a(n, u)).join(" · ")}</p>`).join("")}
    <p><b>Por colonia:</b> ${z.colonias.map((c) => a(c, enlacesZona(z, [], { tipo: tipos[0], colonia: c })[0][1])).join(" · ")}</p>
    ${z.excluir ? `<p class="meta">Fuera de alcance: ${esc(z.excluir)}</p>` : ""}
    <p><b>Riesgos de la zona</b></p><ul class="lista-corta">${z.riesgos.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    ${(z.referencias || []).length ? `<p><b>Referencias de precio (prensa):</b></p><ul class="lista-corta">${z.referencias.map((r) => `<li>${esc(r.texto)} ${a(`${r.fuente}, ${r.fecha}`, r.url)}</li>`).join("")}</ul>` : ""}
    ${cerca.length ? `<p><b>Desarrollos en seguimiento a ${esc(String(z.radio_km))} km o menos:</b></p><ul class="lista-corta">${cerca.slice(0, 12).map((o) =>
      `<li>${o.url ? a(`${o.desarrolladora || ""} · ${o.proyecto || o.ciudad || ""}`, o.url) : esc(o.proyecto || "")} <span class="meta">· desde ${fmt(o.precio_desde)} ${esc(o.moneda || "")} · ${o.km.toFixed(1)} km${o.visto ? ` · consultado ${esc(o.visto)}` : ""}</span></li>`).join("")}</ul>` : ""}
    <p class="meta">Centro de la zona: ${z.lat}, ${z.lon} (${esc(z.precision)}), radio ${esc(String(z.radio_km))} km.</p>
    <p><button type="button" class="btn" data-evaluar="${z.lat},${z.lon},${esc(z.pais_iso3)}" data-nombre="${esc(`${z.ciudad} · ${z.zona}`)}">Evaluar el centro de la zona</button>
      ${a("Ver en OpenStreetMap", `https://www.openstreetmap.org/?mlat=${z.lat}&mlon=${z.lon}#map=14/${z.lat}/${z.lon}`)}</p></details>`;
}
