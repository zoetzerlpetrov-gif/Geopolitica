// Botón global «Animar»: arranca solo lo disponible y detiene todo.
import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.window = globalThis.window || {};
const A = await import("../../js/animacion.js");

const parte = (id, disp) => {
  const p = { id, nombre: id, on: false, disponible: () => disp, activa: () => p.on, iniciar: () => { p.on = true; }, detener: () => { p.on = false; } };
  return p;
};

test("anima solo las partes disponibles y las detiene todas", () => {
  const ev = parte("eventos", true), cl = parte("clima", false);
  A.registrarAnimacion(ev); A.registrarAnimacion(cl);
  assert.deepEqual(A.animarTodo(), ["eventos"]);
  assert.equal(ev.on, true); assert.equal(cl.on, false);
  A.detenerTodo();
  assert.equal(ev.on, false);
});

test("una parte que falla no impide animar las demás", () => {
  const mala = { id: "mala", nombre: "mala", disponible: () => true, activa: () => false, iniciar: () => { throw new Error("x"); }, detener: () => {} };
  const buena = parte("buena", true);
  A.registrarAnimacion(mala); A.registrarAnimacion(buena);
  A.animarTodo();
  assert.equal(buena.on, true);
  A.detenerTodo();
});
