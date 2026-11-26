// Proyectos de principio a fin (proyectos.html): los pasos van en orden y cada panel incrustado existe en su página.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PASOS, urlPanel } from "../../js/proyectos-flujo.js";

test("pasos en orden y cada panel apunta a una pestaña real", () => {
  assert.deepEqual(PASOS.map((p) => p.id), ["empresa", "proyecto", "diagnostico", "plan", "auditoria", "riesgos", "seguimiento", "cierre", "consulta"]);
  assert.deepEqual(PASOS.filter((p) => /^\d$/.test(p.num)).map((p) => Number(p.num)), [1, 2, 3, 4, 5, 6, 7, 8]);
  const paginas = new Set();
  for (const p of PASOS) {
    assert.ok(p.que.length >= 1, p.id);
    for (const [titulo, pagina, panel] of p.paneles || []) {
      const html = readFileSync(pagina, "utf8");
      paginas.add(pagina);
      if (panel) assert.match(html, new RegExp(`data-p="${panel}"`), `${titulo}: ${pagina}#${panel}`);
      assert.match(html, /js\/embebido\.js/, `${pagina} sin modo incrustado`);
    }
  }
  for (const p of ["ops.html", "herramientas.html", "corporativo.html", "cartera.html", "clientes.html"]) assert.ok(paginas.has(p), p);
  assert.equal(urlPanel("ops.html", "dmi"), "ops.html?embebido=1&panel=dmi");
  assert.equal(urlPanel("corporativo.html", ""), "corporativo.html?embebido=1");
});
