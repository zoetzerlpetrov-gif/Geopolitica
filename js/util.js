// Utilidades sin dependencias.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapa texto de terceros antes de insertarlo como HTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Solo permite enlaces http(s); cualquier otro esquema (javascript:, data:) se descarta. */
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

export async function getJSON(url, { bust = false } = {}) {
  // Datos de arranque que index.html ya pidió en paralelo con MapLibre: se usan una sola vez.
  const pre = globalThis.__pre?.[url];
  if (pre) { delete globalThis.__pre[url]; return pre; }
  // El parámetro anticaché se agrega con «&» si la URL ya trae parámetros (p. ej. la API de NWS).
  const r = await fetch(bust ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

const fmtFecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const fmtFechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const fmtHora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
export const fecha = (iso) => fmtFecha.format(new Date(iso));
export const fechaHora = (iso) => fmtFechaHora.format(new Date(iso));
export const hora = (d) => fmtHora.format(d);

export function hace(iso, now = Date.now()) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h ${min % 60} min`;
  return `hace ${Math.floor(h / 24)} días`;
}

export const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const storage = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: se ignora */ } },
};

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = (g) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** ¿El mapa está en tema oscuro? (data-theme manda; si no, la preferencia del sistema). */
export function temaOscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Pintura de etiquetas legible sobre cualquier fondo: texto casi negro con halo blanco suave en tema claro,
 * texto claro con halo oscuro en tema oscuro. Halo difuminado (no un contorno duro) para que no tape las letras.
 */
export function pinturaEtiqueta() {
  return temaOscuro()
    ? { "text-color": "#F4F7F9", "text-halo-color": "rgba(8,14,20,0.92)", "text-halo-width": 1.6, "text-halo-blur": 0.6 }
    : { "text-color": "#101820", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.6, "text-halo-blur": 0.6 };
}

/**
 * ¿Hay en ese píxel un punto, ícono o línea de otra capa interactiva? Los rellenos por país (religiones,
 * gobiernos, índice…) ceden el clic: sin esto, la capa encendida al último se quedaba con todos los clics.
 */
export function hayObjetoEncima(map, punto) {
  return map.queryRenderedFeatures(punto).some((f) => ["circle", "symbol", "line"].includes(f.layer.type)
    && /^(rg-|mov-|cap-|evento|clusters|chokepoints)/.test(f.layer.id) && !/-(texto|pulso)$/.test(f.layer.id));
}

/** Texto sin acentos y en minúsculas, para buscar «Mexico» y encontrar «México». */
export const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Consulta → palabras a buscar (todas deben aparecer). Lo que va entre comillas se busca como frase. */
export function palabrasDe(q) {
  const out = [];
  String(q || "").replace(/"([^"]+)"|(\S+)/g, (_, frase, palabra) => { const x = sinAcentos(frase || palabra).trim(); if (x.length >= 2) out.push(x); return ""; });
  return out;
}
