// Pruebas de subcategorías, religión mencionada y eventos nuevos.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || {};
const { areasDeSubtemas, clavesSub, pasaSub, religionesEn } = await import("../../js/temas.js");
const { idsNuevos } = await import("../../js/avisos.js");
const { sinAcentos } = await import("../../js/util.js");

const tax = JSON.parse(readFileSync(new URL("../../config/taxonomy.json", import.meta.url)));
const areaDeSub = areasDeSubtemas(tax.areas);

test("cada subtema pertenece a una sola área y existen los nuevos", () => {
  for (const id of ["incidentes_aereos", "incidentes_maritimos", "incidentes_ferroviarios", "incidentes_espaciales", "violencia_religiosa"]) assert.ok(areaDeSub.has(id), id);
  assert.equal(areaDeSub.get("incidentes_aereos"), "infraestructura");
  const ids = tax.areas.flatMap((a) => a.subtemas.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("un evento sin subtemas de su área cae en «otros» de esa área", () => {
  const ev = { area_principal: "energia", subtemas: ["incidentes_maritimos"] };
  assert.deepEqual(clavesSub(ev, areaDeSub), ["incidentes_maritimos", "otros:energia"]);
  assert.ok(pasaSub(ev, "incidentes_maritimos", areaDeSub));   // se encuentra aunque su área principal sea Energía
  assert.ok(pasaSub(ev, "otros:energia", areaDeSub));
  assert.ok(!pasaSub(ev, "incidentes_aereos", areaDeSub));
  assert.ok(pasaSub(ev, "", areaDeSub));
  assert.deepEqual(clavesSub({ area_principal: "energia", subtemas: ["petroleros"] }, areaDeSub), ["petroleros"]);
});

test("religión mencionada: raíces, palabras exactas y falsos positivos", () => {
  const r = (t) => religionesEn(sinAcentos(t));
  assert.deepEqual(r("Atacan una mezquita en Pakistán"), ["islam"]);
  assert.deepEqual(r("Mob burns churches after blasphemy claim"), ["cristianismo"]);
  assert.deepEqual(r("Ataque antisemita frente a una sinagoga"), ["judaismo"]);
  assert.deepEqual(r("Hindu nationalists clash with Muslims"), ["islam", "hinduismo"]);
  assert.deepEqual(r("Churchill war rooms reopen"), []);
  assert.deepEqual(r("El precio de la papa sube"), []);
  assert.deepEqual(r("Imanes de neodimio y tierras raras"), []);
});

test("eventos nuevos: la primera carga no avisa; después, solo los ids que no estaban", () => {
  const evs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(idsNuevos(new Set(), evs), []);
  assert.deepEqual(idsNuevos(new Set(["a", "b"]), evs), ["c"]);
});
