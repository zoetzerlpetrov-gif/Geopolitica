// Cuentas propias de DOMINUS (cloudflare/planes/acceso.js) y alta de clientes por Admin (empresas.js), con SQLite real.
import test from "node:test";
import assert from "node:assert/strict";
import { serveAcceso, revisarContrasena, derivar, iguales } from "../../cloudflare/planes/acceso.js";
import { serveEmpresas, aceptarInvitacionDirecta, nombreNormal, rfcValido } from "../../cloudflare/planes/empresas.js";
import { correoSesion } from "../../cloudflare/planes/google.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* sin SQLite */ }

function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { db.exec("BEGIN"); try { for (const s of l) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const ORIGEN = "https://dominusosint.com";
const env = () => ({ OSINT_PLANS_DB: d1(), OSINT_SESSION_SECRET: "s".repeat(40) });
async function acceso(e, ruta, cuerpo) {
  const req = new Request(`https://admin.dominusosint.com/cuenta/acceso/${ruta}`, { method: "POST", headers: { Origin: ORIGEN, "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await serveAcceso(req, new URL(req.url), e, { origenes: [ORIGEN], aceptarInvitacion: (t, m) => aceptarInvitacionDirecta(e.OSINT_PLANS_DB, t, m) });
  return { status: r.status, body: await r.json(), cookie: r.headers.get("Set-Cookie") };
}
async function empresa(e, correo, ruta, cuerpo, esAdmin = false) {
  const init = cuerpo === undefined ? { headers: { Origin: ORIGEN } } : { method: "POST", headers: { Origin: ORIGEN }, body: JSON.stringify(cuerpo) };
  const req = new Request(`https://admin.dominusosint.com/cuenta/empresa/${ruta}`, init);
  const r = await serveEmpresas(req, new URL(req.url), e, { correo, esAdmin, origenes: [ORIGEN] });
  return { status: r.status, body: await r.json() };
}

test("utilidades: contraseña, PBKDF2, comparación, nombre normal y RFC", async () => {
  assert.match(revisarContrasena("corta"), /al menos 10/);
  assert.match(revisarContrasena("ana.lopez-2026!", "ana.lopez@x.mx"), /correo/);
  assert.equal(revisarContrasena("Caballo azul de marzo"), null);
  const h = await derivar("Caballo azul de marzo", "ab".repeat(16));
  assert.equal(h.length, 64);
  assert.ok(iguales(h, await derivar("Caballo azul de marzo", "ab".repeat(16))));
  assert.ok(!iguales(h, await derivar("Caballo azul de abril", "ab".repeat(16))));
  assert.equal(nombreNormal("Minera Ácme, S.A. de C.V."), nombreNormal("minera acme"));
  assert.equal(rfcValido("abc010203xy1"), "ABC010203XY1");
  assert.throws(() => rfcValido("123"), /RFC inválido/);
});

test("Admin da de alta una empresa: enlace de activación, contraseña, entrada, bloqueo y duplicados", { skip: !DatabaseSync }, async () => {
  const e = env();
  assert.equal((await empresa(e, null, "admin/alta", { nombre: "Minera Acme SA de CV", dueno: "dir@acme.mx" })).status, 403);
  const alta = await empresa(e, null, "admin/alta", { nombre: "Minera Acme SA de CV", pais: "MEX", sectores: ["mineria"], rfc: "MAC010203XY1", dueno: "dir@acme.mx", plan: "prueba", dias: 7, asientos: 5 }, true);
  assert.equal(alta.status, 201);
  assert.match(alta.body.token, /^[0-9a-f]{64}$/);
  // Duplicados por nombre (aunque cambie la forma societaria) y por RFC.
  assert.equal((await empresa(e, null, "admin/alta", { nombre: "MINERA ACME, S.A.", dueno: "otro@x.mx" }, true)).status, 409);
  assert.equal((await empresa(e, null, "admin/alta", { nombre: "Otra", rfc: "MAC010203XY1", dueno: "otro@x.mx" }, true)).status, 409);
  assert.equal((await empresa(e, "alguien@x.mx", "crear", { nombre: "minera acme" })).status, 409);
  // Sin activar no entra; activa con contraseña débil no; con buena sí y queda con sesión.
  assert.equal((await acceso(e, "entrar", { email: "dir@acme.mx", contrasena: "Caballo azul de marzo" })).status, 401);
  assert.equal((await acceso(e, "activar", { token: alta.body.token, contrasena: "corta" })).status, 400);
  const act = await acceso(e, "activar", { token: alta.body.token, contrasena: "Caballo azul de marzo", nombre: "Directora" });
  assert.equal(act.status, 200);
  const ses = act.cookie.split(";")[0];
  assert.equal(await correoSesion(new Request("https://admin.dominusosint.com/", { headers: { Cookie: ses } }), e), "dir@acme.mx");
  assert.equal((await acceso(e, "activar", { token: alta.body.token, contrasena: "Caballo azul de marzo" })).status, 404);  // un solo uso
  const info = await empresa(e, "dir@acme.mx", `${alta.body.id}/info`);
  assert.equal(info.body.rol, "dueno");
  assert.equal(info.body.org.asientos, 5);
  // Entrar: bien, mal y bloqueo tras 5 intentos.
  assert.equal((await acceso(e, "entrar", { email: "DIR@acme.mx", contrasena: "Caballo azul de marzo" })).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await acceso(e, "entrar", { email: "dir@acme.mx", contrasena: "equivocada-123" })).status, 401);
  assert.equal((await acceso(e, "entrar", { email: "dir@acme.mx", contrasena: "equivocada-123" })).status, 429);
  assert.equal((await acceso(e, "entrar", { email: "dir@acme.mx", contrasena: "Caballo azul de marzo" })).status, 429);
  // Admin genera un enlace para restablecer y desbloquea al activarlo.
  const res = await empresa(e, null, "admin/acceso", { email: "dir@acme.mx" }, true);
  assert.equal((await acceso(e, "activar", { token: res.body.token, contrasena: "Nueva frase de acceso" })).status, 200);
  assert.equal((await acceso(e, "entrar", { email: "dir@acme.mx", contrasena: "Nueva frase de acceso" })).status, 200);
});

test("una invitación de empresa crea la cuenta DOMINUS del invitado y lo une a la empresa", { skip: !DatabaseSync }, async () => {
  const e = env();
  const alta = await empresa(e, null, "admin/alta", { nombre: "Beta", dueno: "duena@beta.mx" }, true);
  const inv = await empresa(e, "duena@beta.mx", `${alta.body.id}/invitar`, { email: "editor@beta.mx", rol: "editor" });
  assert.equal(inv.status, 201);
  const act = await acceso(e, "activar", { token: inv.body.token, contrasena: "Mi frase segura 2026" });
  assert.equal(act.status, 200);
  const yo = await empresa(e, "editor@beta.mx", "yo");
  assert.equal(yo.body.orgs[0].rol, "editor");
});

test("cortesías: plan del mapa y de creadores con su vencimiento; lista de cuentas para Admin", { skip: !DatabaseSync }, async () => {
  const e = env();
  const c = await empresa(e, null, "admin/cortesia", { email: "amigo@x.mx", producto: "mapa", plan: "analyst", dias: 30, nota: "Periodista" }, true);
  assert.equal(c.status, 201);
  assert.match(c.body.token, /^[0-9a-f]{64}$/);
  const plan = await e.OSINT_PLANS_DB.prepare("SELECT plan FROM dominus_memberships_email WHERE email = ?").bind("amigo@x.mx").first();
  assert.equal(plan.plan, "analyst");
  assert.equal((await empresa(e, null, "admin/cortesia", { email: "c@x.mx", producto: "creadores", plan: "creador", dias: 7 }, true)).status, 201);
  assert.equal((await empresa(e, null, "admin/cortesia", { email: "c@x.mx", producto: "mapa", plan: "inventado", dias: 7 }, true)).status, 400);
  const l = await empresa(e, null, "admin/cuentas", undefined, true);
  assert.equal(l.body.cortesias.length, 2);
  assert.ok(l.body.cuentas.some((x) => x.email === "amigo@x.mx" && x.activa === 0));
});
