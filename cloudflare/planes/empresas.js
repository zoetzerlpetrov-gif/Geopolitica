// Espacios de empresa (base común de los productos por suscripción): organizaciones, miembros con rol, invitaciones
// por enlace firmado, bitácora y, como primer producto, el cumplimiento normativo de cada organización.
// Identidad: correo verificado de la sesión de Google (/cuenta/google). Datos en la base D1 del Worker (OSINT_PLANS_DB).
// Cada consulta filtra por organización y por el rol del correo en ella: una empresa nunca ve datos de otra.
// DESTINOS_FIJOS: no se llama a otros servicios.

export const ROLES = ["lector", "editor", "admin", "dueno"];
export const ESTADOS = ["pendiente", "en_proceso", "cumple", "no_cumple", "no_aplica"];
export const PRUEBA_DIAS = 14;
export const ASIENTOS_PRUEBA = 3;
const DIA = 86400;

export const TABLAS = [
  "CREATE TABLE IF NOT EXISTS dominus_orgs (id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 16 AND id NOT GLOB '*[^0-9a-f]*'), nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120), pais TEXT NOT NULL DEFAULT 'MEX' CHECK (length(pais) = 3), sectores TEXT NOT NULL DEFAULT '[]' CHECK (length(sectores) <= 2000), plan TEXT NOT NULL DEFAULT 'prueba' CHECK (plan IN ('prueba', 'individual', 'equipo', 'medida')), asientos INTEGER NOT NULL DEFAULT 3 CHECK (asientos BETWEEN 1 AND 500), vence INTEGER NOT NULL, creada INTEGER NOT NULL DEFAULT (unixepoch())) STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_org_miembros (org_id TEXT NOT NULL, email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)), rol TEXT NOT NULL CHECK (rol IN ('lector', 'editor', 'admin', 'dueno')), alta INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (org_id, email)) STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_org_invitaciones (token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64), org_id TEXT NOT NULL, email TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('lector', 'editor', 'admin')), vence INTEGER NOT NULL, creada_por TEXT NOT NULL) STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_org_bitacora (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, email TEXT NOT NULL, accion TEXT NOT NULL CHECK (length(accion) <= 40), detalle TEXT NOT NULL DEFAULT '' CHECK (length(detalle) <= 500), fecha INTEGER NOT NULL DEFAULT (unixepoch())) STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_cumplimiento (org_id TEXT NOT NULL, clave TEXT NOT NULL CHECK (length(clave) BETWEEN 3 AND 120), estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'en_proceso', 'cumple', 'no_cumple', 'no_aplica')), responsable TEXT NOT NULL DEFAULT '' CHECK (length(responsable) <= 254), fecha_limite TEXT NOT NULL DEFAULT '' CHECK (fecha_limite = '' OR fecha_limite GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), evidencia TEXT NOT NULL DEFAULT '' CHECK (length(evidencia) <= 1000), actualizado INTEGER NOT NULL DEFAULT (unixepoch()), actualizado_por TEXT NOT NULL DEFAULT '', PRIMARY KEY (org_id, clave)) STRICT",
];
const listas = new WeakSet();  // bases donde ya se crearon las tablas en este proceso
async function asegurar(db) {
  if (listas.has(db)) return;
  for (const t of TABLAS) await db.prepare(t).run();
  listas.add(db);
}

const CORREO = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/;
const ahora = () => Math.floor(Date.now() / 1000);
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const nuevoId = () => hex(crypto.getRandomValues(new Uint8Array(8)));
export const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
export const nivel = (rol) => ROLES.indexOf(rol);
export const puede = (rol, minimo) => nivel(rol) >= nivel(minimo) && nivel(minimo) >= 0;
export const vigente = (org, t = ahora()) => Number(org?.vence) > t;

/** Limpia y valida los datos de una organización. Lanza Error con mensaje para la persona si algo no cuadra. */
export function validarOrg(d = {}) {
  const nombre = String(d.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 120) throw new Error("El nombre de la empresa debe tener entre 2 y 120 caracteres.");
  const pais = String(d.pais ?? "MEX").toUpperCase();
  if (!/^[A-Z]{3}$/.test(pais)) throw new Error("País inválido (código de 3 letras, p. ej. MEX).");
  const sectores = [...new Set((Array.isArray(d.sectores) ? d.sectores : []).map(String).filter((s) => /^[a-z0-9_]{2,40}$/.test(s)))].slice(0, 30);
  return { nombre, pais, sectores };
}

