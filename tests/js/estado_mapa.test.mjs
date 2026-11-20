import test from "node:test";
import assert from "node:assert/strict";
import { claveDe, aplicar, leer } from "../../js/estado_mapa.js";

// Controles mínimos con la forma que usa aplicar(): tipo, dataset, checked/value y dispatchEvent.
globalThis.Event ||= class { constructor(t) { this.type = t; } };
function caja({ id = "", dataset = {}, checked = false, value = "on", type = "checkbox" } = {}) {
  const el = { id, dataset, checked, value, type, disabled: false, eventos: 0, closest: () => null };
  el.dispatchEvent = () => { el.eventos++; };
  return el;
}

test("la clave de un control usa su id, su data-* y el valor en los subtipos", () => {
  assert.equal(claveDe(caja({ id: "capa-chokepoints" })), "#capa-chokepoints");
  assert.equal(claveDe(caja({ dataset: { riesgo: "sismos" } })), "riesgo:sismos");
  assert.equal(claveDe(caja({ dataset: { famSub: "puertos" }, value: "granel" })), "famSub:puertos:granel");
  assert.equal(claveDe(caja()), null);
  const admin = caja({ id: "x" }); admin.closest = () => ({});
  assert.equal(claveDe(admin), null, "lo del menú Admin no se guarda");
});

test("aplicar solo cambia los controles distintos y avisa con change", () => {
  const a = caja({ dataset: { riesgo: "sismos" } }), b = caja({ id: "capa-indice", checked: true }), c = caja({ id: "sel", type: "select-one", value: "" });
  const raiz = { querySelectorAll: () => [a, b, c] };
  const n = aplicar(raiz, { controles: { "riesgo:sismos": true, "#capa-indice": true, "#sel": "MEX" } });
  assert.equal(n, 2);
  assert.equal(a.checked, true); assert.equal(a.eventos, 1);
  assert.equal(b.eventos, 0, "ya estaba encendida");
  assert.equal(c.value, "MEX");
});

test("un estado guardado dañado no rompe el mapa", () => {
  assert.deepEqual(leer({ getItem: () => "{no es json" }), {});
  assert.deepEqual(leer(null), {});
});
