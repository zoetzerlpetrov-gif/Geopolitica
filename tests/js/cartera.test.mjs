// Cartera de proyectos: vista ejecutiva, estado general, cartera por sector, cliente de la nube (con un Supabase falso),
// enlaces para compartir y reglas de seguridad del SQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../../js/cartera-logica.js";
import * as V from "../../js/cartera-vista.js";
import { clienteCartera, enlaceDirectivo, leerEnlace } from "../../js/cartera-nube.js";

const HOY = new Date("2026-06-15T12:00:00Z");
const t = (id, o = {}) => ({ id, fase: "1. Estructura legal y constitución", tarea: `Tarea ${id}`, pais: "México", rol: "LEG", prioridad: "Alta", aplica: "Sí", estado: "Pendiente",
  avance: 0, inicio: "2026-06-01", fin: "2026-07-30", plazo: "", base: "", hito: false, ...o });
const plan = (tareas, extra = {}) => ({ titulo: "P", inicio: "2026-06-01", tareas, recurrentes: [], riesgos: [], leyes: [], auditoria: { total: 0 }, ...extra });

test("estado general: verde, amarillo y rojo con sus motivos", () => {
  const verde = L.vistaEjecutiva(plan([t("a"), t("b", { estado: "Hecho" })]), { hoy: HOY });
  assert.equal(verde.estado.color, "verde");
  const amarillo = L.vistaEjecutiva(plan([t("a", { escalar: "Firmar contrato de arrendamiento" }), t("b")]), { hoy: HOY });
  assert.equal(amarillo.estado.color, "amarillo"); assert.match(amarillo.estado.motivos.join(), /decisi/);
  const rojo = L.vistaEjecutiva(plan([t("a", { fase: "3. Permisos", fin: "2026-06-10", prioridad: "Crítica", tarea: "Trámite: Permiso CNE" }), ...Array.from({ length: 5 }, (_, i) => t(`x${i}`))]), { hoy: HOY });
  assert.equal(rojo.estado.color, "rojo"); assert.match(rojo.estado.motivos[0], /permiso/);
  const retraso = L.vistaEjecutiva(plan([t("a", { fin: "2026-08-30" })]), { hoy: HOY, lineaBase: "2026-08-01" });
  assert.equal(retraso.desviacion, 29); assert.equal(retraso.estado.color, "rojo");
  assert.equal(L.vistaEjecutiva(plan([t("a", { escalar: "No" })]), { hoy: HOY }).escalar.length, 0);
});

test("vista ejecutiva: hitos, permisos, vencimientos legales, riesgos, presupuesto y tendencia", () => {
  const p = plan([
    t("a", { estado: "Hecho", fin: "2026-06-05", presupuesto: "100,000", costo: "120000" }),
    t("b", { plazo: "30 días", fin: "2026-06-20", presupuesto: 50000, costo: 0 }),
    t("c", { fase: "3. Permisos", tarea: "Trámite: Licencia", fin: "2026-09-01" }),
    { ...t("HITO-F1", { hito: true, tarea: "Hito: Estructura terminada", fin: "2026-07-30" }) },
  ], { riesgos: [{ id: "r1", riesgo: "Multa", prob: 4, impacto: 5, estado: "Abierto" }, { id: "r2", riesgo: "Cerrado", prob: 5, impacto: 5, estado: "Cerrado" }] });
  const v = L.vistaEjecutiva(p, { hoy: HOY, cortes: [{ fecha: "2026-06-08T00:00:00Z", resumen: { avance: 0.2, vencidas: 1 } }, { fecha: "2026-06-01T00:00:00Z", resumen: { avance: 0.1, vencidas: 0 } }] });
  assert.equal(v.hitos.proximos[0].id, "HITO-F1");
  assert.deepEqual([v.permisos.total, v.permisos.obtenidos], [1, 0]);
  assert.deepEqual(v.legales.map((x) => x.id), ["b"]);
  assert.deepEqual(v.riesgos.map((x) => x.id), ["r1"]);
  assert.equal(v.presupuesto.presupuesto, 150000); assert.equal(v.presupuesto.costo, 120000);
  assert.deepEqual(v.tendencia.map((x) => x.fecha), ["2026-06-01", "2026-06-08"]);
  const h = V.htmlEjecutivo(v, { empresa: "Empresa <A>", sector: "Hidrocarburos", actualizado: "2026-06-15T10:00:00Z" });
  assert.match(h, /Empresa &lt;A&gt;/); assert.match(h, /Hito: Estructura terminada|Estructura terminada/); assert.match(h, /<svg/); assert.match(h, /150,000/);
});

