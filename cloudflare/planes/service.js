import config from "../../config/planes.json" with { type: "json" };
import { authorized, begin, configured, sessionId, signOut } from "../huella/auth.js";
import { servirDatos } from "./datos.js";
import { CSS as CSS_CUENTA, paginaCuenta } from "./cuenta-ui.js";
import { TEMA_JS } from '../apariencia/tema-publico.js';
import { avisoMercadoPago } from "./mercadopago.js";
import { aceptarInvitacionDirecta, serveEmpresas } from "./empresas.js";
import { serveDocumentos } from "./documentos.js";
import { serveAcceso } from "./acceso.js";
import { completarGoogle, correoSesion, googleConfigurado, iniciarGoogle, planPorCorreo, registrado, salirGoogle, TABLA_EMAIL } from "./google.js";

const ORDER = ["demo", "recon", "analyst", "command"];
const groups = config.acceso_por_plan.grupos;
const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

// Misma definición que 001_planes.sql: el Worker crea la tabla la primera vez si aún no existe (no borra ni cambia datos).
export const TABLA = "CREATE TABLE IF NOT EXISTS dominus_memberships ( github_id TEXT PRIMARY KEY NOT NULL CHECK ( length(github_id) BETWEEN 1 AND 20 AND github_id GLOB '[1-9]*' AND github_id NOT GLOB '*[^0-9]*' ), plan TEXT NOT NULL CHECK (plan IN ('recon', 'analyst', 'command')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > 0), updated_at INTEGER NOT NULL DEFAULT (unixepoch()) ) STRICT;";
let tablaLista = false;

// El mapa público (dominusosint.com) pregunta aquí el plan de la cuenta. Solo esos orígenes, con la cookie de sesión
// (mismo sitio: admin.dominusosint.com). DESTINOS_FIJOS: no se llama a otros servicios.
export const ORIGENES_MAPA = ["https://dominusosint.com", "https://www.dominusosint.com"];
export function corsMapa(request) {
  const origen = request.headers.get("Origin");
  return ORIGENES_MAPA.includes(origen)
    ? { "Access-Control-Allow-Origin": origen, "Access-Control-Allow-Credentials": "true", Vary: "Origin" }
    : { Vary: "Origin" };
}

export async function activePlan(db, id) {
  if (!db || !id) return null;
  if (!tablaLista) { await db.prepare(TABLA).run(); tablaLista = true; }
  const row = await db.prepare(
    "SELECT plan FROM dominus_memberships WHERE github_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > unixepoch())"
  ).bind(id).first();
  return ORDER.indexOf(row?.plan) > 0 ? row.plan : null;
}

// Página de la cuenta: CSS y script de preferencia aparte, sin estilos ni scripts en línea.
const CSP_CUENTA = "default-src 'none'; script-src 'self'; style-src 'self' https://dominusosint.com; font-src https://dominusosint.com; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
function page(plan, failed, google = false) {
  return new Response(paginaCuenta({ plan, fallo: failed, google }),
    { headers: { ...headers, "Content-Security-Policy": CSP_CUENTA, "Content-Type": "text/html; charset=utf-8" } });
}

export async function servePlans(request, url, env, authRoot) {
  if (!configured(url, env) || !env.OSINT_PLANS_DB) return Response.json({ error: "Acceso a planes sin configurar." }, { status: 503, headers });
  const route = url.pathname.slice("/cuenta/".length);
  if (route === 'tema.js' && request.method === 'GET') return new Response(TEMA_JS,{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  // Avisos de Mercado Pago (alta y baja automáticas): firma verificada dentro de avisoMercadoPago.
  if (route === "mercadopago/aviso" && request.method === "POST") return avisoMercadoPago(request, url, env, TABLA_EMAIL);
  if (route === "cuenta.css" && request.method === "GET") return new Response(CSS_CUENTA, { headers: { ...headers, "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  if (route === "ingreso" && request.method === "GET") return begin(url, env, authRoot, "planes");
  if (route === "google" && request.method === "GET") return googleConfigurado(env) ? iniciarGoogle(url, env) : Response.json({ error: "Inicio con Google sin configurar." }, { status: 503, headers });
  if (route === "google/callback" && request.method === "GET" && googleConfigurado(env)) return completarGoogle(request, url, env, (email) => planPorCorreo(env.OSINT_PLANS_DB, email, ORDER));
  if (route === "salir" && request.method === "POST" && request.headers.get("Origin") === url.origin) {
    const logout = signOut("planes");
    logout.headers.set("Location", "/cuenta/");
    logout.headers.append("Set-Cookie", salirGoogle());
    return new Response(null, { status: 303, headers: logout.headers });
  }
  // Cuentas propias de DOMINUS (correo y contraseña): entrar, activar con enlace o invitación, salir.
  if (route === "acceso" || route.startsWith("acceso/")) {
    return serveAcceso(request, url, env, { origenes: ORIGENES_MAPA, base: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" },
      aceptarInvitacion: (token, email) => aceptarInvitacionDirecta(env.OSINT_PLANS_DB, token, email) });
  }
  // Espacios de empresa (organizaciones, miembros, invitaciones y cumplimiento): API JSON con la sesión de Google.
  // Documentos de Organización DOMINUS (solo administración): texto en D1 y archivos en R2.
  if (route === "empresa/admin/docs" || route.startsWith("empresa/admin/docs/")) {
    return serveDocumentos(request, url, env, { esAdmin: await authorized(request, env).catch(() => false), origenes: ORIGENES_MAPA,
      base: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  if (route === "empresa" || route.startsWith("empresa/")) {
    const correo = await correoSesion(request, env).catch(() => null);
    const esAdmin = await authorized(request, env).catch(() => false);
    return serveEmpresas(request, url, env, { correo, esAdmin, origenes: ORIGENES_MAPA, base: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  if (request.method !== "GET") return Response.json({ error: "Método inválido." }, { status: 405, headers });
  try {
    const correo = await correoSesion(request, env);
    const plan = await activePlan(env.OSINT_PLANS_DB, await sessionId(request, env, "planes"))
      || await planPorCorreo(env.OSINT_PLANS_DB, correo, ORDER)
      || (await registrado(env.OSINT_PLANS_DB, correo) ? "demo" : null);
    if (route === "") return page(plan, url.searchParams.get("estado") === "sin-acceso", googleConfigurado(env));
    // Datos por plan (fase 2): archivos de data/ que solo ven los planes de pago, desde R2 y con la sesión del mapa.
    if (route.startsWith("datos/")) {
      const cors = corsMapa(request);
      return servirDatos(env, route.slice("datos/".length), plan, await authorized(request, env).catch(() => false), cors);
    }
    if (route === "sesion" || route === "permiso") {
      const h = route === "sesion" ? { ...headers, ...corsMapa(request) } : headers;
      if (!plan) return Response.json({ error: "No hay un plan activo." }, { status: 403, headers: h });
      if (route === "sesion") return Response.json({ plan }, { headers: h });
      const group = url.searchParams.get("grupo");
      if (!Object.hasOwn(groups, group)) return Response.json({ error: "Grupo desconocido." }, { status: 404, headers });
      const minimum = ORDER.indexOf(groups[group]);  // «demo» (registro gratuito) solo abre lo del plan Demo
      const allowed = minimum >= 0 && ORDER.indexOf(plan) >= minimum;
      return Response.json({ allowed }, { status: allowed ? 200 : 403, headers });
    }
    return Response.json({ error: "Ruta inexistente." }, { status: 404, headers });
  } catch {
    return Response.json({ error: "No se pudo comprobar el plan." }, { status: 503, headers });
  }
}
