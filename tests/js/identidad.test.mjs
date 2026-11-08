import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarCurp, filtrar, progreso, proximaRevision, RUTA, REVISIONES, PREVENCION, PLANTILLAS, bitacora } from "../../js/identidad-logica.js";

const LISTA = JSON.parse(readFileSync(new URL("../../config/lineas_mx.json", import.meta.url)));
const P = LISTA.plataformas;

test("CURP: ejemplo oficial de RENAPO válido y errores explicados", () => {
  assert.equal(validarCurp("HEGG560427MVZRRL04").ok, true);
  assert.equal(validarCurp(" hegg560427mvzrrl04 ").ok, true, "acepta minúsculas y espacios");
  assert.match(validarCurp("HEGG560427MVZRRL05").motivo, /verificador/);
  assert.match(validarCurp("HEGG560427MVZRRL0").motivo, /17 caracteres/);
  assert.match(validarCurp("HEGG561327MVZRRL04").motivo, /fecha/);
  assert.match(validarCurp("HEGG560427MXXRRL04").motivo, /entidad/);
  assert.equal(validarCurp("").ok, false);
});

test("lista oficial: 149 marcas en 58 páginas, sin repetir y con https", () => {
  assert.equal(P.length, 58);
  assert.equal(P.reduce((s, p) => s + p.marcas.length, 0), 149);
  assert.equal(new Set(P.map((p) => p.id)).size, P.length);
  assert.equal(new Set(P.map((p) => p.url)).size, P.length);
  for (const p of P) assert.match(p.url, /^https:\/\//);
  const altan = P.find((p) => p.url.includes("altanredes"));
  assert.equal(altan.marcas.length, 89);
  assert.deepEqual(P.slice(0, 3).map((p) => p.marcas[0]), ["Telcel", "AT&T, Unefon y WIM marca digital AT&T", "Teléfonica Movistar"]);
  assert.ok(P.filter((p) => p.principal).length >= 5);
});

test("filtrar ignora acentos y encuentra marcas dentro de la página de Altán", () => {
  assert.equal(filtrar(P, "").length, 58);
  assert.ok(filtrar(P, "telefonica").some((p) => p.url.includes("movistar")));
  assert.ok(filtrar(P, "bienestar").length >= 3);
  assert.ok(filtrar(P, "netwey")[0].url.includes("altanredes"));
});

test("progreso cuenta páginas, marcas cubiertas y líneas ajenas", () => {
  const altan = P.find((p) => p.url.includes("altanredes"));
  const e = { [P[0].id]: { e: "mia" }, [altan.id]: { e: "ajena", linea: "4417" }, [P[1].id]: { e: "sin" } };
  const r = progreso(P, e);
  assert.equal(r.revisadas, 3); assert.equal(r.mias, 1); assert.equal(r.ajenas.length, 1);
  assert.equal(r.marcas, 91); assert.equal(r.totalMarcas, 149); assert.equal(r.pct, 5);
  assert.deepEqual(progreso(P, {}).ajenas, []);
});

test("proximaRevision suma meses sin desbordar el fin de mes", () => {
  assert.equal(proximaRevision("2026-11-08", 3), "2027-02-08");
  assert.equal(proximaRevision("2026-11-30", 3), "2027-02-28");
  assert.equal(proximaRevision("2027-08-31", 6), "2028-02-29");
  assert.equal(proximaRevision("x"), "");
});

test("ruta, revisiones y prevención completas con enlaces oficiales", () => {
  assert.deepEqual(RUTA.map((r) => r.id).slice(0, 3), ["evidencia", "baja", "compania"]);
  for (const x of [...RUTA, ...REVISIONES, ...PREVENCION]) { assert.ok(x.t && x.d.length > 30, x.id); }
  for (const r of REVISIONES) assert.match(r.url, /^https:\/\//);
  assert.equal(new Set(REVISIONES.map((r) => r.id)).size, REVISIONES.length);
});

test("plantillas llenan datos y dejan marcadores cuando faltan", () => {
  const d = { nombre: "Ana López", curp: "HEGG560427MVZRRL04", compania: "Bait", linea: "4417", folio: "88123", fecha: "2026-11-08", correo: "ana@example.org", ciudad: "Puebla" };
  for (const [k, p] of Object.entries(PLANTILLAS)) {
    const t = p.f(d);
    assert.ok(t.includes("Ana López") && t.includes("4417"), k);
    assert.ok(t.includes("8 de noviembre de 2026"), k);
    assert.ok(!/undefined|null/.test(t), k);
    const vacio = p.f({ fecha: "2026-11-08" });
    assert.ok(vacio.includes("[nombre completo]") || vacio.includes("[Nombre y firma]"), k);
    assert.ok(!/undefined/.test(vacio), k);
  }
  assert.ok(PLANTILLAS.compania.f(d).includes("folio") || PLANTILLAS.compania.f(d).includes("Folio"));
});

test("bitácora resume la revisión con folios", () => {
  const e = { [P[0].id]: { e: "ajena", fecha: "2026-11-08", folio: "88123" } };
  const t = bitacora(P, e, "2026-11-08");
  assert.match(t, /1 de 58/); assert.match(t, /Telcel: LÍNEA QUE NO RECONOZCO \(2026-11-08\) · folio 88123/);
});

test("la página está enlazada y se publica", () => {
  const raiz = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  assert.ok(raiz("index.html").includes('href="identidad.html"'));
  assert.ok(raiz("index.html").includes('id="b-herr-identidad"'));
  assert.ok(raiz(".github/workflows/pages.yml").includes("identidad.html"));
  const h = raiz("identidad.html");
  for (const id of ["i-curp", "i-lista", "r-pasos", "t-texto", "o-lista", "v-lista"]) assert.ok(h.includes(`id="${id}"`), id);
});
