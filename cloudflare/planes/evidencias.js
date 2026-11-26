// DESTINOS_FIJOS: este módulo no llama a servicios externos; usa la base D1 (OSINT_PLANS_DB) y el bucket R2 privado DATOS_PLAN.
// Evidencias (archivos, enlaces o notas) ligadas a algo concreto, guardadas en el servidor por empresa:
//   ref = «proy:<pid>:item:<iid>» (hallazgo o actividad), «proy:<pid>:check:<cid>» (pregunta de auditoría o riesgo),
//         «proy:<pid>:fase:<fase>» (contrato, informe…), «cumpl:<clave>» (cumplimiento normativo), «autoaud:<marco>:<ref>».
// Rutas (empresa = id de 16 hex; Admin también «dominus-interno»):
//   Mi empresa: /cuenta/empresa/<org>/evidencias…   (miembros consultan; desde «editor» agregan y quitan; con plan vigente)
//   Admin:      /cuenta/empresa/admin/evidencias/<org>…
//   GET  ?ref=… | ?prefijo=…        → lista
//   GET  /<id>                      → descarga del archivo (adjunto)
//   POST /enlace  {ref, titulo, url?, nota?}
//   POST /archivo?ref=&titulo=&nombre=   (cuerpo: el archivo, hasta 10 MB)
//   POST /<id>/borrar
import { TIPOS, tipoArchivo, MAX_ARCHIVO } from "./documentos.js";

