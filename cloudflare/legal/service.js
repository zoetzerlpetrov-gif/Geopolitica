// Datos legales del sitio (aviso de privacidad y términos): se editan en legal.html (solo admin) y se guardan en la
// base D1 del Worker «geopolitica». Las páginas públicas los leen de /legal/datos.json al abrirse: un cambio guardado
// se ve en la web en menos de un minuto, sin tocar GitHub.
// Solo campos de texto conocidos, con largo máximo; nada de HTML (las páginas lo insertan como texto).

export const CAMPOS = {
  tipo_persona: { max: 10, opciones: ["fisica", "moral"] },
  razon_social: { max: 160 },
  nombre_comercial: { max: 80 },
  rfc: { max: 13, patron: /^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})?$/ },
  domicilio: { max: 300 },
  correo_privacidad: { max: 120, patron: /^([^\s@<>]+@[^\s@<>]+\.[a-z]{2,})?$/i },
  correo_contacto: { max: 120, patron: /^([^\s@<>]+@[^\s@<>]+\.[a-z]{2,})?$/i },
  telefono: { max: 30, patron: /^[+\d\s()-]*$/ },
  departamento_datos: { max: 120 },
  jurisdiccion: { max: 80 },
  representante_ue: { max: 300 },
  sitio: { max: 120, patron: /^(https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?)?$/i },
  actualizado_privacidad: { max: 10, patron: /^(\d{4}-\d{2}-\d{2})?$/ },
  actualizado_terminos: { max: 10, patron: /^(\d{4}-\d{2}-\d{2})?$/ },
};

/** Objeto recibido → { datos } limpios o { error }. */
export function validar(entrada) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { error: "Formato inválido." };
  const extra = Object.keys(entrada).filter((k) => !CAMPOS[k]);
  if (extra.length) return { error: `Campos no permitidos: ${extra.join(", ")}` };
  const datos = {};
  for (const [k, regla] of Object.entries(CAMPOS)) {
    const v = entrada[k] == null ? "" : entrada[k];
    if (typeof v !== "string") return { error: `«${k}» debe ser texto.` };
    const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (t.length > regla.max) return { error: `«${k}» pasa de ${regla.max} caracteres.` };
    if (regla.opciones && t && !regla.opciones.includes(t)) return { error: `«${k}» debe ser ${regla.opciones.join(" o ")}.` };
    if (regla.patron && !regla.patron.test(k === "rfc" ? t.toUpperCase() : t)) return { error: `«${k}» no tiene un formato válido.` };
    datos[k] = k === "rfc" ? t.toUpperCase() : t;
  }
  return { datos };
}

const TABLA = "CREATE TABLE IF NOT EXISTS dominus_legal (id TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado INTEGER NOT NULL, por TEXT)";

export async function leer(db) {
  if (!db) return null;
  await db.prepare(TABLA).run();
  const fila = await db.prepare("SELECT datos, actualizado FROM dominus_legal WHERE id = 'sitio'").first();
  return fila ? { ...JSON.parse(fila.datos), _guardado: fila.actualizado } : null;
}

export async function guardar(db, datos, por) {
  await db.prepare(TABLA).run();
  await db.prepare("INSERT INTO dominus_legal (id, datos, actualizado, por) VALUES ('sitio', ?, unixepoch(), ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, por = excluded.por")
    .bind(JSON.stringify(datos), String(por || "")).run();
}

const PUBLICO = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

/** GET /legal/datos.json: público (los datos de un aviso de privacidad son públicos por ley). */
export async function servirPublico(env) {
  try {
    const d = await leer(env.OSINT_PLANS_DB);
    if (!d) return new Response("{}", { headers: PUBLICO });
    delete d._guardado;
    return new Response(JSON.stringify(d), { headers: PUBLICO });
  } catch {
    return new Response(JSON.stringify({ error: "sin datos" }), { status: 503, headers: PUBLICO });
  }
}

/** /admin/huella/legal: GET (estado actual) y PUT (guardar). Quien llama ya comprobó que es admin. */
export async function servirAdmin(request, url, env, json, quien) {
  if (!env.OSINT_PLANS_DB) return json({ error: "La base D1 no está vinculada al Worker." }, 503);
  if (request.method === "GET") return json({ datos: await leer(env.OSINT_PLANS_DB) || {} });
  if (request.method !== "PUT") return json({ error: "Método inválido." }, 405);
  if (request.headers.get("Origin") !== url.origin || request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
    return json({ error: "Origen o formato de solicitud inválido." }, 403);
  }
  const texto = await request.text();
  if (texto.length > 8000) return json({ error: "Solicitud demasiado grande." }, 413);
  let entrada;
  try { entrada = JSON.parse(texto); } catch { return json({ error: "JSON inválido." }, 400); }
  const { datos, error } = validar(entrada);
  if (error) return json({ error }, 400);
  await guardar(env.OSINT_PLANS_DB, datos, quien);
  return json({ ok: true, datos });
}
