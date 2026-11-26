// Espacios de empresa (base común de los productos por suscripción): organizaciones, miembros con rol, invitaciones
// por enlace firmado, bitácora y, como primer producto, el cumplimiento normativo de cada organización.
// Identidad: correo verificado de la sesión de Google (/cuenta/google). Datos en la base D1 del Worker (OSINT_PLANS_DB).
// Cada consulta filtra por organización y por el rol del correo en ella: una empresa nunca ve datos de otra.
// DESTINOS_FIJOS: no se llama a otros servicios.

import { asegurarAcceso, enlaceActivacion } from "./acceso.js";
import { rutaProyectos, vistaCompartida } from "./proyectos.js";

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
  "CREATE TABLE IF NOT EXISTS dominus_org_rfc (org_id TEXT PRIMARY KEY NOT NULL, rfc TEXT NOT NULL UNIQUE CHECK (length(rfc) BETWEEN 12 AND 13)) STRICT",
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

/** Nombre comparable para detectar empresas repetidas: sin acentos, mayúsculas, signos ni forma societaria. */
export function nombreNormal(nombre) {
  return String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(s\.?\s?a\.?|s\.?\s?de\s?r\.?\s?l\.?|s\.?\s?a\.?\s?p\.?\s?i\.?|s\.?\s?a\.?\s?s\.?|de\s+c\.?\s?v\.?|s\.?\s?c\.?|a\.?\s?c\.?|sapi|inc|llc|ltd|gmbh|corp)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
/** RFC mexicano (persona moral 12, física 13 caracteres) o vacío. */
export function rfcValido(rfc) {
  const r = String(rfc || "").trim().toUpperCase();
  if (!r) return "";
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(r)) throw new Error("RFC inválido (12 o 13 caracteres, p. ej. ABC010203XY1).");
  return r;
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

/** Empresa ya registrada con el mismo nombre (normalizado) o el mismo RFC; null si no hay. */
export async function empresaExistente(db, nombre, rfc = "") {
  const n = nombreNormal(nombre);
  if (rfc) {
    const r = await db.prepare("SELECT o.id, o.nombre FROM dominus_org_rfc x JOIN dominus_orgs o ON o.id = x.org_id WHERE x.rfc = ?").bind(rfc).first();
    if (r) return { ...r, por: "RFC" };
  }
  const todas = (await db.prepare("SELECT id, nombre FROM dominus_orgs").all()).results || [];
  const igual = todas.find((o) => nombreNormal(o.nombre) === n);
  return igual ? { ...igual, por: "nombre" } : null;
}

/** Acepta una invitación de empresa para `correo` (lo usan /aceptar y la activación de cuenta propia). */
export async function aceptarInvitacionDirecta(db, token, correo) {
  await asegurar(db);
  const inv = await db.prepare("SELECT * FROM dominus_org_invitaciones WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!inv || inv.vence <= ahora()) return { error: "La invitación no existe o ya venció. Pide una nueva.", status: 404 };
  if (inv.email !== correo) return { error: `Esta invitación es para ${inv.email}. Inicia sesión con ese correo.`, status: 403 };
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO dominus_org_miembros (org_id, email, rol) VALUES (?, ?, ?)").bind(inv.org_id, correo, inv.rol),
    db.prepare("DELETE FROM dominus_org_invitaciones WHERE token_hash = ?").bind(inv.token_hash),
    db.prepare("INSERT INTO dominus_org_bitacora (org_id, email, accion, detalle) VALUES (?, ?, 'aceptar', ?)").bind(inv.org_id, correo, inv.rol),
  ]);
  return { ok: true, org: inv.org_id };
}

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
    // Las actividades de una plantilla de proyecto llegan en lote (hasta 800): ese caso admite cuerpos más grandes.
    if (texto.length > (/\/proyectos\/(?:[0-9a-f]{16}\/)?[0-9a-f]{16}\/(?:items|checklist)$/.test(url.pathname) ? 400000 : 20000)) return json({ error: "Solicitud demasiado grande." }, 413, h);
    try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { return json({ error: "JSON inválido." }, 400, h); }
  }
  try {
    await asegurar(db);
    // Vista de solo lectura de un proyecto compartido por enlace (sin sesión).
    if (partes[0] === "vista" && partes.length === 2 && request.method === "GET") {
      const v = await vistaCompartida(db, partes[1]);
      return v ? json(v, 200, h) : json({ error: "El enlace no existe o ya no está activo." }, 404, h);
    }
    // Administración de DOMINUS: lista de organizaciones y alta de plan/asientos tras el cobro.
    if (partes[0] === "admin") {
      if (!esAdmin) return json({ error: "Solo administración." }, 403, h);
      if (partes[1] === "orgs" && request.method === "GET") {
        const r = await db.prepare(`SELECT o.id, o.nombre, o.pais, o.sectores, o.plan, o.asientos, o.vence, o.creada, (SELECT rfc FROM dominus_org_rfc x WHERE x.org_id = o.id) AS rfc,
          (SELECT group_concat(email, ', ') FROM dominus_org_miembros m WHERE m.org_id = o.id AND m.rol = 'dueno') AS duenos,
          (SELECT count(*) FROM dominus_org_miembros m WHERE m.org_id = o.id) AS miembros FROM dominus_orgs o ORDER BY o.creada DESC LIMIT 500`).all();
        return json({ orgs: (r.results || []).map((o) => ({ ...o, sectores: JSON.parse(o.sectores || "[]") })) }, 200, h);
      }
      if (partes[1] === "org" && partes[2] === "editar" && request.method === "POST") {
        // Editar datos de una empresa cliente: nombre, RFC, país y sectores (sin repetir otra empresa).
        const org = await db.prepare("SELECT id FROM dominus_orgs WHERE id = ?").bind(String(cuerpo.org || "")).first();
        if (!org) return json({ error: "La empresa no existe." }, 404, h);
        const d = validarOrg(cuerpo), rfc = rfcValido(cuerpo.rfc);
        const ya = await empresaExistente(db, d.nombre, rfc);
        if (ya && ya.id !== org.id) return json({ error: `Ya existe «${ya.nombre}» (coincide el ${ya.por}).` }, 409, h);
        await db.batch([
          db.prepare("UPDATE dominus_orgs SET nombre = ?, pais = ?, sectores = ? WHERE id = ?").bind(d.nombre, d.pais, JSON.stringify(d.sectores), org.id),
          db.prepare("DELETE FROM dominus_org_rfc WHERE org_id = ?").bind(org.id),
          ...(rfc ? [db.prepare("INSERT INTO dominus_org_rfc (org_id, rfc) VALUES (?, ?)").bind(org.id, rfc)] : []),
          db.prepare("INSERT INTO dominus_org_bitacora (org_id, email, accion, detalle) VALUES (?, 'admin-dominus', 'editar', ?)").bind(org.id, d.nombre),
        ]);
        return json({ ok: true }, 200, h);
      }
      if (partes[1] === "org" && partes[2] === "borrar" && request.method === "POST") {
        // Eliminar una empresa y todo lo suyo (miembros, invitaciones, cumplimiento, proyectos). Pide escribir el nombre.
        const org = await db.prepare("SELECT id, nombre FROM dominus_orgs WHERE id = ?").bind(String(cuerpo.org || "")).first();
        if (!org) return json({ error: "La empresa no existe." }, 404, h);
        if (String(cuerpo.confirmar || "").trim() !== org.nombre) return json({ error: "Para confirmar, escribe el nombre exacto de la empresa." }, 400, h);
        await rutaProyectos(db, org.id, [], "GET", {}, {}); // asegura las tablas de proyectos
        await db.batch(["dominus_proyecto_checklist", "dominus_proyecto_items", "dominus_proyectos", "dominus_cumplimiento", "dominus_org_invitaciones", "dominus_org_miembros", "dominus_org_rfc", "dominus_org_bitacora"]
          .map((t) => db.prepare(`DELETE FROM ${t} WHERE org_id = ?`).bind(org.id)).concat([db.prepare("DELETE FROM dominus_orgs WHERE id = ?").bind(org.id)]));
        return json({ ok: true }, 200, h);
      }
      if (partes[1] === "cuenta" && ["editar", "borrar"].includes(partes[2]) && request.method === "POST") {
        await asegurarAcceso(db);
        const email = String(cuerpo.email || "").trim().toLowerCase();
        const c = await db.prepare("SELECT email FROM dominus_cuentas WHERE email = ?").bind(email).first();
        if (!c) return json({ error: "La cuenta no existe." }, 404, h);
        if (partes[2] === "editar") {
          // Nombre visible y, si se pide, desbloquear (borra los intentos fallidos).
          const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 120);
          await db.prepare(`UPDATE dominus_cuentas SET nombre = ?${cuerpo.desbloquear ? ", bloqueo = 0, intentos = 0" : ""} WHERE email = ?`).bind(nombre, email).run();
          return json({ ok: true }, 200, h);
        }
        // Borrar la cuenta: ya no podrá entrar con contraseña. No se borra si es la única dueña de una empresa.
        const unica = await db.prepare(`SELECT o.nombre FROM dominus_org_miembros m JOIN dominus_orgs o ON o.id = m.org_id WHERE m.email = ? AND m.rol = 'dueno'
          AND (SELECT count(*) FROM dominus_org_miembros x WHERE x.org_id = m.org_id AND x.rol = 'dueno') = 1`).bind(email).first();
        if (unica) return json({ error: `Es la única dueña de «${unica.nombre}». Elimina esa empresa o agrega otra persona dueña antes.` }, 409, h);
        await db.batch([
          db.prepare("DELETE FROM dominus_cuentas_tokens WHERE email = ?").bind(email),
          db.prepare("DELETE FROM dominus_org_miembros WHERE email = ?").bind(email),
          db.prepare("DELETE FROM dominus_cuentas WHERE email = ?").bind(email),
        ]);
        return json({ ok: true }, 200, h);
      }
      if (partes[1] === "cortesia" && ["editar", "borrar"].includes(partes[2]) && request.method === "POST") {
        // Ampliar/cambiar la vigencia de una cortesía (días desde hoy) o quitarla (también apaga el plan del mapa que dio).
        await asegurarAcceso(db);
        const id = Number(cuerpo.id);
        const co = Number.isInteger(id) ? await db.prepare("SELECT id, email, producto FROM dominus_cortesias WHERE id = ?").bind(id).first() : null;
        if (!co) return json({ error: "La cortesía no existe." }, 404, h);
        const mapa = co.producto === "mapa";
        if (mapa) await db.prepare("CREATE TABLE IF NOT EXISTS dominus_memberships_email (email TEXT PRIMARY KEY NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email) AND email LIKE '%_@_%._%'), plan TEXT NOT NULL CHECK (plan IN ('recon', 'analyst', 'command')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > 0), updated_at INTEGER NOT NULL DEFAULT (unixepoch())) STRICT").run();
        if (partes[2] === "borrar") {
          await db.batch([db.prepare("DELETE FROM dominus_cortesias WHERE id = ?").bind(co.id),
            ...(mapa ? [db.prepare("UPDATE dominus_memberships_email SET active = 0, updated_at = unixepoch() WHERE email = ?").bind(co.email)] : [])]);
          return json({ ok: true }, 200, h);
        }
        const dias = Math.floor(Number(cuerpo.dias));
        if (!(dias >= 1 && dias <= 400)) return json({ error: "Días inválidos (1-400)." }, 400, h);
        const vence = ahora() + dias * DIA, nota = String(cuerpo.nota ?? "").slice(0, 300);
        await db.batch([db.prepare("UPDATE dominus_cortesias SET vence = ?, nota = ? WHERE id = ?").bind(vence, nota, co.id),
          ...(mapa ? [db.prepare("UPDATE dominus_memberships_email SET active = 1, expires_at = ?, updated_at = unixepoch() WHERE email = ?").bind(vence, co.email)] : [])]);
        return json({ ok: true, vence }, 200, h);
      }
      if (partes[1] === "plan" && request.method === "POST") {
        const plan = String(cuerpo.plan || ""), asientos = Number(cuerpo.asientos), dias = Number(cuerpo.dias);
        if (!["prueba", "individual", "equipo", "medida"].includes(plan) || !(asientos >= 1 && asientos <= 500) || !(dias >= 1 && dias <= 400)) return json({ error: "Plan, asientos (1-500) o días (1-400) inválidos." }, 400, h);
        const r = await db.prepare("UPDATE dominus_orgs SET plan = ?, asientos = ?, vence = ? WHERE id = ?").bind(plan, Math.floor(asientos), ahora() + Math.floor(dias) * DIA, String(cuerpo.org || "")).run();
        return json({ ok: (r.meta?.changes || 0) > 0 }, 200, h);
      }
      if (partes[1] === "alta" && request.method === "POST") {
        // Alta de una empresa cliente por Admin: datos, plan, días de prueba o de servicio y la persona dueña.
        const d = validarOrg(cuerpo), rfc = rfcValido(cuerpo.rfc);
        const dueno = String(cuerpo.dueno || "").trim().toLowerCase();
        if (!CORREO.test(dueno)) return json({ error: "Correo de la persona responsable inválido." }, 400, h);
        const plan = String(cuerpo.plan || "prueba"), asientos = Math.floor(Number(cuerpo.asientos || 3)), dias = Math.floor(Number(cuerpo.dias || 14));
        if (!["prueba", "individual", "equipo", "medida"].includes(plan) || !(asientos >= 1 && asientos <= 500) || !(dias >= 1 && dias <= 400)) return json({ error: "Plan, usuarios (1-500) o días (1-400) inválidos." }, 400, h);
        const ya = await empresaExistente(db, d.nombre, rfc);
        if (ya) return json({ error: `Ya existe «${ya.nombre}» (coincide el ${ya.por}). Usa esa empresa o cambia el nombre.`, existente: ya.id }, 409, h);
        const id = nuevoId();
        await db.batch([
          db.prepare("INSERT INTO dominus_orgs (id, nombre, pais, sectores, plan, asientos, vence) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, d.nombre, d.pais, JSON.stringify(d.sectores), plan, asientos, ahora() + dias * DIA),
          db.prepare("INSERT INTO dominus_org_miembros (org_id, email, rol) VALUES (?, ?, 'dueno')").bind(id, dueno),
          ...(rfc ? [db.prepare("INSERT INTO dominus_org_rfc (org_id, rfc) VALUES (?, ?)").bind(id, rfc)] : []),
          db.prepare("INSERT INTO dominus_org_bitacora (org_id, email, accion, detalle) VALUES (?, 'admin-dominus', 'alta', ?)").bind(id, `${plan} · ${asientos} usuarios · ${dias} días`),
        ]);
        await asegurarAcceso(db);
        const cuenta = await db.prepare("SELECT activa FROM dominus_cuentas WHERE email = ?").bind(dueno).first();
        const token = cuenta?.activa ? null : await enlaceActivacion(db, dueno, "admin-dominus");
        return json({ id, token, ya_tenia_cuenta: Boolean(cuenta?.activa) }, 201, h);
      }
      if (partes[1] === "acceso" && request.method === "POST") {
        // Enlace para que una persona cree o restablezca su contraseña DOMINUS (se copia y se le envía).
        const email = String(cuerpo.email || "").trim().toLowerCase();
        if (!CORREO.test(email)) return json({ error: "Correo inválido." }, 400, h);
        await asegurarAcceso(db);
        const c = await db.prepare("SELECT activa FROM dominus_cuentas WHERE email = ?").bind(email).first();
        return json({ token: await enlaceActivacion(db, email, "admin-dominus", c?.activa ? "restablecer" : "activar") }, 201, h);
      }
      if (partes[1] === "cortesia" && request.method === "POST") {
        const email = String(cuerpo.email || "").trim().toLowerCase(), producto = String(cuerpo.producto || ""), dias = Math.floor(Number(cuerpo.dias || 0));
        const plan = String(cuerpo.plan || ""), nota = String(cuerpo.nota || "").slice(0, 300);
        if (!CORREO.test(email)) return json({ error: "Correo inválido." }, 400, h);
        if (!(dias >= 1 && dias <= 400)) return json({ error: "Días inválidos (1-400)." }, 400, h);
        if (!["mapa", "creadores"].includes(producto)) return json({ error: "Producto inválido (para empresas usa «Alta de empresa»)." }, 400, h);
        if (producto === "mapa" && !["recon", "analyst", "command"].includes(plan)) return json({ error: "Plan del mapa inválido." }, 400, h);
        if (producto === "creadores" && !["inicial", "creador"].includes(plan)) return json({ error: "Plan de creadores inválido." }, 400, h);
        await asegurarAcceso(db);
        const vence = ahora() + dias * DIA;
        if (producto === "mapa") {
          await db.prepare("CREATE TABLE IF NOT EXISTS dominus_memberships_email (email TEXT PRIMARY KEY NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email) AND email LIKE '%_@_%._%'), plan TEXT NOT NULL CHECK (plan IN ('recon', 'analyst', 'command')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > 0), updated_at INTEGER NOT NULL DEFAULT (unixepoch())) STRICT").run();
          await db.prepare("INSERT INTO dominus_memberships_email (email, plan, active, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT (email) DO UPDATE SET plan = excluded.plan, active = 1, expires_at = excluded.expires_at, updated_at = unixepoch()").bind(email, plan, vence).run();
        }
        await db.prepare("INSERT INTO dominus_cortesias (email, producto, plan, vence, nota, creada_por) VALUES (?, ?, ?, ?, ?, 'admin-dominus')").bind(email, producto, plan, vence, nota).run();
        const c = await db.prepare("SELECT activa FROM dominus_cuentas WHERE email = ?").bind(email).first();
        return json({ ok: true, vence, token: c?.activa ? null : await enlaceActivacion(db, email, "admin-dominus") }, 201, h);
      }
      if (partes[1] === "proyectos") {
        // Proyectos y seguimiento de cualquier cliente (Admin → Clientes y proyectos → Proyectos).
        const org = /^[0-9a-f]{16}$/.test(partes[2] || "") ? await db.prepare("SELECT id FROM dominus_orgs WHERE id = ?").bind(partes[2]).first() : null;
        if (!org) return json({ error: "Elige una empresa válida." }, 404, h);
        const [b, s] = await rutaProyectos(db, org.id, partes.slice(3), request.method, cuerpo, { quien: "admin-dominus", escribir: true });
        return json(b, s, h);
      }
      if (partes[1] === "interno") {
        // Organización DOMINUS (organizacion.html): avance de las tareas de cada área de la propia empresa.
        const ORG = "dominus-interno";
        if (request.method === "GET") {
          const r = await db.prepare("SELECT clave, estado, responsable, fecha_limite, evidencia, actualizado FROM dominus_cumplimiento WHERE org_id = ?").bind(ORG).all();
          return json({ respuestas: r.results || [] }, 200, h);
        }
        const clave = String(cuerpo.clave || ""), estado = String(cuerpo.estado || "pendiente");
        const responsable = String(cuerpo.responsable || "").trim().slice(0, 120), fecha_limite = String(cuerpo.fecha_limite || ""), evidencia = String(cuerpo.evidencia || "").slice(0, 1000);
        if (!/^[a-z0-9_]{1,30}\.[a-z0-9_]{1,30}$/.test(clave)) return json({ error: "Tarea inválida." }, 400, h);
        if (!ESTADOS.includes(estado)) return json({ error: "Estado inválido." }, 400, h);
        if (fecha_limite && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_limite)) return json({ error: "Fecha inválida." }, 400, h);
        await db.prepare(`INSERT INTO dominus_cumplimiento (org_id, clave, estado, responsable, fecha_limite, evidencia, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin-dominus')
          ON CONFLICT (org_id, clave) DO UPDATE SET estado = excluded.estado, responsable = excluded.responsable, fecha_limite = excluded.fecha_limite, evidencia = excluded.evidencia, actualizado = excluded.actualizado`)
          .bind(ORG, clave, estado, responsable, fecha_limite, evidencia, ahora()).run();
        return json({ ok: true, actualizado: ahora() }, 200, h);
      }
      if (partes[1] === "cuentas" && request.method === "GET") {
        await asegurarAcceso(db);
        const cuentas = (await db.prepare("SELECT email, nombre, activa, creada, ultimo_ingreso, bloqueo FROM dominus_cuentas ORDER BY creada DESC LIMIT 500").all()).results || [];
        const cortesias = (await db.prepare("SELECT id, email, producto, plan, vence, nota, creada FROM dominus_cortesias ORDER BY id DESC LIMIT 500").all()).results || [];
        return json({ cuentas, cortesias }, 200, h);
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
      const ya = await empresaExistente(db, d.nombre);
      if (ya) return json({ error: `«${ya.nombre}» ya tiene un espacio en DOMINUS. Pide a su administrador que te invite con tu correo.` }, 409, h);
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
      const r = await aceptarInvitacionDirecta(db, token, correo);
      return r.ok ? json(r, 200, h) : json({ error: r.error }, r.status, h);
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

    if (accion === "proyectos") {
      const [b, s] = await rutaProyectos(db, orgId, partes.slice(2), request.method, cuerpo, { quien: correo, escribir: puede(yo.rol, "editor") });
      return json(b, s, h);
    }
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