const REF = /^(proy:[0-9a-f]{16}:(item|check):[0-9a-f]{16}|proy:[0-9a-f]{16}:fase:[a-z_]{2,20}|cumpl:[A-Za-z0-9_:#.-]{3,120}|autoaud:[A-Za-z0-9_.:-]{2,120})$/;
const PREFIJO = /^(proy:[0-9a-f]{16}:|cumpl:|autoaud:)[A-Za-z0-9_:#.-]{0,120}$/;
const ID = /^[0-9a-f]{16}$/;
const INTERNO = "dominus-interno";
const listas = new WeakSet();
const ahora = () => Math.floor(Date.now() / 1000);
const nuevoId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
const limpio = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
export { TIPOS };

async function asegurar(db) {
  if (listas.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_evidencias (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL, ref TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('archivo', 'enlace', 'nota')), titulo TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '', tamano INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL, por TEXT NOT NULL DEFAULT '')`).run();
  listas.add(db);
}

export const validarRef = (r) => REF.test(String(r || ""));

/** ¿Quién pide y qué puede hacer? Devuelve {org, escribir, quien} o una respuesta de error [cuerpo, estado]. */
async function permiso(db, url, { esAdmin, correo }) {
  const m = url.pathname.match(/^\/cuenta\/empresa\/(?:admin\/evidencias\/([0-9a-z-]+)|([0-9a-f]{16})\/evidencias)(\/.*)?$/);
  if (!m) return { error: [{ error: "Ruta inexistente." }, 404] };
  if (m[1] !== undefined) {
    if (!esAdmin) return { error: [{ error: "Solo administración." }, 403] };
    const org = m[1] === INTERNO ? INTERNO : (ID.test(m[1]) && await db.prepare("SELECT id FROM dominus_orgs WHERE id = ?").bind(m[1]).first()) ? m[1] : null;
    if (!org) return { error: [{ error: "Empresa inválida." }, 404] };
    return { org, escribir: true, quien: "admin-dominus", resto: m[3] || "" };
  }
  if (!correo) return { error: [{ error: "Inicia sesión para ver las evidencias." }, 401] };
  const yo = await db.prepare("SELECT m.rol, o.vence FROM dominus_org_miembros m JOIN dominus_orgs o ON o.id = m.org_id WHERE m.org_id = ? AND m.email = ?").bind(m[2], correo).first();
  if (!yo) return { error: [{ error: "No perteneces a esta empresa." }, 403] };
  return { org: m[2], escribir: ["editor", "admin", "dueno"].includes(yo.rol) && Number(yo.vence) > ahora(), quien: correo, resto: m[3] || "" };
}

export async function serveEvidencias(request, url, env, { esAdmin = false, correo = null, origenes = [], base = {} }) {
  const cors = origenes.includes(request.headers.get("Origin")) ? { "Access-Control-Allow-Origin": request.headers.get("Origin"), "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : { Vary: "Origin" };
  const h = { ...base, ...cors, "Content-Type": "application/json; charset=utf-8" };
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: h });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...h, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } });
  if (request.method === "POST") {
    const o = request.headers.get("Origin");
    if (o !== url.origin && !origenes.includes(o)) return json({ error: "Origen no permitido." }, 403);
  } else if (request.method !== "GET") return json({ error: "Método inválido." }, 405);
  const db = env.OSINT_PLANS_DB;
  if (!db) return json({ error: "Base de datos sin configurar." }, 503);
  await asegurar(db);
  const p = await permiso(db, url, { esAdmin, correo });
  if (p.error) return json(...p.error);
  const { org, escribir, quien } = p, partes = p.resto.split("/").filter(Boolean);
  const llave = (id) => `evidencias/${org}/${id}`;
  try {
    if (request.method === "GET" && !partes.length) {
      const ref = url.searchParams.get("ref"), pre = url.searchParams.get("prefijo");
      if (ref ? !validarRef(ref) : !PREFIJO.test(pre || "")) return json({ error: "Indica ref o prefijo válido." }, 400);
      const r = ref ? await db.prepare("SELECT id, ref, tipo, titulo, url, nota, nombre, mime, tamano, creado, por FROM dominus_evidencias WHERE org_id = ? AND ref = ? ORDER BY creado DESC").bind(org, ref).all()
        : await db.prepare("SELECT id, ref, tipo, titulo, url, nota, nombre, mime, tamano, creado, por FROM dominus_evidencias WHERE org_id = ? AND substr(ref, 1, ?) = ? ORDER BY creado DESC LIMIT 2000").bind(org, pre.length, pre).all();
      return json({ evidencias: r.results || [], escribir });
    }
    if (request.method === "GET" && partes.length === 1 && ID.test(partes[0])) {
      const e = await db.prepare("SELECT * FROM dominus_evidencias WHERE id = ? AND org_id = ?").bind(partes[0], org).first();
      if (!e || e.tipo !== "archivo") return json({ error: "No existe." }, 404);
      const obj = await env.DATOS_PLAN?.get(llave(e.id));
      if (!obj) return json({ error: "El archivo no está en el almacenamiento." }, 404);
      return new Response(obj.body, { headers: { ...base, ...cors, "Content-Type": e.mime || "application/octet-stream", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(e.nombre || "evidencia")}`, "Content-Security-Policy": "sandbox" } });
    }
    if (request.method !== "POST") return json({ error: "Ruta inexistente." }, 404);
    if (!escribir) return json({ error: "Tu rol solo permite consultar (o el plan de la empresa venció)." }, 403);
    const n = await db.prepare("SELECT count(*) AS n FROM dominus_evidencias WHERE org_id = ?").bind(org).first();
    if (partes[0] === "enlace" && partes.length === 1) {
      const t = await request.text();
      if (t.length > 8000) return json({ error: "Solicitud demasiado grande." }, 413);
      let c; try { c = JSON.parse(t || "{}"); } catch { return json({ error: "JSON inválido." }, 400); }
      const ref = String(c.ref || ""), titulo = limpio(c.titulo, 200), u = limpio(c.url, 1000), nota = limpio(c.nota, 3000);
      if (!validarRef(ref)) return json({ error: "Referencia inválida." }, 400);
      if (u && !/^https:\/\/[^\s<>"']+$/i.test(u)) return json({ error: "El enlace debe empezar con https://" }, 400);
      if (!titulo || (!u && !nota)) return json({ error: "Escribe un título y un enlace o una nota." }, 400);
      if ((n?.n || 0) >= 5000) return json({ error: "Límite de 5,000 evidencias por empresa." }, 409);
      const id = nuevoId();
      await db.prepare("INSERT INTO dominus_evidencias (id, org_id, ref, tipo, titulo, url, nota, creado, por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, org, ref, u ? "enlace" : "nota", titulo, u, nota, ahora(), quien).run();
      return json({ ok: true, id }, 201);
    }
    if (partes[0] === "archivo" && partes.length === 1) {
      if (!env.DATOS_PLAN) return json({ error: "Almacenamiento de archivos sin configurar." }, 503);
      const q = url.searchParams, ref = q.get("ref") || "", tipo = tipoArchivo(q.get("nombre")), titulo = limpio(q.get("titulo") || q.get("nombre"), 200);
      if (!validarRef(ref)) return json({ error: "Referencia inválida." }, 400);
      if (!tipo) return json({ error: "Tipo de archivo no permitido. Usa PDF, Word, Excel, PowerPoint, imágenes, CSV, TXT o ZIP." }, 400);
      if (Number(request.headers.get("Content-Length") || 0) > MAX_ARCHIVO) return json({ error: "El archivo supera 10 MB." }, 413);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ error: "El archivo está vacío." }, 400);
      if (bytes.byteLength > MAX_ARCHIVO) return json({ error: "El archivo supera 10 MB." }, 413);
      if ((n?.n || 0) >= 5000) return json({ error: "Límite de 5,000 evidencias por empresa." }, 409);
      const id = nuevoId();
      await env.DATOS_PLAN.put(llave(id), bytes, { httpMetadata: { contentType: tipo.mime } });
      await db.prepare("INSERT INTO dominus_evidencias (id, org_id, ref, tipo, titulo, nombre, mime, tamano, creado, por) VALUES (?, ?, ?, 'archivo', ?, ?, ?, ?, ?, ?)")
        .bind(id, org, ref, titulo, tipo.nombre, tipo.mime, bytes.byteLength, ahora(), quien).run();
      return json({ ok: true, id }, 201);
    }
    if (partes.length === 2 && ID.test(partes[0]) && partes[1] === "borrar") {
      const e = await db.prepare("SELECT tipo FROM dominus_evidencias WHERE id = ? AND org_id = ?").bind(partes[0], org).first();
      if (!e) return json({ error: "No existe." }, 404);
      if (e.tipo === "archivo") await env.DATOS_PLAN?.delete(llave(partes[0]));
      await db.prepare("DELETE FROM dominus_evidencias WHERE id = ?").bind(partes[0]).run();
      return json({ ok: true });
    }
    return json({ error: "Ruta inexistente." }, 404);
  } catch {
    return json({ error: "No se pudo completar la operación." }, 500);
  }
}
