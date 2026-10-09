// Buscador de la lista de eventos: palabras sin acentos y frases entre comillas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { palabrasDe, sinAcentos } from "../../js/util.js";

test("palabras sin acentos, frases entre comillas y se ignoran las de 1 letra", () => {
  assert.deepEqual(palabrasDe('Gasolina  "Banco de México" y a'), ["gasolina", "banco de mexico", "y"].filter((x) => x.length >= 2));
  assert.deepEqual(palabrasDe("   "), []);
  assert.equal(sinAcentos("Ñandú ÁRBOL"), "nandu arbol");
});
