// Documentos de Organización DOMINUS (cloudflare/planes/documentos.js): D1 real en memoria (node:sqlite) y R2 simulado.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serveDocumentos, tipoArchivo, validarUbicacion, MAX_ARCHIVO } from "../../cloudflare/planes/documentos.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* Node sin SQLite */ }

function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql) };
}
function r2() {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, new Uint8Array(v)); }, get: async (k) => (m.has(k) ? { body: m.get(k) } : null), delete: async (k) => { m.delete(k); } };
}
const ORIGEN = "https://dominusosint.com";
const base = "https://dominusosint.com/cuenta/empresa/admin/docs";
async function llamar(env, ruta, { cuerpo, crudo, tipo, esAdmin = true, origen = ORIGEN } = {}) {
  const post = cuerpo !== undefined || crudo !== undefined;
  const req = new Request(base + ruta, post ? { method: "POST", headers: { Origin: origen, "Content-Type": tipo || "text/plain" }, body: crudo ?? JSON.stringify(cuerpo) } : { headers: { Origin: origen } });
  const r = await serveDocumentos(req, new URL(req.url), env, { esAdmin, origenes: [ORIGEN] });
  const ct = r.headers.get("Content-Type") || "";
  return { status: r.status, headers: r.headers, body: ct.startsWith("application/json") ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}

test("validaciones: áreas y tareas del catálogo, tipos de archivo permitidos", () => {
  assert.equal(validarUbicacion("legal", "contratos"), null);
  assert.match(validarUbicacion("inventada"), /Área/);
  assert.match(validarUbicacion("legal", "inventada"), /Tarea/);
  assert.equal(tipoArchivo("Acta constitutiva.PDF").mime, "application/pdf");
  assert.equal(tipoArchivo("contrato.docx").ext, "docx");
  for (const malo of ["pagina.html", "logo.svg", "x.js", "sin-extension"]) assert.equal(tipoArchivo(malo), null, malo);
  assert.equal(tipoArchivo("a/b\\c.pdf").nombre, "a_b_c.pdf");
});

test("plantillas: cada una apunta a un área y tarea existentes y trae aviso de revisión", () => {
  const { plantillas } = JSON.parse(readFileSync("config/organizacion-plantillas.json", "utf8"));
  const cat = JSON.parse(readFileSync("config/organizacion.json", "utf8"));
  assert.ok(plantillas.length >= 28);
  assert.equal(new Set(plantillas.map((p) => p.id)).size, plantillas.length);
  for (const p of plantillas) {
    assert.equal(validarUbicacion(p.area, p.tarea), null, p.id);
    assert.match(p.contenido, /Borrador de trabajo/);
  }
  for (const a of cat.areas) {
    assert.ok(plantillas.some((p) => p.area === a.id), `sin plantilla: ${a.id}`);
    assert.ok(a.skills.length >= 2 && a.skills.every((s) => /^[a-z-]+(:[a-z0-9-]+)?$/.test(s.skill) && s.para), a.id);
  }
});

test("flujo: crear, editar, listar, subir, reemplazar, descargar y borrar", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1(), DATOS_PLAN: r2() };
  assert.equal((await llamar(env, "", { esAdmin: false })).status, 403);
  assert.equal((await llamar(env, "/texto", { cuerpo: { area: "legal", titulo: "x" }, origen: "https://malo.example" })).status, 403);
  assert.equal((await llamar(env, "/texto", { cuerpo: { area: "nada", titulo: "x" } })).status, 400);

  const nuevo = await llamar(env, "/texto", { cuerpo: { area: "legal", tarea: "contratos", titulo: "NDA mutuo", contenido: "# NDA\nTexto" } });
  assert.equal(nuevo.status, 201);
  const id = nuevo.body.id;
  const editado = await llamar(env, "/texto", { cuerpo: { id, area: "legal", tarea: "contratos", titulo: "NDA mutuo v2", contenido: "# NDA\nTexto revisado", nota: "Revisado por abogado" } });
  assert.equal(editado.status, 200);
  const leido = await llamar(env, "/" + id);
  assert.equal(leido.body.documento.contenido, "# NDA\nTexto revisado");
  assert.equal(leido.body.documento.version, 2);

  const pdf = new TextEncoder().encode("%PDF-1.7 prueba");
  assert.equal((await llamar(env, "/archivo?area=legal&titulo=Web&nombre=pagina.html", { crudo: pdf, tipo: "text/html" })).status, 400);
  const sub = await llamar(env, "/archivo?area=fiscal&tarea=cfdi&titulo=Constancia&nombre=constancia.pdf", { crudo: pdf, tipo: "application/pdf" });
  assert.equal(sub.status, 201);
  const fid = sub.body.id;
  assert.ok(env.DATOS_PLAN.m.has("interno/organizacion/" + fid));
  const repl = await llamar(env, `/archivo?area=fiscal&tarea=cfdi&titulo=Constancia 2026&nombre=constancia-2026.pdf&id=${fid}`, { crudo: new TextEncoder().encode("%PDF nueva"), tipo: "application/pdf" });
  assert.equal(repl.status, 200);
  const bajada = await llamar(env, "/" + fid);
  assert.equal(bajada.status, 200);
  assert.match(bajada.headers.get("Content-Disposition"), /^attachment; filename\*=UTF-8''constancia-2026\.pdf$/);
  assert.equal(new TextDecoder().decode(bajada.body), "%PDF nueva");

  const lista = await llamar(env, "");
  assert.equal(lista.body.documentos.length, 2);
  assert.ok(lista.body.documentos.every((d) => !("contenido" in d)));
  assert.equal((await llamar(env, "?area=fiscal")).body.documentos.length, 1);
  assert.equal((await llamar(env, `/${fid}/editar`, { cuerpo: { area: "finanzas", tarea: "", titulo: "Constancia fiscal", nota: "" } })).status, 200);
  assert.equal((await llamar(env, "?area=finanzas")).body.documentos[0].titulo, "Constancia fiscal");

  assert.equal((await llamar(env, `/${fid}/borrar`, { cuerpo: {} })).status, 200);
  assert.ok(!env.DATOS_PLAN.m.has("interno/organizacion/" + fid));
  assert.equal((await llamar(env, `/${id}/borrar`, { cuerpo: {} })).status, 200);
  assert.equal((await llamar(env, "")).body.documentos.length, 0);
  assert.equal((await llamar(env, "/" + id)).status, 404);
});

test("límites: archivo vacío, demasiado grande y sin R2", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1(), DATOS_PLAN: r2() };
  assert.equal((await llamar(env, "/archivo?area=legal&titulo=x&nombre=a.pdf", { crudo: new Uint8Array(0), tipo: "application/pdf" })).status, 400);
  assert.equal((await llamar(env, "/archivo?area=legal&titulo=x&nombre=a.pdf", { crudo: new Uint8Array(MAX_ARCHIVO + 1), tipo: "application/pdf" })).status, 413);
  assert.equal((await llamar({ OSINT_PLANS_DB: env.OSINT_PLANS_DB }, "/archivo?area=legal&titulo=x&nombre=a.pdf", { crudo: new Uint8Array(3), tipo: "application/pdf" })).status, 503);
});
