// Buscador de la lista de eventos: palabras sin acentos y frases entre comillas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { palabrasDe, sinAcentos, resaltar, fragmento } from "../../js/util.js";

test("palabras sin acentos, frases entre comillas y desde 3 caracteres", () => {
  assert.deepEqual(palabrasDe('Gasolina  "Banco de México" y de'), ["gasolina", "banco de mexico"]);
  assert.deepEqual(palabrasDe("   "), []);
  assert.deepEqual(palabrasDe("me"), []);
  assert.deepEqual(palabrasDe("méx"), ["mex"]);
  assert.equal(sinAcentos("Ñandú ÁRBOL"), "nandu arbol");
});

test("resalta lo que coincide sin importar acentos y escapa el HTML", () => {
  assert.equal(resaltar("Banco de México sube tasas", ["mexico"]), "Banco de <mark>México</mark> sube tasas");
  assert.equal(resaltar("Rusia y RUSIA", ["rus"]), "<mark>Rus</mark>ia y <mark>RUS</mark>IA");
  assert.equal(resaltar("<b>x</b> gas", ["gas"]), "&lt;b&gt;x&lt;/b&gt; <mark>gas</mark>");
  assert.equal(resaltar("sin búsqueda", []), "sin búsqueda");
});

test("fragmento alrededor de la coincidencia", () => {
  const r = "Los ductos que llevan gas de Rusia a Alemania sufrieron explosiones bajo el mar Báltico, según autoridades danesas y suecas que investigan.";
  const f = fragmento(r, ["rusia"], 60);
  assert.match(f, /<mark>Rusia<\/mark>/);
  assert.ok(f.startsWith("…") && f.endsWith("…"));
  assert.equal(fragmento(r, ["japon"]), "");
});
