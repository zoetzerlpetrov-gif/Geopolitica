import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as I from "../../js/investigacion.js";
import { filtrar, htmlGrupos } from "../../js/marco.js";
import { titulares, coincidencias, htmlTecnica } from "../../js/narrativas.js";

const DOF = { por_mes: { "2026-09": { Decreto: 2 }, "2026-10": { Acuerdo: 3, "Ley o reforma legal": 1 } },
  leyes: [{ f: "2026-10-07", t: "Ley o reforma legal", d: "", x: "Decreto por el que se reforma la Constitución", u: "https://dof.gob.mx/nota_detalle.php?codigo=1&fecha=07/10/2026" },
    { f: "2026-09-24", t: "Decreto", d: "", x: "Decreto de expropiación", u: "https://dof.gob.mx/x" }] };

test("DOF por mes: meses ordenados, conteo y leyes del mes", () => {
  assert.deepEqual(I.mesesDof(DOF), ["2026-10", "2026-09"]);
  const h = I.htmlMesDof(DOF, "2026-10");
  assert.ok(h.includes("4 publicaciones") && h.includes("Constitución") && !h.includes("expropiación"));
  assert.ok(I.htmlMesDof(DOF, "2025-01").includes("Sin datos"));
});

test("leyes federales: búsqueda sin acentos y barras por año", () => {
  const d = { leyes: [{ n: "LEY Aduanera", ref: "https://r", pdf: "", pub: "1995-12-15", ult: "2025-12-27" }, { n: "CONSTITUCIÓN Política", ref: "https://c", pdf: "https://p", pub: "1917-02-05", ult: "2026-10-07" }],
    por_anio: { 2025: 1, 2026: 1 } };
  assert.deepEqual(I.buscarLeyes(d, "constitucion").map((l) => l.n), ["CONSTITUCIÓN Política"]);
  assert.equal(I.buscarLeyes(d, "").length, 2);
  assert.ok(I.htmlLeyes(d, d.leyes).includes("última reforma 2026-10-07"));
});

test("verificador de proveedores contra el 69-B", () => {
  const datos = { corte_sat: "2026-10-01", filas: [["AAA010101AAA", "COMERCIALIZADORA FANTASMA SA DE CV", "Definitivo", "", "", "2025-01-01", ""]] };
  const filas = I.verificarProveedores(datos, "AAA010101AAA\nempresa limpia sa\n\nx");
  assert.equal(filas.length, 2);
  assert.equal(filas[0].res[0].situacion, "Definitivo");
  assert.equal(filas[1].res.length, 0);
  assert.ok(I.htmlProveedores(filas, datos).includes("1 de 2"));
});

test("guías y fuentes con enlaces https", () => {
  for (const [, u] of I.FUENTES_PODER) assert.match(u, /^https:\/\//);
  assert.ok(I.GUIAS.length >= 3 && I.FOCOS_CONTRATOS.length >= 5);
  assert.ok(I.htmlGuia(I.GUIAS[2]).includes("no cruza apellidos"));
});

test("marco normativo: estructura y búsqueda", () => {
  const cfg = JSON.parse(readFileSync(new URL("../../config/normativa.json", import.meta.url)));
  for (const g of cfg.grupos) for (const i of g.items) for (const k of ["nombre", "emisor", "que_es", "relacion", "url"]) assert.ok(i[k], `${g.id}: falta ${k}`);
  const r = filtrar(cfg, "robots");
  assert.ok(r.length >= 1 && r.every((g) => g.items.every((i) => /robots/i.test(`${i.nombre} ${i.que_es} ${i.relacion}`))));
  assert.ok(htmlGrupos(filtrar(cfg, "zzzz")).includes("Nada coincide"));
});

test("narrativas: estructura, obras citadas existen y coincidencias", () => {
  const cfg = JSON.parse(readFileSync(new URL("../../config/narrativas.json", import.meta.url)));
  const ids = new Set(cfg.obras.map((o) => o.id));
  for (const t of cfg.tecnicas) {
    for (const o of t.obras) assert.ok(ids.has(o), `${t.id}: obra ${o} no existe`);
    for (const k of ["nombre", "rx", "que_es", "que_sigue", "defensa"]) assert.ok(t[k], `${t.id}: falta ${k}`);
    assert.ok(t.senales.length >= 2);
  }
  const ahora = Date.parse("2026-10-21T12:00:00Z");
  const lista = titulares({ notas: [{ t: "EUA impone aranceles al acero", u: "https://a", m: "x", f: "2026-10-21T10:00:00Z" },
    { t: "Nota vieja de sanciones", u: "https://b", m: "y", f: "2026-10-10T10:00:00Z" }] },
  { eventos: [{ titulo: "Denuncian granja de trolls en elecciones", url: "https://c", fuente: "z", fecha_utc: "2026-10-21T11:00:00Z" }] }, { ahora });
  assert.deepEqual(lista.map((n) => n.u), ["https://c", "https://a"]);
  const r = Object.fromEntries(coincidencias(cfg.tecnicas, lista).map((x) => [x.tec.id, x.total]));
  assert.equal(r.economica, 1);
  assert.equal(r.influencia, 1);
  assert.equal(r.miedo, 0);
  const h = htmlTecnica(coincidencias(cfg.tecnicas, lista).find((x) => x.tec.id === "economica"), cfg.obras, ahora);
  assert.ok(h.includes("Guerra irrestricta") && h.includes("aranceles"));
});
