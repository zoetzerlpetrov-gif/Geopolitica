// DESTINOS_FIJOS: este módulo no llama a ningún servicio externo; solo lee y escribe la base D1 del Worker.
// Tablero de pruebas (pruebas.html, solo Admin). El flujo «Pruebas integrales por rol» recorre el sitio con un navegador
// real por cada rol y corre las pruebas unitarias; manda aquí un resumen. Se guarda solo en D1 (el repositorio es
// público) y únicamente quien administra lo lee. Ingesta con un token aleatorio que el flujo crea en cada corrida
// (PRUEBAS_INGEST_TOKEN, comparado en tiempo constante). Consultas siempre parametrizadas.
import { igualesSeguro } from "../seguridad/service.js";

export const TABLA = "CREATE TABLE IF NOT EXISTS dominus_pruebas (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL CHECK (length(fecha) BETWEEN 10 AND 30), datos TEXT NOT NULL CHECK (length(datos) <= 300000)) STRICT";
const MAX_CUERPO = 300000, CONSERVAR = 300, ROLES = ["admin", "demo", "recon", "analyst", "command"], PLANES_DATOS = ["recon", "analyst", "command", "admin"];
let lista = false;

const texto = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(Math.round(Number(v)), 1e6) : 0);
const lista_ = (v, max, largo) => (Array.isArray(v) ? v : []).slice(0, max).map((x) => texto(x, largo)).filter(Boolean);

/** Limpia el resumen recibido: solo campos conocidos, números acotados y textos cortos. */
export function validarCorrida(e) {
  if (!e || typeof e !== "object" || !Array.isArray(e.roles)) return null;
  const fecha = texto(e.fecha, 30);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(fecha)) return null;
  const roles = e.roles.slice(0, 10).filter((r) => ROLES.includes(r?.rol)).map((r) => ({
    rol: r.rol, arranque_s: num(r.arranque_s), capas: num(r.capas), vacias: num(r.vacias), pegadas: num(r.pegadas), sin_imagen: num(r.sin_imagen),
    paginas: num(r.paginas), paginas_mal: num(r.paginas_mal), js: num(r.js), solo_admin_visible: num(r.solo_admin_visible), parpadeo: num(r.parpadeo),
    grave: num(r.grave),
    comprobaciones: (Array.isArray(r.comprobaciones) ? r.comprobaciones : []).slice(0, 40).map((c) => ({ nombre: texto(c?.nombre, 120), ok: c?.ok === true, detalle: texto(c?.detalle, 200) })).filter((c) => c.nombre),
    problemas: lista_(r.problemas, 60, 240), avisos: lista_(r.avisos, 60, 300),
  }));
  const u = e.unitarias && typeof e.unitarias === "object" ? e.unitarias : {};
  const unitarias = Object.fromEntries(["python", "js"].map((k) => [k, { pasan: num(u[k]?.pasan), fallan: num(u[k]?.fallan) }]));
  // Archivos de data/ que solo piden planes superiores (para config/datos_por_plan.json): ruta → plan mínimo.
  const datos_plan = Object.fromEntries(Object.entries(e.datos_plan && typeof e.datos_plan === "object" ? e.datos_plan : {}).slice(0, 500)
    .filter(([k, v]) => /^data\/[\w.\/-]{1,200}$/.test(k) && !k.includes("..") && PLANES_DATOS.includes(v)));
  return { fecha, datos_plan, commit: texto(e.commit, 40).replace(/[^a-f0-9]/gi, ""), corrida: texto(e.corrida, 200).replace(/[^\w:/.?=&-]/g, ""), sitio: texto(e.sitio, 120), roles, unitarias };
}

async function preparar(db) {
  if (!lista) { await db.prepare(TABLA).run(); lista = true; }
}

/** POST /admin/huella/pruebas/ingesta (solo el flujo de pruebas, con su token). */
export async function ingesta(request, env, json) {
  const token = env.PRUEBAS_INGEST_TOKEN || "";
  const dado = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.length < 32 || !igualesSeguro(dado, token)) return json({ error: "No autorizado." }, 401);
  if (!env.OSINT_PLANS_DB) return json({ error: "Base de datos sin configurar." }, 503);
  if ((request.headers.get("Content-Type") || "").split(";")[0] !== "application/json") return json({ error: "Formato inválido." }, 415);
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return json({ error: "Informe demasiado grande." }, 413);
  let c;
  try { c = validarCorrida(JSON.parse(cuerpo)); } catch { c = null; }
  if (!c) return json({ error: "Informe inválido." }, 400);
  const db = env.OSINT_PLANS_DB;
  await preparar(db);
  await db.prepare("INSERT INTO dominus_pruebas (fecha, datos) VALUES (?, ?)").bind(c.fecha, JSON.stringify(c)).run();
  await db.prepare("DELETE FROM dominus_pruebas WHERE id NOT IN (SELECT id FROM dominus_pruebas ORDER BY id DESC LIMIT ?)").bind(CONSERVAR).run();
  return json({ ok: true });
}

/** GET /admin/huella/pruebas (sesión de administración): últimas corridas, la más reciente primero. */
export async function consulta(env, json) {
  if (!env.OSINT_PLANS_DB) return json({ corridas: [] });
  const db = env.OSINT_PLANS_DB;
  await preparar(db);
  const { results = [] } = await db.prepare("SELECT id, fecha, datos FROM dominus_pruebas ORDER BY id DESC LIMIT 120").all();
  return json({ corridas: results.map((r) => { try { return { id: r.id, ...JSON.parse(r.datos) }; } catch { return null; } }).filter(Boolean) });
}
