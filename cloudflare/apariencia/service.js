// Apariencia del sitio (apariencia.html, solo admin): colores, tipografías, esquinas e íconos. Se guarda en la D1 del
// Worker y todas las páginas la leen de /apariencia/datos.json (js/apariencia.js). Solo valores de una lista cerrada o
// colores hexadecimales: no se acepta CSS libre.
export const COLORES = ["bg", "surface", "surface-2", "text", "text-2", "line", "accent", "focus"];
export const FUENTES = ["sistema", "plex", "plex-barlow"];
export const ICONOS = ["mostrar", "ocultar"];
const HEX = /^#[0-9a-f]{6}$/i;

export function validar(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return { error: "Formato inválido." };
  const d = { preset: String(e.preset || "personalizado").slice(0, 30).replace(/[^a-z0-9_-]/gi, ""), claro: {}, oscuro: {} };
  for (const modo of ["claro", "oscuro"]) {
    for (const k of COLORES) {
      const v = e[modo]?.[k];
      if (!HEX.test(String(v || ""))) return { error: `Color «${modo}.${k}» inválido (usa #RRGGBB).` };
      d[modo][k] = v.toLowerCase();
    }
  }
  if (!FUENTES.includes(e.fuente)) return { error: "Tipografía no permitida." };
  if (!ICONOS.includes(e.iconos)) return { error: "Opción de íconos inválida." };
  const radio = Number(e.radio);
  if (!Number.isInteger(radio) || radio < 0 || radio > 16) return { error: "Las esquinas van de 0 a 16 px." };
  Object.assign(d, { fuente: e.fuente, iconos: e.iconos, radio, titulos_mayusculas: Boolean(e.titulos_mayusculas) });
  return { datos: d };
}

const TABLA = "CREATE TABLE IF NOT EXISTS dominus_apariencia (id TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado INTEGER NOT NULL, por TEXT)";
const PUBLICO = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };

export async function leer(db) {
  if (!db) return null;
  await db.prepare(TABLA).run();
  const f = await db.prepare("SELECT datos FROM dominus_apariencia WHERE id = 'sitio'").first();
  return f ? JSON.parse(f.datos) : null;
}

export async function servirPublico(env) {
  try { return new Response(JSON.stringify(await leer(env.OSINT_PLANS_DB) || {}), { headers: PUBLICO }); }
  catch { return new Response("{}", { status: 503, headers: PUBLICO }); }
}

export async function servirAdmin(request, url, env, json, quien) {
  const db = env.OSINT_PLANS_DB;
  if (!db) return json({ error: "La base D1 no está vinculada al Worker." }, 503);
  if (request.method === "GET") return json({ datos: await leer(db) || {} });
  if (request.method !== "PUT") return json({ error: "Método inválido." }, 405);
  if (request.headers.get("Origin") !== url.origin || request.headers.get("Content-Type")?.split(";")[0] !== "application/json") return json({ error: "Origen o formato inválido." }, 403);
  const t = await request.text();
  if (t.length > 4000) return json({ error: "Solicitud demasiado grande." }, 413);
  let e; try { e = JSON.parse(t); } catch { return json({ error: "JSON inválido." }, 400); }
  const { datos, error } = validar(e);
  if (error) return json({ error }, 400);
  await db.prepare(TABLA).run();
  await db.prepare("INSERT INTO dominus_apariencia (id, datos, actualizado, por) VALUES ('sitio', ?, unixepoch(), ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, por = excluded.por")
    .bind(JSON.stringify(datos), String(quien || "")).run();
  return json({ ok: true, datos });
}
