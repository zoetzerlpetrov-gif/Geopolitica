// Admin → Clientes y proyectos: editar y eliminar empresas, cuentas y cortesías (empresas.js), con SQLite en memoria.
import test from "node:test";
import assert from "node:assert/strict";
import { serveEmpresas } from "../../cloudflare/planes/empresas.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* sin SQLite */ }
function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { raw: db, prepare: (sql) => stmt(sql), batch: async (lista) => { for (const s of lista) await s.run(); } };
}
const ORIGEN = "https://dominusosint.com";
async function admin(env, ruta, cuerpo) {
  const init = cuerpo === undefined ? { headers: { Origin: ORIGEN } } : { method: "POST", headers: { Origin: ORIGEN, "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) };
  const req = new Request("https://admin.dominusosint.com/cuenta/empresa/admin/" + ruta, init);
  const r = await serveEmpresas(req, new URL(req.url), env, { correo: null, esAdmin: true, origenes: [ORIGEN] });
  return { status: r.status, body: await r.json() };
}

test("editar y eliminar empresa, cuenta y cortesía", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1() };
  const a = await admin(env, "alta", { nombre: "Minera Acme SA de CV", rfc: "MAC010203XY1", pais: "MEX", dueno: "dir@acme.mx", plan: "prueba", asientos: 3, dias: 14 });
  const b = await admin(env, "alta", { nombre: "Beta Logística", pais: "MEX", dueno: "dir@beta.mx", plan: "prueba", asientos: 3, dias: 14 });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  let orgs = (await admin(env, "orgs")).body.orgs;
  assert.equal(orgs.find((o) => o.id === a.body.id).rfc, "MAC010203XY1");
  assert.equal(orgs.find((o) => o.id === a.body.id).duenos, "dir@acme.mx");
  // Editar: no puede tomar el nombre de otra empresa
  assert.equal((await admin(env, "org/editar", { org: a.body.id, nombre: "Beta Logistica S.A.", pais: "MEX" })).status, 409);
  assert.equal((await admin(env, "org/editar", { org: a.body.id, nombre: "Acme Minería", rfc: "", pais: "CHL", sectores: ["mineria"] })).status, 200);
  orgs = (await admin(env, "orgs")).body.orgs;
  const acme = orgs.find((o) => o.id === a.body.id);
  assert.deepEqual([acme.nombre, acme.pais, acme.rfc, acme.sectores], ["Acme Minería", "CHL", null, ["mineria"]]);
  // Cuenta: no se borra si es la única dueña; se edita el nombre
  assert.equal((await admin(env, "cuenta/editar", { email: "dir@acme.mx", nombre: "Dirección Acme" })).status, 200);
  assert.equal((await admin(env, "cuenta/borrar", { email: "dir@acme.mx" })).status, 409);
  // Eliminar empresa: pide el nombre exacto y borra sus proyectos
  await admin(env, `proyectos/${a.body.id}/crear`, { nombre: "Diagnóstico" });
  assert.equal((await admin(env, "org/borrar", { org: a.body.id, confirmar: "otro" })).status, 400);
  assert.equal((await admin(env, "org/borrar", { org: a.body.id, confirmar: "Acme Minería" })).status, 200);
  assert.equal((await admin(env, "orgs")).body.orgs.length, 1);
  assert.equal(env.OSINT_PLANS_DB.raw.prepare("SELECT count(*) AS n FROM dominus_proyectos").get().n, 0);
  // Ahora la cuenta ya no es dueña única: se puede borrar
  assert.equal((await admin(env, "cuenta/borrar", { email: "dir@acme.mx" })).status, 200);
  assert.ok(!(await admin(env, "cuentas")).body.cuentas.some((c) => c.email === "dir@acme.mx"));
  // Cortesía: cambiar días y quitar (apaga el plan del mapa)
  const co = await admin(env, "cortesia", { email: "periodista@medio.mx", producto: "mapa", plan: "analyst", dias: 7, nota: "nota" });
  assert.equal(co.status, 201);
  const id = (await admin(env, "cuentas")).body.cortesias[0].id;
  const ed = await admin(env, "cortesia/editar", { id, dias: 30, nota: "ampliada" });
  assert.ok(ed.body.vence > co.body.vence);
  assert.equal((await admin(env, "cortesia/borrar", { id })).status, 200);
  assert.equal(env.OSINT_PLANS_DB.raw.prepare("SELECT active FROM dominus_memberships_email WHERE email = ?").get("periodista@medio.mx").active, 0);
  assert.equal((await admin(env, "cuentas")).body.cortesias.length, 0);
});
