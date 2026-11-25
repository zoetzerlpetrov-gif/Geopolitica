// Espacios de empresa (cloudflare/planes/empresas.js) con una base SQLite real en memoria (node:sqlite) que imita D1:
// prepare().bind().run()/first()/all() y batch(). Así se prueban el SQL, los CHECK de las tablas y los permisos.
import test from "node:test";
import assert from "node:assert/strict";
import { serveEmpresas, validarOrg, validarRespuesta, puede } from "../../cloudflare/planes/empresas.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* Node sin SQLite: se omiten las pruebas con base */ }

function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (lista) => { db.exec("BEGIN"); try { for (const s of lista) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}

const ORIGEN = "https://dominusosint.com";
const base = "https://admin.dominusosint.com/cuenta/empresa/";
async function api(env, correo, ruta, cuerpo, { esAdmin = false, origen = ORIGEN } = {}) {
  const init = cuerpo === undefined ? { headers: { Origin: origen } } : { method: "POST", headers: { Origin: origen, "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) };
  const req = new Request(base + ruta, init);
  const r = await serveEmpresas(req, new URL(req.url), env, { correo, esAdmin, origenes: [ORIGEN] });
  return { status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers };
}

test("validaciones puras", () => {
  assert.deepEqual(validarOrg({ nombre: "  Acme   SA ", pais: "mex", sectores: ["mineria", "mineria", "X!"] }), { nombre: "Acme SA", pais: "MEX", sectores: ["mineria"] });
  assert.throws(() => validarOrg({ nombre: "A" }), /entre 2 y 120/);
  assert.throws(() => validarRespuesta({ clave: "x", estado: "cumple" }), /Pregunta inválida/);
  assert.throws(() => validarRespuesta({ clave: "lfpdppp#0011aabb", estado: "cumple", responsable: "otro@x.com" }, ["a@x.com"]), /miembro/);
  assert.ok(puede("admin", "editor") && !puede("lector", "editor") && !puede("dueno", "inventado"));
});

test("flujo completo: crear, invitar, aceptar, límite de usuarios, cumplimiento y aislamiento entre empresas", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1() };
  assert.equal((await api(env, null, "yo")).status, 401);
  const c = await api(env, "duena@acme.mx", "crear", { nombre: "Acme", pais: "MEX", sectores: ["mineria"] });
  assert.equal(c.status, 201);
  const org = c.body.id;
  assert.equal(c.headers.get("Access-Control-Allow-Origin"), ORIGEN);
  // Invitación: solo la acepta el correo invitado.
  const inv = await api(env, "duena@acme.mx", `${org}/invitar`, { email: "Editor@Acme.mx", rol: "editor" });
  assert.equal(inv.status, 201);
  assert.equal((await api(env, "otro@x.com", "aceptar", { token: inv.body.token })).status, 403);
  assert.equal((await api(env, "editor@acme.mx", "aceptar", { token: inv.body.token })).status, 200);
  assert.equal((await api(env, "editor@acme.mx", "aceptar", { token: inv.body.token })).status, 404);  // un solo uso
  // Límite del plan de prueba: 3 usuarios (dueña + editor + 1).
  assert.equal((await api(env, "duena@acme.mx", `${org}/invitar`, { email: "tres@acme.mx", rol: "lector" })).status, 201);
  assert.equal((await api(env, "duena@acme.mx", `${org}/invitar`, { email: "cuatro@acme.mx", rol: "lector" })).status, 409);
  // El editor no invita; sí responde cumplimiento.
  assert.equal((await api(env, "editor@acme.mx", `${org}/invitar`, { email: "x@acme.mx" })).status, 403);
  const r = await api(env, "editor@acme.mx", `${org}/cumplimiento`, { clave: "lfpdppp#0011aabb", estado: "cumple", responsable: "duena@acme.mx", fecha_limite: "2026-12-31", evidencia: "Aviso publicado" });
  assert.equal(r.status, 200);
  const g = await api(env, "duena@acme.mx", `${org}/cumplimiento`);
  assert.equal(g.body.respuestas[0].estado, "cumple");
  // Otra empresa no ve nada de Acme.
  assert.equal((await api(env, "ajeno@beta.mx", `${org}/cumplimiento`)).status, 403);
  assert.equal((await api(env, "ajeno@beta.mx", `${org}/info`)).status, 403);
  // Bitácora solo para administradores, con lo ocurrido.
  assert.equal((await api(env, "editor@acme.mx", `${org}/bitacora`)).status, 403);
  const b = await api(env, "duena@acme.mx", `${org}/bitacora`);
  assert.ok(b.body.bitacora.some((x) => x.accion === "cumplimiento") && b.body.bitacora.some((x) => x.accion === "aceptar"));
  // La dueña no se puede quitar ni degradar.
  assert.equal((await api(env, "duena@acme.mx", `${org}/rol`, { email: "duena@acme.mx", rol: "lector" })).status, 409);
});

test("escrituras desde otro sitio se rechazan; periodo vencido deja la empresa en solo lectura; admin fija plan", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1() };
  assert.equal((await api(env, "a@acme.mx", "crear", { nombre: "Acme" }, { origen: "https://malicioso.example" })).status, 403);
  const org = (await api(env, "a@acme.mx", "crear", { nombre: "Acme" })).body.id;
  assert.equal((await api(env, "a@acme.mx", "admin/plan", { org, plan: "equipo", asientos: 5, dias: 30 })).status, 403);
  assert.deepEqual((await api(env, "a@acme.mx", "admin/plan", { org, plan: "equipo", asientos: 5, dias: 30 }, { esAdmin: true })).body, { ok: true });
  const info = await api(env, "a@acme.mx", `${org}/info`);
  assert.equal(info.body.org.plan, "equipo");
  assert.equal(info.body.org.asientos, 5);
  // Vencida: lectura sí, escritura no.
  await env.OSINT_PLANS_DB.prepare("UPDATE dominus_orgs SET vence = 1 WHERE id = ?").bind(org).run();
  assert.equal((await api(env, "a@acme.mx", `${org}/info`)).status, 200);
  assert.equal((await api(env, "a@acme.mx", `${org}/cumplimiento`, { clave: "x.y#0011aabb", estado: "cumple" })).status, 402);
});
