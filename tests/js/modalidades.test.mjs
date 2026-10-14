// Criminología: modalidades delictivas en titulares.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const R = await import("../../js/riesgos.js");
const fc = (...ts) => ({ type: "FeatureCollection", features: ts.map((title) => ({ properties: { title } })) });
const mod = (id) => R.MODALIDADES.find((m) => m[0] === id)[3];

test("cada modalidad reconoce sus titulares (español e inglés, sin acentos)", () => {
  const casos = { extorsion: "Detienen a célula dedicada a la extorsión y cobro de piso", secuestro: "Rescatan a víctima de secuestro en Puebla",
    fraude: "Desmantelan red de fraude con empresas fantasma", ciber: "Ransomware paraliza hospitales", trata: "Rescatan a 30 víctimas de trata de personas",
    amenazas: "Colocan narcomanta con amenazas de muerte", robo: "Aumenta el robo de vehículo en la autopista" };
  for (const [id, t] of Object.entries(casos)) assert.equal(R.filtrarModalidad(fc(t, "Clima soleado en Monterrey"), mod(id)).features.length, 1, id);
});

test("las amenazas entre países (títulos de GDELT) no cuentan como delito", () => {
  assert.equal(R.filtrarModalidad(fc("Amenaza: Irán → Israel (Tehran, Irán)"), mod("amenazas")).features.length, 0);
});

test("siete capas de criminología, fuera de la lista de amenazas", () => {
  const cs = R.CAPAS.filter((c) => c.grupo.startsWith("Criminología"));
  assert.equal(cs.length, 7);
  assert.ok(cs.every((c) => c.noAmenaza && c.generar && /089/.test(c.pie)));
  assert.ok(R.GRUPOS.some(([g]) => g.startsWith("Criminología")));
});
