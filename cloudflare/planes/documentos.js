// DESTINOS_FIJOS: este módulo no llama a servicios externos; usa la base D1 (OSINT_PLANS_DB) y el bucket R2 privado DATOS_PLAN.
// Documentos de Organización DOMINUS (organizacion.html → Documentos), solo con la sesión de administración:
//   GET  /cuenta/empresa/admin/docs[?area=]        → lista (sin contenido)
//   GET  /cuenta/empresa/admin/docs/<id>           → documento de texto (JSON) o descarga del archivo
//   POST /cuenta/empresa/admin/docs/texto          → crea o actualiza un documento de texto {id?, area, tarea?, titulo, contenido, nota?}
//   POST /cuenta/empresa/admin/docs/archivo?area=&tarea=&titulo=&nombre=[&id=]  (cuerpo: el archivo) → sube o reemplaza
//   POST /cuenta/empresa/admin/docs/<id>/editar    → cambia título, nota, área o tarea
//   POST /cuenta/empresa/admin/docs/<id>/borrar    → elimina (y su archivo en R2)
// Los archivos viven en R2 bajo «interno/organizacion/», fuera de la ruta data/ que sirve datos.js.
import catalogo from "../../config/organizacion.json" with { type: "json" };

export const MAX_ARCHIVO = 10 * 1024 * 1024;
export const MAX_TEXTO = 300000;
// Solo formatos de oficina, imagen y texto; nunca HTML, SVG ni scripts (se descargan siempre como adjunto).
export const TIPOS = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv", txt: "text/plain", md: "text/markdown", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", zip: "application/zip", xml: "application/xml",
};
const AREAS = new Map(catalogo.areas.map((a) => [a.id, new Set(a.tareas.map((t) => t.id))]));
const ID = /^[a-z0-9]{16}$/;
const PREFIJO = "interno/organizacion/";
const listas = new WeakSet();

const ahora = () => Math.floor(Date.now() / 1000);
const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
const limpio = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

