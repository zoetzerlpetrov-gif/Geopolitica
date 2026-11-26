// DESTINOS_FIJOS: este módulo no llama a servicios externos; solo usa la base D1 (OSINT_PLANS_DB).
// Cuenta de creador: demo de 7 días desde el primer ingreso, plan de cortesía o pagado (tabla dominus_cortesias con
// producto «creadores») y lo que el creador guarda del estudio (perfil, ideas, guiones, calendario, métricas y evaluación).
// Las fotos y los videos no se suben: se trabajan y se descargan en su equipo.
//   GET  /cuenta/creador/estado          → { email, plan, vence, dias_restantes, activo }
//   GET  /cuenta/creador/datos           → { datos: { clave: valor } }
//   POST /cuenta/creador/datos           → { cambios: { clave: valor | null } }  (requiere plan activo)
export const DIAS_DEMO = 7;
export const CLAVES = /^cr_[a-z_]{1,24}$/;
export const MAX_VALOR = 200000;
export const MAX_CLAVES = 40;
const DIA = 86400;
const ahora = () => Math.floor(Date.now() / 1000);
const listas = new WeakSet();

async function asegurar(db) {
  if (listas.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS dominus_creadores (email TEXT PRIMARY KEY NOT NULL, inicio_demo INTEGER NOT NULL) STRICT").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_creador_datos (email TEXT NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL, actualizado INTEGER NOT NULL,
    PRIMARY KEY (email, clave)) STRICT`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_cortesias (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, producto TEXT NOT NULL, plan TEXT NOT NULL DEFAULT '',
    vence INTEGER NOT NULL, nota TEXT NOT NULL DEFAULT '', creada_por TEXT NOT NULL DEFAULT '', creada INTEGER NOT NULL DEFAULT (unixepoch()))`).run();
  listas.add(db);
}

/** Plan del creador: el de una cortesía o pago vigente; si no, la demo de 7 días desde su primer ingreso. */
export async function estadoCreador(db, email, t = ahora()) {
  await asegurar(db);
  await db.prepare("INSERT OR IGNORE INTO dominus_creadores (email, inicio_demo) VALUES (?, ?)").bind(email, t).run();
  const c = await db.prepare("SELECT plan, vence FROM dominus_cortesias WHERE email = ? AND producto = 'creadores' AND vence > ? ORDER BY vence DESC LIMIT 1").bind(email, t).first();
  if (c) return { email, plan: c.plan || "creador", vence: c.vence, dias_restantes: Math.ceil((c.vence - t) / DIA), activo: true };
  const d = await db.prepare("SELECT inicio_demo FROM dominus_creadores WHERE email = ?").bind(email).first();
  const vence = Number(d.inicio_demo) + DIAS_DEMO * DIA;
  return { email, plan: vence > t ? "demo" : "vencido", vence, dias_restantes: Math.max(0, Math.ceil((vence - t) / DIA)), activo: vence > t };
}

export async function serveCreadores(request, url, env, { correo = null, origenes = [], base = {} } = {}) {
  const o = request.headers.get("Origin");
  const h = { ...base, "Content-Type": "application/json; charset=utf-8", ...(origenes.includes(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : { Vary: "Origin" }) };
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: h });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...h, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" } });
  if (request.method === "POST" && o !== url.origin && !origenes.includes(o)) return json({ error: "Origen no permitido." }, 403);
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Método inválido." }, 405);
  const db = env.OSINT_PLANS_DB;
  if (!db) return json({ error: "Base de datos sin configurar." }, 503);
  if (!correo) return json({ error: "Inicia sesión para usar el estudio." }, 401);
  const ruta = url.pathname.replace(/^\/cuenta\/creador\/?/, "");
  try {
    const est = await estadoCreador(db, correo);
    if (ruta === "estado" && request.method === "GET") return json(est);
    if (ruta !== "datos") return json({ error: "Ruta inexistente." }, 404);
    if (request.method === "GET") {
      const r = (await db.prepare("SELECT clave, valor FROM dominus_creador_datos WHERE email = ?").bind(correo).all()).results || [];
      return json({ datos: Object.fromEntries(r.map((x) => [x.clave, x.valor])), estado: est });
    }
    if (!est.activo) return json({ error: "Tu demo terminó: elige un plan para seguir guardando. Lo ya guardado sigue disponible para consultar." }, 402);
    const texto = await request.text();
    if (texto.length > MAX_VALOR * 2) return json({ error: "Solicitud demasiado grande." }, 413);
    let c; try { c = JSON.parse(texto || "{}").cambios; } catch { return json({ error: "JSON inválido." }, 400); }
    if (!c || typeof c !== "object" || Array.isArray(c)) return json({ error: "Cambios inválidos." }, 400);
    const entradas = Object.entries(c);
    if (!entradas.length || entradas.length > MAX_CLAVES) return json({ error: "Demasiadas claves." }, 400);
    for (const [k, v] of entradas) {
      if (!CLAVES.test(k)) return json({ error: `Clave no permitida: ${k}` }, 400);
      if (v !== null && (typeof v !== "string" || v.length > MAX_VALOR)) return json({ error: `Valor inválido o demasiado grande: ${k}` }, 413);
    }
    const t = ahora();
    await db.batch(entradas.map(([k, v]) => (v === null
      ? db.prepare("DELETE FROM dominus_creador_datos WHERE email = ? AND clave = ?").bind(correo, k)
      : db.prepare("INSERT INTO dominus_creador_datos (email, clave, valor, actualizado) VALUES (?, ?, ?, ?) ON CONFLICT (email, clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado").bind(correo, k, v, t))));
    const n = await db.prepare("SELECT count(*) AS n FROM dominus_creador_datos WHERE email = ?").bind(correo).first();
    if ((n?.n || 0) > MAX_CLAVES) return json({ error: "Límite de datos guardados alcanzado." }, 409);
    return json({ ok: true });
  } catch {
    return json({ error: "No se pudo completar la operación." }, 500);
  }
}
