// DESTINOS_FIJOS: este módulo no llama a ningún servicio externo; solo lee y escribe la base D1 del Worker.
// Monitor de vulnerabilidades (vulnerabilidades.html, solo Admin). Cada día un flujo de GitHub Actions revisa el proyecto
// (tools/seguridad/vulnerabilidades.py) y manda aquí el resultado. El repositorio es público: por eso los hallazgos NO se
// publican en data/ ni en los registros de Actions; se guardan solo en D1 y únicamente quien administra los lee.
// Autenticación de la ingesta: token aleatorio que el propio flujo crea en cada corrida y guarda como secreto del Worker
// (VULN_INGEST_TOKEN), comparado en tiempo constante. Consultas siempre parametrizadas.

export const TABLA = "CREATE TABLE IF NOT EXISTS dominus_vulnerabilidades (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL CHECK (length(fecha) BETWEEN 10 AND 30), datos TEXT NOT NULL CHECK (length(datos) <= 400000)) STRICT";
const MAX_CUERPO = 400000, MAX_HALLAZGOS = 400, CONSERVAR = 400;
export const UMBRAL_OPCION_B = 3;
const SEVERIDADES = ["critica", "alta", "media", "baja", "info"];
const QUIEN = ["claude", "tu", "ambos"];
let lista = false;

const texto = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export function igualesSeguro(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

/** Limpia el informe recibido: campos conocidos, largos máximos, severidad y responsable de listas cerradas. */
export function validarInforme(entrada) {
  if (!entrada || typeof entrada !== "object" || !Array.isArray(entrada.hallazgos)) return null;
  const fecha = texto(entrada.fecha, 30);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(fecha)) return null;
  const hallazgos = entrada.hallazgos.slice(0, MAX_HALLAZGOS).map((h) => ({
    id: texto(h?.id, 120).replace(/[^a-z0-9_.:/-]/gi, "_"),
    categoria: texto(h?.categoria, 60),
    severidad: SEVERIDADES.includes(h?.severidad) ? h.severidad : "info",
    titulo: texto(h?.titulo, 200),
    detalle: texto(h?.detalle, 1500),
    accion: texto(h?.accion, 1500),
    quien: QUIEN.includes(h?.quien) ? h.quien : "tu",
  })).filter((h) => h.id && h.titulo);
  const revisiones = (Array.isArray(entrada.revisiones) ? entrada.revisiones : []).slice(0, 80)
    .map((r) => ({ nombre: texto(r?.nombre, 120), estado: ["ok", "hallazgos", "omitida", "error"].includes(r?.estado) ? r.estado : "error", nota: texto(r?.nota, 300) }));
  return { fecha, hallazgos, revisiones };
}

async function preparar(db) {
  if (!lista) { await db.prepare(TABLA).run(); lista = true; }
}

/** Clientes con plan de pago vigente (para el aviso «protege los datos por plan en el Worker»). */
async function clientesPago(db) {
  let n = 0;
  for (const q of ["SELECT COUNT(*) AS n FROM dominus_memberships_email WHERE active = 1 AND plan IN ('recon','analyst','command') AND (expires_at IS NULL OR expires_at > unixepoch())",
    "SELECT COUNT(*) AS n FROM dominus_memberships WHERE active = 1 AND plan IN ('recon','analyst','command') AND (expires_at IS NULL OR expires_at > unixepoch())"]) {
    try { n += Number((await db.prepare(q).first())?.n || 0); } catch { /* tabla aún no creada */ }
  }
  return n;
}

/** POST /admin/huella/vulnerabilidades/ingesta (solo el flujo diario, con su token). */
export async function ingesta(request, env, json) {
  const token = env.VULN_INGEST_TOKEN || "";
  const dado = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.length < 32 || !igualesSeguro(dado, token)) return json({ error: "No autorizado." }, 401);
  if (!env.OSINT_PLANS_DB) return json({ error: "Base de datos sin configurar." }, 503);
  if ((request.headers.get("Content-Type") || "").split(";")[0] !== "application/json") return json({ error: "Formato inválido." }, 415);
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return json({ error: "Informe demasiado grande." }, 413);
  let informe;
  try { informe = validarInforme(JSON.parse(cuerpo)); } catch { informe = null; }
  if (!informe) return json({ error: "Informe inválido." }, 400);
  const db = env.OSINT_PLANS_DB;
  await preparar(db);
  const clientes = await clientesPago(db);
  if (clientes > 0) for (const h of informe.hallazgos) if (h.id === "manual:datos-por-plan") {
    h.severidad = "alta";
    h.titulo = `Datos por plan servidos desde el Worker — ya hay ${clientes} cliente(s) de pago`;
  }
  // Con varios clientes, el cobro debe seguir el tipo de cambio del día (opción B de Mercado Pago): obligatorio.
  if (clientes >= UMBRAL_OPCION_B && !informe.hallazgos.some((h) => h.id === "manual:mp-opcion-b")) informe.hallazgos.push({
    id: "manual:mp-opcion-b", categoria: "Cobro", severidad: "alta", quien: "ambos",
    titulo: `Cambiar el cobro de Mercado Pago a la opción B (tipo de cambio del día) — ya hay ${clientes} clientes de pago`,
    detalle: "Con montos fijos en pesos, cada cliente paga distinto según el FIX del día en que se suscribió y el precio en USD deja de coincidir.",
    accion: "Pídele a Claude: «Activar la opción B de Mercado Pago». El Worker creará cada suscripción con el monto en pesos del FIX del día.",
  });
  await db.prepare("INSERT INTO dominus_vulnerabilidades (fecha, datos) VALUES (?, ?)").bind(informe.fecha, JSON.stringify(informe)).run();
  await db.prepare(`DELETE FROM dominus_vulnerabilidades WHERE id NOT IN (SELECT id FROM dominus_vulnerabilidades ORDER BY id DESC LIMIT ?)`).bind(CONSERVAR).run();
  return json({ ok: true, clientes_pago: clientes });
}

/** GET /admin/huella/vulnerabilidades (sesión de administración): últimas corridas, la más reciente primero. */
export async function consulta(env, json) {
  if (!env.OSINT_PLANS_DB) return json({ corridas: [], clientes_pago: 0 });
  const db = env.OSINT_PLANS_DB;
  await preparar(db);
  const { results = [] } = await db.prepare("SELECT id, fecha, datos FROM dominus_vulnerabilidades ORDER BY id DESC LIMIT 120").all();
  const corridas = results.map((r) => { try { return { id: r.id, ...JSON.parse(r.datos) }; } catch { return null; } }).filter(Boolean);
  return json({ corridas, clientes_pago: await clientesPago(db) });
}