test("cartera: filas, comparación por sector y corte", () => {
  const regs = [{ id: "1", empresa: "B", sector: "Hidrocarburos", titulo: "Plan B", datos: plan([t("a", { fin: "2026-06-01" })]) },
    { id: "2", empresa: "A", sector: "Hidrocarburos", titulo: "Plan A", datos: plan([t("a", { estado: "Hecho", avance: 1 })]) },
    { id: "3", empresa: "C", sector: "", titulo: "Plan C", datos: plan([t("a")]) }];
  const filas = regs.map((r) => L.filaCartera(r, HOY));
  assert.equal(filas[0].vencidas, 1); assert.equal(filas[1].avance, 1);
  const s = L.porSector(filas);
  assert.deepEqual(s.map((x) => [x.sector, x.planes]), [["Hidrocarburos", 2], ["Sin sector", 1]]);
  assert.equal(s[0].avance, 0.5);
  assert.match(V.htmlTarjeta(filas[0]), /data-plan="1"/);
  const c = L.corteDe(regs[0].datos, HOY);
  assert.deepEqual([c.total, c.vencidas, c.hechas], [1, 1, 0]);
  assert.equal(L.planParaNube(plan([t("a", { tarea: "x".repeat(900) })])).tareas[0].tarea.length, 300);
});

test("cliente de la nube: valida entradas y usa solo tablas dominus_planes", async () => {
  const llamadas = [];
  const consulta = (tabla) => {
    const q = { tabla, ops: [] };
    const cadena = new Proxy(q, { get: (o, k) => (k === "then" ? (res) => res({ data: [{ id: "x" }], error: null }) : (...a) => { o.ops.push([k, a]); return cadena; }) });
    llamadas.push(q);
    return cadena;
  };
  const sb = { auth: { getUser: async () => ({ data: { user: { id: "u", email: "yo@x.com" } } }), signInWithOtp: async (o) => { llamadas.push(o); return {}; }, signOut: async () => ({}) },
    from: consulta, rpc: async () => ({ data: { esquema: 1 } }) };
  const c = clienteCartera(sb);
  await assert.rejects(() => c.pedirCodigo("no-es-correo"), /Correo/);
  await c.pedirCodigo(" Directivo@Empresa.com ");
  assert.equal(llamadas.at(-1).email, "directivo@empresa.com"); assert.equal(llamadas.at(-1).options.shouldCreateUser, false);
  await assert.rejects(() => c.obtener("1; drop table"), /inválido/);
  await assert.rejects(() => c.compartir("11111111-1111-1111-1111-111111111111", "x@y.com", "admin"), /Rol/);
  await c.compartir("11111111-1111-1111-1111-111111111111", "X@Y.com", "lector");
  assert.equal(llamadas.at(-1).tabla, "dominus_planes_miembros");
  assert.deepEqual(llamadas.at(-1).ops[0][1][0], { plan_id: "11111111-1111-1111-1111-111111111111", correo: "x@y.com", rol: "lector" });
  await assert.rejects(() => c.subir({ empresa: " ", titulo: "t", datos: {} }), /empresa/);
  await c.subir({ empresa: "Empresa", titulo: "Plan", datos: { tareas: [] } });
  assert.equal(llamadas.at(-1).ops[0][0], "insert");
  assert.ok(llamadas.filter((q) => q.tabla).every((q) => q.tabla.startsWith("dominus_planes")));
});

test("enlace para compartir y SQL con seguridad por filas", () => {
  const cfg = { url: "https://abcdefgh.supabase.co", key: "sb_publishable_abcdefghijkl" };
  const e = enlaceDirectivo("https://sitio/cartera.html#viejo", cfg, "11111111-1111-1111-1111-111111111111");
  assert.match(e, /^https:\/\/sitio\/cartera\.html#u=/);
  assert.deepEqual(leerEnlace(e.split("#")[1]), { url: cfg.url, key: cfg.key, plan: "11111111-1111-1111-1111-111111111111" });
  const sql = readFileSync(new URL("../../config/cartera.sql", import.meta.url), "utf8");
  for (const tabla of ["dominus_planes", "dominus_planes_miembros", "dominus_planes_cortes"]) assert.match(sql, new RegExp(`alter table public\\.${tabla} enable row level security`));
  assert.match(sql, /revoke all on public\.dominus_planes, public\.dominus_planes_miembros, public\.dominus_planes_cortes from anon/);
  assert.doesNotMatch(sql, /service_role|drop table/i);
});
