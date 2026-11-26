// Proyectos y seguimiento por cliente (cloudflare/planes/proyectos.js) a través de empresas.js, con SQLite en memoria.
import test from "node:test";
import assert from "node:assert/strict";
import { serveEmpresas } from "../../cloudflare/planes/empresas.js";
import { validarProyecto, validarItem, resumen, FASES } from "../../cloudflare/planes/proyectos.js";
import { siguientePaso, htmlFases } from "../../js/proyectos-ui.js";

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
  return { prepare: (sql) => stmt(sql), batch: async (lista) => { for (const s of lista) await s.run(); } };
}
const ORIGEN = "https://dominusosint.com";
async function api(env, correo, ruta, cuerpo, esAdmin = false) {
  const init = cuerpo === undefined ? { headers: { Origin: ORIGEN } } : { method: "POST", headers: { Origin: ORIGEN, "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) };
  const req = new Request("https://admin.dominusosint.com/cuenta/empresa/" + ruta, init);
  const r = await serveEmpresas(req, new URL(req.url), env, { correo, esAdmin, origenes: [ORIGEN] });
  return { status: r.status, body: await r.json() };
}

test("validaciones y cálculo de avance", () => {
  assert.deepEqual(FASES, ["alta", "arranque", "plan", "auditorias", "seguimiento", "entrega", "cierre"]);
  assert.throws(() => validarProyecto({ nombre: "x" }), /nombre/);
  assert.throws(() => validarProyecto({ nombre: "Ok", inicio: "2026-05-01", fin: "2026-04-01" }), /anterior/);
  assert.throws(() => validarProyecto({ nombre: "Ok", fase: "inventada" }, true), /Fase/);
  assert.throws(() => validarItem({ tipo: "hallazgo", texto: "Sin control", severidad: "extrema" }), /Gravedad/);
  assert.equal(validarItem({ tipo: "actividad", texto: "Visita" }).estado, "pendiente");
  assert.deepEqual(resumen([{ tipo: "actividad", estado: "hecho" }, { tipo: "actividad", estado: "pendiente" },
    { tipo: "hallazgo", estado: "abierto", severidad: "critica" }, { tipo: "hallazgo", estado: "cerrado", severidad: "alta" }, { tipo: "seguimiento", estado: "registrada" }]),
    { actividades: 2, hechas: 1, avance: 50, hallazgos_abiertos: 1, criticos: 1, notas: 1 });
});

test("pantalla: fases en orden con la actual marcada", () => {
  const fases = FASES.map((id, i) => ({ id, nombre: `${i + 1}. ${id}`, icono: "•", que: "" }));
  assert.equal(siguientePaso(fases, "plan").siguiente.id, "auditorias");
  assert.equal(siguientePaso(fases, "cierre").siguiente, null);
  const h = htmlFases(fases, "plan");
  assert.equal((h.match(/class="hecha"/g) || []).length, 2);
  assert.match(h, /class="actual"[^>]*><span>•<\/span>3\. plan/);
});

test("flujo: admin crea proyecto, el cliente lo ve y edita según su rol, aislamiento entre empresas", { skip: !DatabaseSync }, async () => {
  const env = { OSINT_PLANS_DB: d1() };
  const dueno = "dueno@acme.mx", lector = "lector@acme.mx", otro = "otro@beta.mx";
  const a = await api(env, dueno, "crear", { nombre: "Acme SA", pais: "MEX", sectores: [] });
  const b = await api(env, otro, "crear", { nombre: "Beta SA", pais: "MEX", sectores: [] });
  const org = a.body.id;
  const inv = await api(env, dueno, `${org}/invitar`, { email: lector, rol: "lector" });
  assert.equal((await api(env, lector, "aceptar", { token: inv.body.token })).status, 200);

  assert.equal((await api(env, dueno, `admin/proyectos/${org}`, undefined, false)).status, 403);
  assert.equal((await api(env, null, `admin/proyectos/ffffffffffffffff`, undefined, true)).status, 404);
  const p = await api(env, null, `admin/proyectos/${org}/crear`, { nombre: "Diagnóstico planta Monterrey", pais: "mex", inicio: "2026-12-01" }, true);
  assert.equal(p.status, 201);
  const pid = p.body.id;
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/item`, { tipo: "actividad", texto: "Visita a la planta", responsable: "Ana", fecha: "2026-12-05" })).status, 200);
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/item`, { tipo: "hallazgo", texto: "Sin control de acceso", severidad: "critica" })).status, 200);
  assert.equal((await api(env, lector, `${org}/proyectos/${pid}/item`, { tipo: "seguimiento", texto: "Intento" })).status, 403);
  const det = await api(env, lector, `${org}/proyectos/${pid}`);
  assert.equal(det.status, 200);
  assert.equal(det.body.proyecto.pais, "MEX");
  assert.equal(det.body.items.length, 2);
  assert.equal(det.body.proyecto.criticos, 1);
  const act = det.body.items.find((i) => i.tipo === "actividad");
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/item`, { ...act, estado: "hecho" })).status, 200);
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/editar`, { ...det.body.proyecto, fase: "auditorias" })).status, 200);
  const lista = await api(env, null, `admin/proyectos/${org}`, undefined, true);
  assert.equal(lista.body.proyectos[0].fase, "auditorias");
  assert.equal(lista.body.proyectos[0].avance, 100);
  assert.equal(lista.body.fases.length, 7);
  // Otra empresa no ve ni toca el proyecto
  assert.equal((await api(env, otro, `${org}/proyectos`)).status, 403);
  assert.equal((await api(env, otro, `${b.body.id}/proyectos/${pid}`)).status, 404);
  // Borrar elemento y proyecto
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/item/${act.id}/borrar`, {})).status, 200);
  assert.equal((await api(env, dueno, `${org}/proyectos/${pid}/borrar`, {})).status, 200);
  assert.equal((await api(env, dueno, `${org}/proyectos`)).body.proyectos.length, 0);
});
