// Lógica del cumplimiento normativo por empresa (js/cumplimiento-logica.js) con las fichas reales de México.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../js/cumplimiento-logica.js";

const leer = (f) => JSON.parse(readFileSync(new URL(`../../config/normativa/${f}`, import.meta.url), "utf8"));
const MEX = leer("MEX.json"), EXTRA = leer("MEX_sectores.json").sectores;

test("huella estable y claves válidas para el API (idLey#8hex)", () => {
  assert.equal(C.huella("abc"), C.huella("abc"));
  assert.notEqual(C.huella("abc"), C.huella("abd"));
  const it = C.preguntas(C.leyesAplicables(MEX, EXTRA, []));
  assert.ok(it.length > 10);
  for (const x of it) assert.match(x.clave, /^[a-z0-9_.-]{1,60}#[0-9a-f]{8}$/);
  assert.equal(new Set(it.map((x) => x.clave)).size, it.length, "claves únicas");
});

test("los sectores agregan sus leyes sin repetir las generales", () => {
  const gen = C.leyesAplicables(MEX, EXTRA, []);
  const s = C.sectoresDe(MEX, EXTRA);
  assert.ok(s.length >= 20 && s.every((x) => x.id && x.nombre));
  const con = C.leyesAplicables(MEX, EXTRA, ["quimica_petroquimica", "automotriz"]);
  assert.ok(con.length > gen.length);
  assert.equal(new Set(con.map((l) => l.id)).size, con.length);
});

test("avisos: la ley cambió después de la revisión y plazo vencido; resumen sin contar «no aplica»", () => {
  const ley = { id: "x", ultima_reforma: "2025-06-27 · nueva 2026-11-24 (verificar)", preguntas: ["¿A?", "¿B?", "¿C?"] };
  assert.equal(C.fechaReforma(ley.ultima_reforma), "2026-11-24");
  const [a, b, c] = C.preguntas([ley]);
  const r = { [a.clave]: { estado: "cumple", actualizado: Date.parse("2026-11-01") / 1000 },
    [b.clave]: { estado: "en_proceso", fecha_limite: "2026-11-01", actualizado: Date.parse("2026-11-25") / 1000 },
    [c.clave]: { estado: "no_aplica" } };
  assert.equal(C.avisos(a, r[a.clave], "2026-11-25")[0].tipo, "cambio");
  assert.equal(C.avisos(b, r[b.clave], "2026-11-25")[0].tipo, "vencido");
  const s = C.resumen([a, b, c], r);
  assert.equal(s.pct, 50);
  assert.equal(s.no_aplica, 1);
  assert.match(C.csv([a], r), /Cumple/);
});
