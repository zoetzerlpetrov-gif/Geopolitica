import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { htmlModulo } from "../../js/demo.js";

test("la demostración recorre todo el proyecto y cada módulo tiene captura, explicación y ejemplo", () => {
  const d = JSON.parse(readFileSync(new URL("../../config/demo.json", import.meta.url), "utf8"));
  const mods = d.capitulos.flatMap((c) => c.modulos);
  assert.ok(d.capitulos.length >= 6 && mods.length >= 25);
  for (const m of mods) {
    assert.ok(existsSync(new URL(`../../assets/demo/${m.captura}`, import.meta.url)), m.captura);
    assert.ok(m.que_hace && m.para_quien && m.ejemplo.length >= 3, m.id);
  }
});

test("el módulo se escapa y su imagen se puede ampliar", () => {
  const h = htmlModulo({ id: "x", titulo: "<b>T</b>", captura: "mapa.jpg", que_hace: "q", para_quien: "p", ejemplo: ["a"], pagina: "./" });
  assert.ok(h.includes("&lt;b&gt;T") && !h.includes("<b>T") && h.includes("data-ampliar"));
});

test("los precios de la demostración (página, PDF y PowerPoint) se muestran en dólares", async () => {
  const { preciosPlanes } = await import("../../js/demo.js");
  const cat = JSON.parse(readFileSync(new URL("../../config/planes.json", import.meta.url), "utf8"));
  const p = preciosPlanes(cat);
  assert.equal(p.length, cat.planes.length);
  assert.ok(p.every((t) => /: (Gratis|USD \d+\.\d{2} al mes)$/.test(t)), p.join(" | "));
  assert.ok(!p.join(" ").includes("MXN"));
  const h = htmlModulo({ id: "planes", titulo: "Planes", captura: "planes.jpg", que_hace: "q", para_quien: "p", ejemplo: ["a"], precios: p });
  assert.ok(h.includes("Precios (USD)") && h.includes("USD 4.99 al mes"));
});