async function asegurar(db) {
  if (listas.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_org_documentos (
    id TEXT PRIMARY KEY NOT NULL, area TEXT NOT NULL, tarea TEXT NOT NULL DEFAULT '', titulo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'archivo')), contenido TEXT, nombre TEXT, mime TEXT, tamano INTEGER NOT NULL DEFAULT 0,
    nota TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, creado INTEGER NOT NULL, actualizado INTEGER NOT NULL)`).run();
  listas.add(db);
}

/** Valida área y tarea contra config/organizacion.json; devuelve el error o null. */
export function validarUbicacion(area, tarea = "") {
  if (!AREAS.has(area)) return "Área inválida.";
  if (tarea && !AREAS.get(area).has(tarea)) return "Tarea inválida para esa área.";
  return null;
}

/** Nombre de archivo seguro y su tipo permitido (o null). */
export function tipoArchivo(nombre) {
  const n = limpio(nombre, 120).replace(/[\\/:*?"<>|]/g, "_");
  const ext = (n.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
  return TIPOS[ext] ? { nombre: n, mime: TIPOS[ext], ext } : null;
}

const CAMPOS = "id, area, tarea, titulo, tipo, nombre, mime, tamano, nota, version, creado, actualizado";

export async function serveDocumentos(request, url, env, { esAdmin, origenes = [], base = {} }) {
  const h = { ...base, "Content-Type": "application/json; charset=utf-8" };
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: h });
  if (!esAdmin) return json({ error: "Solo administración." }, 403);
  if (request.method === "POST") {
    const o = request.headers.get("Origin");
    if (o !== url.origin && !origenes.includes(o)) return json({ error: "Origen no permitido." }, 403);
  } else if (request.method !== "GET") return json({ error: "Método inválido." }, 405);
  const db = env.OSINT_PLANS_DB;
  if (!db) return json({ error: "Base de datos sin configurar." }, 503);
  await asegurar(db);
  const partes = url.pathname.replace(/^\/cuenta\/empresa\/admin\/docs\/?/, "").split("/").filter(Boolean);
  const leerJson = async () => {
    const t = await request.text();
    if (t.length > MAX_TEXTO + 5000) throw Object.assign(new Error("Documento demasiado grande (máximo 300,000 caracteres)."), { status: 413 });
    try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("JSON inválido."), { status: 400 }); }
  };
  try {
    if (request.method === "GET" && partes.length === 0) {
      const area = url.searchParams.get("area") || "";
      if (area && validarUbicacion(area)) return json({ error: "Área inválida." }, 400);
      const r = area ? await db.prepare(`SELECT ${CAMPOS} FROM dominus_org_documentos WHERE area = ? ORDER BY actualizado DESC`).bind(area).all()
        : await db.prepare(`SELECT ${CAMPOS} FROM dominus_org_documentos ORDER BY actualizado DESC LIMIT 2000`).all();
      return json({ documentos: r.results || [], r2: Boolean(env.DATOS_PLAN) });
    }
    if (request.method === "GET" && partes.length === 1 && ID.test(partes[0])) {
      const d = await db.prepare(`SELECT ${CAMPOS}, contenido FROM dominus_org_documentos WHERE id = ?`).bind(partes[0]).first();
      if (!d) return json({ error: "No existe." }, 404);
      if (d.tipo === "texto") return json({ documento: d });
      const obj = await env.DATOS_PLAN?.get(PREFIJO + d.id);
      if (!obj) return json({ error: "El archivo no está en el almacenamiento." }, 404);
      return new Response(obj.body, { headers: { ...base, "Content-Type": d.mime || "application/octet-stream", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.nombre || "documento")}`, "Content-Security-Policy": "sandbox" } });
    }
    if (request.method !== "POST") return json({ error: "Ruta inexistente." }, 404);

    if (partes[0] === "texto" && partes.length === 1) {
      const c = await leerJson();
      const area = String(c.area || ""), tarea = String(c.tarea || ""), titulo = limpio(c.titulo, 160), contenido = String(c.contenido ?? "");
      const err = validarUbicacion(area, tarea) || (!titulo && "Escribe un título.") || (contenido.length > MAX_TEXTO && "Documento demasiado grande.");
      if (err) return json({ error: err }, 400);
      const t = ahora(), nota = limpio(c.nota, 500);
      if (c.id) {
        if (!ID.test(String(c.id))) return json({ error: "Documento inválido." }, 400);
        const r = await db.prepare("UPDATE dominus_org_documentos SET area = ?, tarea = ?, titulo = ?, contenido = ?, nota = ?, tamano = ?, version = version + 1, actualizado = ? WHERE id = ? AND tipo = 'texto'")
          .bind(area, tarea, titulo, contenido, nota, contenido.length, t, c.id).run();
        if (!(r.meta?.changes > 0)) return json({ error: "No existe." }, 404);
        return json({ ok: true, id: c.id, actualizado: t });
      }
      const id = nuevoId();
      await db.prepare("INSERT INTO dominus_org_documentos (id, area, tarea, titulo, tipo, contenido, nombre, mime, tamano, nota, creado, actualizado) VALUES (?, ?, ?, ?, 'texto', ?, ?, 'text/markdown', ?, ?, ?, ?)")
        .bind(id, area, tarea, titulo, contenido, titulo.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) + ".md", contenido.length, nota, t, t).run();
      return json({ ok: true, id, actualizado: t }, 201);
    }

    if (partes[0] === "archivo" && partes.length === 1) {
      if (!env.DATOS_PLAN) return json({ error: "Almacenamiento de archivos sin configurar." }, 503);
      const q = url.searchParams, area = q.get("area") || "", tarea = q.get("tarea") || "", titulo = limpio(q.get("titulo") || q.get("nombre"), 160);
      const tipo = tipoArchivo(q.get("nombre"));
      const err = validarUbicacion(area, tarea) || (!tipo && "Tipo de archivo no permitido. Usa PDF, Word, Excel, PowerPoint, imágenes, CSV, TXT o ZIP.") || (!titulo && "Escribe un título.");
      if (err) return json({ error: err }, 400);
      const largo = Number(request.headers.get("Content-Length") || 0);
      if (largo > MAX_ARCHIVO) return json({ error: "El archivo supera 10 MB." }, 413);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ error: "El archivo está vacío." }, 400);
      if (bytes.byteLength > MAX_ARCHIVO) return json({ error: "El archivo supera 10 MB." }, 413);
      const id = q.get("id") || nuevoId();
      if (!ID.test(id)) return json({ error: "Documento inválido." }, 400);
      const previo = q.get("id") ? await db.prepare("SELECT tipo FROM dominus_org_documentos WHERE id = ?").bind(id).first() : null;
      if (q.get("id") && previo?.tipo !== "archivo") return json({ error: "No existe." }, 404);
      await env.DATOS_PLAN.put(PREFIJO + id, bytes, { httpMetadata: { contentType: tipo.mime } });
      const t = ahora(), nota = limpio(q.get("nota"), 500);
      if (previo) await db.prepare("UPDATE dominus_org_documentos SET area = ?, tarea = ?, titulo = ?, nombre = ?, mime = ?, tamano = ?, version = version + 1, actualizado = ? WHERE id = ?")
        .bind(area, tarea, titulo, tipo.nombre, tipo.mime, bytes.byteLength, t, id).run();
      else await db.prepare("INSERT INTO dominus_org_documentos (id, area, tarea, titulo, tipo, nombre, mime, tamano, nota, creado, actualizado) VALUES (?, ?, ?, ?, 'archivo', ?, ?, ?, ?, ?, ?)")
        .bind(id, area, tarea, titulo, tipo.nombre, tipo.mime, bytes.byteLength, nota, t, t).run();
      return json({ ok: true, id, actualizado: t }, previo ? 200 : 201);
    }

    if (partes.length === 2 && ID.test(partes[0]) && partes[1] === "editar") {
      const c = await leerJson();
      const area = String(c.area || ""), tarea = String(c.tarea || ""), titulo = limpio(c.titulo, 160);
      const err = validarUbicacion(area, tarea) || (!titulo && "Escribe un título.");
      if (err) return json({ error: err }, 400);
      const r = await db.prepare("UPDATE dominus_org_documentos SET area = ?, tarea = ?, titulo = ?, nota = ?, actualizado = ? WHERE id = ?")
        .bind(area, tarea, titulo, limpio(c.nota, 500), ahora(), partes[0]).run();
      return r.meta?.changes > 0 ? json({ ok: true }) : json({ error: "No existe." }, 404);
    }

    if (partes.length === 2 && ID.test(partes[0]) && partes[1] === "borrar") {
      const d = await db.prepare("SELECT tipo FROM dominus_org_documentos WHERE id = ?").bind(partes[0]).first();
      if (!d) return json({ error: "No existe." }, 404);
      if (d.tipo === "archivo") await env.DATOS_PLAN?.delete(PREFIJO + partes[0]);
      await db.prepare("DELETE FROM dominus_org_documentos WHERE id = ?").bind(partes[0]).run();
      return json({ ok: true });
    }
    return json({ error: "Ruta inexistente." }, 404);
  } catch (e) {
    return json({ error: e.status ? e.message : "No se pudo completar la operación." }, e.status || 500);
  }
}
