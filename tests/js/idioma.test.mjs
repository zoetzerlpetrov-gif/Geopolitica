import { test } from "node:test";
import assert from "node:assert/strict";
import { DICC, traducir, campoNombre, IDIOMAS } from "../../js/idioma.js";
import { GRUPOS } from "../../js/riesgos.js";
import { sha1Hex, vecesEnRango, revisar, htmlResultado } from "../../js/exposicion.js";

test("diccionario: cada fila trae los cuatro idiomas", () => {
  assert.ok(Object.keys(DICC).length > 150);
  for (const [es, t] of Object.entries(DICC)) for (const [k] of IDIOMAS.slice(1)) assert.ok(t[k], `falta ${k} en «${es}»`);
});

test("traducir respeta espacios y deja el español intacto", () => {
  assert.equal(traducir("  Herramientas ", "de"), "  Werkzeuge ");
  assert.equal(traducir("Herramientas", "es"), null);
  assert.equal(traducir("texto que no está", "en"), null);
  assert.equal(traducir("🌋 Desastres naturales\n      ", "en"), "🌋 Natural disasters\n      ");
  assert.equal(traducir(" 8 capas", "it"), " 8 livelli");
  assert.equal(traducir("12,592 objetos", "fr"), "12,592 objets");
});

test("todos los grupos de Riesgos tienen traducción", () => {
  for (const [g] of GRUPOS) assert.ok(DICC[g], `falta el grupo «${g}»`);
});

test("etiquetas del mapa en el idioma elegido con respaldo", () => {
  assert.deepEqual(campoNombre("fr"), ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]]);
});

test("Pwned Passwords: SHA-1, búsqueda del sufijo y solo 5 caracteres enviados", async () => {
  assert.equal(await sha1Hex("password"), "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  assert.equal(vecesEnRango("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\nABC:0", "1E4C9B93F3F0682250B6CF8331B7EE68FD8"), 9659365);
  let pedido = "";
  const r = await revisar("password", async (url) => { pedido = url; return { ok: true, text: async () => "1E4C9B93F3F0682250B6CF8331B7EE68FD8:3" }; });
  assert.equal(pedido, "https://api.pwnedpasswords.com/range/5BAA6");
  assert.equal(r.veces, 3);
  assert.match(htmlResultado(r), /aparece 3 veces/);
  assert.match(htmlResultado({ veces: 0, prefijo: "ABCDE" }), /No aparece/);
});
