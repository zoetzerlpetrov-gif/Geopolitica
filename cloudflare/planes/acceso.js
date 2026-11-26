// Cuentas propias de DOMINUS (correo + contraseña), sin depender de Google ni de otro proveedor.
// - La contraseña se guarda solo como derivación PBKDF2-SHA256 (100 000 iteraciones, sal aleatoria de 16 bytes).
// - Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. El mensaje de error no dice si el correo existe.
// - Una cuenta nace «pendiente» con un enlace de activación de un solo uso (7 días) que crea Admin o que llega como
//   invitación de una empresa; con él la persona elige su contraseña.
// - Al entrar se emite la misma sesión de cliente que con Google (cookieCorreo): todo lo demás funciona igual.
// DESTINOS_FIJOS: no se llama a otros servicios.
import { cookieCorreo, correoSesion, salirGoogle } from "./google.js";

export const ITERACIONES = 100000;
export const MIN_CONTRASENA = 10;
const MAX_INTENTOS = 5, BLOQUEO = 15 * 60, DIA = 86400;
const CORREO = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/;
const ahora = () => Math.floor(Date.now() / 1000);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h) => Uint8Array.from(String(h).match(/../g) || [], (x) => parseInt(x, 16));
export const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));

export const TABLAS_ACCESO = [
  "CREATE TABLE IF NOT EXISTS dominus_cuentas (email TEXT PRIMARY KEY NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)), hash TEXT NOT NULL DEFAULT '', sal TEXT NOT NULL DEFAULT '', iter INTEGER NOT NULL DEFAULT 100000, nombre TEXT NOT NULL DEFAULT '' CHECK (length(nombre) <= 120), activa INTEGER NOT NULL DEFAULT 0 CHECK (activa IN (0, 1)), intentos INTEGER NOT NULL DEFAULT 0, bloqueo INTEGER NOT NULL DEFAULT 0, creada INTEGER NOT NULL DEFAULT (unixepoch()), ultimo_ingreso INTEGER NOT NULL DEFAULT 0) STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_cuentas_tokens (token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64), email TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('activar', 'restablecer')), vence INTEGER NOT NULL, creado_por TEXT NOT NULL DEFAULT '') STRICT",
  "CREATE TABLE IF NOT EXISTS dominus_cortesias (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, producto TEXT NOT NULL CHECK (producto IN ('mapa', 'empresa', 'creadores')), plan TEXT NOT NULL DEFAULT '' CHECK (length(plan) <= 30), vence INTEGER NOT NULL, nota TEXT NOT NULL DEFAULT '' CHECK (length(nota) <= 300), creada_por TEXT NOT NULL DEFAULT '', creada INTEGER NOT NULL DEFAULT (unixepoch())) STRICT",
];
const listas = new WeakSet();
export async function asegurarAcceso(db) {
  if (listas.has(db)) return;
  for (const t of TABLAS_ACCESO) await db.prepare(t).run();
  listas.add(db);
}

/** Derivación PBKDF2 de la contraseña (hex). */
export async function derivar(contrasena, salHex, iter = ITERACIONES) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deHex(salHex), iterations: iter }, base, 256));
}
/** Comparación en tiempo constante de dos cadenas hex del mismo largo. */
export function iguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Reglas mínimas de contraseña (NIST SP 800-63B: largo antes que complejidad). */
export function revisarContrasena(c, email = "") {
  const t = String(c || "");
  if ([...t].length < MIN_CONTRASENA) return `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`;
  if (t.length > 200) return "La contraseña es demasiado larga.";
  if (email && t.toLowerCase().includes(String(email).split("@")[0].toLowerCase()) && String(email).split("@")[0].length >= 4) return "La contraseña no debe contener tu correo.";
  if (/^(.)\1+$/.test(t) || /^(0123456789|1234567890|contrasena|password)/i.test(t)) return "Esa contraseña es demasiado fácil de adivinar.";
  return null;
}

