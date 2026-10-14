// Historia por país.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const H = await import("../../js/historia.js");

test("elige el artículo «Historia de …» correcto", () => {
  assert.equal(H.elegirArticulo(["Historia de Estados Unidos", ["Historia de Estados Unidos (libro)", "Historia de los Estados Unidos"]], "Estados Unidos"), "Historia de los Estados Unidos");
  assert.equal(H.elegirArticulo(["x", ["Historia de México", "Historia de la Ciudad de México"]], "México"), "Historia de México");
  assert.equal(H.elegirArticulo(["x", ["Mexicali"]], "México"), null);
});

test("etapas: solo nivel 1 y sin secciones de servicio", () => {
  const p = { parse: { sections: [{ toclevel: 1, line: "Época prehispánica", anchor: "Época_prehispánica" }, { toclevel: 2, line: "Olmecas", anchor: "Olmecas" },
    { toclevel: 1, line: "<i>Virreinato</i>", anchor: "Virreinato" }, { toclevel: 1, line: "Véase también", anchor: "V" }, { toclevel: 1, line: "Referencias", anchor: "R" }] } };
  assert.deepEqual(H.etapas(p), [{ titulo: "Época prehispánica", ancla: "Época_prehispánica" }, { titulo: "Virreinato", ancla: "Virreinato" }]);
});

test("fechas antes de Cristo y con precisión de día", () => {
  assert.equal(H.fechaHistorica("-0500-01-01T00:00:00Z", 9), "500 a. C.");
  assert.equal(H.fechaHistorica("+1810-09-16T00:00:00Z", 9), "1810");
  assert.match(H.fechaHistorica("1810-09-16T00:00:00Z", 11), /16 sep.* 1810/);
  assert.equal(H.anioDe("-0500-01-01T00:00:00Z"), -500);
});

test("hechos: orden cronológico, sin deporte ni etiquetas sin traducir, agrupados por época", () => {
  const r = H.hechos([["Q1", "Revolución mexicana", "1910-11-20T00:00:00Z", 11, "revolución", 69], ["Q2", "Fundación de Tenochtitlan", "1325-01-01T00:00:00Z", 9, "", 30],
    ["Q3", "Copa Mundial de Fútbol de 1970", "1970-05-31T00:00:00Z", 11, "", 82], ["Q4", "Q4", "1999-01-01T00:00:00Z", 9, "", 20], ["Q1", "Revolución mexicana", "1910-11-20T00:00:00Z", 11, "", 69]]);
  assert.deepEqual(r.map((h) => h.id), ["Q2", "Q1"]);
  assert.deepEqual(H.porEpoca(r).map((g) => g.titulo.slice(0, 9)), ["Antigüeda", "1900–1945"]);
});

test("ficha con atribución CC BY-SA y enlaces", () => {
  const html = H.htmlHistoria("México", { articulo: { titulo: "Historia de México", url: "https://es.wikipedia.org/wiki/Historia_de_M%C3%A9xico", extracto: "La historia <b>…</b>", etapas: [{ titulo: "Virreinato", ancla: "Virreinato" }] },
    hechos: [{ id: "Q1", nombre: "Revolución", fecha: "1910", anio: 1910, tipo: "" }], errores: [] });
  assert.match(html, /CC BY-SA 4\.0/);
  assert.match(html, /&lt;b&gt;/);  // el extracto se escapa
  assert.match(html, /Historia_de_M%C3%A9xico#Virreinato/);
});