/** Valida una respuesta de cumplimiento. */
export function validarRespuesta(d = {}, miembros = []) {
  const clave = String(d.clave ?? "");
  if (!/^[a-z0-9_.-]{1,60}#[0-9a-f]{8}$/.test(clave)) throw new Error("Pregunta inválida.");
  const estado = String(d.estado ?? "pendiente");
  if (!ESTADOS.includes(estado)) throw new Error("Estado inválido.");
  const responsable = String(d.responsable ?? "").toLowerCase();
  if (responsable && !miembros.includes(responsable)) throw new Error("El responsable debe ser miembro de la empresa.");
  const fecha_limite = String(d.fecha_limite ?? "");
  if (fecha_limite && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_limite)) throw new Error("Fecha inválida (AAAA-MM-DD).");
  const evidencia = String(d.evidencia ?? "").slice(0, 1000);
  return { clave, estado, responsable, fecha_limite, evidencia };
}

/** Cabeceras CORS: el mapa (dominusosint.com) usa la API con la cookie de sesión del mismo sitio. */
export function cors(request, origenes) {
  const o = request.headers.get("Origin");
  return origenes.includes(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : { Vary: "Origin" };
}

const json = (data, status, h) => Response.json(data, { status, headers: h });

/**
 * API de empresas: /cuenta/empresa/<ruta>. `correo` = correo verificado de la sesión (o null); `esAdmin` = sesión de
 * administración de DOMINUS (para fijar plan y asientos tras el cobro). `origenes` = orígenes permitidos con CORS.
 */
export async function serveEmpresas(request, url, env, { correo, esAdmin = false, origenes = [], base = {} }) {
  const h = { ...base, ...cors(request, origenes), "Content-Type": "application/json; charset=utf-8" };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...h, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } });
  }
  const db = env.OSINT_PLANS_DB;
  if (!db) return json({ error: "Base de datos sin configurar." }, 503, h);
  // Escrituras solo desde el propio sitio (evita que otra página use la cookie de la persona).
  if (request.method === "POST") {
    const o = request.headers.get("Origin");
    if (o !== url.origin && !origenes.includes(o)) return json({ error: "Origen no permitido." }, 403, h);
  } else if (request.method !== "GET") return json({ error: "Método inválido." }, 405, h);
  const ruta = url.pathname.replace(/^\/cuenta\/empresa\/?/, "");
  const partes = ruta.split("/").filter(Boolean);
  let cuerpo = {};
  if (request.method === "POST") {
    const texto = await request.text();
    if (texto.length > 20000) return json({ error: "Solicitud demasiado grande." }, 413, h);
    try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { return json({ error: "JSON inválido." }, 400, h); }
  }
  try {
    await asegurar(db);
    // Administración de DOMINUS: lista de organizaciones y alta de plan/asientos tras el cobro.
    if (partes[0] === "admin") {
      if (!esAdmin) return json({ error: "Solo administración." }, 403, h);
      if (partes[1] === "orgs" && request.method === "GET") {
        const r = await db.prepare("SELECT o.id, o.nombre, o.pais, o.plan, o.asientos, o.vence, o.creada, (SELECT count(*) FROM dominus_org_miembros m WHERE m.org_id = o.id) AS miembros FROM dominus_orgs o ORDER BY o.creada DESC LIMIT 500").all();
        return json({ orgs: r.results || [] }, 200, h);
      }
      if (partes[1] === "plan" && request.method === "POST") {
        const plan = String(cuerpo.plan || ""), asientos = Number(cuerpo.asientos), dias = Number(cuerpo.dias);
        if (!["prueba", "individual", "equipo", "medida"].includes(plan) || !(asientos >= 1 && asientos <= 500) || !(dias >= 1 && dias <= 400)) return json({ error: "Plan, asientos (1-500) o días (1-400) inválidos." }, 400, h);
        const r = await db.prepare("UPDATE dominus_orgs SET plan = ?, asientos = ?, vence = ? WHERE id = ?").bind(plan, Math.floor(asientos), ahora() + Math.floor(dias) * DIA, String(cuerpo.org || "")).run();
        return json({ ok: (r.meta?.changes || 0) > 0 }, 200, h);
      }
      return json({ error: "Ruta inexistente." }, 404, h);
    }
    if (!correo || !CORREO.test(correo)) return json({ error: "Inicia sesión con Google para usar los espacios de empresa.", ingresar: "/cuenta/google" }, 401, h);
    const bitacora = (org, accion, detalle = "") => db.prepare("INSERT INTO dominus_org_bitacora (org_id, email, accion, detalle) VALUES (?, ?, ?, ?)").bind(org, correo, accion, String(detalle).slice(0, 500)).run();

    if (partes[0] === "yo" && request.method === "GET") {
      const r = await db.prepare("SELECT o.id, o.nombre, o.pais, o.sectores, o.plan, o.asientos, o.vence, m.rol FROM dominus_org_miembros m JOIN dominus_orgs o ON o.id = m.org_id WHERE m.email = ? ORDER BY o.nombre").bind(correo).all();
      return json({ email: correo, orgs: (r.results || []).map((o) => ({ ...o, sectores: JSON.parse(o.sectores || "[]"), vigente: vigente(o) })) }, 200, h);
    }
    if (partes[0] === "crear" && request.method === "POST") {
      const d = validarOrg(cuerpo);
      const propias = await db.prepare("SELECT count(*) AS n FROM dominus_org_miembros WHERE email = ? AND rol = 'dueno'").bind(correo).first();
      if ((propias?.n || 0) >= 3) return json({ error: "Cada cuenta puede crear hasta 3 empresas." }, 409, h);
      const id = nuevoId();
      await db.batch([
        db.prepare("INSERT INTO dominus_orgs (id, nombre, pais, sectores, plan, asientos, vence) VALUES (?, ?, ?, ?, 'prueba', ?, ?)").bind(id, d.nombre, d.pais, JSON.stringify(d.sectores), ASIENTOS_PRUEBA, ahora() + PRUEBA_DIAS * DIA),
        db.prepare("INSERT INTO dominus_org_miembros (org_id, email, rol) VALUES (?, ?, 'dueno')").bind(id, correo),
      ]);
      await bitacora(id, "crear", d.nombre);
      return json({ id, plan: "prueba", vence: ahora() + PRUEBA_DIAS * DIA }, 201, h);
    }
    if (partes[0] === "aceptar" && request.method === "POST") {
      const token = String(cuerpo.token || "");
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Invitación inválida." }, 400, h);
      const inv = await db.prepare("SELECT * FROM dominus_org_invitaciones WHERE token_hash = ?").bind(await sha256(token)).first();
      if (!inv || inv.vence <= ahora()) return json({ error: "La invitación no existe o ya venció. Pide una nueva." }, 404, h);
      if (inv.email !== correo) return json({ error: `Esta invitación es para ${inv.email}. Inicia sesión con ese correo.` }, 403, h);
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO dominus_org_miembros (org_id, email, rol) VALUES (?, ?, ?)").bind(inv.org_id, correo, inv.rol),
        db.prepare("DELETE FROM dominus_org_invitaciones WHERE token_hash = ?").bind(inv.token_hash),
      ]);
      await bitacora(inv.org_id, "aceptar", inv.rol);
      return json({ ok: true, org: inv.org_id }, 200, h);
    }

    // Rutas de una organización: /cuenta/empresa/<org>/<accion>
    const orgId = partes[0], accion = partes[1] || "info";
    if (!/^[0-9a-f]{16}$/.test(orgId || "")) return json({ error: "Ruta inexistente." }, 404, h);
    const yo = await db.prepare("SELECT rol FROM dominus_org_miembros WHERE org_id = ? AND email = ?").bind(orgId, correo).first();
    if (!yo) return json({ error: "No perteneces a esta empresa." }, 403, h);
    const org = await db.prepare("SELECT * FROM dominus_orgs WHERE id = ?").bind(orgId).first();
    if (!org) return json({ error: "La empresa no existe." }, 404, h);
    const escritura = request.method === "POST";
    if (escritura && !vigente(org) && accion !== "quitar") return json({ error: "El periodo de la empresa terminó: queda en solo lectura hasta renovar el plan." }, 402, h);
    const miembros = async () => (await db.prepare("SELECT email, rol, alta FROM dominus_org_miembros WHERE org_id = ? ORDER BY alta").bind(orgId).all()).results || [];

    if (accion === "info" && request.method === "GET") {
      const ms = await miembros();
      const inv = puede(yo.rol, "admin") ? ((await db.prepare("SELECT email, rol, vence FROM dominus_org_invitaciones WHERE org_id = ? AND vence > ?").bind(orgId, ahora()).all()).results || []) : [];
      return json({ org: { ...org, sectores: JSON.parse(org.sectores || "[]"), vigente: vigente(org) }, rol: yo.rol, miembros: ms, invitaciones: inv }, 200, h);
    }
    if (accion === "config" && escritura) {
      if (!puede(yo.rol, "admin")) return json({ error: "Solo administradores." }, 403, h);
      const d = validarOrg(cuerpo);
      await db.prepare("UPDATE dominus_orgs SET nombre = ?, pais = ?, sectores = ? WHERE id = ?").bind(d.nombre, d.pais, JSON.stringify(d.sectores), orgId).run();
      await bitacora(orgId, "config", `${d.pais} · ${d.sectores.join(", ")}`);
      return json({ ok: true }, 200, h);
    }
    if (accion === "invitar" && escritura) {
      if (!puede(yo.rol, "admin")) return json({ error: "Solo administradores." }, 403, h);
      const email = String(cuerpo.email || "").trim().toLowerCase(), rol = String(cuerpo.rol || "lector");
      if (!CORREO.test(email)) return json({ error: "Correo inválido." }, 400, h);
      if (!["lector", "editor", "admin"].includes(rol)) return json({ error: "Rol inválido." }, 400, h);
      const ms = await miembros();
      if (ms.some((m) => m.email === email)) return json({ error: "Esa persona ya es miembro." }, 409, h);
      const pend = await db.prepare("SELECT count(*) AS n FROM dominus_org_invitaciones WHERE org_id = ? AND vence > ? AND email <> ?").bind(orgId, ahora(), email).first();
      if (ms.length + (pend?.n || 0) + 1 > org.asientos) return json({ error: `Tu plan incluye ${org.asientos} usuario(s). Quita a alguien o amplía el plan.` }, 409, h);
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      await db.batch([
        db.prepare("DELETE FROM dominus_org_invitaciones WHERE org_id = ? AND email = ?").bind(orgId, email),
        db.prepare("INSERT INTO dominus_org_invitaciones (token_hash, org_id, email, rol, vence, creada_por) VALUES (?, ?, ?, ?, ?, ?)").bind(await sha256(token), orgId, email, rol, ahora() + 7 * DIA, correo),
      ]);
      await bitacora(orgId, "invitar", `${email} (${rol})`);
      return json({ token, vence_dias: 7 }, 201, h);
    }
    if (accion === "rol" && escritura) {
      if (!puede(yo.rol, "admin")) return json({ error: "Solo administradores." }, 403, h);
      const email = String(cuerpo.email || "").toLowerCase(), rol = String(cuerpo.rol || "");
      if (!["lector", "editor", "admin"].includes(rol)) return json({ error: "Rol inválido." }, 400, h);
      const r = await db.prepare("UPDATE dominus_org_miembros SET rol = ? WHERE org_id = ? AND email = ? AND rol <> 'dueno'").bind(rol, orgId, email).run();
      if (!(r.meta?.changes > 0)) return json({ error: "No se pudo cambiar (¿es la persona dueña?)." }, 409, h);
      await bitacora(orgId, "rol", `${email} → ${rol}`);
      return json({ ok: true }, 200, h);
    }
    if (accion === "quitar" && escritura) {
      const email = String(cuerpo.email || "").toLowerCase();
      if (email !== correo && !puede(yo.rol, "admin")) return json({ error: "Solo administradores." }, 403, h);
      const r = await db.prepare("DELETE FROM dominus_org_miembros WHERE org_id = ? AND email = ? AND rol <> 'dueno'").bind(orgId, email).run();
      await db.prepare("DELETE FROM dominus_org_invitaciones WHERE org_id = ? AND email = ?").bind(orgId, email).run();
      await bitacora(orgId, "quitar", email);
      return json({ ok: (r.meta?.changes || 0) > 0 }, 200, h);
    }
    if (accion === "cumplimiento" && request.method === "GET") {
      const r = await db.prepare("SELECT clave, estado, responsable, fecha_limite, evidencia, actualizado, actualizado_por FROM dominus_cumplimiento WHERE org_id = ?").bind(orgId).all();
      return json({ respuestas: r.results || [] }, 200, h);
    }
    if (accion === "cumplimiento" && escritura) {
      if (!puede(yo.rol, "editor")) return json({ error: "Tu rol es de solo lectura." }, 403, h);
      const d = validarRespuesta(cuerpo, (await miembros()).map((m) => m.email));
      await db.prepare(`INSERT INTO dominus_cumplimiento (org_id, clave, estado, responsable, fecha_limite, evidencia, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (org_id, clave) DO UPDATE SET estado = excluded.estado, responsable = excluded.responsable, fecha_limite = excluded.fecha_limite, evidencia = excluded.evidencia, actualizado = excluded.actualizado, actualizado_por = excluded.actualizado_por`)
        .bind(orgId, d.clave, d.estado, d.responsable, d.fecha_limite, d.evidencia, ahora(), correo).run();
      await bitacora(orgId, "cumplimiento", `${d.clave} → ${d.estado}`);
      return json({ ok: true, actualizado: ahora() }, 200, h);
    }
    if (accion === "bitacora" && request.method === "GET") {
      if (!puede(yo.rol, "admin")) return json({ error: "Solo administradores." }, 403, h);
      const r = await db.prepare("SELECT email, accion, detalle, fecha FROM dominus_org_bitacora WHERE org_id = ? ORDER BY id DESC LIMIT 200").bind(orgId).all();
      return json({ bitacora: r.results || [] }, 200, h);
    }
    return json({ error: "Ruta inexistente." }, 404, h);
  } catch (e) {
    return json({ error: e instanceof Error && /^[A-ZÁÉÍÓÚ]/.test(e.message) && !/D1|SQL/i.test(e.message) ? e.message : "No se pudo completar la operación." }, e instanceof Error && /inválid|debe|caracteres/.test(e.message) ? 400 : 503, h);
  }
}
