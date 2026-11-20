// DESTINOS_FIJOS: este módulo no llama a servicios externos; solo lee el bucket R2 privado DATOS_PLAN del Worker.
// Datos por plan (fase 2): los archivos de data/ que solo usan los planes de pago (config/datos_por_plan.json, medido
// con la prueba por rol) no se publican en el sitio público; viven en R2 y el Worker los entrega solo a la sesión con
// ese plan o superior (o a Admin). Mientras «activo» sea false, no se sirve nada desde aquí.
import mapa from "../../config/datos_por_plan.json" with { type: "json" };

export const ORDEN_DATOS = ["demo", "recon", "analyst", "command", "admin"];
const RUTA = /^data\/[A-Za-z0-9_\-./]{1,200}$/;
const TIPOS = { json: "application/json", geojson: "application/geo+json", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8", pbf: "application/x-protobuf", png: "image/png", webp: "image/webp" };

/** Plan mínimo de una ruta de data/ (exacta o dentro de una carpeta protegida); null si es pública. */
export function planRequerido(ruta, m = mapa) {
  if (!m?.activo || !RUTA.test(ruta) || ruta.includes("..")) return null;
  const a = m.archivos || {};
  if (a[ruta]) return a[ruta];
  const carpeta = Object.keys(a).find((k) => k.endsWith("/") && ruta.startsWith(k));
  return carpeta ? a[carpeta] : null;
}

/** ¿El plan de la sesión alcanza? Admin alcanza todo; «admin» solo lo abre Admin. */
export const alcanza = (plan, requerido, esAdmin = false) => esAdmin || (requerido !== "admin" && ORDEN_DATOS.indexOf(plan) >= ORDEN_DATOS.indexOf(requerido) && ORDEN_DATOS.indexOf(plan) >= 0);

/** Respuesta con el archivo desde R2 (o 403/404). `extra`: encabezados (CORS del mapa). */
export async function servirDatos(env, ruta, plan, esAdmin, extra = {}, m = mapa) {
  const h = { "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff", ...extra };
  const req = planRequerido(ruta, m);
  if (!req) return new Response(null, { status: 404, headers: h });
  if (!alcanza(plan, req, esAdmin)) return Response.json({ error: "Tu plan no incluye estos datos.", plan_requerido: req }, { status: 403, headers: h });
  const obj = await env.DATOS_PLAN?.get(ruta);
  if (!obj) return new Response(null, { status: 404, headers: h });
  const ext = ruta.split(".").pop().toLowerCase();
  return new Response(obj.body, { headers: { ...h, "Content-Type": TIPOS[ext] || "application/octet-stream" } });
}
