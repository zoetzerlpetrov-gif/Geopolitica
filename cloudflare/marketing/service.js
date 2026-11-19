// Contador de visitas por red social y campaña (marketing.html). Solo se cuentan las visitas que llegan con
// utm_source (enlaces de las publicaciones): se guarda día, red, campaña y un número. Sin IP, sin cookies, sin
// identificadores: es un total por día, no un registro de personas.
export const REDES = ["x", "bluesky", "threads", "linkedin", "linkedin_personal", "facebook", "telegram", "whatsapp", "youtube", "tiktok", "instagram", "correo"];
const ORIGENES = ["https://zoetzerlpetrov-gif.github.io", "https://dominusosint.com", "https://www.dominusosint.com", "https://dominus-osint.pages.dev"];
const TABLA = "CREATE TABLE IF NOT EXISTS dominus_visitas (dia TEXT NOT NULL, red TEXT NOT NULL, campania TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, red, campania))";

export function limpiar(red, campania) {
  const r = String(red || "").toLowerCase().trim();
  if (!REDES.includes(r)) return null;
  const c = String(campania || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "sin_campania";
  return { red: r, campania: c };
}

const cors = (origen) => ({
  "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
  "Access-Control-Allow-Methods": "POST",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});

/** POST /m/visita  {red, campania} desde el sitio. Responde 204 siempre que el formato sea válido. */
export async function contar(request, env, hoy = new Date()) {
  const origen = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors(origen), "Access-Control-Allow-Headers": "Content-Type" } });
  if (request.method !== "POST" || !ORIGENES.includes(origen)) return new Response(null, { status: 403, headers: cors(origen) });
  const texto = await request.text();
  if (texto.length > 300) return new Response(null, { status: 413, headers: cors(origen) });
  let e;
  try { e = JSON.parse(texto); } catch { return new Response(null, { status: 400, headers: cors(origen) }); }
  const v = limpiar(e?.red, e?.campania);
  if (!v || !env.OSINT_PLANS_DB) return new Response(null, { status: v ? 503 : 400, headers: cors(origen) });
  const db = env.OSINT_PLANS_DB;
  await db.prepare(TABLA).run();
  await db.prepare("INSERT INTO dominus_visitas (dia, red, campania, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, red, campania) DO UPDATE SET n = n + 1")
    .bind(hoy.toISOString().slice(0, 10), v.red, v.campania).run();
  return new Response(null, { status: 204, headers: cors(origen) });
}

/** GET /admin/huella/marketing/visitas (solo admin): totales de los últimos 90 días. */
export async function resumen(env, json, hoy = new Date()) {
  if (!env.OSINT_PLANS_DB) return json({ error: "La base D1 no está vinculada al Worker." }, 503);
  const db = env.OSINT_PLANS_DB;
  await db.prepare(TABLA).run();
  const desde = new Date(hoy.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const { results = [] } = await db.prepare("SELECT dia, red, campania, n FROM dominus_visitas WHERE dia >= ? ORDER BY dia").bind(desde).all();
  return json({ desde, filas: results });
}
