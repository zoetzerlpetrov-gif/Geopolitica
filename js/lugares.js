// Buscador de lugares en el mapa (direcciones, ciudades, colonias, comercios, monumentos) con Photon de komoot, que usa
// datos de OpenStreetMap. Se consulta desde 3 letras, con espera de 350 ms entre teclas para no saturar el servicio.
// No guarda lo que se escribe.
import { esc, MIN_BUSQUEDA } from "./util.js";

export const PHOTON = "https://photon.komoot.io/api/";
export const ATRIBUCION = "Photon (komoot) · © OpenStreetMap";
const IDIOMAS = new Set(["de", "en", "fr"]);  // Photon solo traduce a estos; en otro idioma se pide el nombre local

/** Texto → URL de Photon; con centro del mapa, los resultados cercanos salen primero. */
export function urlPhoton(q, { lat, lon, idioma = "es", limite = 8 } = {}) {
  const p = new URLSearchParams({ q: q.trim(), limit: String(limite) });
  if (IDIOMAS.has(idioma)) p.set("lang", idioma);
  if (Number.isFinite(lat) && Number.isFinite(lon)) { p.set("lat", lat.toFixed(3)); p.set("lon", lon.toFixed(3)); }
  return `${PHOTON}?${p}`;
}

const TIPO = { city: "Ciudad", town: "Pueblo", village: "Localidad", district: "Distrito", locality: "Localidad", county: "Municipio o condado",
  state: "Estado o provincia", country: "País", street: "Calle", house: "Dirección", other: "Lugar" };

/** Feature de Photon → {nombre, detalle, tipo, lon, lat, bbox} */
export function lugarDe(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  const calle = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : "";
  const nombre = p.name || calle || p.city || p.state || p.country || "";
  const detalle = [p.name && calle, p.district || p.locality, p.city !== nombre && p.city, p.state !== nombre && p.state, p.country !== nombre && p.country]
    .filter(Boolean).join(", ");
  const bbox = Array.isArray(p.extent) && p.extent.length === 4 ? [[p.extent[0], p.extent[3]], [p.extent[2], p.extent[1]]] : null;
  return { nombre, detalle, tipo: TIPO[p.type] || (p.osm_value ? p.osm_value.replace(/_/g, " ") : "Lugar"), lon, lat, bbox };
}

export const lugaresDe = (d) => (d?.features || []).map(lugarDe).filter((l) => l.nombre && Number.isFinite(l.lon) && Number.isFinite(l.lat));

export const htmlLugares = (ls) => ls.length
  ? ls.map((l, i) => `<li role="option" id="lug-op-${i}" data-i="${i}" tabindex="-1"><b>${esc(l.nombre)}</b> <span class="meta">${esc(l.tipo)}</span>${l.detalle ? `<br><span class="meta">${esc(l.detalle)}</span>` : ""}</li>`).join("")
    + `<li class="meta lug-atrib" aria-hidden="true">${esc(ATRIBUCION)}</li>`
  : `<li class="meta">Sin resultados</li>`;

export const listoParaBuscar = (q) => q.trim().length >= MIN_BUSQUEDA;
