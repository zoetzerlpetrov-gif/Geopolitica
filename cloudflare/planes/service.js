import config from "../../config/planes.json" with { type: "json" };
import { begin, configured, sessionId, signOut } from "../huella/auth.js";

const ORDER = ["demo", "recon", "analyst", "command"];
const groups = config.acceso_por_plan.grupos;
const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

export async function activePlan(db, id) {
  if (!db || !id) return null;
  const row = await db.prepare(
    "SELECT plan FROM dominus_memberships WHERE github_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > unixepoch())"
  ).bind(id).first();
  return ORDER.indexOf(row?.plan) > 0 ? row.plan : null;
}

function page(plan, failed) {
  const content = plan
    ? `<p>Plan activo <strong>${plan.toUpperCase()}</strong>.</p><p>Consulta tu asignación de prueba. El mapa público conserva su vista Demo y la simulación de planes.</p>
       <form method="post" action="salir"><button type="submit">Cerrar sesión</button></form>`
    : `${failed ? '<p role="alert">No se pudo abrir una sesión con un plan activo.</p>' : ""}
       <p>Entra con la cuenta de GitHub a la que se asignó un plan.</p><a href="ingreso">Continuar con GitHub</a>`;
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Cuenta · DOMINUS</title><link rel="stylesheet" href="/admin/huella/huella.css"></head><body><header><a href="/">Mapa</a></header><main><section class="panel"><h1>Mi cuenta DOMINUS</h1>${content}</section></main></body></html>`,
    { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

export async function servePlans(request, url, env, authRoot) {
  if (!configured(url, env) || !env.OSINT_PLANS_DB) return Response.json({ error: "Acceso a planes sin configurar." }, { status: 503, headers });
  const route = url.pathname.slice("/cuenta/".length);
  if (route === "ingreso" && request.method === "GET") return begin(url, env, authRoot, "planes");
  if (route === "salir" && request.method === "POST" && request.headers.get("Origin") === url.origin) {
    const logout = signOut("planes");
    logout.headers.set("Location", "/cuenta/");
    return new Response(null, { status: 303, headers: logout.headers });
  }
  if (request.method !== "GET") return Response.json({ error: "Método inválido." }, { status: 405, headers });
  try {
    const plan = await activePlan(env.OSINT_PLANS_DB, await sessionId(request, env, "planes"));
    if (route === "") return page(plan, url.searchParams.get("estado") === "sin-acceso");
    if (route === "sesion" || route === "permiso") {
      if (!plan) return Response.json({ error: "No hay un plan activo." }, { status: 403, headers });
      if (route === "sesion") return Response.json({ plan }, { headers });
      const group = url.searchParams.get("grupo");
      if (!Object.hasOwn(groups, group)) return Response.json({ error: "Grupo desconocido." }, { status: 404, headers });
      const minimum = ORDER.indexOf(groups[group]);
      const allowed = minimum >= 0 && ORDER.indexOf(plan) >= minimum;
      return Response.json({ allowed }, { status: allowed ? 200 : 403, headers });
    }
    return Response.json({ error: "Ruta inexistente." }, { status: 404, headers });
  } catch {
    return Response.json({ error: "No se pudo comprobar el plan." }, { status: 503, headers });
  }
}
