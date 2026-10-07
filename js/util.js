// Utilidades sin dependencias.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapa texto de terceros antes de insertarlo como HTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Solo permite enlaces http(s); cualquier otro esquema (javascript:, data:) se descarta. */
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

export async function getJSON(url, { bust = false } = {}) {
  const r = await fetch(bust ? `${url}?t=${Date.now()}` : url, { cache: "no-store" });
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
