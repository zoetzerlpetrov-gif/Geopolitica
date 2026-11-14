import { test } from "node:test";
import assert from "node:assert/strict";
import { registrar, leerBitacora, rolDe, delRol, informe } from "../../js/bitacora.js";

const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("Soporte: cada error guarda el rol y el informe de un plan no muestra los de la versión completa", () => {
  assert.equal(rolDe("?vista=pago&plan=command"), "pago:command");
  assert.equal(rolDe("?vista=pago"), "pago:sin_plan");
  assert.equal(rolDe(""), "admin");
  const s = memoria(), t = new Date("2026-11-14T03:00:00Z");
  registrar("datos", "HTTP 404 en /data/vivos/x.json", s, t, "admin");
  registrar("error", "falló el mapa", s, t, "pago:command");
  registrar("error", "falló el mapa", s, t, "pago:command");   // repetido: cuenta «veces»
  registrar("error", "falló el mapa", s, t, "pago:analyst");   // mismo mensaje, otro rol: entrada aparte
  const todo = leerBitacora(s);
  assert.equal(todo.length, 3);
  assert.deepEqual(delRol(todo, "pago:command").map((e) => [e.msg, e.veces]), [["falló el mapa", 2]]);
  assert.equal(delRol([{ t: "x", msg: "viejo" }], "admin").length, 1);  // entradas de antes sin rol: cuentan como admin
  assert.match(informe(delRol(todo, "pago:command"), { vista: "pago", plan: "command" }), /Vista: pago · plan command[\s\S]*Entradas: 1/);
});
