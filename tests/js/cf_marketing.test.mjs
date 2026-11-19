import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiar, contar, resumen } from "../../cloudflare/marketing/service.js";
import { leerUtm } from "../../js/utm.js";

test("visitas por red: solo redes conocidas y origen del sitio", async () => {
  assert.deepEqual(limpiar("X", "Pemex Cuba!"), { red: "x", campania: "pemexcuba" });
  assert.equal(limpiar("spam", "c"), null);
  const sql = [];
  const env = { OSINT_PLANS_DB: { prepare: (q) => ({ run: async () => sql.push(q), bind: (...a) => ({ run: async () => sql.push([q, a]), all: async () => ({ results: [{ dia: "2026-11-19", red: "x", campania: "c", n: 3 }] }) }) }) } };
  const pedir = (origen, cuerpo) => new Request("https://w/m/visita", { method: "POST", headers: { Origin: origen, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  assert.equal((await contar(pedir("https://malo.com", { red: "x" }), env)).status, 403);
  assert.equal((await contar(pedir("https://dominusosint.com", { red: "otra" }), env)).status, 400);
  const ok = await contar(pedir("https://dominusosint.com", { red: "linkedin_personal", campania: "serie_1" }), env, new Date("2026-11-19T10:00:00Z"));
  assert.equal(ok.status, 204);
  assert.deepEqual(sql.at(-1)[1], ["2026-11-19", "linkedin_personal", "serie_1"]);
  const r = await resumen(env, (v) => Response.json(v), new Date("2026-11-19T10:00:00Z"));
  assert.equal((await r.json()).filas[0].n, 3);
});

test("el sitio quita los utm de la dirección", () => {
  const v = leerUtm("https://dominusosint.com/?utm_source=x&utm_medium=social&utm_campaign=pemex_cuba&capa=1#b-humedad");
  assert.deepEqual(v, { red: "x", campania: "pemex_cuba", limpia: "/?capa=1#b-humedad" });
  assert.equal(leerUtm("https://dominusosint.com/"), null);
});
