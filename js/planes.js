// Fase 7: precio en pesos de cada plan y permisos por sección (config/planes.json).
// Sin dependencias para poder usarse igual en el navegador y en el Worker de Cloudflare de la versión comercial.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Fecha «AAAA-MM-DD» de hoy en Ciudad de México (Banxico publica el FIX en esa hora). */
export const hoyMexico = (ahora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);

/** «DD/MM/AAAA» (formato del SIE de Banxico) → «AAAA-MM-DD». Acepta también «AAAA-MM-DD». */
export function fechaIso(f) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(f || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(f || "").trim();
}

/**
 * FIX vigente: el de hoy si ya se publicó; si no, el más reciente anterior a hoy (último día hábil).
 * `datos`: [{fecha, dato}] como los da el SIE («N/E» = sin dato). Devuelve {fecha, valor} o null.
 */
export function fixVigente(datos, hoy) {
  let mejor = null;
  for (const d of datos || []) {
    const fecha = fechaIso(d.fecha), valor = Number(String(d.dato ?? d.valor ?? "").replace(",", ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy || !(valor > 0)) continue;
    if (!mejor || fecha > mejor.fecha) mejor = { fecha, valor };
  }
  return mejor;
}

/** Pesos = dólares × FIX, redondeado hacia arriba al peso entero. El redondeo previo a 6 decimales evita que 92.0000000001 suba a 93. */
export function precioMxn(usd, fix) {
  if (Number(usd) === 0) return 0;
  const x = Number(usd) * Number(fix);
  if (!(x > 0)) return null;
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

/** «2026-10-28» → «28 de octubre de 2026». */
export function fechaLarga(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Texto del precio: «93 MXN al mes (USD 4.99 al tipo de cambio FIX de Banxico del 28 de octubre de 2026)». */
export function textoPrecio(plan, fix, plantilla = "{mxn} MXN al mes (USD {usd} al tipo de cambio FIX de Banxico del {fecha})") {
  if (plan.usd === 0) return "Gratis, con registro";
  const mxn = fix ? precioMxn(plan.usd, fix.valor) : null;
  if (mxn == null) return `USD ${plan.usd.toFixed(2)} al mes (sin tipo de cambio disponible)`;
  return plantilla.replace("{mxn}", mxn.toLocaleString("es-MX")).replace("{usd}", plan.usd.toFixed(2)).replace("{fecha}", fechaLarga(fix.fecha));
}

/** Precios de todos los planes con el FIX vigente. */
export const preciosPlanes = (cat, fix) =>
  (cat?.planes || []).map((p) => ({ id: p.id, nombre: p.nombre, usd: p.usd, mxn: p.usd === 0 ? 0 : fix ? precioMxn(p.usd, fix.valor) : null, fix_fecha: fix?.fecha || null, texto: textoPrecio(p, fix, cat?.cobro?.texto) }));

/** ¿Esta página (por su href, sin parámetros) es solo para quien administra? */
export function paginaSoloAdmin(cat, href) {
  const base = String(href || "").split(/[?#]/)[0].split("/").pop();
  return (cat?.solo_admin || []).some((s) => s.tipo === "pagina" && s.href === base);
}
