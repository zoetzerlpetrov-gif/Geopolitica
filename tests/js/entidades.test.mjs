import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrar, htmlEvento, htmlResumen, htmlFicha } from "../../js/entidades.js";

const d = { entidades: [
  { id: "pemex", nombre: "Petróleos Mexicanos", tipo: "EPE", gleif: { lei: "549300CAZKPF4HKMPX17", nombre_legal: "PETROLEOS MEXICANOS EPE", estado: "ACTIVE", registro: "ISSUED", url: "https://search.gleif.org/#/record/549300CAZKPF4HKMPX17", filiales: [["L1", "PMI", "MX"]] },
    resumen: { "cambio de razón social": 1 }, eventos: [
      { fuente: "SEC EDGAR", fecha: "2026-09-08", tipo: "cambio de razón social", titulo: "6-K", detalle: "Gasolinas Bienestar was renamed", url: "https://www.sec.gov/a.htm", estado: "documentado", id: "s1", nuevo: true },
      { fuente: "DOF", fecha: "2026-10-01", tipo: "acto oficial", titulo: "Aviso", detalle: "", url: "https://dof.gob.mx/x", estado: "documentado", id: "d1" }] },
  { id: "cfe", nombre: "CFE", tipo: "EPE", gleif: null, resumen: {}, eventos: [] }] };

test("filtros del monitor", () => {
  assert.deepEqual(filtrar(d).map((x) => x.id), ["s1"]);                    // por defecto, solo cambios relevantes
  assert.deepEqual(filtrar(d, { tipo: "" }).map((x) => x.id), ["d1", "s1"]); // todo, del más reciente al más antiguo
  assert.equal(filtrar(d, { tipo: "", texto: "renamed" }).length, 1);
  assert.equal(filtrar(d, { entidad: "cfe", tipo: "" }).length, 0);
});

test("HTML del monitor", () => {
  const h = htmlEvento({ ...d.entidades[0].eventos[0], entidad: "Petróleos Mexicanos" });
  assert.match(h, /NUEVO/);
  assert.match(h, /href="https:\/\/www\.sec\.gov\/a\.htm"/);
  assert.match(htmlEvento({ ...d.entidades[0].eventos[0], url: "javascript:alert(1)", entidad: "x" }), /href="#"/);
  assert.match(htmlResumen(d), /sin LEI/);
  assert.match(htmlFicha(d.entidades[0]), /Filiales directas \(1\)/);
  assert.match(htmlFicha(d.entidades[1]), /no tiene LEI/);
});
