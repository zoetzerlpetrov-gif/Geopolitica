// Datos de DOMINUS OPS, Caja e Inteligencia corporativa guardados en el servidor por empresa (almacen.js + sincronizar.js).
import test from "node:test";
import assert from "node:assert/strict";
import { rutaDatos, CLAVES as CLAVES_SERVIDOR, INTERNO } from "../../cloudflare/planes/almacen.js";
import { CLAVES, empresaDe, locales, diferencias, modoEmpresa, apiDatos } from "../../js/sincronizar.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* sin SQLite */ }
function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
  return { prepare: (s) => stmt(s), batch: async (l) => { for (const x of l) await x.run(); }, raw: db };
}
function almacen(obj) { const m = new Map(Object.entries(obj)); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null }; }

test("las claves del navegador y del servidor son las mismas y nunca incluyen llaves ni preferencias", () => {
  assert.equal(String(CLAVES), String(CLAVES_SERVIDOR));
  for (const k of ["gp_ops_dmi", "gp_ops_cliente", "gp_corp_instalaciones", "gp_norma_MEX", "gp_aud_mineria", "gp_planes", "agencias"]) assert.ok(CLAVES.test(k), k);
  for (const k of ["gp_groq_llave", "gp_theme", "gp_idioma", "dominus_flujo_org", "gp_norma_mex"]) assert.ok(!CLAVES.test(k), k);
});

test("empresa de la página, claves locales y diferencias", () => {
  assert.equal(empresaDe({ search: "?embebido=1&org=0123456789abcdef" }, almacen({})), "0123456789abcdef");
  assert.equal(empresaDe({ search: "" }, almacen({ dominus_flujo_org: "fedcba9876543210" })), "fedcba9876543210");
  assert.equal(empresaDe({ search: "?org=../x" }, almacen({})), INTERNO);
  assert.deepEqual(locales(almacen({ gp_ops_dmi: "1", gp_theme: "dark", agencias: "[]" })), { gp_ops_dmi: "1", agencias: "[]" });
  // Primera vez: lo local que no está en el servidor se sube; lo del servidor se aplica
  assert.deepEqual(diferencias({ gp_ops_dmi: "a", gp_ops_gob: "b" }, { gp_ops_dmi: "z" }, true), { aplicar: { gp_ops_dmi: "z" }, subir: { gp_ops_gob: "b" } });
  // Otra empresa: lo local que no es de ella se quita (no se mezclan datos entre empresas)
  assert.deepEqual(diferencias({ gp_ops_dmi: "a" }, { gp_corp_instalaciones: "[]" }, false), { aplicar: { gp_corp_instalaciones: "[]", gp_ops_dmi: null }, subir: {} });
});

test("servidor: guardar, leer, borrar, validar y aislar por empresa", { skip: !DatabaseSync }, async () => {
  const db = d1();
  db.raw.exec("CREATE TABLE dominus_orgs (id TEXT PRIMARY KEY, nombre TEXT)"); db.raw.exec("INSERT INTO dominus_orgs VALUES ('0123456789abcdef', 'Acme')");
  assert.equal((await rutaDatos(db, "0123456789abcdef", "POST", { cambios: { gp_ops_dmi: '{"a":1}', gp_corp_instalaciones: "[]" } }))[1], 200);
  assert.deepEqual((await rutaDatos(db, "0123456789abcdef", "GET"))[0].datos, { gp_ops_dmi: '{"a":1}', gp_corp_instalaciones: "[]" });
  assert.deepEqual((await rutaDatos(db, INTERNO, "GET"))[0].datos, {});
  assert.equal((await rutaDatos(db, "0123456789abcdef", "POST", { cambios: { gp_ops_dmi: null } }))[1], 200);
  assert.deepEqual(Object.keys((await rutaDatos(db, "0123456789abcdef", "GET"))[0].datos), ["gp_corp_instalaciones"]);
  assert.equal((await rutaDatos(db, "0123456789abcdef", "POST", { cambios: { gp_groq_llave: "x" } }))[1], 400);
  assert.equal((await rutaDatos(db, "0123456789abcdef", "POST", { cambios: { gp_ops_dmi: "x".repeat(400001) } }))[1], 413);
  assert.equal((await rutaDatos(db, "ffffffffffffffff", "GET"))[1], 404);
});

test("copias para empresas cliente: solo la empresa indicada y la API de miembros", () => {
  const u = (ruta, q = "", host = "dominusosint.com") => ({ pathname: ruta, search: q, hostname: host });
  assert.ok(modoEmpresa(u("/empresa-ops.html")) && modoEmpresa(u("/empresa-caja")) && modoEmpresa(u("/empresa-corporativo.html")));
  assert.ok(!modoEmpresa(u("/ops.html")) && !modoEmpresa(u("/empresa.html")));
  // En modo empresa no hay respaldo a «dominus-interno» ni a la empresa activa del flujo de Admin
  assert.equal(empresaDe(u("/empresa-ops.html", ""), almacen({ dominus_flujo_org: "fedcba9876543210" })), "");
  assert.equal(empresaDe(u("/empresa-ops.html", "?org=dominus-interno"), almacen({})), "");
  assert.equal(empresaDe(u("/empresa-ops.html", "?embebido=1&org=0123456789abcdef"), almacen({})), "0123456789abcdef");
  assert.equal(apiDatos("0123456789abcdef", u("/empresa-ops.html")), "https://admin.dominusosint.com/cuenta/empresa/0123456789abcdef/datos");
  assert.equal(apiDatos("0123456789abcdef", u("/ops.html", "", "admin.dominusosint.com")), "/cuenta/empresa/admin/datos/0123456789abcdef");
});