/** Crea la cuenta pendiente si no existe y devuelve un enlace de activación (token en claro, una sola vez). */
export async function enlaceActivacion(db, email, creadoPor = "", tipo = "activar") {
  await asegurarAcceso(db);
  const e = String(email || "").trim().toLowerCase();
  if (!CORREO.test(e)) throw new Error("Correo inválido.");
  await db.prepare("INSERT OR IGNORE INTO dominus_cuentas (email) VALUES (?)").bind(e).run();
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare("DELETE FROM dominus_cuentas_tokens WHERE email = ?").bind(e),
    db.prepare("INSERT INTO dominus_cuentas_tokens (token_hash, email, tipo, vence, creado_por) VALUES (?, ?, ?, ?, ?)").bind(await sha256(token), e, tipo, ahora() + 7 * DIA, creadoPor),
  ]);
  return token;
}

const json = (d, s, h) => Response.json(d, { status: s, headers: h });

/**
 * /cuenta/acceso/<ruta>: entrar, activar (con enlace de activación o con invitación de empresa), salir y estado.
 * `origenes`: orígenes permitidos (el sitio público llama con credenciales).
 */
export async function serveAcceso(request, url, env, { origenes = [], base = {}, aceptarInvitacion = null } = {}) {
  const o = request.headers.get("Origin");
  const h = { ...base, "Content-Type": "application/json; charset=utf-8", ...(origenes.includes(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : { Vary: "Origin" }) };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...h, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" } });
  const db = env.OSINT_PLANS_DB;
  if (!db || !(env.OSINT_SESSION_SECRET?.length >= 32)) return json({ error: "Acceso sin configurar." }, 503, h);
  const ruta = url.pathname.replace(/^\/cuenta\/acceso\/?/, "");
  if (request.method === "GET" && ruta === "estado") return json({ email: await correoSesion(request, env).catch(() => null) }, 200, h);
  if (request.method !== "POST") return json({ error: "Método inválido." }, 405, h);
  if (o !== url.origin && !origenes.includes(o)) return json({ error: "Origen no permitido." }, 403, h);
  if (ruta === "salir") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...h, "Set-Cookie": salirGoogle() } });
  const texto = await request.text();
  if (texto.length > 4000) return json({ error: "Solicitud demasiado grande." }, 413, h);
  let d = {};
  try { d = JSON.parse(texto || "{}"); } catch { return json({ error: "JSON inválido." }, 400, h); }
  try {
    await asegurarAcceso(db);
    const entrar = async (email) => {
      await db.prepare("UPDATE dominus_cuentas SET intentos = 0, bloqueo = 0, ultimo_ingreso = ? WHERE email = ?").bind(ahora(), email).run();
      return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers: { ...h, "Set-Cookie": await cookieCorreo(env, email) } });
    };
    if (ruta === "entrar") {
      const email = String(d.email || "").trim().toLowerCase(), pw = String(d.contrasena || "");
      const generico = { error: "Correo o contraseña incorrectos." };
      if (!CORREO.test(email) || !pw) return json(generico, 401, h);
      const c = await db.prepare("SELECT * FROM dominus_cuentas WHERE email = ?").bind(email).first();
      if (c?.bloqueo > ahora()) return json({ error: `Demasiados intentos. Espera ${Math.ceil((c.bloqueo - ahora()) / 60)} min o pide un enlace nuevo a tu administrador.` }, 429, h);
      if (!c || !c.activa || !c.hash) {
        await derivar(pw, "00".repeat(16));  // mismo tiempo de respuesta exista o no la cuenta
        return json(generico, 401, h);
      }
      if (!iguales(await derivar(pw, c.sal, c.iter), c.hash)) {
        const n = (c.intentos || 0) + 1;
        await db.prepare("UPDATE dominus_cuentas SET intentos = ?, bloqueo = ? WHERE email = ?").bind(n >= MAX_INTENTOS ? 0 : n, n >= MAX_INTENTOS ? ahora() + BLOQUEO : 0, email).run();
        return json(n >= MAX_INTENTOS ? { error: "Demasiados intentos. La cuenta queda bloqueada 15 minutos." } : generico, n >= MAX_INTENTOS ? 429 : 401, h);
      }
      return entrar(email);
    }
    if (ruta === "activar") {
      const token = String(d.token || "");
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Enlace inválido." }, 400, h);
      const th = await sha256(token);
      let email = null, invitacion = false;
      const t = await db.prepare("SELECT * FROM dominus_cuentas_tokens WHERE token_hash = ? AND vence > ?").bind(th, ahora()).first();
      if (t) email = t.email;
      else {
        // Una invitación de empresa también sirve para crear la cuenta DOMINUS del invitado.
        const inv = await db.prepare("SELECT email FROM dominus_org_invitaciones WHERE token_hash = ? AND vence > ?").bind(th, ahora()).first().catch(() => null);
        if (inv) { email = inv.email; invitacion = true; }
      }
      if (!email) return json({ error: "El enlace no existe o ya venció. Pide uno nuevo." }, 404, h);
      const problema = revisarContrasena(d.contrasena, email);
      if (problema) return json({ error: problema }, 400, h);
      const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await derivar(String(d.contrasena), sal);
      const nombre = String(d.nombre || "").trim().slice(0, 120);
      await db.prepare("INSERT OR IGNORE INTO dominus_cuentas (email) VALUES (?)").bind(email).run();
      await db.batch([
        db.prepare("UPDATE dominus_cuentas SET hash = ?, sal = ?, iter = ?, activa = 1, nombre = CASE WHEN ? <> '' THEN ? ELSE nombre END WHERE email = ?").bind(hash, sal, ITERACIONES, nombre, nombre, email),
        db.prepare("DELETE FROM dominus_cuentas_tokens WHERE email = ?").bind(email),
      ]);
      if (invitacion && aceptarInvitacion) await aceptarInvitacion(token, email);
      return entrar(email);
    }
    if (ruta === "cambiar") {
      // La persona, ya dentro, cambia su contraseña: pide la actual (o crea una si solo entraba con Google).
      const email = await correoSesion(request, env).catch(() => null);
      if (!email) return json({ error: "Inicia sesión para cambiar tu contraseña." }, 401, h);
      const c = await db.prepare("SELECT * FROM dominus_cuentas WHERE email = ?").bind(email).first();
      if (c?.bloqueo > ahora()) return json({ error: `Demasiados intentos. Espera ${Math.ceil((c.bloqueo - ahora()) / 60)} min.` }, 429, h);
      if (c?.activa && c.hash && !iguales(await derivar(String(d.actual || ""), c.sal, c.iter), c.hash)) {
        const n = (c.intentos || 0) + 1;
        await db.prepare("UPDATE dominus_cuentas SET intentos = ?, bloqueo = ? WHERE email = ?").bind(n >= MAX_INTENTOS ? 0 : n, n >= MAX_INTENTOS ? ahora() + BLOQUEO : 0, email).run();
        return json({ error: "La contraseña actual no es correcta." }, 401, h);
      }
      const problema = revisarContrasena(d.nueva, email);
      if (problema) return json({ error: problema }, 400, h);
      const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
      await db.prepare("INSERT OR IGNORE INTO dominus_cuentas (email) VALUES (?)").bind(email).run();
      await db.batch([
        db.prepare("UPDATE dominus_cuentas SET hash = ?, sal = ?, iter = ?, activa = 1, intentos = 0, bloqueo = 0 WHERE email = ?").bind(await derivar(String(d.nueva), sal), sal, ITERACIONES, email),
        db.prepare("DELETE FROM dominus_cuentas_tokens WHERE email = ?").bind(email),
      ]);
      return json({ ok: true }, 200, h);
    }
    return json({ error: "Ruta inexistente." }, 404, h);
  } catch {
    return json({ error: "No se pudo completar el acceso." }, 503, h);
  }
}
