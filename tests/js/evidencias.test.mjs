// Evidencias (cloudflare/planes/evidencias.js): archivos, enlaces y notas por empresa, con permisos por rol y aislamiento.
import test from "node:test";
import assert from "node:assert/strict";
import { serveEvidencias, validarRef } from "../../cloudflare/planes/evidencias.js";
import { refEv } from "../../js/autoauditoria.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* sin SQLite */ }
function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
  return { prepare: (s) => stmt(s), raw: db };
}
function r2() { const m = new Map(); return { m, put: async (k, v) => { m.set(k, new Uint8Array(v)); }, get: async (k) => (m.has(k) ? { body: m.get(k) } : null), delete: async (k) => { m.delete(k); } }; }
const ORIGEN = "https://dominusosint.com";
async function llamar(env, ruta, { correo = null, esAdmin = false, cuerpo, crudo, origen = ORIGEN } = {}) {
  const post = cuerpo !== undefined || crudo !== undefined;
  const req = new Request("https://admin.dominusosint.com/cuenta/empresa/" + ruta, post ? { method: "POST", headers: { Origin: origen, "Content-Type": "text/plain" }, body: crudo ?? JSON.stringify(cuerpo) } : { headers: { Origin: origen } });
  const r = await serveEvidencias(req, new URL(req.url), env, { correo, esAdmin, origenes: [ORIGEN] });
  const ct = r.headers.get("Content-Type") || "";
  return { status: r.status, headers: r.headers, body: ct.startsWith("application/json") ? await r.json() : new TextDecoder().decode(await r.arrayBuffer()) };
}
const ORG = "0123456789abcdef", OTRA = "fedcba9876543210", PID = "aaaaaaaaaaaaaaaa", IID = "bbbbbbbbbbbbbbbb";

test("referencias válidas", () => {
  for (const r of [`proy:${PID}:item:${IID}`, `proy:${PID}:check:${IID}`, `proy:${PID}:fase:entrega`, "cumpl:lfpdppp#0011aabb", "autoaud:iso27001:A.5.1"]) assert.ok(validarRef(r), r);
  for (const r of ["", "proy:x:item:y", "cumpl:<script>", "otro:1"]) assert.ok(!validarRef(r), r);
  assert.equal(refEv({ marco: "cis v8", ref: "1.1 / a" }), "autoaud:cis_v8:1.1___a");
  assert.ok(validarRef(refEv({ marco: "iso27001", ref: "A.5.1" })));
});

test("Mi empresa: lector consulta, editor agrega; archivos y enlaces; aislamiento; Admin e interno", { skip: !DatabaseSync }, async () => {
  const db = d1(), env = { OSINT_PLANS_DB: db, DATOS_PLAN: r2() };
  db.raw.exec("CREATE TABLE dominus_orgs (id TEXT PRIMARY KEY, nombre TEXT, vence INTEGER)");
  db.raw.exec("CREATE TABLE dominus_org_miembros (org_id TEXT, email TEXT, rol TEXT)");
  const futuro = Math.floor(Date.now() / 1000) + 86400;
  db.raw.prepare("INSERT INTO dominus_orgs VALUES (?, 'Acme', ?), (?, 'Beta', ?)").run(ORG, futuro, OTRA, futuro);
  db.raw.prepare("INSERT INTO dominus_org_miembros VALUES (?, 'ed@acme.mx', 'editor'), (?, 'lec@acme.mx', 'lector'), (?, 'ed@beta.mx', 'editor')").run(ORG, ORG, OTRA);
  const ref = `proy:${PID}:item:${IID}`;
  assert.equal((await llamar(env, `${ORG}/evidencias?ref=${encodeURIComponent(ref)}`)).status, 401);
  assert.equal((await llamar(env, `${ORG}/evidencias?ref=${encodeURIComponent(ref)}`, { correo: "ed@beta.mx" })).status, 403);
  assert.equal((await llamar(env, `${ORG}/evidencias/enlace`, { correo: "lec@acme.mx", cuerpo: { ref, titulo: "x", nota: "y" } })).status, 403);
  assert.equal((await llamar(env, `${ORG}/evidencias/enlace`, { correo: "ed@acme.mx", cuerpo: { ref, titulo: "Foto", url: "http://inseguro" } })).status, 400);
  assert.equal((await llamar(env, `${ORG}/evidencias/enlace`, { correo: "ed@acme.mx", cuerpo: { ref, titulo: "Acta", url: "https://drive.example/acta" } })).status, 201);
  assert.equal((await llamar(env, `${ORG}/evidencias/archivo?ref=${encodeURIComponent(ref)}&titulo=Contrato&nombre=contrato.html`, { correo: "ed@acme.mx", crudo: "<b>x</b>" })).status, 400);
  const sub = await llamar(env, `${ORG}/evidencias/archivo?ref=${encodeURIComponent(ref)}&titulo=Contrato&nombre=contrato.pdf`, { correo: "ed@acme.mx", crudo: "%PDF-1.7" });
  assert.equal(sub.status, 201);
  const lista = await llamar(env, `${ORG}/evidencias?prefijo=${encodeURIComponent(`proy:${PID}:`)}`, { correo: "lec@acme.mx" });
  assert.equal(lista.body.evidencias.length, 2);
  assert.equal(lista.body.escribir, false);
  const bajada = await llamar(env, `${ORG}/evidencias/${sub.body.id}`, { correo: "lec@acme.mx" });
  assert.equal(bajada.body, "%PDF-1.7");
  assert.match(bajada.headers.get("Content-Disposition"), /^attachment/);
  // Otra empresa no ve el archivo aunque adivine el id
  assert.equal((await llamar(env, `${OTRA}/evidencias/${sub.body.id}`, { correo: "ed@beta.mx" })).status, 404);
  // Borrar quita también el archivo
  assert.equal((await llamar(env, `${ORG}/evidencias/${sub.body.id}/borrar`, { correo: "ed@acme.mx", cuerpo: {} })).status, 200);
  assert.equal(env.DATOS_PLAN.m.size, 0);
  // Admin: cualquier empresa y DOMINUS interno
  assert.equal((await llamar(env, `admin/evidencias/${ORG}?ref=${encodeURIComponent(ref)}`)).status, 403);
  assert.equal((await llamar(env, `admin/evidencias/${ORG}?ref=${encodeURIComponent(ref)}`, { esAdmin: true })).body.evidencias.length, 1);
  assert.equal((await llamar(env, "admin/evidencias/dominus-interno/enlace", { esAdmin: true, cuerpo: { ref: "autoaud:iso27001:A.5.1", titulo: "Política", nota: "Aprobada" } })).status, 201);
  assert.equal((await llamar(env, "admin/evidencias/dominus-interno?prefijo=autoaud:", { esAdmin: true })).body.evidencias.length, 1);
  assert.equal((await llamar(env, "admin/evidencias/ffffffffffffffff?prefijo=autoaud:", { esAdmin: true })).status, 404);
  // Origen ajeno no escribe
  assert.equal((await llamar(env, `${ORG}/evidencias/enlace`, { correo: "ed@acme.mx", cuerpo: { ref, titulo: "x", nota: "y" }, origen: "https://malo.example" })).status, 403);
});
