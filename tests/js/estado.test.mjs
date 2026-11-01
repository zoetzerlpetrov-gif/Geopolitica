import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarWorkflow, evaluarDato, erroresDe, peor } from "../../js/estado.js";
import { registrar, leerBitacora, informe, leerInforme, rutaSegura } from "../../js/bitacora.js";

const AHORA = new Date("2026-10-29T18:00:00Z");
const P = { id: "vivos", nombre: "Datos en movimiento", workflow: "vivos.yml", max_horas: 1 };
const c = (id, creada, fin, conclusion = "success") => ({ id, status: "completed", conclusion, created_at: creada, updated_at: fin, html_url: `u${id}` });

test("misma regla que Python: al día, canceladas y falla", () => {
  assert.equal(evaluarWorkflow(P, [c(1, "2026-10-29T17:20:00Z", "2026-10-29T17:45:00Z")], AHORA).estado, "ok");
  const canc = [0, 1, 2, 3].map((i) => c(i, "2026-10-29T17:00:00Z", "2026-10-29T17:10:00Z", "cancelled"));
  const w = evaluarWorkflow(P, [...canc, c(9, "2026-10-29T16:30:00Z", "2026-10-29T16:55:00Z")], AHORA);
  assert.equal(w.estado, "atraso"); assert.match(w.detalle, /canceladas/);
  assert.equal(evaluarWorkflow(P, canc, AHORA).estado, "falla");
  assert.equal(evaluarWorkflow(P, [], AHORA).estado, "falla");
});

test("datos publicados y fuentes con error", () => {
  const r = { id: "d", nombre: "N", archivo: "a", campo: "actualizado_utc", max_horas: 4, errores: "fuentes" };
  const d = evaluarDato(r, { actualizado_utc: "2026-10-29T17:00:00Z", fuentes: { eua: "ok (1)", mi5: "error: URLError" } }, AHORA);
  assert.equal(d.estado, "ok"); assert.deepEqual(d.errores, ["mi5: error: URLError"]);
  assert.equal(evaluarDato(r, null, AHORA).estado, "falla");
  assert.deepEqual(erroresDe({ pasos: { buques: { estado: "error", error: "x" } } }, "pasos"), ["buques: x"]);
  assert.equal(peor([{ estado: "ok" }, { estado: "falla" }, { estado: "atraso" }]), "falla");
});

test("bitácora local: sin parámetros de URL, agrupa repetidos y el informe se puede leer de vuelta", () => {
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(rutaSegura("data/vivos/x.json?lat=19.4&lon=-99.1", "https://s.io"), "/data/vivos/x.json");
  assert.equal(rutaSegura("https://api.otro.com/buscar?q=mi+casa", "https://s.io"), "api.otro.com");
  registrar("datos", "HTTP 404 en /data/x.json", store, AHORA);
  registrar("datos", "HTTP 404 en /data/x.json", store, AHORA);
  registrar("error", "TypeError: a is undefined", store, AHORA);
  const b = leerBitacora(store);
  assert.equal(b.length, 2); assert.equal(b[0].veces, 2);
  registrar("error", "otro", store, new Date("2026-11-20T00:00:00Z"));
  assert.equal(leerBitacora(store).length, 1, "se borra lo de más de 14 días");
  const txt = informe(b, { vista: "pago", plan: "recon", fecha: "2026-10-29T18:00:00Z", navegador: "Prueba", pantalla: "1×1", idioma: "es" });
  const { cab, filas } = leerInforme(txt);
  assert.equal(cab["Vista"], "pago · plan recon"); assert.equal(filas.length, 2); assert.equal(filas[0].msg, "HTTP 404 en /data/x.json");
});

test("Portafolio: fecha con zona de CDMX y mínimo de instrumentos con noticias", () => {
  const r = { id: "d_portafolio", nombre: "P", archivo: "https://x/daily_report.json", campo: "generated_at", max_horas: 30,
    errores: "noticias.fuentes", minimo: { campo: "noticias.instrumentos_con_noticias", valor: 1, texto: "Instrumentos con noticias" } };
  const sin = evaluarDato(r, { generated_at: "2026-10-29T09:00:00-06:00", report: {} }, AHORA);
  assert.equal(sin.estado, "atraso");
  assert.match(sin.detalle, /Instrumentos con noticias: 0/);
  const con = evaluarDato(r, { generated_at: "2026-10-29T09:00:00-06:00", noticias: { instrumentos_con_noticias: 12, fuentes: { "https://b/rss": "error: URLError" } } }, AHORA);
  assert.equal(con.estado, "ok");
  assert.deepEqual(con.errores, ["https://b/rss: error: URLError"]);
});
